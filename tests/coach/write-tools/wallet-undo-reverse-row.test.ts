import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-02 — Undo de record_wallet_transaction = REVERSE-ROW
//
// ADR-058: wallet_transactions eh ledger imutavel. Undo NUNCA hard-delete.
// Em vez disso, cria nova row com delta inverso + reason='manual_correction' +
// reversedByActionId apontando para o coach_actions.id.
//
// Este test valida que o handler.undo() chama walletService.recordWalletTransaction
// com delta INVERTIDO (deposito -> withdrawal de mesmo amount).
// =============================================================================

const recordWalletTransactionMock = vi.fn();
vi.mock('../../../server/services/walletService', () => ({
  walletService: { recordWalletTransaction: recordWalletTransactionMock },
  recordWalletTransaction: recordWalletTransactionMock,
}));

const ctx = {
  userId: 'USER-0001',
  chatSessionId: 'sess_1',
  messageId: 'msg_1',
  actionId: 'act_1',
};

beforeEach(() => {
  recordWalletTransactionMock.mockReset();
});

describe('record_wallet_transaction.undo — reverse-row imutavel', () => {
  it('deposit confirmed -> undo cria withdrawal de mesmo amount com reason=manual_correction', async () => {
    recordWalletTransactionMock.mockResolvedValue({
      transaction: { id: 'tx-rev', newNativeBalance: '1450.00' },
      wallet: { id: 'w-1', balanceNative: '1450.00' },
    });

    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');

    const txClient = { query: vi.fn() };
    const out = await recordWalletTransactionTool.undo(
      { walletId: 'w-1', walletBalanceNative: 1450, walletBalanceUSD: 1450 },  // payloadBefore
      {
        walletId: 'w-1',
        walletBalanceNative: 1500, walletBalanceUSD: 1500,
        delta: 50, transactionId: 'tx-original',
      }, // payloadAfter
      ctx as any,
      txClient,
    );

    expect(recordWalletTransactionMock).toHaveBeenCalled();
    const callArgs = recordWalletTransactionMock.mock.calls[0];
    // input no 3o argumento (userId, walletId, input, externalTx)
    const input = callArgs[2];
    expect(input.direction).toBe('out');
    expect(Number(input.nativeAmount)).toBe(50);
    // Bug fix simplify: 'manual_correction' nao existe em WALLET_TX_REASONS_P0;
    // usamos 'manual_adjustment' (canonico shared/wallet-reasons.ts).
    expect(input.reason).toBe('manual_adjustment');
    expect(input.note || input.notes).toMatch(/Desfeito|undo|reversed/i);

    expect(out.reversedEntityId).toBe('tx-rev');
  });

  it('withdrawal confirmed -> undo cria deposit reversal', async () => {
    recordWalletTransactionMock.mockResolvedValue({
      transaction: { id: 'tx-rev', newNativeBalance: '500' },
      wallet: { id: 'w-2', balanceNative: '500' },
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await recordWalletTransactionTool.undo(
      { walletId: 'w-2', walletBalanceNative: 500 },
      { walletId: 'w-2', walletBalanceNative: 400, delta: -100, transactionId: 'tx-orig' },
      ctx as any,
      txClient,
    );
    const input = recordWalletTransactionMock.mock.calls[0][2];
    expect(input.direction).toBe('in');
    expect(Number(input.nativeAmount)).toBe(100);
  });

  it('NUNCA chama hard-delete (DELETE FROM wallet_transactions) — reverse-row only', async () => {
    recordWalletTransactionMock.mockResolvedValue({
      transaction: { id: 'tx-rev', newNativeBalance: '1450' },
      wallet: { id: 'w-1', balanceNative: '1450' },
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await recordWalletTransactionTool.undo(
      { walletBalanceNative: 1450 },
      { walletBalanceNative: 1500, delta: 50, transactionId: 'tx-orig', walletId: 'w-1' },
      ctx as any,
      txClient,
    );
    // ledger imutavel: ZERO chamadas de DELETE
    const txCalls = txClient.query.mock.calls.map((c: any) => String(c[0] || ''));
    expect(txCalls.some(q => /DELETE\s+FROM\s+wallet_transactions/i.test(q))).toBe(false);
  });

  it('passa externalTx (lesson #194)', async () => {
    recordWalletTransactionMock.mockResolvedValue({
      transaction: { id: 'tx-rev' },
      wallet: { id: 'w-1' },
    });
    const { recordWalletTransactionTool } =
      await import('../../../server/coachTools/handlers/recordWalletTransaction');
    const txClient = { query: vi.fn() };
    await recordWalletTransactionTool.undo(
      { walletBalanceNative: 1450 },
      { walletBalanceNative: 1500, delta: 50, transactionId: 'tx-orig', walletId: 'w-1' },
      ctx as any,
      txClient,
    );
    expect(recordWalletTransactionMock.mock.calls[0][3]).toBe(txClient);
  });
});
