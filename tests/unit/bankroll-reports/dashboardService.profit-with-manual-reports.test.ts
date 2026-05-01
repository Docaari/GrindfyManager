/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-08
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-069
 *
 * Foco: profit calc per platform/period em dashboardService inclui
 * `wallet_transactions WHERE reason='manual_report'` na soma.
 *
 * Lessons:
 *   #3 — mock shape REAL de listWalletTransactionsByUser (cols delta_usd_at_time, reason).
 *   #6 — re-conversao via fxResolver fallback se delta_usd_at_time ausente.
 *   #12 — invalidacao de cache pos-manual_report.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    listGrindSessionsByUser: vi.fn(),
    listSessionTournamentsBySessions: vi.fn(),
    getRoiByPlatform: vi.fn(),
    getUserSettings: vi.fn(),
    listWalletTransactionsByUser: vi.fn(),
    getActiveWalletsByUser: vi.fn(),
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
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({});
  (storage.listWalletTransactionsByUser as any).mockResolvedValue([]);
});

async function loadService() {
  const mod: any = await import('../../../server/services/dashboardService');
  return mod.dashboardService ?? mod;
}

describe('dashboardService.getRoiByPlatform — inclui manual_reports (RF-08)', () => {
  it('soma deltaUsd de manual_reports na profitUSD por plataforma', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'PokerStars', sessionsCount: 1, tournamentsCount: 5, investedNative: '500', profitNative: '60' },
    ]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      // Manual report registra perda externa de $50 USD em PokerStars
      { id: 'tx_mr_1', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'out', nativeAmount: '250', usdAmount: '50', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });

    const ps = result.platforms.find((p: any) => p.site === 'PokerStars');
    expect(ps).toBeDefined();
    // RED: profit ainda nao soma manual_reports — deveria incluir delta -$50
    // profit base 60 USD - 50 USD manual_report = 10 USD
    expect(ps.profitUSD).toBeCloseTo(10, 1);
  });

  it('manual_report sem profit pre-existente: profitUSD = manual_report delta', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_mr', userId: 'USER-0001', walletId: 'wlt_gg', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '100', usdAmount: '100', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_gg', platform: 'GGNetwork', name: 'GG', nativeCurrency: 'USD' },
    ]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });

    const gg = result.platforms.find((p: any) => p.site === 'GGNetwork');
    expect(gg).toBeDefined();
    expect(gg.profitUSD).toBeCloseTo(100, 1);
  });

  it('FX-aware (#6): re-converte via fxResolver quando usdAmount ausente (legacy tx)', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      // Legacy: usdAmount ausente, nativeAmount=100 BRL, expectativa = 20 USD (rate 5.0)
      { id: 'tx_legacy', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '100', usdAmount: null, occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    const ps = result.platforms.find((p: any) => p.site === 'PokerStars');
    expect(ps?.profitUSD).toBeCloseTo(20, 1);
  });

  it('regression: zero impact se user nao tem manual_reports', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      { site: 'GGNetwork', sessionsCount: 5, tournamentsCount: 20, investedNative: '500', profitNative: '60' },
    ]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d', limit: 10 });
    const gg = result.platforms.find((p: any) => p.site === 'GGNetwork');
    expect(gg.profitUSD).toBeCloseTo(60, 1);
  });

  it('manual_report direction=out subtrai (delta negativo)', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'out', nativeAmount: '100', usdAmount: '20', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d' });
    const ps = result.platforms.find((p: any) => p.site === 'PokerStars');
    expect(ps?.profitUSD).toBeCloseTo(-20, 1);
  });

  it('manual_report fora do periodo: NAO contabilizado', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 ano atras
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_old', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '100', usdAmount: '20', occurredAt: old },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '7d' });
    const ps = result.platforms.find((p: any) => p.site === 'PokerStars');
    // platform pode nem aparecer (sem profit no periodo)
    expect(ps?.profitUSD ?? 0).toBeCloseTo(0, 1);
  });

  it('multiplas wallets/plataformas: cada manual_report agrega sob seu site', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '500', usdAmount: '100', occurredAt: '2026-05-01T14:30:00Z' },
      { id: 'tx_b', userId: 'USER-0001', walletId: 'wlt_gg', sessionId: null, reason: 'manual_report', direction: 'out', nativeAmount: '200', usdAmount: '200', occurredAt: '2026-05-01T14:32:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
      { id: 'wlt_gg', platform: 'GGNetwork', name: 'GG', nativeCurrency: 'USD' },
    ]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d' });
    const ps = result.platforms.find((p: any) => p.site === 'PokerStars');
    const gg = result.platforms.find((p: any) => p.site === 'GGNetwork');
    expect(ps?.profitUSD).toBeCloseTo(100, 1);
    expect(gg?.profitUSD).toBeCloseTo(-200, 1);
  });

  it('session_result e manual_report somam juntos no profitUSD', async () => {
    (storage.getRoiByPlatform as any).mockResolvedValue([
      // Profit base de tournaments (=session_result implicito): +60 USD
      { site: 'PokerStars', sessionsCount: 1, tournamentsCount: 5, investedNative: '500', profitNative: '60' },
    ]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      // Manual report ADICIONAL: +30 USD
      { id: 'tx_mr', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '150', usdAmount: '30', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const svc = await loadService();
    const result = await svc.getRoiByPlatform('USER-0001', { period: '30d' });
    const ps = result.platforms.find((p: any) => p.site === 'PokerStars');
    // 60 + 30 = 90
    expect(ps?.profitUSD).toBeCloseTo(90, 1);
  });
});
