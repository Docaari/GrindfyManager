import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: shared/schema.ts -> tabela wallet_transactions (RF-03) +
// insertWalletTransactionSchema (Zod)
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-03, RF-05)
// ADR-034: ledger imutavel, fxRateUSDPerNative IMUTAVEL pos-insert
// =============================================================================

import {
  walletTransactions,
  insertWalletTransactionSchema,
} from '../../../shared/schema';
import { WALLET_TX_REASONS, WALLET_TX_REASONS_P0 } from '../../../shared/wallet-reasons';

describe('walletTransactions - definicao da tabela Drizzle', () => {
  it('exportado de shared/schema.ts', () => {
    expect(walletTransactions).toBeDefined();
  });

  it('tem coluna id (PK)', () => {
    expect((walletTransactions as any).id).toBeDefined();
  });

  it('tem coluna walletId (FK)', () => {
    expect((walletTransactions as any).walletId).toBeDefined();
  });

  it('tem coluna userId (denormalizado)', () => {
    expect((walletTransactions as any).userId).toBeDefined();
  });

  it('tem colunas occurredAt + effectiveAt', () => {
    expect((walletTransactions as any).occurredAt).toBeDefined();
    expect((walletTransactions as any).effectiveAt).toBeDefined();
  });

  it('tem coluna direction (in|out)', () => {
    expect((walletTransactions as any).direction).toBeDefined();
  });

  it('tem coluna nativeAmount + nativeCurrency', () => {
    expect((walletTransactions as any).nativeAmount).toBeDefined();
    expect((walletTransactions as any).nativeCurrency).toBeDefined();
  });

  it('tem coluna fxRateUSDPerNative + usdAmount', () => {
    expect((walletTransactions as any).fxRateUSDPerNative).toBeDefined();
    expect((walletTransactions as any).usdAmount).toBeDefined();
  });

  it('tem colunas previousNativeBalance + newNativeBalance (audit ADR-017)', () => {
    expect((walletTransactions as any).previousNativeBalance).toBeDefined();
    expect((walletTransactions as any).newNativeBalance).toBeDefined();
  });

  it('tem coluna reason (enum)', () => {
    expect((walletTransactions as any).reason).toBeDefined();
  });

  it('tem colunas feeAmount + feeCurrency (nullable)', () => {
    expect((walletTransactions as any).feeAmount).toBeDefined();
    expect((walletTransactions as any).feeCurrency).toBeDefined();
  });

  it('tem coluna sessionId (nullable, FK grind_sessions)', () => {
    expect((walletTransactions as any).sessionId).toBeDefined();
  });

  it('tem coluna note (text)', () => {
    expect((walletTransactions as any).note).toBeDefined();
  });

  it('tem coluna source (manual|auto_session|migration_v1|auto_import_csv)', () => {
    expect((walletTransactions as any).source).toBeDefined();
  });

  it('tem campos reservados transferGroupId + stakingDealId (nullable)', () => {
    expect((walletTransactions as any).transferGroupId).toBeDefined();
    expect((walletTransactions as any).stakingDealId).toBeDefined();
  });
});

describe('insertWalletTransactionSchema - validacao Zod', () => {
  const validInput = {
    walletId: 'wlt_abc123',
    userId: 'USER-0001',
    occurredAt: new Date('2026-04-26T15:00:00Z'),
    effectiveAt: new Date('2026-04-26T15:00:00Z'),
    direction: 'in' as const,
    nativeAmount: '100.00',
    nativeCurrency: 'USD',
    fxRateUSDPerNative: '1.0',
    usdAmount: '100.00',
    previousNativeBalance: '0.00',
    newNativeBalance: '100.00',
    reason: 'deposit' as const,
  };

  it('aceita input minimo valido', () => {
    const r = insertWalletTransactionSchema.safeParse(validInput);
    expect(r.success).toBe(true);
  });

  it('rejeita direction invalido', () => {
    const r = insertWalletTransactionSchema.safeParse({ ...validInput, direction: 'sideways' });
    expect(r.success).toBe(false);
  });

  it('aceita direction in e out', () => {
    expect(insertWalletTransactionSchema.safeParse({ ...validInput, direction: 'in' }).success).toBe(true);
    expect(insertWalletTransactionSchema.safeParse({ ...validInput, direction: 'out' }).success).toBe(true);
  });

  it('rejeita reason fora do enum total', () => {
    const r = insertWalletTransactionSchema.safeParse({ ...validInput, reason: 'foo_bar' });
    expect(r.success).toBe(false);
  });

  it('aceita todos os reasons P0', () => {
    for (const reason of WALLET_TX_REASONS_P0) {
      const r = insertWalletTransactionSchema.safeParse({ ...validInput, reason });
      expect(r.success, `reason=${reason}`).toBe(true);
    }
  });

  it('aceita reasons reservados (P1+) — schema base nao filtra; endpoint que filtra', () => {
    // RF-05: schema base aceita TODOS os reasons (forward-compat); endpoint
    // POST /api/wallets/:id/transactions filtra para WALLET_TX_REASONS_P0.
    for (const reason of ['transfer_in', 'transfer_out', 'fee', 'fx_adjustment']) {
      const r = insertWalletTransactionSchema.safeParse({ ...validInput, reason });
      expect(r.success, `reason=${reason}`).toBe(true);
    }
  });

  it('rejeita nativeAmount <= 0 (sempre positivo; sinal vem de direction)', () => {
    expect(insertWalletTransactionSchema.safeParse({ ...validInput, nativeAmount: '0' }).success).toBe(false);
    expect(insertWalletTransactionSchema.safeParse({ ...validInput, nativeAmount: '-50' }).success).toBe(false);
  });

  it('rejeita fxRateUSDPerNative <= 0', () => {
    expect(insertWalletTransactionSchema.safeParse({ ...validInput, fxRateUSDPerNative: '0' }).success).toBe(false);
    expect(insertWalletTransactionSchema.safeParse({ ...validInput, fxRateUSDPerNative: '-1' }).success).toBe(false);
  });

  it('feeAmount + feeCurrency: ambos null OU ambos set', () => {
    // Ambos null
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, feeAmount: null, feeCurrency: null,
    }).success).toBe(true);
    // Ambos set
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, feeAmount: '5.00', feeCurrency: 'USD',
    }).success).toBe(true);
    // So feeAmount sem feeCurrency -> rejeita
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, feeAmount: '5.00', feeCurrency: null,
    }).success).toBe(false);
    // So feeCurrency sem feeAmount -> rejeita
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, feeAmount: null, feeCurrency: 'USD',
    }).success).toBe(false);
  });

  it('transferGroupId nullable; quando set deve ser nanoid-like', () => {
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, transferGroupId: null,
    }).success).toBe(true);
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, transferGroupId: 'xfer_abc123',
    }).success).toBe(true);
    // String vazia rejeita (consistencia com nanoid)
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, transferGroupId: '',
    }).success).toBe(false);
  });

  it('sessionId nullable; quando set valida tipo string', () => {
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, sessionId: null,
    }).success).toBe(true);
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, sessionId: 'ses_abc123',
    }).success).toBe(true);
  });

  it('note max 500 chars', () => {
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, note: 'x'.repeat(500),
    }).success).toBe(true);
    expect(insertWalletTransactionSchema.safeParse({
      ...validInput, note: 'x'.repeat(501),
    }).success).toBe(false);
  });

  it('source aceita os 4 valores canonicos', () => {
    for (const source of ['manual', 'auto_session', 'migration_v1', 'auto_import_csv']) {
      const r = insertWalletTransactionSchema.safeParse({ ...validInput, source });
      expect(r.success, `source=${source}`).toBe(true);
    }
  });
});

describe('WALLET_TX_REASONS — enum canonico', () => {
  it('inclui os 4 reasons P0', () => {
    expect(WALLET_TX_REASONS).toContain('deposit');
    expect(WALLET_TX_REASONS).toContain('withdrawal');
    expect(WALLET_TX_REASONS).toContain('session_result');
    expect(WALLET_TX_REASONS).toContain('manual_adjustment');
  });

  it('inclui reservados P1+ (transfer_in/out, fee, fx_adjustment)', () => {
    expect(WALLET_TX_REASONS).toContain('transfer_in');
    expect(WALLET_TX_REASONS).toContain('transfer_out');
    expect(WALLET_TX_REASONS).toContain('fee');
    expect(WALLET_TX_REASONS).toContain('fx_adjustment');
  });

  it('inclui reservados Sprint Bankroll-3 (staking)', () => {
    expect(WALLET_TX_REASONS).toContain('staking_payout');
    expect(WALLET_TX_REASONS).toContain('staking_buyin');
    expect(WALLET_TX_REASONS).toContain('makeup_clear');
  });

  it('WALLET_TX_REASONS_P0 tem exatamente 4 valores', () => {
    expect(WALLET_TX_REASONS_P0.length).toBe(4);
    expect(WALLET_TX_REASONS_P0).toEqual([
      'deposit',
      'withdrawal',
      'session_result',
      'manual_adjustment',
    ]);
  });
});
