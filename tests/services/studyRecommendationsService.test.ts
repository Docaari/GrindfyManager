/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-06: studyRecommendationsService
 *
 * Spec:    Docs/specs/sprint-studies-reform.md (RF-06, D4)
 * ADR-068: Cross-feature recommendations engine + priority score formula
 *
 * Pipeline:
 *   getStatsLeaks(top 5) + getStaleSpots(>7d, themeId IS NULL) + getDormantThemes(progress<30, lastVisit>30d)
 *   -> Promise.allSettled (lesson #9)
 *   -> merge + sort priority_score desc
 *   -> top N (default 10)
 *
 * Score formula (V1):
 *   leak: leakSeverity * 1.5 + (severity>=7 ? 5 : 0)
 *   stale_spot: spotAgeDays * 0.3 + (type ∈ {tilt, leak, mistake} ? 2 : 0)  // cap age 30
 *   dormant_theme: themeDormancyDays * 0.1 + (progress<10 ? 1 : 0)          // cap age 30
 *   normalized = Math.min(100, Math.round(score * 2))
 *
 * Lessons:
 *   #3 mocks shape REAL (storage)
 *   #9 logar antes de fallback (Promise.allSettled)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Storage mock — shape real (tabelas: studyThemes, starredHands, study_theme_spot_links)
vi.mock('../../server/storage', () => ({
  storage: {
    getStatsLeaks: vi.fn(),
    getStaleSpots: vi.fn(),
    getDormantThemes: vi.fn(),
    getLinkedSpots: vi.fn(),
  },
}));

// detectLeaks pode existir como funcao standalone — alguns implementers usam direto.
vi.mock('../../server/studies-v2', () => ({
  detectLeaks: vi.fn(async () => []),
}));

import { storage } from '../../server/storage';

async function importService() {
  return await import('../../server/services/studyRecommendationsService');
}

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).getStatsLeaks.mockResolvedValue([]);
  (storage as any).getStaleSpots.mockResolvedValue([]);
  (storage as any).getDormantThemes.mockResolvedValue([]);
});

describe('RF-06 studyRecommendationsService — pipeline', () => {
  it('retorna shape { items, source_counts, generated_at }', async () => {
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('source_counts');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.source_counts).toHaveProperty('leaks');
    expect(result.source_counts).toHaveProperty('stale_spots');
    expect(result.source_counts).toHaveProperty('dormant_themes');
  });

  it('agrega 3 fontes (leak + stale_spot + dormant_theme)', async () => {
    (storage as any).getStatsLeaks.mockResolvedValue([
      { id: 'lk1', type: 'preflop_leak', severity: 9, description: 'PKO ROI -8%' },
    ]);
    (storage as any).getStaleSpots.mockResolvedValue([
      { id: 'sp1', type: 'tilt', spot: 'ip_vs_bb', conclusion: 'fold', createdAt: new Date(Date.now() - 14 * 86400000) },
    ]);
    (storage as any).getDormantThemes.mockResolvedValue([
      { id: 'th1', name: 'Dormant', progress: 5, lastVisitedAt: new Date(Date.now() - 60 * 86400000) },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    const types = result.items.map((i: any) => i.type);
    expect(types).toContain('leak');
    expect(types).toContain('stale_spot');
    expect(types).toContain('dormant_theme');
  });

  it('respeita limit (top N)', async () => {
    const manyLeaks = Array.from({ length: 20 }).map((_, i) => ({
      id: `lk${i}`, type: 'leak', severity: 5, description: `leak ${i}`,
    }));
    (storage as any).getStatsLeaks.mockResolvedValue(manyLeaks);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 5);
    expect(result.items.length).toBeLessThanOrEqual(5);
  });

  it('Promise.allSettled tolera falha em getStatsLeaks (lesson #9)', async () => {
    (storage as any).getStatsLeaks.mockRejectedValue(new Error('detectLeaks bombed'));
    (storage as any).getStaleSpots.mockResolvedValue([
      { id: 'sp1', type: 'leak', spot: 'ip_vs_bb', conclusion: 'x', createdAt: new Date(Date.now() - 10 * 86400000) },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    expect(result.items.length).toBeGreaterThan(0);
    // source_counts.leaks zerado pois fonte falhou
    expect(result.source_counts.leaks).toBe(0);
  });

  it('Promise.allSettled tolera 2 falhas (so 1 fonte ok)', async () => {
    (storage as any).getStatsLeaks.mockRejectedValue(new Error('A'));
    (storage as any).getStaleSpots.mockRejectedValue(new Error('B'));
    (storage as any).getDormantThemes.mockResolvedValue([
      { id: 'th1', name: 'X', progress: 5, lastVisitedAt: new Date(Date.now() - 60 * 86400000) },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    expect(result.items.length).toBe(1);
  });

  it('cross-user isolation: nao retorna dados de outro user (storage chamado com userId correto)', async () => {
    const svc = await importService();
    await svc.getRecommendations('USER-AAAA', 10);
    expect((storage as any).getStatsLeaks).toHaveBeenCalledWith('USER-AAAA', expect.any(Number));
    expect((storage as any).getStaleSpots).toHaveBeenCalledWith('USER-AAAA', expect.any(Number));
    expect((storage as any).getDormantThemes).toHaveBeenCalledWith(
      'USER-AAAA', expect.any(Number), expect.any(Number),
    );
  });

  it('items sao ordenados por priority_score desc', async () => {
    (storage as any).getStatsLeaks.mockResolvedValue([
      { id: 'lk1', type: 'preflop_leak', severity: 9, description: 'A' },
      { id: 'lk2', type: 'preflop_leak', severity: 3, description: 'B' },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i - 1].priority_score).toBeGreaterThanOrEqual(result.items[i].priority_score);
    }
  });
});

describe('RF-06 score formula (6 scenarios)', () => {
  // Importamos helper ou recalcula via getRecommendations
  it('S1: leak severidade 9 -> score normalizado 37 (raw 9*1.5+5=18.5)', async () => {
    (storage as any).getStatsLeaks.mockResolvedValue([
      { id: 'lk', type: 'preflop_leak', severity: 9, description: 'x' },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    const item = result.items.find((i: any) => i.type === 'leak');
    expect(item).toBeTruthy();
    expect(item!.priority_score).toBe(37);
  });

  it('S2: leak severidade 5 -> score 15 (raw 7.5)', async () => {
    (storage as any).getStatsLeaks.mockResolvedValue([
      { id: 'lk', type: 'leak', severity: 5, description: 'x' },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    const item = result.items.find((i: any) => i.type === 'leak');
    expect(item!.priority_score).toBe(15);
  });

  it('S3: spot tilt 14d -> score 12 (raw 14*0.3+2=6.2)', async () => {
    (storage as any).getStaleSpots.mockResolvedValue([
      { id: 'sp', type: 'tilt', spot: 'x', conclusion: 'c', createdAt: new Date(Date.now() - 14 * 86400000) },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    const item = result.items.find((i: any) => i.type === 'stale_spot');
    expect(item!.priority_score).toBe(12);
  });

  it('S4: spot bluff 30d -> score 18 (raw 30*0.3+0=9)', async () => {
    (storage as any).getStaleSpots.mockResolvedValue([
      { id: 'sp', type: 'bluff', spot: 'x', conclusion: 'c', createdAt: new Date(Date.now() - 30 * 86400000) },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    const item = result.items.find((i: any) => i.type === 'stale_spot');
    expect(item!.priority_score).toBe(18);
  });

  it('S5: theme dormente 60d progress 5% -> score 8 (raw cap 30*0.1+1=4)', async () => {
    (storage as any).getDormantThemes.mockResolvedValue([
      { id: 'th', name: 'X', progress: 5, lastVisitedAt: new Date(Date.now() - 60 * 86400000) },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    const item = result.items.find((i: any) => i.type === 'dormant_theme');
    expect(item!.priority_score).toBe(8);
  });

  it('S6: theme dormente 90d progress 25% -> score 6 (raw cap 30*0.1+0=3)', async () => {
    (storage as any).getDormantThemes.mockResolvedValue([
      { id: 'th', name: 'X', progress: 25, lastVisitedAt: new Date(Date.now() - 90 * 86400000) },
    ]);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 10);
    const item = result.items.find((i: any) => i.type === 'dormant_theme');
    expect(item!.priority_score).toBe(6);
  });
});

describe('RF-06 source_counts diagnostico', () => {
  it('source_counts reflete totais brutos das fontes (mesmo se descartados pelo limit)', async () => {
    const leaks = Array.from({ length: 5 }).map((_, i) => ({
      id: `lk${i}`, type: 'leak', severity: 8, description: 'x',
    }));
    (storage as any).getStatsLeaks.mockResolvedValue(leaks);
    const svc = await importService();
    const result = await svc.getRecommendations('USER-0001', 2);
    expect(result.source_counts.leaks).toBe(5);
    expect(result.items.length).toBeLessThanOrEqual(2);
  });
});
