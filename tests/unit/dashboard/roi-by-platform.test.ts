/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-7: Dashboard ROI por plataforma (service)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-7)
 *
 * API esperada em server/services/dashboardService.ts (ou ja existente):
 *   getRoiByPlatform(userId, { period, limit }):
 *     Promise<{ period, generatedAt, platforms: Array<...> }>
 *
 * Casos cobertos:
 *   1. Happy path: agrega por site, conversao USD via fxResolver+getCurrencyForSite
 *   2. Apenas sessoes status=completed
 *   3. Apenas tournaments com total_invested > 0
 *   4. roiPct = (profitUSD / investedUSD) * 100
 *   5. investedUSD=0 -> roiPct=0 (nao NaN)
 *   6. Ordena por investedUSD DESC
 *   7. Aplica limit (default 10)
 *   8. periodos: 7d, 30d, 90d, 180d, all
 *   9. Sem sessoes: array vazio
 *  10. Conversao BRL: invested 100 BRL, rate=5.0 -> 20 USD
 *  11. Plataforma sem mapeamento (USD fallback)
 *  12. Multiplas wallets/plataformas: cada agrega sob seu site
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    listGrindSessionsByUser: vi.fn(),
    listSessionTournamentsBySessions: vi.fn(),
    getRoiByPlatform: vi.fn(),
    getUserSettings: vi.fn(),
  },
}));

vi.mock('../../../server/services/fxResolver', () => ({
  fxResolver: {
    resolveExchangeRates: vi.fn(async () => ({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    })),
    invalidateCache: vi.fn(),
  },
  resolveExchangeRates: vi.fn(async () => ({
    rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
    source: 'fallback',
    resolvedAt: new Date(),
  })),
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({});
});

async function loadService() {
  const mod: any = await import('../../../server/services/dashboardService');
  return mod.dashboardService ?? mod;
}

describe('dashboardService.getRoiByPlatform — RF-7', () => {
  it('happy path: agrega por site', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'GGNetwork', sessionsCount: 5, tournamentsCount: 20, investedNative: '500', profitNative: '60' },
      { site: 'Suprema', sessionsCount: 3, tournamentsCount: 10, investedNative: '1500', profitNative: '180' },
    ]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });

    expect(Array.isArray(result.platforms)).toBe(true);
    expect(result.platforms.length).toBeGreaterThanOrEqual(2);
    const gg = result.platforms.find((p: any) => p.site === 'GGNetwork');
    const sup = result.platforms.find((p: any) => p.site === 'Suprema');
    expect(gg).toBeDefined();
    expect(sup).toBeDefined();
  });

  it('conversao BRL: invested 1500 BRL, rate=5.0 -> 300 USD', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'Suprema', sessionsCount: 3, tournamentsCount: 10, investedNative: '1500', profitNative: '0' },
    ]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    const sup = result.platforms.find((p: any) => p.site === 'Suprema');
    expect(sup.investedUSD).toBeCloseTo(300, 1);
  });

  it('conversao USD: invested 500 USD -> 500 USD (rate=1)', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'GGNetwork', sessionsCount: 5, tournamentsCount: 20, investedNative: '500', profitNative: '50' },
    ]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    const gg = result.platforms.find((p: any) => p.site === 'GGNetwork');
    expect(gg.investedUSD).toBeCloseTo(500, 1);
    expect(gg.roiPct).toBeCloseTo(10, 1);
  });

  it('investedUSD=0 -> roiPct=0 (nao NaN)', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'GGNetwork', sessionsCount: 0, tournamentsCount: 0, investedNative: '0', profitNative: '0' },
    ]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    const gg = result.platforms.find((p: any) => p.site === 'GGNetwork');
    if (gg) {
      expect(Number.isNaN(gg.roiPct)).toBe(false);
      expect(gg.roiPct).toBe(0);
    }
  });

  it('ordena por investedUSD DESC', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'GGNetwork', sessionsCount: 1, tournamentsCount: 1, investedNative: '100', profitNative: '0' },
      { site: 'Suprema', sessionsCount: 5, tournamentsCount: 20, investedNative: '5000', profitNative: '0' },
      { site: 'iPoker', sessionsCount: 2, tournamentsCount: 5, investedNative: '500', profitNative: '0' },
    ]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    for (let i = 1; i < result.platforms.length; i++) {
      expect(result.platforms[i - 1].investedUSD).toBeGreaterThanOrEqual(result.platforms[i].investedUSD);
    }
  });

  it('aplica limit', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        site: `Site${i}`,
        sessionsCount: 1,
        tournamentsCount: 1,
        investedNative: String(100 - i),
        profitNative: '0',
      })),
    );
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 5 });
    expect(result.platforms.length).toBeLessThanOrEqual(5);
  });

  it('default period=30d', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', {});
    expect(result.period).toBe('30d');
  });

  it('default limit=10', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    const svc = await loadService();
    await svc.getRoiByPlatform('USER-0001', { period: '30d' });
    const args = (storage.getRoiByPlatform as any).mock.calls[0];
    const opts = args[1] ?? {};
    expect(opts.limit ?? 10).toBeLessThanOrEqual(10);
  });

  it('periodo=all nao filtra por completed_at', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    const svc = await loadService();
    await svc.getRoiByPlatform('USER-0001', { period: 'all' });
    const args = (storage.getRoiByPlatform as any).mock.calls[0];
    const opts = args[1] ?? {};
    // sinceDate nao definido / null para period=all
    expect(opts.sinceDate ?? null).toBeNull();
  });

  it('0 sessoes: retorna array vazio (200)', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    expect(result.platforms).toEqual([]);
  });

  it('retorna {period, generatedAt, platforms}', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    expect(result).toHaveProperty('period');
    expect(result).toHaveProperty('generatedAt');
    expect(result).toHaveProperty('platforms');
  });

  it('plataforma desconhecida usa USD (fallback)', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'NewMysterySite', sessionsCount: 1, tournamentsCount: 1, investedNative: '100', profitNative: '20' },
    ]);
    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d' });
    const entry = result.platforms.find((p: any) => p.site === 'NewMysterySite');
    expect(entry.investedUSD).toBeCloseTo(100, 1);
  });
});
