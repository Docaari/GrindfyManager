import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: GET /api/analytics/player-bundle (RF-03 + ADR-016)
//
// Endpoint agregado que devolve as 7 dimensoes de analytics em uma unica chamada.
// Cache em memoria por (userId, lookbackDays) com TTL 5min.
// Invalidado em upload de novo CSV (chamada direta `playerBundleCache.invalidate`).
// =============================================================================

import { handlePlayerBundle } from '../../../server/routes/analytics';
import { playerBundleCache } from '../../../server/services/playerBundle';
import { storage } from '../../../server/storage';

vi.mock('../../../server/services/playerBundle', () => ({
  playerBundleCache: {
    getOrLoad: vi.fn(),
    invalidate: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getAnalyticsBySite: vi.fn().mockResolvedValue([]),
    getAnalyticsByBuyinRange: vi.fn().mockResolvedValue([]),
    getAnalyticsByCategory: vi.fn().mockResolvedValue([]),
    getAnalyticsBySpeed: vi.fn().mockResolvedValue([]),
    getAnalyticsByDayOfWeek: vi.fn().mockResolvedValue([]),
    getAnalyticsByTimeOfDay: vi.fn().mockResolvedValue([]),
    getAnalyticsByField: vi.fn().mockResolvedValue([]),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/analytics/player-bundle - shape', () => {
  it('response inclui as 7 dimensoes', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      totalTournaments: 200,
      lookbackTournaments: 200,
      lookbackDays: 180,
      overallRoi: 12,
      bySite: [], byBuyIn: [], byCategory: [], bySpeed: [],
      byDayOfWeek: [], byTimeOfDay: [], byField: [],
    });
    const r = await handlePlayerBundle({ userId: 'USER-0001', lookbackDays: 180 });
    expect(r).toHaveProperty('bySite');
    expect(r).toHaveProperty('byBuyIn');
    expect(r).toHaveProperty('byCategory');
    expect(r).toHaveProperty('bySpeed');
    expect(r).toHaveProperty('byDayOfWeek');
    expect(r).toHaveProperty('byTimeOfDay');
    expect(r).toHaveProperty('byField');
  });

  it('response inclui metadata totalTournaments, lookback*, overallRoi', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      totalTournaments: 200,
      lookbackTournaments: 423,
      lookbackDays: 180,
      overallRoi: 12.4,
      bySite: [], byBuyIn: [], byCategory: [], bySpeed: [],
      byDayOfWeek: [], byTimeOfDay: [], byField: [],
    });
    const r = await handlePlayerBundle({ userId: 'USER-0001', lookbackDays: 180 });
    expect(r.totalTournaments).toBe(200);
    expect(r.lookbackTournaments).toBe(423);
    expect(r.lookbackDays).toBe(180);
    expect(r.overallRoi).toBe(12.4);
  });

  it('lookbackDays customizavel (=90)', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      totalTournaments: 100, lookbackTournaments: 100, lookbackDays: 90, overallRoi: 5,
      bySite: [], byBuyIn: [], byCategory: [], bySpeed: [], byDayOfWeek: [], byTimeOfDay: [], byField: [],
    });
    await handlePlayerBundle({ userId: 'USER-0001', lookbackDays: 90 });
    expect(playerBundleCache.getOrLoad).toHaveBeenCalledWith('USER-0001', 90);
  });
});

describe('GET /api/analytics/player-bundle - auth', () => {
  it('userId vazio (sem auth) -> lanca', async () => {
    await expect(
      handlePlayerBundle({ userId: '' as any, lookbackDays: 180 })
    ).rejects.toThrow();
  });
});

describe('GET /api/analytics/player-bundle - cache 5min', () => {
  it('inclui flag cacheHit no response', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      totalTournaments: 200, lookbackTournaments: 200, lookbackDays: 180, overallRoi: 12,
      bySite: [], byBuyIn: [], byCategory: [], bySpeed: [], byDayOfWeek: [], byTimeOfDay: [], byField: [],
      cacheHit: true,
    });
    const r = await handlePlayerBundle({ userId: 'USER-0001', lookbackDays: 180 });
    expect(r).toHaveProperty('cacheHit');
  });
});

describe('GET /api/analytics/player-bundle - cold start flag', () => {
  it('totalTournaments < 20 inclui coldStart="pure" no response', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      totalTournaments: 10, lookbackTournaments: 10, lookbackDays: 180, overallRoi: 0,
      bySite: [], byBuyIn: [], byCategory: [], bySpeed: [], byDayOfWeek: [], byTimeOfDay: [], byField: [],
    });
    const r = await handlePlayerBundle({ userId: 'USER-0001', lookbackDays: 180 });
    expect(r.coldStart).toBe('pure');
  });

  it('totalTournaments 20-49 -> coldStart="partial"', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      totalTournaments: 30, lookbackTournaments: 30, lookbackDays: 180, overallRoi: 5,
      bySite: [], byBuyIn: [], byCategory: [], bySpeed: [], byDayOfWeek: [], byTimeOfDay: [], byField: [],
    });
    const r = await handlePlayerBundle({ userId: 'USER-0001', lookbackDays: 180 });
    expect(r.coldStart).toBe('partial');
  });

  it('totalTournaments >= 50 -> coldStart=false', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      totalTournaments: 50, lookbackTournaments: 50, lookbackDays: 180, overallRoi: 8,
      bySite: [], byBuyIn: [], byCategory: [], bySpeed: [], byDayOfWeek: [], byTimeOfDay: [], byField: [],
    });
    const r = await handlePlayerBundle({ userId: 'USER-0001', lookbackDays: 180 });
    expect(r.coldStart).toBe(false);
  });
});
