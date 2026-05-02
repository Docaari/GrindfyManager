import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint F4 W0 — Migration 0014: tournaments + 3 colunas para simulacao
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Modelos de Dados D.2)
// ADR-054: PrimeDope external provider
// Migration script: server/scripts/migrate-0026-tournaments-simulation-fields.ts
//
// Comportamento esperado:
//   - ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS players_avg integer
//     CHECK (players_avg BETWEEN 10 AND 50000)
//   - ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS places_paid_avg integer
//     CHECK (places_paid_avg BETWEEN 1 AND 10000)
//   - ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS rake_pct decimal(5,2)
//     CHECK (rake_pct BETWEEN 0 AND 30)
//
// Backfill cascade per row (UPDATE ... SET ... WHERE players_avg IS NULL):
//   1. JOIN tournament_templates: players_avg = tt.avg_field_size quando >= 10
//   2. fallback: players_avg = tournaments.field_size quando >= 10
//   3. last fallback: players_avg = 1000
//   4. places_paid_avg = ROUND(players_avg * 0.15)
//   5. rake_pct heuristica per network (NETWORK_DEFAULTS_RAKE) com fallback 8.
//
// Idempotente: re-aplicar nao quebra (IF NOT EXISTS + WHERE col IS NULL).
//
// REVIEWER FIX (HIGH #3): testes anteriores chamavam metodos `tx.*` ficticios
// (`tx.addColumnIfNotExists`, `tx.backfillPlayersAvgFromTemplate` etc.) que
// NAO existiam em storage.ts — green falso. Reescritos para mockar
// `db.execute` (que e o que o script realmente chama) + asserir os SQLs
// emitidos.
// =============================================================================

const dbExecuteMock = vi.fn();

vi.mock('../../../server/db', () => ({
  db: {
    execute: (...args: any[]) => dbExecuteMock(...args),
  },
  pool: {},
}));

async function importMigration() {
  return await import('../../../server/scripts/migrate-0026-tournaments-simulation-fields');
}

/**
 * Concatena toda a SQL emitida em uma string para asserts grep-style.
 */
function emittedSql(): string {
  return dbExecuteMock.mock.calls
    .map((call) => {
      const arg = call[0];
      try {
        if (arg && typeof arg === 'object') {
          if (Array.isArray(arg.queryChunks)) {
            return arg.queryChunks
              .map((c: any) =>
                typeof c === 'string'
                  ? c
                  : c?.value ?? (typeof c?.toString === 'function' ? c.toString() : ''),
              )
              .join(' ');
          }
          if (typeof arg.toString === 'function') {
            return arg.toString();
          }
        }
      } catch {
        return '';
      }
      return String(arg);
    })
    .join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  dbExecuteMock.mockReset();
  // Por default, db.execute retorna { rowCount: 0 } (idempotente — re-run nao
  // altera nada). Tests especificos sobrescrevem.
  dbExecuteMock.mockResolvedValue({ rowCount: 0, rows: [] });
});

describe('Migration 0014 — schema delta', () => {
  it('emite ALTER TABLE ADD COLUMN IF NOT EXISTS players_avg integer', async () => {
    const { runMigration0014 } = await importMigration();
    await runMigration0014({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/ALTER TABLE.*tournaments/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS.*players_avg.*integer/i);
  });

  it('emite ALTER TABLE ADD COLUMN IF NOT EXISTS places_paid_avg integer', async () => {
    const { runMigration0014 } = await importMigration();
    await runMigration0014({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS.*places_paid_avg.*integer/i);
  });

  it('emite ALTER TABLE ADD COLUMN IF NOT EXISTS rake_pct decimal(5,2)', async () => {
    const { runMigration0014 } = await importMigration();
    await runMigration0014({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS.*rake_pct.*decimal\(5,2\)/i);
  });

  it('cria CHECK constraints com limites corretos (10..50000, 1..10000, 0..30)', async () => {
    const { runMigration0014 } = await importMigration();
    await runMigration0014({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/tournaments_players_avg_check/);
    expect(sql).toMatch(/BETWEEN 10 AND 50000/);
    expect(sql).toMatch(/tournaments_places_paid_avg_check/);
    expect(sql).toMatch(/BETWEEN 1 AND 10000/);
    expect(sql).toMatch(/tournaments_rake_pct_check/);
    expect(sql).toMatch(/BETWEEN 0 AND 30/);
  });
});

describe('Migration 0014 — backfill cascade', () => {
  it('priority 1: usa tt.avg_field_size do JOIN tournament_templates quando >= 10', async () => {
    // Schema delta = 4 calls (3 ADD COLUMN + 1 DO $$ block).
    // Backfill UPDATE = calls 5, 6, 7 (template, field_size, default).
    let callIdx = 0;
    dbExecuteMock.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 5) return { rowCount: 150, rows: [] };
      if (callIdx === 6) return { rowCount: 20, rows: [] };
      if (callIdx === 7) return { rowCount: 5, rows: [] };
      return { rowCount: 0, rows: [] };
    });

    const { runMigration0014 } = await importMigration();
    const r = await runMigration0014({ dryRun: false });

    expect(r.playersAvgFromTemplate).toBe(150);
    expect(r.playersAvgFromFieldSize).toBe(20);
    expect(r.playersAvgFromDefault).toBe(5);
  });

  it('priority 2 SQL inclui field_size >= 10 (descarta amostras curtas)', async () => {
    const { runMigration0014 } = await importMigration();
    await runMigration0014({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/field_size.*>=\s*10/i);
  });

  it('places_paid_avg = ROUND(players_avg * 0.15) emitido apos players_avg', async () => {
    let callIdx = 0;
    dbExecuteMock.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 8) return { rowCount: 175, rows: [] };
      return { rowCount: 0, rows: [] };
    });

    const { runMigration0014 } = await importMigration();
    const r = await runMigration0014({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/places_paid_avg.*ROUND.*players_avg.*0\.15/i);
    expect(r.placesPaidAvgUpdated).toBe(175);
  });

  it('rake_pct usa CASE WHEN per-network (GG=10, WPN=8, Stars=9) + fallback ELSE 8', async () => {
    let callIdx = 0;
    dbExecuteMock.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 9) return { rowCount: 200, rows: [] };
      return { rowCount: 0, rows: [] };
    });

    const { runMigration0014 } = await importMigration();
    const r = await runMigration0014({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/CASE/i);
    expect(sql).toMatch(/THEN 10/);
    expect(sql).toMatch(/THEN 8/);
    expect(sql).toMatch(/ELSE 8/);
    expect(r.rakePctUpdated).toBe(200);
  });
});

describe('Migration 0014 — idempotencia', () => {
  it('re-run em DB com tudo preenchido nao altera nada (rowCount=0 em cada UPDATE)', async () => {
    const { runMigration0014 } = await importMigration();
    const r = await runMigration0014({ dryRun: false });

    expect(r.playersAvgFromTemplate).toBe(0);
    expect(r.playersAvgFromFieldSize).toBe(0);
    expect(r.playersAvgFromDefault).toBe(0);
    expect(r.placesPaidAvgUpdated).toBe(0);
    expect(r.rakePctUpdated).toBe(0);
  });
});

describe('Migration 0014 — dry-run', () => {
  it('dryRun=true loga + nao emite nenhum SQL', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runMigration0014 } = await importMigration();
    const r = await runMigration0014({ dryRun: true });

    expect(dbExecuteMock).not.toHaveBeenCalled();
    expect(r.dryRun).toBe(true);
    infoSpy.mockRestore();
  });
});
