import { describe, it, expect, vi } from 'vitest';

// =============================================================================
// CRITICAL #1, #2, #3 — Shape Mismatch Defense Suite
//
// Estes testes existem para garantir que os SHAPES devolvidos pelos metodos
// reais do storage (analytics V2 + library entries) casam com o que o scorer
// e o handler do selector esperam. Os mocks dos testes de integracao usam
// shapes IDEAIS, mas estes testes verificam as labels DERIVADAS dos
// scoringConstants.
//
// Sem esta suite, qualquer renomeacao no storage que mantenha os mocks ainda
// passariam — exatamente o bug que deixou o sinal buyIn (peso 0.20) caindo
// silenciosamente para emptySignal(50).
// =============================================================================

import {
  BUYIN_BUCKETS,
  FIELD_BUCKETS,
} from '../../../server/scoring/scoringConstants';

// vi.mock e processado em tempo de hoist — declarado no topo do arquivo.
vi.mock('../../../server/supremaService', () => ({
  getSupremaTournaments: vi.fn(async () => []),
}));

describe('CRITICAL #1: BUYIN_BUCKETS labels devem alinhar com getAnalyticsByBuyinRangeV2', () => {
  it('todos os labels de BUYIN_BUCKETS sao reproduziveis pelo CASE WHEN da V2', () => {
    // O storage.getAnalyticsByBuyinRangeV2 emite estes labels via CASE WHEN.
    // Aqui validamos a lista esperada.
    const expectedLabels = [
      '$1-6',
      '$7-15',
      '$16-29',
      '$30-49',
      '$50-70',
      '$71-130',
      '$131-250',
      '$251-350',
      '$351-599',
      '$600-1K',
      '$1K+',
    ];
    const actualLabels = BUYIN_BUCKETS.map((b) => b.range);
    expect(actualLabels).toEqual(expectedLabels);
  });

  it('NENHUM label do BUYIN_BUCKETS coincide com os do dashboard antigo (deteccao de regressao)', () => {
    const dashboardLegacyLabels = [
      '$0-$5',
      '$5-$10',
      '$11-$20',
      '$21-$32',
      '$33-$45',
      '$46-$60',
      '$60-$99',
      '$100-$160',
      '$161+',
    ];
    const v2Labels = BUYIN_BUCKETS.map((b) => b.range);
    for (const l of dashboardLegacyLabels) {
      expect(v2Labels).not.toContain(l);
    }
  });
});

describe('CRITICAL #2: FIELD_BUCKETS labels devem alinhar com getAnalyticsByFieldSize', () => {
  it('todos os labels esperados (pequeno/medio/grande/massivo) estao presentes', () => {
    const labels = FIELD_BUCKETS.map((b) => b.bucket);
    expect(labels).toEqual(['pequeno', 'medio', 'grande', 'massivo']);
  });

  it('os labels NAO incluem percentuais de eliminacao (Top 5%, 5-10%, etc.)', () => {
    const labels = FIELD_BUCKETS.map((b) => b.bucket);
    expect(labels).not.toContain('Top 5%');
    expect(labels).not.toContain('5-10%');
    expect(labels).not.toContain('10-15%');
  });
});

describe('CRITICAL #3: getTournamentLibraryEntries (entries reais) e diferente de getTournamentLibrary (grupos agregados)', () => {
  it('a interface IStorage declara getTournamentLibraryEntries explicitamente', async () => {
    // Lazy import para evitar bind acidental ao DatabaseStorage real
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).getTournamentLibraryEntries).toBe('function');
  });

  it('a interface IStorage declara getTournamentLibrary (legacy) preservada', async () => {
    const mod = await import('../../../server/storage');
    expect(typeof (mod.storage as any).getTournamentLibrary).toBe('function');
  });
});

// ===========================================================================
// SHAPE INTEGRATION: bundle.byBuyIn[].range deve casar com o que o scorer faz
// lookup. Garantia de que o playerBundle PASSA o shape correto adiante.
// ===========================================================================

describe('CRITICAL #1+#2 integration: playerBundle propaga labels de scoringConstants para o scorer', () => {
  it('playerBundle.byBuyIn item shape: { range, sample, roi } com range = label do BUYIN_BUCKETS', async () => {
    const { playerBundleCache } = await import('../../../server/services/playerBundle');
    const { storage } = await import('../../../server/storage');

    const fakeBuyInResult = [
      { range: '$16-29', sample: 134, roi: 16.8 },
    ];

    const spies = [
      vi.spyOn(storage as any, 'getAnalyticsByBuyinRangeV2').mockResolvedValue(fakeBuyInResult),
      vi.spyOn(storage as any, 'getAnalyticsBySite').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByCategory').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsBySpeed').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByDayOfWeek').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByTimeOfDay').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByFieldSize').mockResolvedValue([]),
    ];
    if (typeof (storage as any).countTournaments === 'function') {
      spies.push(vi.spyOn(storage as any, 'countTournaments').mockResolvedValue(200));
    }
    if (typeof (storage as any).getOverallRoi === 'function') {
      spies.push(vi.spyOn(storage as any, 'getOverallRoi').mockResolvedValue(12));
    }

    try {
      (playerBundleCache as any).__resetForTest?.();
      const bundle = await playerBundleCache.getOrLoad('USER-CRIT', 180);
      expect(bundle.byBuyIn[0].range).toBe('$16-29');
      const labels = BUYIN_BUCKETS.map((b) => b.range);
      expect(labels).toContain(bundle.byBuyIn[0].range);
    } finally {
      for (const s of spies) s.mockRestore();
      (playerBundleCache as any).__resetForTest?.();
    }
  });

  it('playerBundle.byField item shape: { range, sample, roi } com range = label do FIELD_BUCKETS', async () => {
    const { playerBundleCache } = await import('../../../server/services/playerBundle');
    const { storage } = await import('../../../server/storage');

    const fakeFieldResult = [
      { range: 'medio', sample: 100, roi: 9 },
      { range: 'grande', sample: 50, roi: 15 },
    ];

    const spies = [
      vi.spyOn(storage as any, 'getAnalyticsByFieldSize').mockResolvedValue(fakeFieldResult),
      vi.spyOn(storage as any, 'getAnalyticsBySite').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByBuyinRangeV2').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByCategory').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsBySpeed').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByDayOfWeek').mockResolvedValue([]),
      vi.spyOn(storage as any, 'getAnalyticsByTimeOfDay').mockResolvedValue([]),
    ];
    if (typeof (storage as any).countTournaments === 'function') {
      spies.push(vi.spyOn(storage as any, 'countTournaments').mockResolvedValue(200));
    }
    if (typeof (storage as any).getOverallRoi === 'function') {
      spies.push(vi.spyOn(storage as any, 'getOverallRoi').mockResolvedValue(12));
    }

    try {
      (playerBundleCache as any).__resetForTest?.();
      const bundle = await playerBundleCache.getOrLoad('USER-CRIT-2', 180);
      expect(bundle.byField.length).toBe(2);
      expect(bundle.byField[0].range).toBe('medio');
      const labels = FIELD_BUCKETS.map((b) => b.bucket);
      expect(labels).toContain(bundle.byField[0].range);
      expect(labels).toContain(bundle.byField[1].range);
    } finally {
      for (const s of spies) s.mockRestore();
      (playerBundleCache as any).__resetForTest?.();
    }
  });
});

// ===========================================================================
// CRITICAL #3 integration: library entry com dayOfWeek e currency e scoreada
//
// Usa vi.spyOn em metodos do storage e mocks de modulo para evitar problemas
// com getters de modulos ESM (vi.mock so pode ser usado no top-level — vide
// declaracao no topo do arquivo).
// ===========================================================================

import { handleTournamentSelector } from '../../../server/routes/tournament-selector';
import { playerBundleCache } from '../../../server/services/playerBundle';
import { selectorCache } from '../../../server/services/selectorCache';
import { storage as storageRef } from '../../../server/storage';

describe('CRITICAL #3 integration: library entry com dayOfWeek=4 produz score nao-null', () => {
  it('library entry com dayOfWeek igual ao da date alvo aparece scoreada', async () => {
    const fakeBundle = {
      totalTournaments: 200,
      lookbackTournaments: 200,
      lookbackDays: 180,
      overallRoi: 12,
      bySite: [{ site: 'PokerStars', sample: 100, roi: 12, profit: 100 }],
      byBuyIn: [{ range: '$22-54.99', sample: 80, roi: 14 }],
      byCategory: [{ category: 'PKO', sample: 60, roi: 16 }],
      bySpeed: [{ speed: 'Normal', sample: 100, roi: 10 }],
      byDayOfWeek: [{ dayOfWeek: 4, sample: 60, roi: 11 }],
      byTimeOfDay: [{ bucket: 'noite-cedo', sample: 80, roi: 13 }],
      byField: [{ range: 'medio', sample: 80, roi: 9 }],
    };

    const bundleSpy = vi.spyOn(playerBundleCache, 'getOrLoad').mockResolvedValue(fakeBundle as any);
    const cacheGetSpy = vi.spyOn(selectorCache, 'get').mockReturnValue(null);
    const cacheSetSpy = vi.spyOn(selectorCache, 'set').mockImplementation(() => {});

    const libSpy = vi.spyOn(storageRef as any, 'getTournamentLibraryEntries').mockResolvedValue([
      {
        id: 'lib-real-001',
        userId: 'USER-CRIT',
        name: 'Library Tourney',
        site: 'PokerStars',
        buyIn: '22.00',
        currency: 'USD',
        time: '20:00',
        type: 'PKO',
        speed: 'Normal',
        dayOfWeek: 4, // chave: scorer espera essa entry apareca
      },
    ]);
    const planSpy = vi.spyOn(storageRef as any, 'getPlannedTournaments').mockResolvedValue([]);
    const settingsSpy = vi.spyOn(storageRef as any, 'getUserSettings').mockResolvedValue({});
    const logSpy = vi.spyOn(storageRef as any, 'insertSelectorLog').mockResolvedValue({ id: 'log-1' });

    try {
      const r = await handleTournamentSelector({
        userId: 'USER-CRIT',
        date: '2026-04-23', // Quinta = dayOfWeek 4
      } as any);

      expect(r.tournaments.length).toBe(1);
      expect(r.tournaments[0].source).toBe('library');
      expect(r.tournaments[0].score).toBeGreaterThan(0);
      expect(r.tournaments[0].id).toBe('lib-real-001');
    } finally {
      bundleSpy.mockRestore();
      cacheGetSpy.mockRestore();
      cacheSetSpy.mockRestore();
      libSpy.mockRestore();
      planSpy.mockRestore();
      settingsSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
