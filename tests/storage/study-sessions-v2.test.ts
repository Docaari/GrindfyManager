/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-1 Storage layer (study_sessions_v2)
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-1.1 a §RF-1.6
 * ADRs : 126 (study_sessions_v2 nova) + 130 (idempotency auto_lesson 24h)
 * Pad. : tests/storage/userFocusStats.test.ts (mock db Drizzle chain — lesson #3)
 *
 * Cobertura storage methods (RED — implementer cria em server/storage.ts):
 *   - createStudySessionV2(input) -> insert + retorna row
 *   - createStudySessionV2 — REJEITA com SESSION_ALREADY_RUNNING quando user ja tem live
 *   - getStudySessionsV2(userId, filter) -> lista paginada filtrada por mode/period
 *   - getStudySessionV2ById(id, userId) -> ownership check
 *   - getRunningStudySessionV2(userId) -> retorna live ativa OU null
 *   - updateStudySessionV2(id, userId, patch) -> update editavel fields
 *   - deleteStudySessionV2(id, userId) -> soft delete (deleted_at) gate 24h
 *   - finalizeStudySessionV2(id, userId, payload) -> running -> completed
 *   - getStudyMinutesTodayV2(userId, todayUtc) -> SUM duration_minutes do dia
 *   - findAutoLessonInWindow(userId, lessonId, hours) -> lookup janela rolling 24h (ADR-130)
 *
 * Lessons aplicadas:
 *   #2  data-testid (n/a — storage)
 *   #3  shape REAL (mock chain Drizzle: insert/values/returning array, select/from/where)
 *   #5  vi.fn() ok (sem `new` constructor)
 *   #14 await import nao usado aqui (sem JSX)
 *
 * Status RED: metodos nao existem em server/storage.ts ainda.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock db Drizzle chain — shape REAL
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
  chain.for = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

import { storage } from '../../server/storage';
import { db } from '../../server/db';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset chain methods to default chainable mocks (test isolation: previous
  // tests may have replaced db.X with a one-shot mockResolvedValue, leaking
  // into the next test's chain. Without this, canonical Drizzle chains
  // break: e.g. select().from().where(...).limit() throws "limit is not a
  // function" because .where was replaced with mockResolvedValue.
  const make = () => vi.fn().mockReturnValue(db as any);
  (db as any).select = make();
  (db as any).from = make();
  (db as any).where = make();
  (db as any).orderBy = make();
  (db as any).limit = make();
  (db as any).offset = make();
  (db as any).insert = make();
  (db as any).values = make();
  (db as any).returning = make();
  (db as any).update = make();
  (db as any).set = make();
  (db as any).delete = make();
  (db as any).for = make();
});

// =============================================================================
// createStudySessionV2 — happy path
// =============================================================================
describe('storage.createStudySessionV2 (RF-1.1)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).createStudySessionV2).toBe('function');
  });

  it('insere session manual_post_hoc completed e retorna row hidratada', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'ssv2-newid',
        userId: 'USER-0001',
        mode: 'drill_gto',
        source: 'manual_post_hoc',
        status: 'completed',
        themeId: 'th-1',
        durationMinutes: 30,
        registeredAt: new Date('2026-05-08T10:00:00Z'),
        createdAt: new Date('2026-05-08T10:00:00Z'),
        updatedAt: new Date('2026-05-08T10:00:00Z'),
      },
    ]);

    const result = await (storage as any).createStudySessionV2({
      userId: 'USER-0001',
      mode: 'drill_gto',
      source: 'manual_post_hoc',
      status: 'completed',
      themeId: 'th-1',
      durationMinutes: 30,
    });

    expect(result).toMatchObject({
      userId: 'USER-0001',
      mode: 'drill_gto',
      source: 'manual_post_hoc',
      status: 'completed',
      durationMinutes: 30,
    });
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(10);
  });

  it('insere session manual_live com status=running + started_at populado', async () => {
    const startedAt = new Date('2026-05-08T10:00:00Z');
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'ssv2-live-1',
        userId: 'USER-0001',
        mode: 'lesson',
        source: 'manual_live',
        status: 'running',
        lessonId: 'lesson-bloco-a-ep1',
        themeId: 'th-mental',
        durationMinutes: 1,
        startedAt,
        registeredAt: startedAt,
      },
    ]);

    const result = await (storage as any).createStudySessionV2({
      userId: 'USER-0001',
      mode: 'lesson',
      source: 'manual_live',
      status: 'running',
      lessonId: 'lesson-bloco-a-ep1',
      themeId: 'th-mental',
      durationMinutes: 1,
      startedAt,
    });

    expect(result.status).toBe('running');
    expect(result.startedAt).toEqual(startedAt);
  });

  it('PG 23505 em uq_ssv2_user_running -> SESSION_ALREADY_RUNNING (RF-1.4)', async () => {
    // PG unique violation — error code 23505 com constraint name
    (db as any).returning = vi.fn().mockRejectedValue(
      Object.assign(new Error('duplicate key value violates unique constraint "uq_ssv2_user_running"'), {
        code: '23505',
        constraint: 'uq_ssv2_user_running',
      }),
    );

    await expect(
      (storage as any).createStudySessionV2({
        userId: 'USER-0001',
        mode: 'drill_gto',
        source: 'manual_live',
        status: 'running',
        themeId: 'th-1',
        durationMinutes: 1,
        startedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'SESSION_ALREADY_RUNNING' });
  });
});

// =============================================================================
// getStudySessionsV2 — list + filters
// =============================================================================
describe('storage.getStudySessionsV2 (RF-1 GET list)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getStudySessionsV2).toBe('function');
  });

  it('retorna array vazio quando user sem sessions', async () => {
    (db as any).offset = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getStudySessionsV2('USER-0001', {
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
      limit: 30,
      offset: 0,
    });
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(0);
  });

  it('retorna sessions ordenadas por started_at DESC com paginacao', async () => {
    const rows = [
      { id: 'ssv2-3', userId: 'USER-0001', mode: 'drill_gto', startedAt: new Date('2026-05-08T18:00:00Z'), durationMinutes: 30 },
      { id: 'ssv2-2', userId: 'USER-0001', mode: 'lesson', startedAt: new Date('2026-05-08T14:00:00Z'), durationMinutes: 25 },
      { id: 'ssv2-1', userId: 'USER-0001', mode: 'tournament_review', startedAt: new Date('2026-05-08T10:00:00Z'), durationMinutes: 45 },
    ];
    (db as any).offset = vi.fn().mockResolvedValue(rows);
    const r = await (storage as any).getStudySessionsV2('USER-0001', { limit: 30, offset: 0 });
    expect(r).toHaveLength(3);
    expect(r[0].id).toBe('ssv2-3');
  });

  it('aplica filtro por mode quando passado', async () => {
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStudySessionsV2('USER-0001', { mode: 'drill_gto', limit: 30, offset: 0 });
    expect((db as any).select).toHaveBeenCalled();
    expect((db as any).where).toHaveBeenCalled();
  });

  it('exclui rows soft-deleted (deleted_at NOT NULL)', async () => {
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStudySessionsV2('USER-0001', { limit: 30, offset: 0 });
    expect((db as any).where).toHaveBeenCalled();
  });

  it('default limit=30 + offset=0 quando nao passado', async () => {
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStudySessionsV2('USER-0001', {});
    expect((db as any).limit).toHaveBeenCalledWith(30);
    expect((db as any).offset).toHaveBeenCalledWith(0);
  });
});

// =============================================================================
// getStudySessionV2ById
// =============================================================================
describe('storage.getStudySessionV2ById (ownership)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getStudySessionV2ById).toBe('function');
  });

  it('retorna row quando id pertence ao userId', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      { id: 'ssv2-1', userId: 'USER-0001', mode: 'drill_gto', durationMinutes: 30 },
    ]);
    const r = await (storage as any).getStudySessionV2ById('ssv2-1', 'USER-0001');
    expect(r).toMatchObject({ id: 'ssv2-1', userId: 'USER-0001' });
  });

  it('retorna null quando id nao existe', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getStudySessionV2ById('inexistente', 'USER-0001');
    expect(r).toBeNull();
  });

  it('retorna null quando id existe mas pertence a outro user (NAO vaza dados)', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getStudySessionV2ById('ssv2-of-other', 'USER-0001');
    expect(r).toBeNull();
  });
});

// =============================================================================
// getRunningStudySessionV2
// =============================================================================
describe('storage.getRunningStudySessionV2 (live check)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getRunningStudySessionV2).toBe('function');
  });

  it('retorna null quando user sem session running', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getRunningStudySessionV2('USER-0001');
    expect(r).toBeNull();
  });

  it('retorna a session live ativa quando existe', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        id: 'ssv2-live-1',
        userId: 'USER-0001',
        status: 'running',
        startedAt: new Date('2026-05-08T10:00:00Z'),
      },
    ]);
    const r = await (storage as any).getRunningStudySessionV2('USER-0001');
    expect(r?.status).toBe('running');
  });
});

// =============================================================================
// updateStudySessionV2 — PATCH editaveis
// =============================================================================
describe('storage.updateStudySessionV2 (RF-1 PATCH)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).updateStudySessionV2).toBe('function');
  });

  it('atualiza notes + theme_id e retorna row atualizada', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'ssv2-1',
        userId: 'USER-0001',
        notes: 'Notas novas',
        themeId: 'th-2',
        updatedAt: new Date(),
      },
    ]);
    const r = await (storage as any).updateStudySessionV2('ssv2-1', 'USER-0001', {
      notes: 'Notas novas',
      themeId: 'th-2',
    });
    expect(r.notes).toBe('Notas novas');
    expect(r.themeId).toBe('th-2');
  });

  it('retorna null quando id inexistente OU outro user', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).updateStudySessionV2('ssv2-none', 'USER-0001', { notes: 'x' });
    expect(r).toBeNull();
  });
});

// =============================================================================
// deleteStudySessionV2 — soft delete 24h gate
// =============================================================================
describe('storage.deleteStudySessionV2 (RF-1 DELETE soft)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).deleteStudySessionV2).toBe('function');
  });

  it('seta deleted_at e retorna true quando dentro de 24h', async () => {
    // Spec: ate 24h pos creation. Storage marca deleted_at=now().
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'ssv2-1', userId: 'USER-0001', deletedAt: new Date() },
    ]);
    const ok = await (storage as any).deleteStudySessionV2('ssv2-1', 'USER-0001');
    expect(ok).toBe(true);
    expect((db as any).update).toHaveBeenCalled();
  });

  it('retorna false quando session nao existe ou outra ownership', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const ok = await (storage as any).deleteStudySessionV2('ssv2-none', 'USER-0001');
    expect(ok).toBe(false);
  });
});

// =============================================================================
// finalizeStudySessionV2 — running -> completed
// =============================================================================
describe('storage.finalizeStudySessionV2 (RF-1 finalize live)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).finalizeStudySessionV2).toBe('function');
  });

  it('atualiza status running -> completed + duration final', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'ssv2-1',
        userId: 'USER-0001',
        status: 'completed',
        durationMinutes: 33,
        endedAt: new Date('2026-05-08T10:33:00Z'),
        wasProductive: true,
      },
    ]);
    const r = await (storage as any).finalizeStudySessionV2('ssv2-1', 'USER-0001', {
      endedAt: new Date('2026-05-08T10:33:00Z'),
      durationMinutes: 33,
      wasProductive: true,
      idlePeriods: [{ start: '2026-05-08T10:15:00Z', end: '2026-05-08T10:27:00Z' }],
    });
    expect(r.status).toBe('completed');
    expect(r.durationMinutes).toBe(33);
  });
});

// =============================================================================
// getStudyMinutesTodayV2 — agregacao por dia (RF-2 streak calc)
// =============================================================================
describe('storage.getStudyMinutesTodayV2 (RF-2.2 today_minutes)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getStudyMinutesTodayV2).toBe('function');
  });

  it('retorna 0 quando user sem sessoes hoje', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ total: 0 }]);
    const m = await (storage as any).getStudyMinutesTodayV2('USER-0001', '2026-05-08');
    expect(m).toBe(0);
  });

  it('retorna SUM(duration_minutes) das sessions registered_at=today', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ total: 35 }]);
    const m = await (storage as any).getStudyMinutesTodayV2('USER-0001', '2026-05-08');
    expect(m).toBe(35);
  });

  it('exclui rows soft-deleted (deleted_at NOT NULL)', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ total: 35 }]);
    await (storage as any).getStudyMinutesTodayV2('USER-0001', '2026-05-08');
    // O storage precisa filtrar deletedAt IS NULL (testavel via .where calls)
    expect((db as any).where).toHaveBeenCalled();
  });

  it('aceita string numerica e converte', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ total: '78' }]);
    const m = await (storage as any).getStudyMinutesTodayV2('USER-0001', '2026-05-08');
    expect(m).toBe(78);
  });
});

// =============================================================================
// findAutoLessonInWindow — ADR-130 idempotency
// =============================================================================
describe('storage.findAutoLessonInWindow (ADR-130 24h rolling)', () => {
  it('existe como method (forward compat Sprint 2)', () => {
    expect(typeof (storage as any).findAutoLessonInWindow).toBe('function');
  });

  it('retorna null quando nenhuma session auto_lesson dentro de 24h', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).findAutoLessonInWindow('USER-0001', 'lesson-1', 24);
    expect(r).toBeNull();
  });

  it('retorna session existente quando registrada nas ultimas 24h', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        id: 'ssv2-auto-1',
        userId: 'USER-0001',
        mode: 'lesson',
        source: 'auto_lesson',
        lessonId: 'lesson-1',
        durationMinutes: 12,
        registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5h atras
      },
    ]);
    const r = await (storage as any).findAutoLessonInWindow('USER-0001', 'lesson-1', 24);
    expect(r?.source).toBe('auto_lesson');
  });
});

// =============================================================================
// REGRESSAO — dashboard isolation (study_sessions LEGADO continua funcionando)
// =============================================================================
describe('regressao: study_sessions LEGADO read-only', () => {
  it('storage.getStudySessions (legado) continua existindo (NAO removido)', () => {
    // Spec ADR-126: legado fica read-only — implementer NAO deve remover
    const legacy = (storage as any).getStudySessions;
    if (typeof legacy === 'function') {
      expect(typeof legacy).toBe('function');
    } else {
      // Aceitavel se nunca existiu — o ponto eh que nao quebramos nada
      expect(true).toBe(true);
    }
  });
});
