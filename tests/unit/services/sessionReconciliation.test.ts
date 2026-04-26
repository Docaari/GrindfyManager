/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-04: backend itera fail-fast por wallet, calcula delta, chama walletService.recordWalletTransaction
 *  - RF-08: idempotencia preflight via storage.findReconciliationMarker
 * ADR : Docs/architecture/decisions/040-session-end-wallet-reconciliation.md
 *
 * Helpers testados (modulo NAO existe ainda — implementer cria):
 *   server/services/sessionReconciliation.ts
 *     - computeAdjustment(wallet, reportedBalance, expectedPreviousBalance):
 *         { delta, direction, nativeAmount } | null  (null se |delta| < 0.01)
 *     - runReconciliation(userId, sessionId, adjustments):
 *         { created: TxReceipt[], skipped: number,
 *           failed?: { walletId, code, message, currentBalance? } }
 *         OU
 *         { alreadyReconciled: true, existingCount: N, created: [], skipped: 0 }
 *
 * Mocks:
 *  - walletService.recordWalletTransaction — shape REAL: retorna { transaction, wallet, warning? }
 *    e em erro joga Error com .code/.statusCode/.currentBalance
 *  - storage.findReconciliationMarker — preflight idempotencia
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock antes de import dinamico no try/catch (alinhado ao pattern dos outros tests).
vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    recordWalletTransaction: vi.fn(),
    createWallet: vi.fn(),
    getWallet: vi.fn(),
    listWallets: vi.fn(),
    updateWallet: vi.fn(),
    archiveWallet: vi.fn(),
    listWalletTransactions: vi.fn(),
    getConsolidatedBalance: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    findReconciliationMarker: vi.fn(),
    getGrindSession: vi.fn(),
  },
}));

import {
  computeAdjustment,
  runReconciliation,
} from '../../../server/services/sessionReconciliation';
import { walletService } from '../../../server/services/walletService';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// computeAdjustment
// =============================================================================

describe('computeAdjustment (RF-03 epsilon, RF-04 direction/amount)', () => {
  it('delta positivo -> direction=in, nativeAmount=|delta|', () => {
    const r = computeAdjustment(
      { id: 'wA', balance: '1180.00', nativeCurrency: 'BRL' } as any,
      1247.0,
      1180.0,
    );
    expect(r).not.toBeNull();
    expect(r!.direction).toBe('in');
    expect(r!.nativeAmount).toBeCloseTo(67.0, 2);
  });

  it('delta negativo -> direction=out, nativeAmount=|delta|', () => {
    const r = computeAdjustment(
      { id: 'wA', balance: '200.00', nativeCurrency: 'USD' } as any,
      165.0,
      200.0,
    );
    expect(r).not.toBeNull();
    expect(r!.direction).toBe('out');
    expect(r!.nativeAmount).toBeCloseTo(35.0, 2);
  });

  it('delta zero (exato) -> retorna null (skip)', () => {
    const r = computeAdjustment(
      { id: 'wA', balance: '1000.00', nativeCurrency: 'USD' } as any,
      1000.0,
      1000.0,
    );
    expect(r).toBeNull();
  });

  it('|delta| < 0.01 (epsilon) -> retorna null (skip)', () => {
    const r = computeAdjustment(
      { id: 'wA', balance: '1000.00', nativeCurrency: 'USD' } as any,
      1000.005,
      1000.0,
    );
    expect(r).toBeNull();
  });

  it('|delta| >= 0.01 (boundary inclusivo) -> retorna ajuste', () => {
    const r = computeAdjustment(
      { id: 'wA', balance: '1000.00', nativeCurrency: 'USD' } as any,
      1000.01,
      1000.0,
    );
    expect(r).not.toBeNull();
    expect(r!.direction).toBe('in');
    expect(r!.nativeAmount).toBeCloseTo(0.01, 2);
  });
});

// =============================================================================
// runReconciliation — happy path
// =============================================================================

describe('runReconciliation - happy path (RF-04, US-01)', () => {
  it('cria tx para 2 ajustes nao-zero, retorna created.length=2 skipped=0', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (walletService.recordWalletTransaction as any)
      .mockResolvedValueOnce({
        transaction: { id: 'tx1', walletId: 'wA', direction: 'in', nativeAmount: '67' },
        wallet: { id: 'wA', balance: '1247' },
      })
      .mockResolvedValueOnce({
        transaction: { id: 'tx2', walletId: 'wB', direction: 'out', nativeAmount: '35' },
        wallet: { id: 'wB', balance: '165' },
      });

    const r = await runReconciliation('USER-0001', 'ses_1', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
      { walletId: 'wB', reportedBalance: 165, expectedPreviousBalance: 200 },
    ]);

    expect(r.alreadyReconciled).toBeFalsy();
    expect(r.created).toHaveLength(2);
    expect(r.skipped).toBe(0);
    expect(r.failed).toBeUndefined();
  });

  it('passa source=auto_session, reason=session_result, sessionId, expectedPreviousBalance no payload', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx1' },
      wallet: { id: 'wA', balance: '1247' },
    });

    await runReconciliation('USER-0001', 'ses_xyz', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
    ]);

    expect(walletService.recordWalletTransaction).toHaveBeenCalledTimes(1);
    const call = (walletService.recordWalletTransaction as any).mock.calls[0];
    // assinatura: recordWalletTransaction(userId, walletId, input)
    expect(call[0]).toBe('USER-0001');
    expect(call[1]).toBe('wA');
    const input = call[2];
    expect(input.reason).toBe('session_result');
    expect(input.source).toBe('auto_session');
    expect(input.sessionId).toBe('ses_xyz');
    expect(input.expectedPreviousBalance).toBe(1180);
    expect(input.direction).toBe('in');
    expect(input.nativeAmount).toBeCloseTo(67, 2);
    expect(typeof input.note).toBe('string');
  });

  it('skipa silenciosamente delta < 0.01, contabiliza em skipped', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx1' },
      wallet: { id: 'wA' },
    });

    const r = await runReconciliation('USER-0001', 'ses_1', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
      { walletId: 'wB', reportedBalance: 100.005, expectedPreviousBalance: 100.0 },
      { walletId: 'wC', reportedBalance: 200, expectedPreviousBalance: 200 },
    ]);

    expect(r.created).toHaveLength(1);
    expect(r.skipped).toBe(2);
    expect(walletService.recordWalletTransaction).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// runReconciliation — fail-fast mid-batch
// =============================================================================

describe('runReconciliation - fail-fast mid-batch (RF-04, US-04, US-06)', () => {
  it('1o ok, 2o ok, 3o 409 balance_mismatch -> created=[tx1,tx2], failed.code=balance_mismatch', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    const mismatchErr: any = new Error('balance_mismatch');
    mismatchErr.statusCode = 409;
    mismatchErr.code = 'balance_mismatch';
    mismatchErr.currentBalance = 1280;

    (walletService.recordWalletTransaction as any)
      .mockResolvedValueOnce({
        transaction: { id: 'tx1' },
        wallet: { id: 'wA', balance: '1247' },
      })
      .mockResolvedValueOnce({
        transaction: { id: 'tx2' },
        wallet: { id: 'wB', balance: '165' },
      })
      .mockRejectedValueOnce(mismatchErr);

    const r = await runReconciliation('USER-0001', 'ses_1', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
      { walletId: 'wB', reportedBalance: 165, expectedPreviousBalance: 200 },
      { walletId: 'wC', reportedBalance: 50, expectedPreviousBalance: 60 },
    ]);

    expect(r.created).toHaveLength(2);
    expect(r.failed).toBeDefined();
    expect(r.failed!.walletId).toBe('wC');
    expect(r.failed!.code).toBe('balance_mismatch');
    expect(r.failed!.currentBalance).toBe(1280);
  });

  it('1o falha imediatamente -> created=[], failed.walletId=primeiro', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    const archivedErr: any = new Error('wallet_archived');
    archivedErr.statusCode = 422;
    archivedErr.code = 'wallet_archived';
    (walletService.recordWalletTransaction as any).mockRejectedValueOnce(archivedErr);

    const r = await runReconciliation('USER-0001', 'ses_1', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
      { walletId: 'wB', reportedBalance: 165, expectedPreviousBalance: 200 },
    ]);

    expect(r.created).toHaveLength(0);
    expect(r.failed).toBeDefined();
    expect(r.failed!.walletId).toBe('wA');
    expect(r.failed!.code).toBe('wallet_archived');
    // Loop fail-fast: nao chama o 2o ajuste
    expect(walletService.recordWalletTransaction).toHaveBeenCalledTimes(1);
  });

  it('tx anteriores NAO sao revertidas (fail-fast nao implica rollback)', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    const mismatchErr: any = new Error('balance_mismatch');
    mismatchErr.statusCode = 409;
    mismatchErr.code = 'balance_mismatch';

    (walletService.recordWalletTransaction as any)
      .mockResolvedValueOnce({ transaction: { id: 'tx1' }, wallet: { id: 'wA' } })
      .mockRejectedValueOnce(mismatchErr);

    const r = await runReconciliation('USER-0001', 'ses_1', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
      { walletId: 'wB', reportedBalance: 165, expectedPreviousBalance: 200 },
    ]);

    // tx1 permanece em created (nao foi removida apos a falha do 2o)
    expect(r.created).toHaveLength(1);
    expect((r.created as any[])[0].id).toBe('tx1');
  });
});

// =============================================================================
// runReconciliation — idempotencia (RF-08)
// =============================================================================

describe('runReconciliation - idempotencia (RF-08, US-05)', () => {
  it('marker pre-existente -> retorna alreadyReconciled=true sem chamar service', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 2 });

    const r = await runReconciliation('USER-0001', 'ses_already', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
    ]);

    expect(r.alreadyReconciled).toBe(true);
    expect(r.existingCount).toBe(2);
    expect(r.created).toHaveLength(0);
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });

  it('preflight chamado com sessionId correto', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 1 });
    await runReconciliation('USER-0001', 'ses_check', []);
    expect(storage.findReconciliationMarker).toHaveBeenCalledTimes(1);
    const args = (storage.findReconciliationMarker as any).mock.calls[0];
    // primeiro arg: sessionId
    expect(args[0]).toBe('ses_check');
  });
});

// =============================================================================
// runReconciliation — adjustments=[] (skip total via endpoint)
// =============================================================================

describe('runReconciliation - adjustments vazio', () => {
  it('adjustments=[] e marker zero -> created=[] skipped=0', async () => {
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });

    const r = await runReconciliation('USER-0001', 'ses_1', []);

    expect(r.created).toHaveLength(0);
    expect(r.skipped).toBe(0);
    expect(r.alreadyReconciled).toBeFalsy();
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });
});
