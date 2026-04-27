import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-04 — Gate de coach por plano
//
// Modulo alvo: server/coachAccess.ts (NAO EXISTE)
//   - canAccessCoach(tier, coachType): boolean
//   - getAccessibleCoaches(tier): CoachType[]
//   - getUpgradeTarget(currentTier, requestedCoach): 'pro' | 'premium' | null
//
// Matriz (spec RF-04.3):
//   free     -> mental
//   pro      -> mental, tournament
//   premium  -> mental, tournament, technical
//   admin    -> qualquer (bypass)
//
// MEDIUM-2 — clearUserTierCache(userId) invalida cache em mudancas de plano.
// =============================================================================

// Mock db ANTES de importar coachAccess para que o cache de tier possa ser
// testado de forma controlada (resolveUserTier dispara db.select no caminho 'active').
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ type: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ type: 'and', a })),
  desc: vi.fn((...a: any[]) => ({ type: 'desc', a })),
}));

vi.mock('@shared/schema', () => ({
  userSubscriptions: {},
  subscriptionPlans: {},
}));

import {
  canAccessCoach,
  getAccessibleCoaches,
  getUpgradeTarget,
  resolveUserTier,
  clearUserTierCache,
  clearTierCache,
} from '../../../server/coachAccess';

describe('canAccessCoach', () => {
  it('free pode acessar mental', () => {
    expect(canAccessCoach('free', 'mental')).toBe(true);
  });
  it('free NAO pode acessar tournament', () => {
    expect(canAccessCoach('free', 'tournament')).toBe(false);
  });
  it('free NAO pode acessar technical', () => {
    expect(canAccessCoach('free', 'technical')).toBe(false);
  });

  it('pro pode acessar mental', () => {
    expect(canAccessCoach('pro', 'mental')).toBe(true);
  });
  it('pro pode acessar tournament', () => {
    expect(canAccessCoach('pro', 'tournament')).toBe(true);
  });
  it('pro NAO pode acessar technical', () => {
    expect(canAccessCoach('pro', 'technical')).toBe(false);
  });

  it('premium pode acessar mental', () => {
    expect(canAccessCoach('premium', 'mental')).toBe(true);
  });
  it('premium pode acessar tournament', () => {
    expect(canAccessCoach('premium', 'tournament')).toBe(true);
  });
  it('premium pode acessar technical', () => {
    expect(canAccessCoach('premium', 'technical')).toBe(true);
  });

  it('admin pode acessar qualquer coach', () => {
    expect(canAccessCoach('admin', 'mental')).toBe(true);
    expect(canAccessCoach('admin', 'tournament')).toBe(true);
    expect(canAccessCoach('admin', 'technical')).toBe(true);
  });
});

describe('getAccessibleCoaches', () => {
  it('free -> [mental]', () => {
    expect(getAccessibleCoaches('free')).toEqual(['mental']);
  });
  it('pro -> [mental, tournament]', () => {
    expect(getAccessibleCoaches('pro').sort()).toEqual(['mental', 'tournament']);
  });
  it('premium -> [mental, tournament, technical]', () => {
    expect(getAccessibleCoaches('premium').sort()).toEqual(['mental', 'technical', 'tournament']);
  });
  it('admin -> [mental, tournament, technical]', () => {
    expect(getAccessibleCoaches('admin').sort()).toEqual(['mental', 'technical', 'tournament']);
  });
});

describe('getUpgradeTarget', () => {
  it('free pedindo tournament -> pro', () => {
    expect(getUpgradeTarget('free', 'tournament')).toBe('pro');
  });
  it('free pedindo technical -> premium', () => {
    expect(getUpgradeTarget('free', 'technical')).toBe('premium');
  });
  it('pro pedindo technical -> premium', () => {
    expect(getUpgradeTarget('pro', 'technical')).toBe('premium');
  });
  it('free pedindo mental -> null (ja pode)', () => {
    expect(getUpgradeTarget('free', 'mental')).toBeNull();
  });
  it('premium pedindo technical -> null (ja pode)', () => {
    expect(getUpgradeTarget('premium', 'technical')).toBeNull();
  });
  it('admin pedindo qualquer coach -> null (bypass)', () => {
    expect(getUpgradeTarget('admin', 'technical')).toBeNull();
    expect(getUpgradeTarget('admin', 'tournament')).toBeNull();
    expect(getUpgradeTarget('admin', 'mental')).toBeNull();
  });
});

// =============================================================================
// MEDIUM-2 — clearUserTierCache invalidates cache and forces re-query
// =============================================================================

describe('clearUserTierCache (MEDIUM-2)', () => {
  beforeEach(() => {
    clearTierCache();
    vi.clearAllMocks();
  });

  // Helper: mocka a chain db.select(...).from(...).leftJoin(...).where(...).orderBy(...).limit(...)
  function mockDbReturn(rows: any[]) {
    return {
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
        }),
      }),
    };
  }

  it('clearUserTierCache(userId) remove a entrada cacheada', async () => {
    const { db } = await import('../../../server/db') as any;

    // Primeira chamada: db retorna 'pro' e cacheia
    db.select = vi
      .fn()
      .mockReturnValueOnce(mockDbReturn([{ planName: 'Plano Pro Anual' }]));

    const tier1 = await resolveUserTier({
      id: 'u-1',
      userPlatformId: 'USER-0001',
      role: 'user',
      subscriptionPlan: 'active',
    });
    expect(tier1).toBe('pro');
    expect(db.select).toHaveBeenCalledTimes(1);

    // Segunda chamada (sem clearUserTierCache): hit no cache, NAO consulta DB
    const tier2 = await resolveUserTier({
      id: 'u-1',
      userPlatformId: 'USER-0001',
      role: 'user',
      subscriptionPlan: 'active',
    });
    expect(tier2).toBe('pro');
    expect(db.select).toHaveBeenCalledTimes(1); // ainda 1 — cache hit

    // Invalida cache: proxima chamada DEVE re-consultar o DB.
    clearUserTierCache('USER-0001');

    db.select = vi
      .fn()
      .mockReturnValueOnce(mockDbReturn([{ planName: 'Plano Premium Mensal' }]));

    const tier3 = await resolveUserTier({
      id: 'u-1',
      userPlatformId: 'USER-0001',
      role: 'user',
      subscriptionPlan: 'active',
    });
    expect(tier3).toBe('premium');
    expect(db.select).toHaveBeenCalledTimes(1); // chamou de novo (na nova mock)
  });

  it('clearUserTierCache aceita userId vazio sem lancar', () => {
    expect(() => clearUserTierCache('')).not.toThrow();
    expect(() => clearUserTierCache(undefined as any)).not.toThrow();
  });

  it('clearUserTierCache so afeta o user especificado', async () => {
    const { db } = await import('../../../server/db') as any;

    // User A: cacheia como pro
    db.select = vi
      .fn()
      .mockReturnValueOnce(mockDbReturn([{ planName: 'Pro' }]))
      .mockReturnValueOnce(mockDbReturn([{ planName: 'Premium' }]));

    const tA = await resolveUserTier({
      id: 'u-a',
      userPlatformId: 'USER-AAAA',
      role: 'user',
      subscriptionPlan: 'active',
    });
    expect(tA).toBe('pro');

    // User B: cacheia como premium
    const tB = await resolveUserTier({
      id: 'u-b',
      userPlatformId: 'USER-BBBB',
      role: 'user',
      subscriptionPlan: 'active',
    });
    expect(tB).toBe('premium');

    expect(db.select).toHaveBeenCalledTimes(2);

    // Limpa apenas A
    clearUserTierCache('USER-AAAA');

    // B continua cacheado: nao consulta o DB
    const tB2 = await resolveUserTier({
      id: 'u-b',
      userPlatformId: 'USER-BBBB',
      role: 'user',
      subscriptionPlan: 'active',
    });
    expect(tB2).toBe('premium');
    expect(db.select).toHaveBeenCalledTimes(2); // ainda 2 — B veio do cache

    // A precisa re-consultar
    db.select = vi
      .fn()
      .mockReturnValueOnce(mockDbReturn([{ planName: 'Premium' }]));

    const tA2 = await resolveUserTier({
      id: 'u-a',
      userPlatformId: 'USER-AAAA',
      role: 'user',
      subscriptionPlan: 'active',
    });
    expect(tA2).toBe('premium');
    expect(db.select).toHaveBeenCalledTimes(1); // 1 chamada na nova mock
  });
});

// =============================================================================
// INFO-1/2 — Promise-cache mitiga thundering herd
// =============================================================================

describe('resolveUserTier promise-cache (INFO-1/2)', () => {
  beforeEach(() => {
    clearTierCache();
    vi.clearAllMocks();
  });

  it('5 chamadas concorrentes para mesmo user disparam apenas 1 query', async () => {
    const { db } = await import('../../../server/db') as any;

    // Promise pendente que so resolve apos as 5 chamadas concorrentes terem sido emitidas
    let resolveLimit: (v: any) => void = () => {};
    const limitPromise = new Promise((resolve) => {
      resolveLimit = resolve;
    });

    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue(limitPromise),
            }),
          }),
        }),
      }),
    });

    const userInput = {
      id: 'u-1',
      userPlatformId: 'USER-0001',
      role: 'user',
      subscriptionPlan: 'active',
    };

    // Dispara 5 requests concorrentes ANTES da query resolver
    const all = Promise.all([
      resolveUserTier(userInput),
      resolveUserTier(userInput),
      resolveUserTier(userInput),
      resolveUserTier(userInput),
      resolveUserTier(userInput),
    ]);

    // Agora resolve o limit() — todas as 5 chamadas devem completar
    resolveLimit([{ planName: 'Premium' }]);

    const results = await all;
    expect(results).toEqual(['premium', 'premium', 'premium', 'premium', 'premium']);

    // Apenas 1 chamada a db.select — as outras 4 receberam o Promise compartilhado
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
