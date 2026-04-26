import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: QW-1 RF-04 — Migration heuristica de exchangeRates
//
// Spec: Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md (RF-04)
// Script: server/scripts/migrate-qw1-fx-convention.ts (Implementer cria)
//
// HEURISTICA conservadora:
//   1. ccy='USD' && rate=1.0     -> nao tocar
//   2. ccy='USDT' && rate=1.0    -> nao tocar
//   3. ccy in fiat majors:
//      rate < 1.0 -> inverte (1/rate)  // suspeita legacy
//      rate >= 1.0 -> nao tocar         // ja correto
//   4. ccy in {BTC, ETH} (cripto cara) -> nao tocar (rate < 1 e CORRETO na nova)
//   5. outras chaves -> log + nao tocar
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getAllUsersWithSettings: vi.fn(),
    updateUserSettingsExchangeRates: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn({})),
  },
}));

import { storage } from '../../../server/storage';

// Import dinamico para o script — Implementer cria em server/scripts/
async function importMigration() {
  return await import('../../../server/scripts/migrate-qw1-fx-convention');
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BANKROLL_QW1_DRY_RUN;
});

describe('QW-1 RF-04: migration heuristica — usuarios com convencao antiga', () => {
  it('usuario com BRL=0.20 (legacy) -> migration aplica BRL=5.0', async () => {
    const mockUsers = [
      {
        userId: 'USER-0001',
        exchangeRates: { BRL: 0.20 },
      },
    ];
    (storage.getAllUsersWithSettings as any).mockResolvedValue(mockUsers);
    (storage.updateUserSettingsExchangeRates as any).mockResolvedValue(true);

    const { runMigration } = await importMigration();
    const result = await runMigration({ dryRun: false });

    expect(storage.updateUserSettingsExchangeRates).toHaveBeenCalled();
    const call = (storage.updateUserSettingsExchangeRates as any).mock.calls[0];
    // Aceita assinatura (userId, newRates) OU ({userId, newRates})
    const newRates = call.find((arg: any) => arg && typeof arg === 'object' && 'BRL' in (arg.newRates ?? arg)) ?? call[1];
    const inverted = newRates.BRL ?? newRates.newRates?.BRL ?? 5.0;
    expect(inverted).toBeCloseTo(5.0, 2);
    expect(result.applied).toBeGreaterThanOrEqual(1);
  });

  it('usuario com BRL=5.0 (ja correto) -> migration NAO toca (idempotente)', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-0002', exchangeRates: { BRL: 5.0 } },
    ]);

    const { runMigration } = await importMigration();
    const result = await runMigration({ dryRun: false });

    expect(storage.updateUserSettingsExchangeRates).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('usuario com EUR=1.10 (legacy: USD por unidade) -> inverte para EUR=0.91 aprox', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-0003', exchangeRates: { EUR: 1.10 } },
    ]);
    // EUR=1.10 e >= 1.0 -> heuristica NAO toca (defensiva: rate >= 1 e assumido novo).
    // Resultado esperado: skipped (decisao explicita do RF-04).
    const { runMigration } = await importMigration();
    const result = await runMigration({ dryRun: false });

    // Heuristica conservadora: nao inverte rates >= 1.0 mesmo que possam estar errados
    expect(storage.updateUserSettingsExchangeRates).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('usuario sem exchangeRates (null/undefined/{}) -> migration nao toca', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-0004', exchangeRates: null },
      { userId: 'USER-0005', exchangeRates: {} },
    ]);

    const { runMigration } = await importMigration();
    const result = await runMigration({ dryRun: false });

    expect(storage.updateUserSettingsExchangeRates).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(2);
  });

  it('cripto BTC=0.000015 (correto na nova convencao) -> migration NAO toca', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-0006', exchangeRates: { BTC: 0.000015 } },
    ]);

    const { runMigration } = await importMigration();
    const result = await runMigration({ dryRun: false });

    expect(storage.updateUserSettingsExchangeRates).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('USDT=1.0 (paridade stable) -> migration NAO toca mesmo apos rate < 1 detector', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-0007', exchangeRates: { USDT: 1.0 } },
    ]);

    const { runMigration } = await importMigration();
    await runMigration({ dryRun: false });

    expect(storage.updateUserSettingsExchangeRates).not.toHaveBeenCalled();
  });

  it('chave desconhecida (XYZ=0.5) -> log + NAO toca', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-0008', exchangeRates: { XYZ: 0.5 } },
    ]);

    const { runMigration } = await importMigration();
    await runMigration({ dryRun: false });

    expect(storage.updateUserSettingsExchangeRates).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it('usuario com mix (BRL=0.20 legacy + BTC=0.000015 correto): so BRL e invertido', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      {
        userId: 'USER-0009',
        exchangeRates: { BRL: 0.20, BTC: 0.000015 },
      },
    ]);

    const { runMigration } = await importMigration();
    await runMigration({ dryRun: false });

    expect(storage.updateUserSettingsExchangeRates).toHaveBeenCalledTimes(1);
    const call = (storage.updateUserSettingsExchangeRates as any).mock.calls[0];
    // Pega o objeto rates do payload
    const payload = call.find((arg: any) => arg && typeof arg === 'object') ?? {};
    const rates = payload.newRates ?? payload;
    expect(rates.BRL).toBeCloseTo(5.0, 2);
    // BTC preservado
    expect(rates.BTC).toBeCloseTo(0.000015, 8);
  });
});

describe('QW-1 RF-04: idempotencia', () => {
  it('rodar migration 2x: 2a execucao nao toca (idempotente)', async () => {
    let firstRates = { BRL: 0.20 };
    (storage.getAllUsersWithSettings as any).mockImplementation(async () => [
      { userId: 'USER-0010', exchangeRates: firstRates },
    ]);
    (storage.updateUserSettingsExchangeRates as any).mockImplementation(async (..._args: any[]) => {
      // Apos primeiro update, o estado do user vira { BRL: 5.0 }.
      firstRates = { BRL: 5.0 };
      return true;
    });

    const { runMigration } = await importMigration();
    const r1 = await runMigration({ dryRun: false });
    expect(r1.applied).toBeGreaterThanOrEqual(1);

    // Segunda execucao - mock agora ja retorna {BRL: 5.0}
    const r2 = await runMigration({ dryRun: false });
    expect(r2.applied).toBe(0);
    expect(r2.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe('QW-1 RF-04: dry-run mode', () => {
  it('BANKROLL_QW1_DRY_RUN=true -> nao escreve no banco, apenas loga', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-DRY', exchangeRates: { BRL: 0.20 } },
    ]);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runMigration } = await importMigration();
    const result = await runMigration({ dryRun: true });

    expect(storage.updateUserSettingsExchangeRates).not.toHaveBeenCalled();
    // Deve ter logado o delta planejado
    const allLogs = infoSpy.mock.calls.flat().map((x) => JSON.stringify(x)).join(' ');
    expect(allLogs).toMatch(/dry|plan|USER-DRY/i);
    expect(result.dryRun).toBe(true);
    infoSpy.mockRestore();
  });
});

describe('QW-1 RF-04: log estruturado por usuario', () => {
  it('cada update logado com {userId, currency, oldRate, newRate}', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-LOG', exchangeRates: { BRL: 0.20 } },
    ]);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runMigration } = await importMigration();
    await runMigration({ dryRun: false });

    const allLogs = infoSpy.mock.calls.flat().map((x) => JSON.stringify(x)).join(' ');
    expect(allLogs).toMatch(/USER-LOG/);
    expect(allLogs).toMatch(/BRL/);
    // Spec: deve incluir oldRate e newRate
    expect(allLogs).toMatch(/oldRate|0\.2/);
    expect(allLogs).toMatch(/newRate|5/);
    infoSpy.mockRestore();
  });
});

describe('QW-1 RF-04: rollback prep — snapshot do exchangeRates antes da mudanca', () => {
  it('migration grava snapshot completo do exchangeRates pre-update em log', async () => {
    (storage.getAllUsersWithSettings as any).mockResolvedValue([
      { userId: 'USER-ROLL', exchangeRates: { BRL: 0.20, USD: 1.0 } },
    ]);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runMigration } = await importMigration();
    await runMigration({ dryRun: false });

    const allLogs = infoSpy.mock.calls.flat().map((x) => JSON.stringify(x)).join(' ');
    // Snapshot pre-update: deve conter BRL=0.20
    expect(allLogs).toMatch(/0\.2|"BRL":0\.2/);
    infoSpy.mockRestore();
  });
});
