import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): server/services/bankrollService.ts
//
// Fonte: docs/specs/bankroll-management.md (RF-01 a RF-04)
//        docs/architecture/bankroll-index.md (Resumo Tecnico -> bankrollService)
//        docs/architecture/flows/bankroll/sequence-configure.md (atomicidade + FOR UPDATE)
//
// API esperada do service:
//   getBankrollState(userId: string): Promise<BankrollState>
//   updateBankroll(userId, { amount, rule, reason, note }): Promise<BankrollState>
//   recordSnapshot(userId, { delta, reason, note, occurredAt? }): Promise<{ snapshot, bankroll }>
//   getBankrollHistory(userId, filters): Promise<BankrollHistoryResponse>
//
// Invariantes testadas:
//   - Transacao atomica: UPDATE user_settings + INSERT bankroll_snapshots
//   - Se amount nao mudou, NAO cria snapshot (apenas UPDATE rule)
//   - Snapshot inicial forcado a reason="initial"
//   - Erro em INSERT aborta UPDATE (rollback)
//   - Cache do Selector invalidado apos mutacao
//   - Concorrencia Q-Arch-3: SELECT FOR UPDATE serializa
// =============================================================================

// ===========================================================================
// Mock do storage real — NAO inventamos shapes idealizados; usamos o
// mesmo contrato da UserSettings ja validada em tests/unit/schema/user-settings-bankroll.
// (Licao do Sprint 1: tests/integration/scoring/storage-vs-scorer.test.ts.)
// ===========================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    // novos metodos que o Implementer vai criar (spec RF-05 + index tecnico)
    getBankrollSnapshots: vi.fn(),
    insertBankrollSnapshot: vi.fn(),
    updateUserBankroll: vi.fn(),
    getUserBankrollForUpdate: vi.fn(), // SELECT FOR UPDATE (Q-Arch-3)
    transaction: vi.fn(async (fn: any) => fn({
      getUserSettings: vi.fn(),
      upsertUserSettings: vi.fn(),
      getBankrollSnapshots: vi.fn(),
      insertBankrollSnapshot: vi.fn(),
      updateUserBankroll: vi.fn(),
      getUserBankrollForUpdate: vi.fn(),
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
});

// ===========================================================================
// getBankrollState (RF-01)
// ===========================================================================

describe('bankrollService.getBankrollState', () => {
  it('retorna configured=false quando bankrollAmount=null', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: null,
      bankrollRule: '1pct',
      exchangeRates: {},
      updatedAt: new Date('2026-04-20T10:00:00Z'),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');

    expect(r.configured).toBe(false);
    expect(r.amount).toBeNull();
    expect(r.maxBuyInUSD).toBeNull();
    expect(r.snapshotCount).toBe(0);
  });

  it('retorna configured=true + maxBuyIn=15 com amount=1000 e rule=1pct', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 5.2 },
      updatedAt: new Date('2026-04-24T18:00:00Z'),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([
      { id: 's1' }, { id: 's2' }, { id: 's3' },
    ]);

    const r = await bankrollService.getBankrollState('USER-0001');

    expect(r.configured).toBe(true);
    expect(r.amount).toBe(1000);
    expect(r.rule).toBe('1pct');
    expect(r.rulePct).toBe(1.0);
    expect(r.tolerance).toBe(1.5);
    expect(r.maxBuyInUSD).toBe(15);
    expect(r.snapshotCount).toBe(3);
  });

  it('retorna maxBuyInDisplay com BRL derivado via exchangeRates', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 5.2 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');

    expect(r.maxBuyInDisplay).toBeDefined();
    expect(r.maxBuyInDisplay.USD).toBe(15);
    expect(r.maxBuyInDisplay.BRL).toBeCloseTo(78, 1); // 15 USD * 5.2
  });

  it('rule invalida -> fallback 1pct + warning (spec RF-01 criterio)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '500',
      bankrollRule: 'bogus',
      exchangeRates: {},
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');

    expect(r.rulePct).toBe(1.0);
    expect(r.maxBuyInUSD).toBe(7.5); // 500 * 0.01 * 1.5
  });

  it('custom:3 com amount=500 -> rulePct=3.0 e maxBuyIn=22.5', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '500',
      bankrollRule: 'custom:3',
      exchangeRates: {},
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');

    expect(r.rulePct).toBe(3.0);
    expect(r.maxBuyInUSD).toBeCloseTo(22.5, 5);
  });
});

// ===========================================================================
// updateBankroll (RF-02) - com transacao e snapshot condicional
// ===========================================================================

describe('bankrollService.updateBankroll', () => {
  it('primeira configuracao: amount=1000 + rule=1pct -> cria snapshot "initial"', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn().mockResolvedValue(undefined),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({
        id: 'snap-init',
        delta: '1000',
        previousAmount: '0',
        newAmount: '1000',
        reason: 'initial',
      }),
      getUserSettings: vi.fn(),
      upsertUserSettings: vi.fn(),
      getBankrollSnapshots: vi.fn().mockResolvedValue([]),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));

    // Apos a transacao, o service le o estado atualizado:
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000',
      bankrollRule: '1pct',
      exchangeRates: {},
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([{ id: 'snap-init' }]);

    const r = await bankrollService.updateBankroll('USER-0001', {
      amount: 1000,
      rule: '1pct',
      reason: 'initial',
    });

    expect(txStorage.insertBankrollSnapshot).toHaveBeenCalledTimes(1);
    const insertCall = (txStorage.insertBankrollSnapshot.mock.calls[0] as any[])[0];
    expect(insertCall.reason).toBe('initial');
    expect(Number(insertCall.delta)).toBe(1000);
    expect(Number(insertCall.previousAmount)).toBe(0);
    expect(Number(insertCall.newAmount)).toBe(1000);
    expect(r.configured).toBe(true);
    expect(r.amount).toBe(1000);
  });

  it('mudar apenas rule (amount inalterado) -> NAO cria snapshot', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '1000', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn().mockResolvedValue(undefined),
      insertBankrollSnapshot: vi.fn(),
      getBankrollSnapshots: vi.fn().mockResolvedValue([{ id: 's1' }]),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));

    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000',
      bankrollRule: '2pct',
      exchangeRates: {},
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([{ id: 's1' }]);

    await bankrollService.updateBankroll('USER-0001', {
      amount: 1000,
      rule: '2pct',
    });

    expect(txStorage.insertBankrollSnapshot).not.toHaveBeenCalled();
    expect(txStorage.updateUserBankroll).toHaveBeenCalled();
  });

  it('mudar amount em usuario ja configurado SEM reason -> lanca erro "reason obrigatorio"', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '1000', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn(),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));

    await expect(
      bankrollService.updateBankroll('USER-0001', { amount: 1500, rule: '1pct' })
    ).rejects.toThrow(/reason/i);
    expect(txStorage.insertBankrollSnapshot).not.toHaveBeenCalled();
  });

  it('custom:0.05 (abaixo do min) -> lanca erro antes da transacao', async () => {
    await expect(
      bankrollService.updateBankroll('USER-0001', { amount: 1000, rule: 'custom:0.05', reason: 'initial' })
    ).rejects.toThrow(/0\.1.*20/i);
  });

  it('custom:25 (acima do max) -> lanca erro', async () => {
    await expect(
      bankrollService.updateBankroll('USER-0001', { amount: 1000, rule: 'custom:25', reason: 'initial' })
    ).rejects.toThrow(/0\.1.*20/i);
  });

  it('amount=null (desconfigura) em usuario com banca -> cria snapshot manual_adjustment com delta negativo total', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '1500', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn().mockResolvedValue(undefined),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap-undo' }),
      getBankrollSnapshots: vi.fn().mockResolvedValue([]),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));

    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: null,
      bankrollRule: '1pct',
      exchangeRates: {},
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.updateBankroll('USER-0001', {
      amount: null,
      rule: '1pct',
      reason: 'manual_adjustment',
    });

    expect(txStorage.insertBankrollSnapshot).toHaveBeenCalled();
    const call = (txStorage.insertBankrollSnapshot.mock.calls[0] as any[])[0];
    expect(Number(call.delta)).toBe(-1500);
    expect(Number(call.newAmount)).toBe(0);
    expect(call.reason).toBe('manual_adjustment');
  });

  it('invalida cache do Selector apos mutacao bem-sucedida', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1' }),
      getBankrollSnapshots: vi.fn().mockResolvedValue([]),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.updateBankroll('USER-0001', {
      amount: 1000, rule: '1pct', reason: 'initial',
    });

    expect(selectorCache.invalidateAllForUser).toHaveBeenCalledWith('USER-0001');
    expect(selectorCache.invalidateAllForUser).toHaveBeenCalledTimes(1);
  });

  it('atomicidade: falha em INSERT snapshot aborta UPDATE (rollback)', async () => {
    const updateSpy = vi.fn();
    const insertSpy = vi.fn().mockRejectedValue(new Error('DB: snapshot insert failed'));
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
      updateUserBankroll: updateSpy,
      insertBankrollSnapshot: insertSpy,
      getBankrollSnapshots: vi.fn().mockResolvedValue([]),
    };
    // A transacao deve propagar o erro (drizzle.transaction reverte se o callback lanca)
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      try {
        return await fn(txStorage);
      } catch (err) {
        // Simula o rollback do Drizzle e relanca
        throw err;
      }
    });

    await expect(
      bankrollService.updateBankroll('USER-0001', {
        amount: 1000, rule: '1pct', reason: 'initial',
      })
    ).rejects.toThrow(/snapshot insert failed/);

    // Nao chama invalidate em caso de erro
    expect(selectorCache.invalidateAllForUser).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// recordSnapshot (RF-03) - aporte/saque/ajuste
// ===========================================================================

describe('bankrollService.recordSnapshot', () => {
  it('aporte $500 em banca $1000 -> nova banca $1500 + snapshot criado', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '1000', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({
        id: 'snap-deposit',
        delta: '500',
        previousAmount: '1000',
        newAmount: '1500',
        reason: 'deposit',
      }),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1500', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([{ id: 'snap-deposit' }]);

    const r = await bankrollService.recordSnapshot('USER-0001', {
      delta: 500,
      reason: 'deposit',
      note: 'PIX',
    });

    expect(r.snapshot).toBeDefined();
    expect(r.bankroll.amount).toBe(1500);
    const insertCall = (txStorage.insertBankrollSnapshot.mock.calls[0] as any[])[0];
    expect(Number(insertCall.delta)).toBe(500);
    expect(Number(insertCall.newAmount)).toBe(1500);
    expect(Number(insertCall.previousAmount)).toBe(1000);
  });

  it('saque -$300 em banca $1000 -> nova banca $700', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '1000', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap' }),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '700', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.recordSnapshot('USER-0001', { delta: -300, reason: 'withdrawal' });

    const insertCall = (txStorage.insertBankrollSnapshot.mock.calls[0] as any[])[0];
    expect(Number(insertCall.newAmount)).toBe(700);
    expect(insertCall.reason).toBe('withdrawal');
  });

  it('rejeita delta=0', async () => {
    await expect(
      bankrollService.recordSnapshot('USER-0001', { delta: 0, reason: 'deposit' })
    ).rejects.toThrow(/delta/i);
  });

  it('rejeita reason="initial" (so permitido em updateBankroll)', async () => {
    await expect(
      bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'initial' as any })
    ).rejects.toThrow();
  });

  it('rejeita occurredAt no futuro', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    await expect(
      bankrollService.recordSnapshot('USER-0001', {
        delta: 500, reason: 'deposit', occurredAt: futureDate,
      })
    ).rejects.toThrow(/futuro|future/i);
  });

  it('erro 409 quando banca nao configurada (spec RF-03)', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: null, bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn(),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));

    await expect(
      bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'deposit' })
    ).rejects.toThrow(/configure.*banca|not configured|configured/i);
  });

  it('banca vira negativa -> aceita com flag warning (spec Q6)', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn().mockResolvedValue({ bankrollAmount: '100', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap-bust' }),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '-200', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.recordSnapshot('USER-0001', {
      delta: -300,
      reason: 'withdrawal',
    });

    expect(r.warning).toBe('bankroll_negative');
    expect(r.bankroll.amount).toBe(-200);
  });

  it('nao e idempotente: 2 chamadas identicas criam 2 snapshots (spec NFR)', async () => {
    const txStorage = {
      getUserBankrollForUpdate: vi.fn()
        .mockResolvedValueOnce({ bankrollAmount: '1000', bankrollRule: '1pct' })
        .mockResolvedValueOnce({ bankrollAmount: '1500', bankrollRule: '1pct' }),
      updateUserBankroll: vi.fn(),
      insertBankrollSnapshot: vi.fn()
        .mockResolvedValueOnce({ id: 'snap-1', newAmount: '1500' })
        .mockResolvedValueOnce({ id: 'snap-2', newAmount: '2000' }),
    };
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(txStorage));
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '2000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'deposit' });
    await bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'deposit' });

    expect(txStorage.insertBankrollSnapshot).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// getBankrollHistory (RF-04) - paginacao, series com forward-fill, summary
// ===========================================================================

describe('bankrollService.getBankrollHistory', () => {
  it('sem banca configurada -> retorna estrutura vazia (nao lanca erro)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: null, bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollHistory('USER-0001', {});

    expect(r.snapshots).toEqual([]);
    expect(r.series).toEqual([]);
    expect(r.summary.netChange).toBe(0);
    expect(r.summary.startBalance).toBe(0);
    expect(r.summary.endBalance).toBe(0);
  });

  it('summary agrega por reason corretamente', async () => {
    const snapshots = [
      { id: 's1', occurredAt: new Date('2026-04-01'), delta: '1000', previousAmount: '0', newAmount: '1000', reason: 'initial', note: null, source: 'manual' },
      { id: 's2', occurredAt: new Date('2026-04-05'), delta: '500', previousAmount: '1000', newAmount: '1500', reason: 'deposit', note: 'PIX', source: 'manual' },
      { id: 's3', occurredAt: new Date('2026-04-10'), delta: '-300', previousAmount: '1500', newAmount: '1200', reason: 'withdrawal', note: null, source: 'manual' },
      { id: 's4', occurredAt: new Date('2026-04-15'), delta: '127.50', previousAmount: '1200', newAmount: '1327.50', reason: 'session_result', note: null, source: 'manual' },
    ];
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1327.50', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue(snapshots);

    const r = await bankrollService.getBankrollHistory('USER-0001', {
      from: '2026-04-01', to: '2026-04-30',
    });

    expect(r.summary.totalDeposits).toBe(500);
    expect(r.summary.totalWithdrawals).toBe(300);
    expect(r.summary.totalSessionPnL).toBe(127.5);
    expect(r.summary.netChange).toBe(1327.5);
  });

  it('series com forward-fill: bucket sem movimento mantem balance do bucket anterior', async () => {
    const snapshots = [
      { id: 's1', occurredAt: new Date('2026-04-01T12:00:00Z'), delta: '1000', previousAmount: '0', newAmount: '1000', reason: 'initial', note: null, source: 'manual' },
      { id: 's2', occurredAt: new Date('2026-04-05T12:00:00Z'), delta: '500', previousAmount: '1000', newAmount: '1500', reason: 'deposit', note: null, source: 'manual' },
    ];
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1500', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue(snapshots);

    const r = await bankrollService.getBankrollHistory('USER-0001', {
      from: '2026-04-01', to: '2026-04-07', granularity: 'day',
    });

    // 7 buckets, cada um com balance forward-filled
    expect(r.series.length).toBe(7);
    // Dia 02-04 sem movimento mantem balance=1000
    const day2 = r.series.find((s: any) => s.bucket === '2026-04-02');
    expect(day2?.balance).toBe(1000);
    const day6 = r.series.find((s: any) => s.bucket === '2026-04-06');
    expect(day6?.balance).toBe(1500);
  });

  it('from > to -> lanca erro 400', async () => {
    await expect(
      bankrollService.getBankrollHistory('USER-0001', {
        from: '2026-04-30', to: '2026-04-01',
      })
    ).rejects.toThrow(/from.*to|invalid.*range|invalid.*date/i);
  });

  it('limit > 500 -> clamp em 500', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.getBankrollHistory('USER-0001', { limit: 10000 });

    const call = (storage.getBankrollSnapshots as any).mock.calls[0];
    const filters = call[1] ?? call[0];
    expect(filters.limit).toBeLessThanOrEqual(500);
  });

  it('granularity="week" agrupa por semana ISO', async () => {
    const snapshots = [
      { id: 's1', occurredAt: new Date('2026-04-06T12:00:00Z'), delta: '1000', previousAmount: '0', newAmount: '1000', reason: 'initial', note: null, source: 'manual' },
    ];
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue(snapshots);

    const r = await bankrollService.getBankrollHistory('USER-0001', {
      from: '2026-03-30', to: '2026-04-26', granularity: 'week',
    });

    // 4 semanas no range (semana ISO comeca segunda-feira)
    expect(r.series.length).toBeGreaterThanOrEqual(3);
    expect(r.series.length).toBeLessThanOrEqual(5);
  });

  it('filtro reason="deposit,withdrawal" aplica no query do storage', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.getBankrollHistory('USER-0001', {
      reason: 'deposit,withdrawal',
    });

    const call = (storage.getBankrollSnapshots as any).mock.calls[0];
    const filters = call[1] ?? call[0];
    expect(filters.reason).toEqual(expect.arrayContaining(['deposit', 'withdrawal']));
  });
});

// ===========================================================================
// Concorrencia (Q-Arch-3): SELECT FOR UPDATE serializa
// ===========================================================================

describe('bankrollService - concorrencia (Q-Arch-3)', () => {
  it('2 POST /snapshot paralelos sao serializados via SELECT FOR UPDATE', async () => {
    // Simula serializacao: o segundo request espera o primeiro terminar.
    const observedOrder: string[] = [];
    let currentAmount = 1000;

    (storage.transaction as any).mockImplementation(async (fn: any) => {
      const txStorage = {
        getUserBankrollForUpdate: vi.fn().mockImplementation(async () => {
          observedOrder.push(`select:${currentAmount}`);
          return { bankrollAmount: String(currentAmount), bankrollRule: '1pct' };
        }),
        updateUserBankroll: vi.fn().mockImplementation(async ({ amount }: any) => {
          observedOrder.push(`update:${amount}`);
          currentAmount = amount;
        }),
        insertBankrollSnapshot: vi.fn().mockImplementation(async (data: any) => {
          observedOrder.push(`insert:${Number(data.newAmount)}`);
          return { id: `snap-${Number(data.newAmount)}`, ...data };
        }),
      };
      return fn(txStorage);
    });
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '2000', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    // NAO usamos Promise.all com paralelismo real (tests nao tem DB),
    // mas garantimos que o service chama getUserBankrollForUpdate DENTRO da transacao
    // (invariante documentada no sequence-configure.md passo 4).
    await bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'deposit' });
    await bankrollService.recordSnapshot('USER-0001', { delta: 500, reason: 'deposit' });

    // Ordem serializada: select -> update -> insert -> select -> update -> insert
    expect(observedOrder).toEqual([
      'select:1000',
      'update:1500',
      'insert:1500',
      'select:1500', // le valor atualizado do primeiro
      'update:2000',
      'insert:2000',
    ]);
  });

  it('snapshot[n+1].previous_amount == snapshot[n].new_amount (invariante ADR-017)', async () => {
    const seen: Array<{ prev: number; new: number }> = [];
    let currentAmount = 500;

    (storage.transaction as any).mockImplementation(async (fn: any) => {
      const txStorage = {
        getUserBankrollForUpdate: vi.fn().mockImplementation(async () => ({
          bankrollAmount: String(currentAmount), bankrollRule: '1pct',
        })),
        updateUserBankroll: vi.fn().mockImplementation(async ({ amount }: any) => {
          currentAmount = amount;
        }),
        insertBankrollSnapshot: vi.fn().mockImplementation(async (data: any) => {
          seen.push({ prev: Number(data.previousAmount), new: Number(data.newAmount) });
          return { id: 'snap', ...data };
        }),
      };
      return fn(txStorage);
    });
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '500', bankrollRule: '1pct', exchangeRates: {}, updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.recordSnapshot('USER-0001', { delta: 100, reason: 'deposit' });
    await bankrollService.recordSnapshot('USER-0001', { delta: 200, reason: 'deposit' });
    await bankrollService.recordSnapshot('USER-0001', { delta: -50, reason: 'withdrawal' });

    expect(seen.length).toBe(3);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].prev).toBe(seen[i - 1].new);
    }
  });
});
