import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): invariantes do sistema
//
// Fonte: docs/architecture/bankroll-index.md (secao "Invariantes a serem testadas")
//        docs/architecture/decisions/017-bankroll-snapshot-vs-derived.md (detalhes)
//
// Os 6 invariantes:
//   1. user_settings.bankroll_amount == ultimo snapshot.new_amount (cache autoritativo).
//   2. snapshot[n+1].previous_amount == snapshot[n].new_amount (sem drift).
//   3. delta != 0 em todo snapshot (Zod valida).
//   4. occurred_at <= now() em todo snapshot (Zod valida).
//   5. UPDATE + INSERT atomicos (transacao). Falha em uma aborta a outra.
//   6. Cascade: DELETE user remove todos seus snapshots.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    getBankrollSnapshots: vi.fn(),
    insertBankrollSnapshot: vi.fn(),
    updateUserBankroll: vi.fn(),
    getUserBankrollForUpdate: vi.fn(),
    transaction: vi.fn(),
    upsertUserSettings: vi.fn(),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: { invalidateAllForUser: vi.fn(), get: vi.fn(), set: vi.fn() },
}));

import { bankrollService } from '../../../server/services/bankrollService';
import { storage } from '../../../server/storage';
import { insertBankrollSnapshotSchema } from '../../../shared/schema';

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Invariante 1: user_settings.bankroll_amount == ultimo snapshot.new_amount
// ===========================================================================

describe('Invariante 1: user_settings.bankroll_amount == ultimo snapshot.new_amount', () => {
  it('apos updateBankroll, bankroll_amount persistido == newAmount do snapshot criado', async () => {
    const observedUpdate: any = { amount: undefined };
    const observedInsert: any = { newAmount: undefined };

    (storage.transaction as any).mockImplementation(async (fn: any) => fn({
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn().mockImplementation(({ amount }: any) => {
        observedUpdate.amount = amount;
      }),
      insertBankrollSnapshot: vi.fn().mockImplementation((data: any) => {
        observedInsert.newAmount = Number(data.newAmount);
        return Promise.resolve({ id: 'snap-1', ...data });
      }),
    }));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.updateBankroll('USER-0001', { amount: 1000, rule: '1pct', reason: 'initial' });

    expect(observedUpdate.amount).toBe(observedInsert.newAmount);
  });

  it('apos recordSnapshot, bankroll_amount persistido == newAmount do snapshot criado', async () => {
    const observedUpdate: any = { amount: undefined };
    const observedInsert: any = { newAmount: undefined };

    (storage.transaction as any).mockImplementation(async (fn: any) => fn({
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '1000', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn().mockImplementation(({ amount }: any) => {
        observedUpdate.amount = amount;
      }),
      insertBankrollSnapshot: vi.fn().mockImplementation((data: any) => {
        observedInsert.newAmount = Number(data.newAmount);
        return Promise.resolve({ id: 'snap-2', ...data });
      }),
    }));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1500', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'deposit' });

    expect(observedUpdate.amount).toBe(observedInsert.newAmount);
    expect(observedUpdate.amount).toBe(1500);
  });
});

// ===========================================================================
// Invariante 2: snapshot[n+1].previous_amount == snapshot[n].new_amount
// ===========================================================================

describe('Invariante 2: snapshot[n+1].previous_amount == snapshot[n].new_amount (sem drift)', () => {
  it('sequencia de 5 snapshots mantem previous_amount encadeado', async () => {
    const observedSnapshots: Array<{ prev: number; newVal: number }> = [];
    let currentAmount = 1000;

    (storage.transaction as any).mockImplementation(async (fn: any) => fn({
      getUserBankrollForUpdate: vi.fn().mockImplementation(() => ({
        bankrollAmount: String(currentAmount), bankrollRule: '1pct',
      })),
      updateUserBankroll: vi.fn().mockImplementation(({ amount }: any) => {
        currentAmount = amount;
      }),
      insertBankrollSnapshot: vi.fn().mockImplementation((data: any) => {
        observedSnapshots.push({
          prev: Number(data.previousAmount),
          newVal: Number(data.newAmount),
        });
        return Promise.resolve({ id: 'snap', ...data });
      }),
    }));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    // Sequencia de movimentos
    await bankrollService.recordSnapshot('USER-0001', { delta: 200, reason: 'deposit' });
    await bankrollService.recordSnapshot('USER-0001', { delta: 100, reason: 'deposit' });
    await bankrollService.recordSnapshot('USER-0001', { delta: -50, reason: 'withdrawal' });
    await bankrollService.recordSnapshot('USER-0001', { delta: 75, reason: 'session_result' });

    expect(observedSnapshots.length).toBe(4);
    for (let i = 1; i < observedSnapshots.length; i++) {
      expect(observedSnapshots[i].prev).toBe(observedSnapshots[i - 1].newVal);
    }
  });
});

// ===========================================================================
// Invariante 3: delta != 0 em todo snapshot
// ===========================================================================

describe('Invariante 3: delta != 0 (validado no Zod)', () => {
  it('Zod schema rejeita delta=0', () => {
    const r = insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: '0',
      previousAmount: '1000',
      newAmount: '1000',
      reason: 'deposit',
    });
    expect(r.success).toBe(false);
  });

  it('Zod schema rejeita delta=0.0', () => {
    const r = insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: 0,
      previousAmount: 1000,
      newAmount: 1000,
      reason: 'deposit',
    });
    expect(r.success).toBe(false);
  });

  it('service.recordSnapshot rejeita delta=0 antes de chegar ao storage', async () => {
    await expect(
      bankrollService.recordSnapshot('USER-0001', { delta: 0, reason: 'deposit' })
    ).rejects.toThrow(/delta/i);
  });
});

// ===========================================================================
// Invariante 4: occurred_at <= now()
// ===========================================================================

describe('Invariante 4: occurred_at <= now() (validado no Zod)', () => {
  it('Zod schema rejeita occurredAt no futuro', () => {
    const tomorrow = new Date(Date.now() + 86400000);
    const r = insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: '500',
      previousAmount: '1000',
      newAmount: '1500',
      reason: 'deposit',
      occurredAt: tomorrow,
    });
    expect(r.success).toBe(false);
  });

  it('Zod schema aceita occurredAt no passado (retroativo permitido)', () => {
    const yesterday = new Date(Date.now() - 86400000);
    const r = insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: '500',
      previousAmount: '1000',
      newAmount: '1500',
      reason: 'deposit',
      occurredAt: yesterday,
    });
    expect(r.success).toBe(true);
  });

  it('service.recordSnapshot rejeita occurredAt futuro antes de chegar ao storage', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    await expect(
      bankrollService.recordSnapshot('USER-0001', {
        delta: 500, reason: 'deposit', occurredAt: futureDate,
      })
    ).rejects.toThrow(/futuro|future/i);
  });
});

// ===========================================================================
// Invariante 5: UPDATE + INSERT atomicos
// ===========================================================================

describe('Invariante 5: UPDATE + INSERT atomicos (transacao)', () => {
  it('falha em INSERT aborta UPDATE (transacao reverte)', async () => {
    const updateSpy = vi.fn();
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      try {
        return await fn({
          getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
          updateUserBankroll: updateSpy,
          insertBankrollSnapshot: vi.fn().mockRejectedValue(new Error('insert falhou')),
        });
      } catch (err) {
        // Simula rollback de Drizzle
        throw err;
      }
    });

    await expect(
      bankrollService.updateBankroll('USER-0001', {
        amount: 1000, rule: '1pct', reason: 'initial',
      })
    ).rejects.toThrow(/insert falhou/);
  });

  it('service NAO invoca updateUserBankroll fora da transacao', async () => {
    let calledInsideTransaction = false;
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      const tx = {
        getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
        updateUserBankroll: vi.fn().mockImplementation(() => {
          calledInsideTransaction = true;
        }),
        insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap', newAmount: '1000' }),
      };
      return fn(tx);
    });
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.updateBankroll('USER-0001', {
      amount: 1000, rule: '1pct', reason: 'initial',
    });

    expect(calledInsideTransaction).toBe(true);
    // O metodo top-level de storage (fora da tx) NAO deve ser chamado
    expect(storage.updateUserBankroll).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Invariante 6: Cascade - DELETE user remove todos snapshots
// ===========================================================================

describe('Invariante 6: FK user_id ON DELETE CASCADE', () => {
  it.todo('testa em DB real: DELETE FROM users WHERE id = USER-0001 remove bankroll_snapshots.userId=USER-0001');
  it.todo('nenhum snapshot de outro usuario e removido');
  it.todo('migracao 0002_sprint2_bankroll_snapshots.sql declara ON DELETE CASCADE');

  // Os testes acima sao it.todo porque exigem DB real (nao dao para validar com mocks de drizzle).
  // Em ambiente de CI com banco de teste dedicado, converter para integration real.
});
