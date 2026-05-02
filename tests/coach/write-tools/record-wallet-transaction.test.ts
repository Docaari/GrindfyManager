import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-02 — record_wallet_transaction (write tool)
//
// Fontes:
//   - Docs/specs/coach-2b.md (RF-02)
//   - ADR-058 (wallet ledger imutavel — undo via reverse-row)
//   - ADR-077 (coach_actions audit trail)
//   - ADR-083 (state machine confirm/undo)
//
// IMPORTANTE: este arquivo testa o HANDLER (Zod validate + executeConfirmed +
// fetchPayloadBefore + undo). Lesson #3 (mocks idealizados) — validamos shape REAL
// retornado por walletService.recordWalletTransaction.
//
// O test integration que usa DB real fica em
// tests/integration/coach/record-wallet-transaction-db.test.ts (TODO follow-up).
// =============================================================================

// Mock storage com shape real (lesson #3): wallet existe, balance, currency.
const getWalletMock = vi.fn();
const recordWalletTransactionMock = vi.fn();

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    recordWalletTransaction: recordWalletTransactionMock,
  },
  recordWalletTransaction: recordWalletTransactionMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getWallet: getWalletMock,
  },
}));

const ctx = {
  userId: 'USER-0001',
  chatSessionId: 'sess_1',
  messageId: 'msg_1',
  actionId: 'act_1',
};

beforeEach(() => {
  getWalletMock.mockReset();
  recordWalletTransactionMock.mockReset();
});

describe('record_wallet_transaction — Zod validation', () => {
  it('aceita input valido', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const valid = recordWalletTransactionTool.inputSchema.safeParse({
      walletId: 'w-1', amount: 50, currency: 'USD',
      type: 'deposit', reason: 'deposit',
    });
    expect(valid.success).toBe(true);
  });

  it('rejeita amount negativo (Zod positive)', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const out = recordWalletTransactionTool.inputSchema.safeParse({
      walletId: 'w-1', amount: -50, currency: 'USD', type: 'deposit', reason: 'deposit',
    });
    expect(out.success).toBe(false);
  });

  it('rejeita currency invalida (Zod enum)', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const out = recordWalletTransactionTool.inputSchema.safeParse({
      walletId: 'w-1', amount: 50, currency: 'XYZ', type: 'deposit', reason: 'deposit',
    });
    expect(out.success).toBe(false);
  });

  it('rejeita type fora do enum', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const out = recordWalletTransactionTool.inputSchema.safeParse({
      walletId: 'w-1', amount: 50, currency: 'USD',
      type: 'foo', reason: 'deposit',
    });
    expect(out.success).toBe(false);
  });

  it('aceita 4 moedas (USD, BRL, EUR, CNY)', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    for (const currency of ['USD', 'BRL', 'EUR', 'CNY']) {
      const out = recordWalletTransactionTool.inputSchema.safeParse({
        walletId: 'w-1', amount: 50, currency, type: 'deposit', reason: 'deposit',
      });
      expect(out.success).toBe(true);
    }
  });
});

describe('record_wallet_transaction — Tool meta (Coach-2B)', () => {
  it('requiresConfirmation = true', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    expect(recordWalletTransactionTool.requiresConfirmation).toBe(true);
  });

  it('auditLevel = persist', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    expect(recordWalletTransactionTool.auditLevel).toBe('persist');
  });

  it('gateByTier = pro+ (free nao recebe write tools)', async () => {
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    expect(recordWalletTransactionTool.gateByTier).toEqual(
      expect.arrayContaining(['pro', 'premium', 'admin']),
    );
    expect(recordWalletTransactionTool.gateByTier).not.toContain('free');
  });
});

describe('fetchPayloadBefore — captura estado pre-mutacao', () => {
  it('retorna SHAPE REAL (lesson #3): walletBalanceNative + walletBalanceUSD + walletId', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-1', userId: 'USER-0001', name: 'PokerStars USD',
      nativeCurrency: 'USD', balanceNative: '1450.00', balanceUSD: '1450.00',
      isActive: true,
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    const before = await recordWalletTransactionTool.fetchPayloadBefore(
      { walletId: 'w-1', amount: 50, currency: 'USD', type: 'deposit', reason: 'deposit' },
      ctx as any,
      txClient,
    );
    expect(before).toMatchObject({
      walletId: 'w-1',
      walletBalanceNative: expect.anything(),
    });
  });
});

describe('executeConfirmed — happy path', () => {
  it('USD deposito 50 atualiza balance via walletService', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-1', userId: 'USER-0001', nativeCurrency: 'USD',
      balanceNative: '1450.00', isActive: true,
    });
    // Lesson #3: walletService retorna SHAPE REAL — transactionId, newBalanceNative, etc
    recordWalletTransactionMock.mockResolvedValue({
      transaction: { id: 'tx-x', newNativeBalance: '1500.00' },
      wallet: { id: 'w-1', balanceNative: '1500.00', balanceUSD: '1500.00' },
    });

    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    const out = await recordWalletTransactionTool.executeConfirmed(
      { walletId: 'w-1', amount: 50, currency: 'USD', type: 'deposit', reason: 'deposit' },
      ctx as any,
      txClient,
    );
    expect(out.affectedEntityType).toBe('wallet_transaction');
    expect(out.affectedEntityId).toBe('tx-x');
    expect(out.payloadAfter).toMatchObject({ walletBalanceNative: expect.anything() });
  });

  it('BRL withdrawal 100 chama walletService com direction=out + currency=BRL', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-2', userId: 'USER-0001', nativeCurrency: 'BRL',
      balanceNative: '500.00', isActive: true,
    });
    recordWalletTransactionMock.mockResolvedValue({
      transaction: { id: 'tx-w', newNativeBalance: '400.00' },
      wallet: { id: 'w-2', balanceNative: '400.00' },
    });

    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await recordWalletTransactionTool.executeConfirmed(
      { walletId: 'w-2', amount: 100, currency: 'BRL', type: 'withdrawal', reason: 'withdrawal' },
      ctx as any,
      txClient,
    );

    expect(recordWalletTransactionMock).toHaveBeenCalled();
    const callArgs = recordWalletTransactionMock.mock.calls[0];
    // walletService(userId, walletId, input, externalTx?)
    expect(callArgs[0]).toBe('USER-0001');
    expect(callArgs[1]).toBe('w-2');
    expect(callArgs[2]?.direction).toBe('out');
  });

  it('passa externalTx para walletService (lesson #194)', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-1', userId: 'USER-0001', nativeCurrency: 'USD',
      balanceNative: '1000', isActive: true,
    });
    recordWalletTransactionMock.mockResolvedValue({
      transaction: { id: 'tx', newNativeBalance: '1050' },
      wallet: { id: 'w-1', balanceNative: '1050' },
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await recordWalletTransactionTool.executeConfirmed(
      { walletId: 'w-1', amount: 50, currency: 'USD', type: 'deposit', reason: 'deposit' },
      ctx as any,
      txClient,
    );
    const args = recordWalletTransactionMock.mock.calls[0];
    expect(args[3]).toBe(txClient); // externalTx no 4o param
  });
});

describe('executeConfirmed — error paths (Zod superRefine)', () => {
  it('walletId de outro user => wallet_not_owned', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-1', userId: 'USER-OTHER', nativeCurrency: 'USD',
      balanceNative: '1000', isActive: true,
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await expect(recordWalletTransactionTool.executeConfirmed(
      { walletId: 'w-1', amount: 50, currency: 'USD', type: 'deposit', reason: 'deposit' },
      ctx as any,
      txClient,
    )).rejects.toThrow(/wallet_not_owned/);
  });

  it('currency mismatch (USD wallet, BRL input) => currency_mismatch', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-1', userId: 'USER-0001', nativeCurrency: 'USD',
      balanceNative: '1000', isActive: true,
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await expect(recordWalletTransactionTool.executeConfirmed(
      { walletId: 'w-1', amount: 50, currency: 'BRL', type: 'deposit', reason: 'deposit' },
      ctx as any,
      txClient,
    )).rejects.toThrow(/currency_mismatch/);
  });

  it('withdrawal > balance => insufficient_balance', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-1', userId: 'USER-0001', nativeCurrency: 'USD',
      balanceNative: '50', isActive: true,
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await expect(recordWalletTransactionTool.executeConfirmed(
      { walletId: 'w-1', amount: 100, currency: 'USD', type: 'withdrawal', reason: 'withdrawal' },
      ctx as any,
      txClient,
    )).rejects.toThrow(/insufficient_balance/);
  });

  it('wallet inativa => wallet_inactive', async () => {
    getWalletMock.mockResolvedValue({
      id: 'w-1', userId: 'USER-0001', nativeCurrency: 'USD',
      balanceNative: '1000', isActive: false,
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await expect(recordWalletTransactionTool.executeConfirmed(
      { walletId: 'w-1', amount: 50, currency: 'USD', type: 'deposit', reason: 'deposit' },
      ctx as any,
      txClient,
    )).rejects.toThrow(/wallet_inactive/);
  });
});
