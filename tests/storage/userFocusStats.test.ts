/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 7 — RF-01 + RF-07 (storage helpers focus stats)
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-01 + §RF-07
 * ADRs : 116 (user_focus_stats schema) + 117 (study_sessions.theme_id)
 * Pad. : tests/unit/storage/tournament-series-storage.test.ts (mock db Drizzle chain
 *        com shape REAL — lesson #3).
 *
 * Cobertura (RF-07 storage methods):
 *   - listUserFocusStats(userId, month) — array max 3
 *   - createUserFocusStat(input) — insert + 409 quando 3 ja existem
 *   - createUserFocusStat — 409 quando UNIQUE (user, statId, month) duplica
 *   - deleteUserFocusStat(id, userId) — ownership + idempotente
 *   - countUserFocusStats(userId, month) — contagem mensal
 *   - getStatLatestSnapshotInMonth(userId, statId, monthStart, monthEnd)
 *   - getStudyMinutesByThemeMonth(userId, themeId, monthStart, monthEnd)
 *
 * Lessons aplicadas:
 *   #3 shape REAL Drizzle (insert.values.returning => array)
 *   #5 vi.fn() ok aqui (nenhum constructor `new`)
 *   #14 nao precisa hoisted — sem Anthropic
 *
 * Status RED: metodos nao existem em server/storage.ts ainda.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock db (Drizzle chain) — shape REAL
// =============================================================================
vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.offset = make();
  chain.insert = make();
  chain.values = make();
  chain.returning = make();
  chain.update = make();
  chain.set = make();
  chain.delete = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

import { storage } from '../../server/storage';
import { db } from '../../server/db';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// listUserFocusStats
// =============================================================================
describe('storage.listUserFocusStats(userId, month) (RF-07)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).listUserFocusStats).toBe('function');
  });

  it('retorna array (vazio quando user nunca marcou)', async () => {
    // Drizzle: select().from().where().orderBy() resolves
    (db as any).orderBy = vi.fn().mockResolvedValue([]);
    const result = await (storage as any).listUserFocusStats('USER-0001', '2026-05');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('retorna max 3 entries quando user marcou 3 stats no mes', async () => {
    const rows = [
      { id: 'ufs-1', userId: 'USER-0001', statId: 'cbet_flop_ip', studyThemeId: 'th-1', month: '2026-05' },
      { id: 'ufs-2', userId: 'USER-0001', statId: 'vpip', studyThemeId: 'th-2', month: '2026-05' },
      { id: 'ufs-3', userId: 'USER-0001', statId: 'pfr', studyThemeId: 'th-3', month: '2026-05' },
    ];
    (db as any).orderBy = vi.fn().mockResolvedValue(rows);
    const result = await (storage as any).listUserFocusStats('USER-0001', '2026-05');
    expect(result).toHaveLength(3);
    expect(result[0].statId).toBe('cbet_flop_ip');
  });

  it('filtra por (userId, month) — invoca where + select', async () => {
    (db as any).orderBy = vi.fn().mockResolvedValue([]);
    await (storage as any).listUserFocusStats('USER-0001', '2026-05');
    expect((db as any).select).toHaveBeenCalled();
    expect((db as any).where).toHaveBeenCalled();
  });
});

// =============================================================================
// countUserFocusStats
// =============================================================================
describe('storage.countUserFocusStats(userId, month) (RF-07)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).countUserFocusStats).toBe('function');
  });

  it('retorna 0 quando user sem marcacoes', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ count: 0 }]);
    const c = await (storage as any).countUserFocusStats('USER-0001', '2026-05');
    expect(c).toBe(0);
  });

  it('retorna 3 quando user esta no limite', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ count: 3 }]);
    const c = await (storage as any).countUserFocusStats('USER-0001', '2026-05');
    expect(c).toBe(3);
  });
});

// =============================================================================
// createUserFocusStat
// =============================================================================
describe('storage.createUserFocusStat(input) (RF-07)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).createUserFocusStat).toBe('function');
  });

  it('insere row com nanoid e retorna registro completo', async () => {
    const expected = {
      id: expect.any(String),
      userId: 'USER-0001',
      statId: 'cbet_flop_ip',
      studyThemeId: 'th-1',
      month: '2026-05',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    };
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'ufs-newid',
        userId: 'USER-0001',
        statId: 'cbet_flop_ip',
        studyThemeId: 'th-1',
        month: '2026-05',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    // Para a transaction wrapper, o COUNT inicial precisa retornar 0 marcacoes:
    (db as any).where = vi.fn().mockImplementation(() => {
      // sql count fallback chain — devolve [{count:0}] se chamado para count,
      // ou cadeia normal se nao for count.
      const proxy: any = {
        then: (resolve: any) => resolve([{ count: 0 }]),
      };
      return proxy;
    });

    const result = await (storage as any).createUserFocusStat({
      userId: 'USER-0001',
      statId: 'cbet_flop_ip',
      studyThemeId: 'th-1',
      month: '2026-05',
    });

    expect(result).toMatchObject({
      userId: 'USER-0001',
      statId: 'cbet_flop_ip',
      studyThemeId: 'th-1',
      month: '2026-05',
    });
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(10);
  });

  it('REJEITA quando ja existem 3 marcacoes nesse mes (LIMIT_REACHED)', async () => {
    // Mock count -> 3
    (db as any).where = vi.fn().mockImplementation(() => {
      const proxy: any = { then: (r: any) => r([{ count: 3 }]) };
      return proxy;
    });

    await expect(
      (storage as any).createUserFocusStat({
        userId: 'USER-0001',
        statId: 'cbet_flop_ip',
        studyThemeId: 'th-1',
        month: '2026-05',
      }),
    ).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
  });

  it('REJEITA com STAT_ALREADY_FOCUSED quando UNIQUE PG 23505', async () => {
    // Count ok (0)
    (db as any).where = vi.fn().mockImplementation(() => ({
      then: (r: any) => r([{ count: 0 }]),
    }));
    // Insert -> falha UNIQUE
    (db as any).returning = vi.fn().mockRejectedValue(
      Object.assign(new Error('duplicate key value'), { code: '23505' }),
    );

    await expect(
      (storage as any).createUserFocusStat({
        userId: 'USER-0001',
        statId: 'cbet_flop_ip',
        studyThemeId: 'th-1',
        month: '2026-05',
      }),
    ).rejects.toMatchObject({ code: 'STAT_ALREADY_FOCUSED' });
  });
});

// =============================================================================
// deleteUserFocusStat
// =============================================================================
describe('storage.deleteUserFocusStat(id, userId) (RF-07)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).deleteUserFocusStat).toBe('function');
  });

  it('deleta row e retorna true quando existe + ownership ok', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'ufs-1', userId: 'USER-0001', statId: 'vpip', month: '2026-05' },
    ]);
    const ok = await (storage as any).deleteUserFocusStat('ufs-1', 'USER-0001');
    expect(ok).toBe(true);
    expect((db as any).delete).toHaveBeenCalled();
  });

  it('retorna false quando id inexistente OU ownership invalida (NAO lanca)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const ok = await (storage as any).deleteUserFocusStat('ufs-none', 'USER-0001');
    expect(ok).toBe(false);
  });

  it('idempotente: 2x delete = 2x retorno (true entao false), nao quebra', async () => {
    (db as any).returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'ufs-1', userId: 'USER-0001', statId: 'vpip', month: '2026-05' }])
      .mockResolvedValueOnce([]);
    const r1 = await (storage as any).deleteUserFocusStat('ufs-1', 'USER-0001');
    const r2 = await (storage as any).deleteUserFocusStat('ufs-1', 'USER-0001');
    expect(r1).toBe(true);
    expect(r2).toBe(false);
  });
});

// =============================================================================
// getStatLatestSnapshotInMonth
// =============================================================================
describe('storage.getStatLatestSnapshotInMonth(userId, statId, monthStart, monthEnd) (RF-07)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getStatLatestSnapshotInMonth).toBe('function');
  });

  it('retorna null quando nenhum snapshot do mes contem statId', async () => {
    // Drizzle: select().from().where().orderBy().limit() resolves
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getStatLatestSnapshotInMonth(
      'USER-0001',
      'cbet_flop_ip',
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(r).toBeNull();
  });

  it('retorna { value, sampleSize, capturedAt } do snapshot mais recente do mes', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        capturedAt: new Date('2026-05-15T20:13:00Z'),
        sampleSize: 142,
        values: { cbet_flop_ip: 62.4, vpip: 22.5 },
      },
    ]);
    const r = await (storage as any).getStatLatestSnapshotInMonth(
      'USER-0001',
      'cbet_flop_ip',
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(r).toMatchObject({
      value: 62.4,
      sampleSize: 142,
    });
    expect(r.capturedAt).toBeInstanceOf(Date);
  });

  it('retorna value=null quando snapshot existe mas stat nao tem valor', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        capturedAt: new Date('2026-05-15T20:13:00Z'),
        sampleSize: 100,
        values: { vpip: 22.5 }, // statId 'cbet_flop_ip' NAO existe
      },
    ]);
    const r = await (storage as any).getStatLatestSnapshotInMonth(
      'USER-0001',
      'cbet_flop_ip',
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z'),
    );
    // Sem dado da stat solicitada -> retorna null OU value:null. Aceitamos ambos.
    if (r === null) {
      expect(r).toBeNull();
    } else {
      expect(r.value).toBeNull();
    }
  });

  it('funciona para mes anterior (delta calculation)', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        capturedAt: new Date('2026-04-29T18:00:00Z'),
        sampleSize: 320,
        values: { cbet_flop_ip: 58.1 },
      },
    ]);
    const prev = await (storage as any).getStatLatestSnapshotInMonth(
      'USER-0001',
      'cbet_flop_ip',
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-05-01T00:00:00Z'),
    );
    expect(prev?.value).toBe(58.1);
    expect(prev?.sampleSize).toBe(320);
  });
});

// =============================================================================
// getStudyMinutesByThemeMonth (Opcao C — ADR-117)
// =============================================================================
describe('storage.getStudyMinutesByThemeMonth(userId, themeId, monthStart, monthEnd) (RF-07 + ADR-117)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getStudyMinutesByThemeMonth).toBe('function');
  });

  it('retorna 0 quando theme nao tem nenhuma sessao no mes', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ total: 0 }]);
    const m = await (storage as any).getStudyMinutesByThemeMonth(
      'USER-0001',
      'th-1',
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(m).toBe(0);
  });

  it('retorna SUM(duration) quando ha sessoes no mes', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ total: 78 }]);
    const m = await (storage as any).getStudyMinutesByThemeMonth(
      'USER-0001',
      'th-1',
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(m).toBe(78);
  });

  it('aceita resposta numerica string ("78") e converte para number', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ total: '78' }]);
    const m = await (storage as any).getStudyMinutesByThemeMonth(
      'USER-0001',
      'th-1',
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(m).toBe(78);
  });
});
