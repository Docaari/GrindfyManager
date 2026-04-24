import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: GET /api/tournament-library (modificado — RF-05)
//
// Decisao Q7:
//   - Score apenas nos top 50 templates por totalPlayed
//   - Cache (userId, templateId, dayOfWeek) TTL 30min
//   - Templates abaixo do top 50: selectorScore=null
// =============================================================================

import { handleTournamentLibrary } from '../../../server/routes/tournament-library';
import { storage } from '../../../server/storage';
import { playerBundleCache } from '../../../server/services/playerBundle';

vi.mock('../../../server/storage', () => ({
  storage: {
    getTournamentLibrary: vi.fn(),
    getTournamentLibraryEntries: vi.fn(),
  },
}));

vi.mock('../../../server/services/playerBundle', () => ({
  playerBundleCache: {
    getOrLoad: vi.fn(),
    invalidate: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeLibrary(n: number) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      id: `lib-${String(i).padStart(3, '0')}`,
      userId: 'USER-0001',
      name: `Tourney #${i}`,
      site: 'PokerStars',
      buyIn: '22.00',
      time: '20:00',
      type: 'PKO',
      speed: 'Normal',
      dayOfWeek: 4,
      totalPlayed: n - i, // ordem decrescente: lib-000 tem mais sample
    });
  }
  return arr;
}

function bundleStub() {
  return {
    totalTournaments: 200,
    lookbackTournaments: 200,
    lookbackDays: 180,
    overallRoi: 12,
    bySite: [{ site: 'PokerStars', sample: 200, roi: 12, profit: 100 }],
    byBuyIn: [{ range: '$22-54.99', sample: 100, roi: 14 }],
    byCategory: [{ category: 'PKO', sample: 80, roi: 16 }],
    bySpeed: [{ speed: 'Normal', sample: 120, roi: 10 }],
    byDayOfWeek: [{ dayOfWeek: 4, sample: 60, roi: 11 }],
    byTimeOfDay: [{ bucket: 'noite-cedo', sample: 80, roi: 13 }],
    byField: [{ range: 'medio', sample: 100, roi: 9 }],
  };
}

describe('GET /api/tournament-library - retrocompat', () => {
  it('campos antigos (id, name, site, buyIn) preservados', async () => {
    (storage.getTournamentLibraryEntries as any).mockResolvedValue(makeLibrary(5));
    (playerBundleCache.getOrLoad as any).mockResolvedValue(bundleStub());
    const r = await handleTournamentLibrary({ userId: 'USER-0001' });
    expect(r.length).toBe(5);
    expect(r[0]).toHaveProperty('id');
    expect(r[0]).toHaveProperty('name');
    expect(r[0]).toHaveProperty('site');
    expect(r[0]).toHaveProperty('buyIn');
  });
});

describe('GET /api/tournament-library - selectorScore (RF-05 + Q7)', () => {
  it('cada item tem campo selectorScore (number ou null)', async () => {
    (storage.getTournamentLibraryEntries as any).mockResolvedValue(makeLibrary(10));
    (playerBundleCache.getOrLoad as any).mockResolvedValue(bundleStub());
    const r = await handleTournamentLibrary({ userId: 'USER-0001' });
    for (const item of r) {
      expect(item).toHaveProperty('selectorScore');
    }
  });

  it('top 50 por totalPlayed tem selectorScore preenchido (number)', async () => {
    (storage.getTournamentLibraryEntries as any).mockResolvedValue(makeLibrary(60));
    (playerBundleCache.getOrLoad as any).mockResolvedValue(bundleStub());
    const r = await handleTournamentLibrary({ userId: 'USER-0001' });
    // Top 50 (lib-000 a lib-049) tem score numerico
    for (let i = 0; i < 50; i++) {
      expect(typeof r[i].selectorScore).toBe('number');
    }
  });

  it('templates abaixo do top 50 tem selectorScore=null', async () => {
    (storage.getTournamentLibraryEntries as any).mockResolvedValue(makeLibrary(60));
    (playerBundleCache.getOrLoad as any).mockResolvedValue(bundleStub());
    const r = await handleTournamentLibrary({ userId: 'USER-0001' });
    for (let i = 50; i < 60; i++) {
      expect(r[i].selectorScore).toBeNull();
    }
  });

  it('templates SEM dayOfWeek nunca recebem score (so com dayOfWeek scoring faz sentido)', async () => {
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([
      { id: 'lib-no-dow', userId: 'USER-0001', name: 'Sem DOW', site: 'PS', buyIn: '22', totalPlayed: 100 },
    ]);
    (playerBundleCache.getOrLoad as any).mockResolvedValue(bundleStub());
    const r = await handleTournamentLibrary({ userId: 'USER-0001' });
    expect(r[0].selectorScore).toBeNull();
  });

  it('library vazia: response vazio sem chamar bundle', async () => {
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    const r = await handleTournamentLibrary({ userId: 'USER-0001' });
    expect(r).toEqual([]);
    expect(playerBundleCache.getOrLoad).not.toHaveBeenCalled();
  });
});

describe('GET /api/tournament-library - cache de score por (userId, templateId, dayOfWeek)', () => {
  it.todo('segunda chamada com mesma library reusa scores cacheados (TTL 30min)');
  // Implementer cria um score cache module dedicado; teste exige fixture de cache exposta.
});
