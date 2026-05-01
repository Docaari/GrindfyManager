/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-4: schema/zod para wallet_transfers + insert validation
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-4 Validacao Zod snippet)
 *
 * Esperado em shared/schema.ts:
 *   walletTransfers (drizzle table)
 *   insertWalletTransferSchema (zod)
 *   TRANSFER_REASONS const
 *
 * Casos cobertos:
 *   1. insertWalletTransferSchema aceita payload valido
 *   2. fromWalletId === toWalletId -> rejeita
 *   3. amountFrom <= 0 -> rejeita
 *   4. reason fora do enum -> rejeita
 *   5. fee parcial (feeAmount sem feeCurrency) -> rejeita
 *   6. campos opcionais omitidos -> aceita
 *   7. note > 500 chars -> rejeita
 *   8. WALLET_TX_REASONS inclui 'transfer_fee'
 *   9. TRANSFER_REASONS inclui 'transfer', 'rebalance', 'cashout_to_bank', 'site_to_site'
 *  10. amountTo opcional aceito
 */

import { describe, it, expect } from 'vitest';

async function loadSchema() {
  return await import('../../../shared/schema');
}

async function loadReasons() {
  return await import('../../../shared/wallet-reasons');
}

describe('insertWalletTransferSchema — RF-4', () => {
  it('aceita payload minimo valido', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: 100,
      reason: 'transfer',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita fromWalletId === toWalletId', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_1',
      amountFrom: 100,
      reason: 'transfer',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita amountFrom = 0', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: 0,
      reason: 'transfer',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita amountFrom negativo', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: -50,
      reason: 'transfer',
    });
    expect(result.success).toBe(false);
  });

  it('aceita amountFrom como string decimal', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: '100.50',
      reason: 'transfer',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita reason fora do enum', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: 100,
      reason: 'lixo',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita feeAmount sem feeCurrency e feeWalletId', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: 100,
      feeAmount: 5,
      reason: 'transfer',
    });
    expect(result.success).toBe(false);
  });

  it('aceita feeAmount completo (com feeCurrency e feeWalletId)', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: 100,
      feeAmount: 5,
      feeCurrency: 'USD',
      feeWalletId: 'w_fee',
      reason: 'transfer',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita note > 500 chars', async () => {
    const mod: any = await loadSchema();
    const result = mod.insertWalletTransferSchema.safeParse({
      fromWalletId: 'w_1',
      toWalletId: 'w_2',
      amountFrom: 100,
      reason: 'transfer',
      note: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('TRANSFER_REASONS inclui transfer / rebalance / cashout_to_bank / site_to_site', async () => {
    const mod: any = await loadSchema();
    const reasons = mod.TRANSFER_REASONS as readonly string[];
    expect(reasons).toContain('transfer');
    expect(reasons).toContain('rebalance');
    expect(reasons).toContain('cashout_to_bank');
    expect(reasons).toContain('site_to_site');
  });

  it('WALLET_TX_REASONS inclui transfer_fee, transfer_in, transfer_out', async () => {
    const mod: any = await loadReasons();
    const reasons = mod.WALLET_TX_REASONS as readonly string[];
    expect(reasons).toContain('transfer_in');
    expect(reasons).toContain('transfer_out');
    expect(reasons).toContain('transfer_fee');
  });

  it('walletTransfers table eh exportada do schema', async () => {
    const mod: any = await loadSchema();
    expect(mod.walletTransfers).toBeDefined();
  });
});
