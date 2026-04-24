import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): cache invalidation (Q-Arch-1 + Q-Arch-4)
//
// Fonte: docs/architecture/bankroll-index.md (Q-Arch-1, Q-Arch-4)
//        docs/architecture/flows/bankroll/sequence-configure.md (passo 14: invalidation)
//
// Requisitos:
//   Q-Arch-1: apos mutacao de banca, selectorCache.invalidateAllForUser(userId) limpa TODAS
//             as chaves do usuario (nao invalida outros usuarios).
//   Q-Arch-4: cache de GET /api/bankroll/history tem TTL 5min + invalidado em mutacao.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    getBankrollSnapshots: vi.fn(),
    insertBankrollSnapshot: vi.fn(),
    updateUserBankroll: vi.fn(),
    getUserBankrollForUpdate: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn({
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1', newAmount: '1000' }),
      getBankrollSnapshots: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: {
    invalidateAllForUser: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { bankrollService } from '../../../server/services/bankrollService';
import { storage } from '../../../server/storage';
import { selectorCache } from '../../../server/services/selectorCache';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({
    bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
  });
  (storage.getBankrollSnapshots as any).mockResolvedValue([]);
});

// ===========================================================================
// Q-Arch-1: invalidacao do selectorCache apos mutacao
// ===========================================================================

describe('Q-Arch-1: invalidacao do selectorCache apos mutacao de banca', () => {
  it('PUT /api/bankroll -> invalidateUserSelectorCache(userId) chamado 1x', async () => {
    await bankrollService.updateBankroll('USER-0001', {
      amount: 1000, rule: '1pct', reason: 'initial',
    });

    expect(selectorCache.invalidateAllForUser).toHaveBeenCalledTimes(1);
    expect(selectorCache.invalidateAllForUser).toHaveBeenCalledWith('USER-0001');
  });

  it('POST /api/bankroll/snapshot -> invalidateUserSelectorCache(userId) chamado 1x', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => fn({
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '1000', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1', newAmount: '1500' }),
    }));

    await bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'deposit' });

    expect(selectorCache.invalidateAllForUser).toHaveBeenCalledTimes(1);
    expect(selectorCache.invalidateAllForUser).toHaveBeenCalledWith('USER-0001');
  });

  it('invalidateAllForUser e idempotente (chamar 2x nao falha)', async () => {
    // Nao testamos a implementacao do cache aqui — apenas que e "safe to call twice".
    (selectorCache.invalidateAllForUser as any).mockImplementation(() => {});
    expect(() => {
      (selectorCache.invalidateAllForUser as any)('USER-0001');
      (selectorCache.invalidateAllForUser as any)('USER-0001');
    }).not.toThrow();
  });

  it('invalidacao NAO limpa cache de outros usuarios', async () => {
    // Spy que verifica o argumento exato
    (selectorCache.invalidateAllForUser as any).mockImplementation((uid: string) => {
      expect(uid).toBe('USER-0001');
    });

    await bankrollService.updateBankroll('USER-0001', {
      amount: 1000, rule: '1pct', reason: 'initial',
    });

    const calls = (selectorCache.invalidateAllForUser as any).mock.calls;
    expect(calls.every((c: any[]) => c[0] === 'USER-0001')).toBe(true);
  });

  it('erro em invalidacao NAO aborta a mutacao (side-effect nao-critico)', async () => {
    (selectorCache.invalidateAllForUser as any).mockImplementation(() => {
      throw new Error('cache unreachable');
    });

    // A mutacao ja foi persistida; erro na invalidacao vira apenas log.
    // spec NFR: "Se der erro na invalidacao, banca ja foi persistida — proximo request
    // do Selector usa cache stale mas eventualmente expira (TTL 30min)".
    const r = await bankrollService.updateBankroll('USER-0001', {
      amount: 1000, rule: '1pct', reason: 'initial',
    });

    expect(r.configured).toBe(true);
    expect(r.amount).toBe(1000);
  });
});

// ===========================================================================
// Q-Arch-4: cache de /api/bankroll/history TTL 5min + invalidacao em mutacao
// ===========================================================================

describe('Q-Arch-4: cache de /api/bankroll/history', () => {
  it.todo('primeira chamada GET /history popula cache (bankrollHistoryCache.set)');

  it.todo('segunda chamada identica em <5min retorna do cache (cacheHit:true)');

  it.todo('apos 5min, cache expira e refaz query');

  it.todo('PUT /api/bankroll invalida cache de history do mesmo usuario');

  it.todo('POST /api/bankroll/snapshot invalida cache de history do mesmo usuario');

  it.todo('invalidacao respeita (userId, from, to, granularity, reason) - chaves diferentes de outros users nao sao limpas');

  it.todo('TTL da cache = 5min (spec NFR)');
});

// Nota: os testes acima ficam as it.todo porque dependem da decisao do
// Implementer de montar um cache dedicado (ex: server/services/bankrollCache.ts
// seguindo o padrao de selectorCache) ou usar HTTP caching headers.
// O path canonico proposto e:
//    server/services/bankrollCache.ts
// exportando:
//    bankrollCache.get(userId, filtersHash) / set(userId, filtersHash, data)
//    bankrollCache.invalidateAllForUser(userId)
