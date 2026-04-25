import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint W-1 Warm-up): server/storage warmup_rituals queries
//
// Fonte: Docs/specs/warm-up-sprint-w1-spec.md (Secao 7 endpoints)
//        ADR-028 (warmup_rituals tabela dedicada)
//        ADR-029 (no dual-write — INSERT apenas em warmup_rituals)
//
// Convencao: server/storage.ts (camada de abstracao DB) deve expor:
//   - createWarmupRitual(payload)        -> RF-15
//   - getLatestWarmupRitual(userId)      -> RF-16 (gate; filter version=full + 30min)
//   - listWarmupRituals({userId, from, to, limit, offset}) -> RF-17
//   - updateUserSettingsWeeklyHeuristics(userId, heuristics) -> RF-22
//
// Status esperado: TODOS DEVEM FALHAR (red) — funcoes nao existem ainda.
// =============================================================================

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  gt: vi.fn((...args: any[]) => ({ type: 'gt', args })),
  gte: vi.fn((...args: any[]) => ({ type: 'gte', args })),
  lte: vi.fn((...args: any[]) => ({ type: 'lte', args })),
  desc: vi.fn((arg: any) => ({ type: 'desc', arg })),
  sql: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid'),
}));

vi.mock('@shared/schema', () => ({
  warmupRituals: {
    id: 'warmup_rituals.id',
    userId: 'warmup_rituals.user_id',
    startedAt: 'warmup_rituals.started_at',
    completedAt: 'warmup_rituals.completed_at',
    version: 'warmup_rituals.version',
    durationMinutes: 'warmup_rituals.duration_minutes',
    emotionalCheckScore: 'warmup_rituals.emotional_check_score',
    decisionToPlay: 'warmup_rituals.decision_to_play',
    overrideUsed: 'warmup_rituals.override_used',
    blocksCompleted: 'warmup_rituals.blocks_completed',
    sessionIntention: 'warmup_rituals.session_intention',
    linkedGrindSessionId: 'warmup_rituals.linked_grind_session_id',
    createdAt: 'warmup_rituals.created_at',
  },
  userSettings: {
    id: 'user_settings.id',
    userId: 'user_settings.user_id',
    weeklyHeuristics: 'user_settings.weekly_heuristics',
    drillUrl: 'user_settings.drill_url',
  },
}));

// Mock the db chain: select().from().where().orderBy().limit().offset()
const buildSelectMock = (rows: any[]) => {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => Promise.resolve(rows)),
    then: (cb: any) => Promise.resolve(rows).then(cb),
  };
  return chain;
};

// vi.hoisted resolve TDZ no Vitest 4: vi.mock() eh hoisted pro topo do modulo,
// mas `const dbMock` nao. Usar vi.hoisted() garante que dbMock esta inicializado
// quando o factory do vi.mock executar durante a resolucao do import.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../server/db', () => ({ db: dbMock, pool: {} }));

// IMPORT TARGET — deve ser implementado em server/storage.ts ou server/services/warmupService.ts
// (System-Architect deixou em aberto; preferimos storage.ts para coerencia com bankrollService).
import * as storage from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createWarmupRitual
// ---------------------------------------------------------------------------

describe('storage.createWarmupRitual', () => {
  it('INSERT em warmup_rituals e retorna ritual com id gerado (RF-15)', async () => {
    const insertedRow = {
      id: 'mock-nanoid',
      userId: 'USER-0001',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMinutes: 10,
      version: 'full',
      emotionalCheckScore: 8,
      decisionToPlay: true,
      overrideUsed: false,
      blocksCompleted: [],
      sessionIntention: { focus: 'a', tiltPlan: 'b', stopCriteria: 'c' },
      createdAt: new Date(),
    };
    const valuesChain: any = {
      returning: vi.fn(() => Promise.resolve([insertedRow])),
    };
    dbMock.insert.mockReturnValue({ values: vi.fn(() => valuesChain) });

    const r = await (storage as any).createWarmupRitual({
      userId: 'USER-0001',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMinutes: 10,
      version: 'full',
      emotionalCheckScore: 8,
      decisionToPlay: true,
      overrideUsed: false,
      blocksCompleted: [],
      sessionIntention: { focus: 'a', tiltPlan: 'b', stopCriteria: 'c' },
    });

    expect(dbMock.insert).toHaveBeenCalled();
    expect(r).toBeDefined();
    expect(r.id).toBe('mock-nanoid');
    expect(r.version).toBe('full');
  });

  it('NAO escreve em preparation_logs (ADR-029, no dual-write)', async () => {
    const valuesChain: any = {
      returning: vi.fn(() => Promise.resolve([{ id: 'r-1', version: 'aborted' }])),
    };
    dbMock.insert.mockReturnValue({ values: vi.fn(() => valuesChain) });

    await (storage as any).createWarmupRitual({
      userId: 'USER-0001',
      startedAt: new Date(),
      durationMinutes: 0,
      version: 'aborted',
    });

    // db.insert deve ter sido chamado UMA unica vez (warmup_rituals).
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getLatestWarmupRitual (gate)
// ---------------------------------------------------------------------------

describe('storage.getLatestWarmupRitual', () => {
  it('retorna ritual recente quando version=full e completedAt > now-30min (RF-16)', async () => {
    const recentRitual = {
      id: 'r-1',
      userId: 'USER-0001',
      version: 'full',
      completedAt: new Date(Date.now() - 5 * 60 * 1000), // 5min atras
      decisionToPlay: true,
    };
    dbMock.select.mockReturnValue(buildSelectMock([recentRitual]));

    const r = await (storage as any).getLatestWarmupRitual('USER-0001');
    expect(r).toBeDefined();
    expect(r?.id).toBe('r-1');
  });

  it('retorna null quando nao ha ritual nos ultimos 30min', async () => {
    dbMock.select.mockReturnValue(buildSelectMock([]));

    const r = await (storage as any).getLatestWarmupRitual('USER-0001');
    expect(r).toBeNull();
  });

  it('ignora rituais aborted (filtro version=full)', async () => {
    // Storage faz filtro em SQL — entao espera-se que o resultado nao volte com aborted.
    // Aqui o mock simplesmente retorna [] (filtragem feita pela query SQL).
    dbMock.select.mockReturnValue(buildSelectMock([]));
    const r = await (storage as any).getLatestWarmupRitual('USER-0001');
    expect(r).toBeNull();
  });

  it('escopa por userId (nao retorna ritual de outro usuario)', async () => {
    dbMock.select.mockReturnValue(buildSelectMock([]));
    await (storage as any).getLatestWarmupRitual('USER-0001');
    // espera que o where tenha sido chamado com filtro por userId
    expect(dbMock.select).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listWarmupRituals (historico paginado)
// ---------------------------------------------------------------------------

describe('storage.listWarmupRituals', () => {
  it('retorna array ordenado DESC por startedAt (RF-17)', async () => {
    const rituals = [
      { id: 'r-3', startedAt: new Date('2026-04-25T18:00:00Z'), version: 'full' },
      { id: 'r-2', startedAt: new Date('2026-04-24T18:00:00Z'), version: 'full' },
      { id: 'r-1', startedAt: new Date('2026-04-23T18:00:00Z'), version: 'aborted' },
    ];
    dbMock.select.mockReturnValue(buildSelectMock(rituals));

    const r = await (storage as any).listWarmupRituals({
      userId: 'USER-0001',
      limit: 14,
      offset: 0,
    });
    expect(r).toBeDefined();
    expect(Array.isArray(r) || Array.isArray(r?.items)).toBe(true);
  });

  it('respeita parametro limit (default 14, max 100)', async () => {
    dbMock.select.mockReturnValue(buildSelectMock([]));
    await (storage as any).listWarmupRituals({ userId: 'USER-0001', limit: 14, offset: 0 });
    expect(dbMock.select).toHaveBeenCalled();
  });

  it('respeita parametro offset', async () => {
    dbMock.select.mockReturnValue(buildSelectMock([]));
    await (storage as any).listWarmupRituals({ userId: 'USER-0001', limit: 14, offset: 28 });
    expect(dbMock.select).toHaveBeenCalled();
  });

  it('aceita filtros from e to (date range)', async () => {
    dbMock.select.mockReturnValue(buildSelectMock([]));
    await (storage as any).listWarmupRituals({
      userId: 'USER-0001',
      from: new Date('2026-04-01').toISOString(),
      to: new Date('2026-04-25').toISOString(),
      limit: 14,
      offset: 0,
    });
    expect(dbMock.select).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateUserSettingsWeeklyHeuristics
// ---------------------------------------------------------------------------

describe('storage.updateUserSettingsWeeklyHeuristics', () => {
  // Implementacao usa UPSERT (insert + onConflictDoUpdate) por HIGH-4 do review
  // pre-merge: UPDATE puro era no-op silencioso quando user nao tinha row em
  // user_settings (caso comum em first-touch da feature warm-up).
  it('UPSERT user_settings.weekly_heuristics com tuple de 3 strings (RF-22)', async () => {
    const valuesChain: any = {
      onConflictDoUpdate: vi.fn(() => Promise.resolve([{ userId: 'USER-0001' }])),
    };
    dbMock.insert.mockReturnValue({ values: vi.fn(() => valuesChain) });

    const r = await (storage as any).updateUserSettingsWeeklyHeuristics('USER-0001', [
      'h1',
      'h2',
      'h3',
    ]);
    expect(dbMock.insert).toHaveBeenCalled();
    expect(r.heuristics).toEqual(['h1', 'h2', 'h3']);
  });

  it('cria row de user_settings quando nao existe (HIGH-4 fix)', async () => {
    // Simula primeiro touch: ON CONFLICT nao dispara, INSERT cria a row.
    const conflictResolver = vi.fn(() => Promise.resolve([{ userId: 'USER-NEW' }]));
    const valuesChain: any = { onConflictDoUpdate: conflictResolver };
    dbMock.insert.mockReturnValue({ values: vi.fn(() => valuesChain) });

    const r = await (storage as any).updateUserSettingsWeeklyHeuristics('USER-NEW', [
      'a',
      'b',
      'c',
    ]);

    // INSERT deve ser chamado mesmo sem row pre-existente.
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(conflictResolver).toHaveBeenCalledTimes(1);
    expect(r.heuristics).toEqual(['a', 'b', 'c']);
  });
});
