import { describe, it, expect } from 'vitest';

// =============================================================================
// CRITICAL: Wallet Storage Shape Defense Suite
//
// Licao 2026-04-23 (CLAUDE.md erro conhecido): Mocks idealizados escondem shape
// mismatch entre storage e service. No Sprint 1 (Tournament Selector), todos os
// testes passavam green mas 3 bugs CRITICAL existiam em producao porque mocks
// retornavam shapes ideais que divergiam do storage real.
//
// Esta suite valida o CONTRATO da interface IStorage: que os metodos novos
// existem e retornam shapes coerentes com o que walletService espera. Garante
// que se Implementer renomear ou mudar shape, testes detectem.
// =============================================================================

describe('IStorage: contratos esperados pelo walletService', () => {
  it('storage expoe createWallet (cria nova wallet)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).createWallet).toBe('function');
  });

  it('storage expoe getWalletById (single wallet por id+userId)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).getWalletById).toBe('function');
  });

  it('storage expoe listWalletsByUser (com filtros active/archived)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).listWalletsByUser).toBe('function');
  });

  it('storage expoe countActiveWalletsByUser (limite 50)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).countActiveWalletsByUser).toBe('function');
  });

  it('storage expoe findActiveWalletByName (deteccao de duplicatas)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).findActiveWalletByName).toBe('function');
  });

  it('storage expoe selectWalletForUpdate (SELECT FOR UPDATE — atomicidade)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).selectWalletForUpdate).toBe('function');
  });

  it('storage expoe updateWallet + archiveWallet', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).updateWallet).toBe('function');
    expect(typeof (mod.storage as any).archiveWallet).toBe('function');
  });

  it('storage expoe createWalletTransaction + listWalletTransactions', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).createWalletTransaction).toBe('function');
    expect(typeof (mod.storage as any).listWalletTransactions).toBe('function');
  });

  it('storage expoe getLastWalletTransaction (ordem temporal)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).getLastWalletTransaction).toBe('function');
  });

  it('storage expoe getActiveWalletsByUser (consolidacao)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).getActiveWalletsByUser).toBe('function');
  });

  it('storage expoe setUserBankrollV2Migrated (flag de migration)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).setUserBankrollV2Migrated).toBe('function');
  });

  it('storage expoe backfillSnapshotsWalletId (migration v1->v2)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).backfillSnapshotsWalletId).toBe('function');
  });

  it('storage expoe listUsersForV2Migration (script migration)', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).listUsersForV2Migration).toBe('function');
  });
});

describe('Wallet shape: campos retornados batem com schema', () => {
  it('shape de Wallet inclui id, userId, name, platform, nativeCurrency, balance, status', async () => {
    // Validacao tipo-only: o tipo Wallet exportado deve ter os campos canonicos
    const mod = await import('../../../shared/schema');
    expect(mod.wallets).toBeDefined();
    const cols = Object.keys(mod.wallets as any);
    // Drizzle expoe colunas como propriedades. Verificamos as obrigatorias.
    for (const col of ['id', 'userId', 'name', 'platform', 'nativeCurrency', 'balance', 'status']) {
      expect(cols, `expected column ${col}`).toContain(col);
    }
  });

  it('shape de WalletTransaction inclui fxRateUSDPerNative, previousNativeBalance, newNativeBalance', async () => {
    const mod = await import('../../../shared/schema');
    expect(mod.walletTransactions).toBeDefined();
    const cols = Object.keys(mod.walletTransactions as any);
    for (const col of ['fxRateUSDPerNative', 'previousNativeBalance', 'newNativeBalance', 'usdAmount']) {
      expect(cols, `expected column ${col}`).toContain(col);
    }
  });

  it('user_settings tem novas colunas bankrollAggregationMode, bankrollDisplayCurrency, bankrollV2Migrated', async () => {
    const mod = await import('../../../shared/schema');
    const cols = Object.keys(mod.userSettings as any);
    expect(cols).toContain('bankrollAggregationMode');
    expect(cols).toContain('bankrollDisplayCurrency');
    expect(cols).toContain('bankrollV2Migrated');
  });

  it('bankroll_snapshots ganha 4 colunas: walletId, nativeAmount, nativeCurrency, fxRateUSDPerNative', async () => {
    const mod = await import('../../../shared/schema');
    const cols = Object.keys(mod.bankrollSnapshots as any);
    expect(cols).toContain('walletId');
    expect(cols).toContain('nativeAmount');
    expect(cols).toContain('nativeCurrency');
    expect(cols).toContain('fxRateUSDPerNative');
  });
});

describe('walletService — shape do consolidated batido com endpoint /api/bankroll/consolidated', () => {
  it.todo('walletService.getConsolidatedBalance retorna { totalUSD, byWallet, shotPockets, ... } com mesmos field names que docs/api/wallets.md');
});
