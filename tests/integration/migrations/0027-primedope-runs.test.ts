import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint F4 W0 — Migration 0015: tabela primedope_runs (NOVA)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Modelos de Dados D.3)
// ADR-054: PrimeDope external provider + cache + audit trail
// Migration script: server/scripts/migrate-0027-primedope-runs.ts
//
// Schema esperado:
//   id varchar(21) PK (nanoid)
//   user_id varchar FK users(user_platform_id) ON DELETE CASCADE  <- HIGH #5
//   profile_letter char(1) CHECK in (A,B,C)
//   day_of_week integer CHECK 0..6
//   multiplier integer CHECK in (1,4,12,52)
//   input_hash char(64) NOT NULL  (sha256)
//   input_json jsonb NOT NULL
//   result_json jsonb NOT NULL
//   histogram_path text
//   random_runs_path text
//   latency_ms integer
//   source varchar(20) CHECK in ('primedope','cache','fallback-stale')
//   pinned boolean DEFAULT false
//   created_at timestamp DEFAULT NOW
//   expires_at timestamp NULL
//
// Indices:
//   (user_id, profile_letter, day_of_week, created_at DESC)
//   (input_hash) — cache lookup
//
// REVIEWER FIX (HIGH #3): testes anteriores chamavam metodos `tx.*` ficticios
// que NAO existiam — green falso. Reescritos para mockar `db.execute`.
// =============================================================================

const dbExecuteMock = vi.fn();

vi.mock('../../../server/db', () => ({
  db: {
    execute: (...args: any[]) => dbExecuteMock(...args),
  },
  pool: {},
}));

async function importMigration() {
  return await import('../../../server/scripts/migrate-0027-primedope-runs');
}

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
  // Default: tableExists / indexExists retornam false (tabela nova).
  dbExecuteMock.mockResolvedValue({ rowCount: 0, rows: [{ exists: false }] });
});

describe('Migration 0015 — primedope_runs table creation', () => {
  it('emite CREATE TABLE IF NOT EXISTS primedope_runs com todas as colunas', async () => {
    const { runMigration0015 } = await importMigration();
    await runMigration0015({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS.*primedope_runs/i);
    [
      'id',
      'user_id',
      'profile_letter',
      'day_of_week',
      'multiplier',
      'input_hash',
      'input_json',
      'result_json',
      'histogram_path',
      'random_runs_path',
      'latency_ms',
      'source',
      'pinned',
      'created_at',
      'expires_at',
    ].forEach((col) => {
      expect(sql).toMatch(new RegExp(`"${col}"`));
    });
  });

  it('aplica CHECK constraints (profile_letter A/B/C, day_of_week 0..6, multiplier in (1,4,12,52), source enum)', async () => {
    const { runMigration0015 } = await importMigration();
    await runMigration0015({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/profile_letter.*IN.*'A'.*'B'.*'C'/i);
    expect(sql).toMatch(/day_of_week.*BETWEEN 0 AND 6/i);
    expect(sql).toMatch(/multiplier.*IN.*1.*4.*12.*52/i);
    expect(sql).toMatch(/source.*IN.*'primedope'.*'cache'.*'fallback-stale'/i);
  });

  it('FK user_id aponta para users(user_platform_id) ON DELETE CASCADE (HIGH #5)', async () => {
    const { runMigration0015 } = await importMigration();
    await runMigration0015({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(/REFERENCES.*"users".*"user_platform_id"/i);
    expect(sql).toMatch(/ON DELETE CASCADE/i);
  });

  it('cria indice composto (user_id, profile_letter, day_of_week, created_at DESC)', async () => {
    const { runMigration0015 } = await importMigration();
    await runMigration0015({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS.*primedope_runs_user_profile_day_created_idx/i,
    );
    expect(sql).toMatch(
      /"user_id".*"profile_letter".*"day_of_week".*"created_at"\s+DESC/i,
    );
  });

  it('cria indice em (input_hash) para cache lookup', async () => {
    const { runMigration0015 } = await importMigration();
    await runMigration0015({ dryRun: false });

    const sql = emittedSql();
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS.*primedope_runs_input_hash_idx/i,
    );
    expect(sql).toMatch(/"input_hash"/);
  });
});

describe('Migration 0015 — idempotencia', () => {
  it('re-aplicar com tabela ja existente reporta tableCreated=false', async () => {
    // tableExists retorna true antes do CREATE, e cada indexExists retorna true
    dbExecuteMock.mockImplementation(async (arg: any) => {
      const text =
        arg?.queryChunks
          ?.map((c: any) => (typeof c === 'string' ? c : c?.value ?? ''))
          .join(' ') ?? '';
      if (/information_schema\.tables/.test(text) || /pg_indexes/.test(text)) {
        return { rowCount: 1, rows: [{ exists: true }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const { runMigration0015 } = await importMigration();
    const r = await runMigration0015({ dryRun: false });

    expect(r.tableCreated).toBe(false);
    expect(r.indicesCreated).toBe(0);
  });
});

describe('Migration 0015 — dry-run', () => {
  it('dryRun=true loga DDL planejado e nao emite SQL', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runMigration0015 } = await importMigration();
    const r = await runMigration0015({ dryRun: true });

    expect(dbExecuteMock).not.toHaveBeenCalled();
    expect(r.dryRun).toBe(true);
    infoSpy.mockRestore();
  });
});
