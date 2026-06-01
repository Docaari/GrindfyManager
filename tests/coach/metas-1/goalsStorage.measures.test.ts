import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — goalsStorage (medidas) — RED phase
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/storage/goalsStorage.ts -> attachGoalsStorage(storage)
//     storage.createGoal(input, injectedDb?)          goal_kind='measure'
//     storage.getGoal(userId, goalId, injectedDb?)    ownership
//     storage.listGoals(userId, opts?, injectedDb?)
//     storage.updateGoal(userId, goalId, patch, injectedDb?) -> rejeita baselineValue
//     storage.archiveGoal(userId, goalId, injectedDb?) soft-delete archived_at
//     storage.countActiveMeasures(userId, injectedDb?) cap 3
//
// Padrao espelha weeklyPlanningStorage/careerGoalsStorage (attach + injectedDb).
//
// Lessons aplicadas:
//   #3  — fakeDb chainable espelha o shape REAL do drizzle (insert/values/
//         returning; select/from/where/limit/orderBy; update/set/where/returning).
//   #34 — injectedDb como ultimo arg (sem vi.mock global).
//   #14/#26/#38 — await import.
//   #36 — o modulo carrega @shared/schema lazy + fallback; aqui o fakeDb ignora
//         os args de .from()/.where(), entao placeholder basta.
//
// Suposicao documentada: BaselineImmutableError exportado pelo modulo OU lancado
//   como Error com .code === 'baseline_immutable'. Testo o .code (ramo robusto).
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

async function loadAttach() {
  return await import('../../../server/storage/goalsStorage');
}

// Storage host minimal — attachGoalsStorage popula os metodos nele.
function makeStorage() {
  return {} as any;
}

describe('attachGoalsStorage — exposicao dos metodos', () => {
  it('attach popula createGoal/getGoal/listGoals/updateGoal/archiveGoal/countActiveMeasures', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    expect(typeof storage.createGoal).toBe('function');
    expect(typeof storage.getGoal).toBe('function');
    expect(typeof storage.listGoals).toBe('function');
    expect(typeof storage.updateGoal).toBe('function');
    expect(typeof storage.archiveGoal).toBe('function');
    expect(typeof storage.countActiveMeasures).toBe('function');
  });
});

describe('createGoal — INSERT goal_kind="measure", status="active", direction="up"', () => {
  it('insere com nanoid id + goalKind=measure + status=active default', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);

    const insertedRow: any = {};
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => {
          Object.assign(insertedRow, v);
          return { returning: vi.fn(async () => [{ ...v, createdAt: new Date() }]) };
        }),
      })),
    };

    const r = await storage.createGoal(
      {
        userId: 'USER-1',
        goalType: 'process',
        category: 'study',
        title: 'Estudar 300min/semana',
        sourceMetric: 'study_minutes_week',
        targetValue: 300,
        unit: 'minutes',
        cadence: 'weekly',
        horizon: 'quarter',
      },
      fakeDb,
    );

    expect(r).toBeTruthy();
    expect(typeof r.id).toBe('string');
    expect(r.id.length).toBeGreaterThan(0);
    expect(insertedRow.userId).toBe('USER-1');
    expect(insertedRow.goalKind ?? 'measure').toBe('measure');
    expect(insertedRow.status ?? 'active').toBe('active');
    expect(insertedRow.direction ?? 'up').toBe('up');
  });
});

describe('getGoal — ownership', () => {
  it('retorna null quando user_id nao bate (outro dono)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })),
      })),
    };
    const r = await storage.getGoal('USER-1', 'goal-de-outro', fakeDb);
    expect(r).toBeNull();
  });

  it('retorna a row quando ownership bate', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const row = { id: 'g1', userId: 'USER-1', goalKind: 'measure', status: 'active' };
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [row]) })) })),
      })),
    };
    const r = await storage.getGoal('USER-1', 'g1', fakeDb);
    expect(r?.id).toBe('g1');
  });
});

describe('updateGoal — rejeita baselineValue (DEC-menor-1, RF-01 X imutavel)', () => {
  it('patch com baselineValue lanca erro com code "baseline_immutable"', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const fakeDb: any = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'g1' }]) })) })) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [{ id: 'g1', userId: 'USER-1' }]) })) })) })),
    };
    await expect(
      storage.updateGoal('USER-1', 'g1', { baselineValue: 999 } as any, fakeDb),
    ).rejects.toMatchObject({ code: 'baseline_immutable' });
  });

  it('patch sem baselineValue (so targetValue/title) atualiza normalmente', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const setSpy = vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'g1', title: 'novo' }]) })) }));
    const fakeDb: any = {
      update: vi.fn(() => ({ set: setSpy })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [{ id: 'g1', userId: 'USER-1' }]) })) })) })),
    };
    const r = await storage.updateGoal('USER-1', 'g1', { title: 'novo' } as any, fakeDb);
    expect(r?.id).toBe('g1');
  });
});

describe('archiveGoal — soft-delete (archived_at = now, nao hard delete)', () => {
  it('chama update set archived_at (nao db.delete)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    let setArg: any = null;
    const fakeDb: any = {
      update: vi.fn(() => ({
        set: vi.fn((v: any) => {
          setArg = v;
          return { where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'g1' }]) })) };
        }),
      })),
      delete: vi.fn(() => { throw new Error('archiveGoal NUNCA deve hard-delete'); }),
    };
    await storage.archiveGoal('USER-1', 'g1', fakeDb);
    expect(fakeDb.delete).not.toHaveBeenCalled();
    expect(setArg).toBeTruthy();
    expect('archivedAt' in setArg || 'archived_at' in setArg).toBe(true);
  });
});

describe('countActiveMeasures — cap 3 (contagem status=active)', () => {
  it('retorna a contagem numerica de medidas ativas', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(async () => [{ count: 2 }]) })),
      })),
    };
    const n = await storage.countActiveMeasures('USER-1', fakeDb);
    expect(typeof n).toBe('number');
    expect(n).toBe(2);
  });
});
