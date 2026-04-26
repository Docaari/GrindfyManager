import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: QW-1 RF-03 — bankrollService.buildStateFromSettings na nova convencao
//
// Spec: Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md (RF-03)
// ADR-033: USD -> native (display) = usdAmount * exchangeRateBRL
//
// REGRAS:
//   - Banca de 1000 USD com BRL=5.0 -> amountDisplay.BRL = 5000
//   - Banca de 1000 USD com BRL=0 ou ausente -> amountDisplay so contem USD
//   - Comportamento atual do buildStateFromSettings ja era correto na nova
//     convencao (multiplicacao). Apenas adicionado comentario referenciando
//     ADR-033 + guard explicito para rate <= 0.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    getBankrollSnapshots: vi.fn(),
    insertBankrollSnapshot: vi.fn(),
    updateUserBankroll: vi.fn(),
    getUserBankrollForUpdate: vi.fn(),
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

vi.mock('../../../server/services/bankrollCache', () => ({
  bankrollCache: {
    invalidateAllForUser: vi.fn(),
    get: vi.fn(() => null),
    set: vi.fn(),
  },
}));

import { bankrollService } from '../../../server/services/bankrollService';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QW-1 RF-03: buildStateFromSettings (via getBankrollState) com nova convencao', () => {
  it('banca 1000 USD com BRL=5.0 -> amountDisplay.BRL = 5000', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 5.0 },
      updatedAt: new Date('2026-04-25T10:00:00Z'),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');

    expect(r.amountDisplay).toBeDefined();
    expect(r.amountDisplay.USD).toBe(1000);
    expect(r.amountDisplay.BRL).toBeCloseTo(5000, 2);
  });

  it('banca 1000 USD com BRL=4.5 -> amountDisplay.BRL = 4500', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 4.5 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');
    expect(r.amountDisplay.BRL).toBeCloseTo(4500, 2);
  });

  it('regra 1pct + BRL=5.0: maxBuyInDisplay.BRL = hardLimitUSD * 5.0', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 5.0 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');
    // 1pct de 1000 = 10 USD soft, *1.5 = 15 USD hard
    expect(r.hardLimitUSD).toBe(15);
    expect(r.maxBuyInDisplay.BRL).toBeCloseTo(75, 2);
  });

  it('exchangeRateBRL exposto direto no state (MED-3 fix)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 5.2 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');
    expect(r.exchangeRateBRL).toBe(5.2);
  });
});

describe('QW-1 RF-03: guards para rate ausente/invalido', () => {
  it('exchangeRates vazio -> amountDisplay so tem USD (sem BRL)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: {},
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');
    expect(r.amountDisplay.USD).toBe(1000);
    expect(r.amountDisplay.BRL).toBeUndefined();
    expect(r.exchangeRateBRL).toBeNull();
  });

  it('rate=0 (invalido) -> nao explode; amountDisplay so tem USD', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 0 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');
    expect(r.amountDisplay.USD).toBe(1000);
    expect(r.amountDisplay.BRL).toBeUndefined();
  });

  it('rate negativo -> nao explode; amountDisplay so tem USD', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: -1 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');
    expect(r.amountDisplay.USD).toBe(1000);
    expect(r.amountDisplay.BRL).toBeUndefined();
  });
});

describe('QW-1 RF-06: telemetria pos-deploy detecta rate < 1 (suspeita legacy)', () => {
  it('warning emitido quando exchangeRateBRL < 1.0 (suspeita convencao antiga)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-LEGACY',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 0.20 }, // legacy convention
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.getBankrollState('USER-LEGACY');

    const calls = warnSpy.mock.calls.flat().map((x) => String(x));
    expect(calls.join(' ')).toMatch(/bankroll_fx_rate_suspect_legacy|legacy/i);
    warnSpy.mockRestore();
  });

  it('warning NAO emitido quando exchangeRateBRL >= 1.0 (nova convencao)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-OK',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 5.0 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.getBankrollState('USER-OK');

    const calls = warnSpy.mock.calls.flat().map((x) => String(x));
    expect(calls.join(' ')).not.toMatch(/bankroll_fx_rate_suspect_legacy/);
    warnSpy.mockRestore();
  });

  it('warning emitido apenas uma vez por (userId, sessao) — segunda chamada nao re-emite', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-LEG2',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 0.20 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    await bankrollService.getBankrollState('USER-LEG2');
    const firstCallCount = warnSpy.mock.calls.length;
    await bankrollService.getBankrollState('USER-LEG2');
    const secondCallCount = warnSpy.mock.calls.length;

    expect(secondCallCount).toBe(firstCallCount);
    warnSpy.mockRestore();
  });
});

describe('QW-1: integracao Tournament Selector (regression check)', () => {
  it('banca 1000 USD com BRL=5.0: hardLimit em USD nao muda apos inversao da formula', async () => {
    // O Tournament Selector filtra por hardLimitUSD. A inversao do currencyNormalizer
    // afeta a normalizacao de buy-ins mas NAO o hardLimit em USD. Esta suite garante
    // que getBankrollState segue retornando hardLimitUSD = 1pct * 1000 * 1.5 = 15.
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      exchangeRates: { BRL: 5.0 },
      updatedAt: new Date(),
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const r = await bankrollService.getBankrollState('USER-0001');
    expect(r.hardLimitUSD).toBe(15);
    expect(r.softLimitUSD).toBe(10);
  });
});
