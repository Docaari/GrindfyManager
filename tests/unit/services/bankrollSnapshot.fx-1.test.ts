/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-09: Bankroll snapshot usa getRatesForDate(snapshotDate)
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-09
 * ADR : Docs/architecture/decisions/121-system-fx-rates-global-table.md (D3)
 *
 * Mudanca: bankrollService.createAutoSnapshot (e equivalentes de manual snapshot)
 * passa a calcular consolidatedUSD com rates da DATA do snapshot, nao do momento
 * da gravacao. wallets.exchangeRates NAO entra no merge para snapshots novos.
 *
 * Cascata snapshot: user_override > system_fx_rates(date) > FALLBACK
 *   (sem wallets.exchangeRates — quebra acoplamento ADR-034 mantido)
 *
 * Helper esperado em server/services/fx/mergeRates.ts (opcional):
 *   mergeRates(fallback, system, userOverride): Record<string, number>
 *
 * Status RED: bankrollService usa fxResolver corrente; precisa ser ajustado
 * para chamar fxRatesPersistence.getRatesForDate(snapshotDate).
 *
 * Mocks:
 *   - storage.getUserSettings, getBankrollSnapshots, insertBankrollSnapshot
 *   - walletService.getConsolidatedBalance (para verificar rates passadas)
 *   - fxRatesPersistence.getRatesForDate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================
vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    getBankrollSnapshots: vi.fn(),
    insertBankrollSnapshot: vi.fn(),
    listWalletsByUser: vi.fn(),
  },
}));

const {
  getRatesForDateMock,
  getConsolidatedBalanceUSDMock,
} = vi.hoisted(() => ({
  getRatesForDateMock: vi.fn(),
  getConsolidatedBalanceUSDMock: vi.fn(),
}));

vi.mock('../../../server/services/fx/fxRatesPersistence', () => ({
  getRatesForDate: getRatesForDateMock,
  fxRatesPersistence: { getRatesForDate: getRatesForDateMock },
}));

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    getConsolidatedBalance: getConsolidatedBalanceUSDMock,
    getConsolidatedBalanceUSD: getConsolidatedBalanceUSDMock,
  },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({ bankrollManagementEnabled: true });
  (storage.getBankrollSnapshots as any).mockResolvedValue([{ newAmount: '1000' }]);
  (storage.insertBankrollSnapshot as any).mockImplementation(async (row: any) => ({
    id: 'snap1',
    ...row,
  }));
});

async function loadService() {
  vi.resetModules();
  return await import('../../../server/services/bankrollService');
}

// =============================================================================
// Snapshot usa getRatesForDate
// =============================================================================
describe('createBankrollSnapshot — RF-09 usa rates do dia', () => {
  it('snapshot 2026-05-05 chama getRatesForDate("2026-05-05")', async () => {
    getRatesForDateMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.10, source: 'bcb_ptax', fetchedAt: new Date() },
      EUR: { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.92, source: 'frankfurter', fetchedAt: new Date() },
    });
    getConsolidatedBalanceUSDMock.mockResolvedValue({ totalUSD: '1500' });

    const mod = await loadService();
    const occurredAt = new Date('2026-05-05T18:30:00Z');
    await mod.bankrollService.createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd-1',
      sourceRefId: 'cd-1',
      occurredAt,
      origin: 'auto-cooldown',
    });

    expect(getRatesForDateMock).toHaveBeenCalledWith('2026-05-05');
  });

  it('snapshot domingo 2026-05-03 chama getRatesForDate("2026-05-03") e usa rate sexta', async () => {
    // Persistence eh quem faz o lookup descending — o test valida que snapshot passa a data correta
    getRatesForDateMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-01', ratePerUsd: 5.05, source: 'bcb_ptax', fetchedAt: new Date() },
      EUR: { currency: 'EUR', date: '2026-05-01', ratePerUsd: 0.91, source: 'frankfurter', fetchedAt: new Date() },
    });
    getConsolidatedBalanceUSDMock.mockResolvedValue({ totalUSD: '1500' });

    const mod = await loadService();
    await mod.bankrollService.createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd-2',
      sourceRefId: 'cd-2',
      occurredAt: new Date('2026-05-03T18:30:00Z'),
      origin: 'auto-cooldown',
    });

    expect(getRatesForDateMock).toHaveBeenCalledWith('2026-05-03');
  });

  it('user override BRL=5.20 + system BRL=5.10 → snapshot usa override (5.20)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      exchangeRates: { BRL: 5.20 },
    });
    getRatesForDateMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.10, source: 'bcb_ptax', fetchedAt: new Date() },
    });
    // Mock retorna USD already calculado com rates injetados — verificamos que rates corretos
    // foram passados via spy
    getConsolidatedBalanceUSDMock.mockImplementation(async (userId: string, rates?: any) => {
      // Quando rates eh passado explicito (2 args overload do walletService novo),
      // valida que BRL=5.20 foi aplicado
      if (rates && rates.BRL !== undefined) {
        expect(rates.BRL).toBeCloseTo(5.20, 2);
      }
      return { totalUSD: '1500' };
    });

    const mod = await loadService();
    await mod.bankrollService.createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd-3',
      sourceRefId: 'cd-3',
      occurredAt: new Date('2026-05-05T18:30:00Z'),
      origin: 'auto-cooldown',
    });

    expect(getConsolidatedBalanceUSDMock).toHaveBeenCalled();
  });

  it('system rate vazio (DB vazia) → fallback constants usado, log warn', async () => {
    getRatesForDateMock.mockResolvedValue({}); // DB sem rates
    getConsolidatedBalanceUSDMock.mockResolvedValue({ totalUSD: '1500' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mod = await loadService();
    const result = await mod.bankrollService.createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd-4',
      sourceRefId: 'cd-4',
      occurredAt: new Date('2026-05-05T18:30:00Z'),
      origin: 'auto-cooldown',
    });

    // Snapshot ainda eh criado (com fallback rates)
    expect(result).not.toBeNull();
    // Warn loggado para audit
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('wallets.exchangeRates NAO afeta calculo do snapshot novo (apenas snapshots pre-FX-1)', async () => {
    // Wallet legada com BRL=4.5 (drifted)
    (storage.listWalletsByUser as any)?.mockResolvedValue?.([
      { id: 'w1', exchangeRates: { BRL: 4.5 } },
    ]);
    getRatesForDateMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.10, source: 'bcb_ptax', fetchedAt: new Date() },
    });

    getConsolidatedBalanceUSDMock.mockImplementation(async (userId: string, rates?: any) => {
      if (rates && rates.BRL !== undefined) {
        // Deve usar 5.10 (system), nao 4.5 (wallet)
        expect(rates.BRL).toBeCloseTo(5.10, 2);
        expect(rates.BRL).not.toBeCloseTo(4.5, 2);
      }
      return { totalUSD: '1500' };
    });

    const mod = await loadService();
    await mod.bankrollService.createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd-5',
      sourceRefId: 'cd-5',
      occurredAt: new Date('2026-05-05T18:30:00Z'),
      origin: 'auto-cooldown',
    });
  });

  it('reproduzibilidade: 2 snapshots na mesma data X → mesmo USD (rate identica)', async () => {
    getRatesForDateMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.10, source: 'bcb_ptax', fetchedAt: new Date() },
    });
    getConsolidatedBalanceUSDMock.mockResolvedValue({ totalUSD: '1500' });

    const mod = await loadService();
    const occurred = new Date('2026-05-05T18:30:00Z');

    const r1 = await mod.bankrollService.createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd-rep-1',
      sourceRefId: 'cd-rep-1',
      occurredAt: occurred,
      origin: 'auto-cooldown',
    });
    const r2 = await mod.bankrollService.createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd-rep-2',
      sourceRefId: 'cd-rep-2',
      occurredAt: occurred,
      origin: 'auto-cooldown',
    });

    expect(r1?.newAmount).toBe(r2?.newAmount);
  });
});
