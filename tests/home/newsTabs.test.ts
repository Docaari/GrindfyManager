/**
 * Test-Writer (Modo TDD).
 *
 * Sprint home-reform-5 item 10 — helper newsTabs.
 * Spec: Docs/specs/home-reform-5.md item 10.
 */

import { describe, it, expect } from 'vitest';
import {
  getNewsTab,
  isSeriesEvent,
  isResultEvent,
  NEWS_TABS,
  NEWS_TAB_LABELS,
} from '@/lib/newsTabs';
import type { NewsItem } from '@shared/types/news';

function mkItem(overrides: Partial<NewsItem> & { id: string; source: NewsItem['source'] }): NewsItem {
  return {
    id: overrides.id,
    source: overrides.source,
    platform: 'pokerstars',
    title: 'Title',
    summary: '',
    url: 'https://example.com',
    publishedAt: '2026-05-03T10:00:00Z',
    fetchedAt: '2026-05-03T11:00:00Z',
    tags: [],
    engagement: {},
    ...overrides,
  };
}

describe('NEWS_TABS', () => {
  it('exporta 5 abas na ordem fixa Series|Atualizacoes|Estudos|Resultados|Fofocas', () => {
    expect(NEWS_TABS).toEqual(['series', 'updates', 'studies', 'results', 'gossip']);
  });

  it('NEWS_TAB_LABELS PT-BR para cada aba', () => {
    expect(NEWS_TAB_LABELS.series).toBe('Series');
    expect(NEWS_TAB_LABELS.updates).toBe('Atualizacoes');
    expect(NEWS_TAB_LABELS.studies).toBe('Estudos');
    expect(NEWS_TAB_LABELS.results).toBe('Resultados');
    expect(NEWS_TAB_LABELS.gossip).toBe('Fofocas');
  });
});

describe('isSeriesEvent', () => {
  it('detecta SCOOP no titulo', () => {
    expect(isSeriesEvent(mkItem({ id: 'a', source: 'sites', title: 'SCOOP 2026 anuncia schedule' }))).toBe(true);
  });

  it('detecta WSOP no summary', () => {
    expect(isSeriesEvent(mkItem({ id: 'a', source: 'tournament-results', title: 'Brasileiro avanca', summary: 'WSOP Main Event Day 5' }))).toBe(true);
  });

  it('detecta tag "series"', () => {
    expect(isSeriesEvent(mkItem({ id: 'a', source: 'sites', title: 'Notas', tags: ['series'] }))).toBe(true);
  });

  it('item sem keyword retorna false', () => {
    expect(isSeriesEvent(mkItem({ id: 'a', source: 'sites', title: 'Hand2Note 4.5 lancamento' }))).toBe(false);
  });
});

describe('isResultEvent', () => {
  it('detecta "crava"', () => {
    expect(isResultEvent(mkItem({ id: 'a', source: 'sites', title: 'Joao crava o GGMasters' }))).toBe(true);
  });
  it('detecta "conquista anel"', () => {
    expect(isResultEvent(mkItem({ id: 'a', source: 'sites', title: 'Pertile conquista anel WSOP' }))).toBe(true);
  });
  it('detecta "forra"', () => {
    expect(isResultEvent(mkItem({ id: 'a', source: 'sites', title: 'Forra de US$ 220 mil' }))).toBe(true);
  });
  it('detecta "acerta jackpot"', () => {
    expect(isResultEvent(mkItem({ id: 'a', source: 'sites', title: 'Brasileiro acerta jackpot Spin Gold' }))).toBe(true);
  });
  it('detecta "mesa final formada"', () => {
    expect(isResultEvent(mkItem({ id: 'a', source: 'sites', title: 'Mesa final do Main Event do BSOP formada' }))).toBe(true);
  });
});

describe('getNewsTab', () => {
  it('verbo de resultado prevalece sobre keyword series (FT/avanca)', () => {
    // FT = final table, indica resultado ainda que titulo cite serie.
    const item = mkItem({ id: 'a', source: 'tournament-results', title: 'WCOOP Main Event chega ao FT' });
    expect(getNewsTab(item)).toBe('results');
  });

  it('source studies mapeia para "studies"', () => {
    expect(getNewsTab(mkItem({ id: 'a', source: 'studies', title: 'GTO heuristic' }))).toBe('studies');
  });

  it('source tournament-results sem verbo resultado e sem serie cai em "results"', () => {
    expect(getNewsTab(mkItem({ id: 'a', source: 'tournament-results', title: 'Joao crava torneio dominical' }))).toBe('results');
  });

  it('source gossip sem keyword series mapeia para "gossip"', () => {
    expect(getNewsTab(mkItem({ id: 'a', source: 'gossip', title: 'Polemica entre players' }))).toBe('gossip');
  });

  it('source tools mapeia para "updates"', () => {
    expect(getNewsTab(mkItem({ id: 'a', source: 'tools', title: 'PokerTracker 5 release' }))).toBe('updates');
  });

  it('source sites sem keyword series mapeia para "updates"', () => {
    expect(getNewsTab(mkItem({ id: 'a', source: 'sites', title: 'Stars adiciona fast-fold' }))).toBe('updates');
  });

  // Casos reais reportados pelo founder (2026-05-05).
  describe('regression founder report 2026-05-05', () => {
    it('"Pertile conquista anel da WSOP Super Circuit" -> results', () => {
      expect(
        getNewsTab(
          mkItem({
            id: '1',
            source: 'sites',
            title: 'Victor Pertile conquista anel da WSOP Super Circuit e garante forra de US$ 220 mil na GGPoker',
          }),
        ),
      ).toBe('results');
    });

    it('"Joao Valli crava bounty hunters circuit hr" -> results', () => {
      expect(
        getNewsTab(
          mkItem({
            id: '2',
            source: 'sites',
            title: 'Joao Valli crava Bounty Hunters Circuit HR da WSOP SC e garante forra de seis digitos',
          }),
        ),
      ).toBe('results');
    });

    it('"Leonardo Nascimento crava 9 mini main event WSOP super circuit" -> results', () => {
      expect(
        getNewsTab(
          mkItem({
            id: '3',
            source: 'sites',
            title: 'Leonardo Nascimento crava o 9 mini main event da WSOP super circuit e garante segundo anel brasileiro',
          }),
        ),
      ).toBe('results');
    });

    it('"Mesa final do main event do BSOP rio quente formada" -> results', () => {
      expect(
        getNewsTab(
          mkItem({
            id: '4',
            source: 'gossip',
            title: 'Mesa final do main event do BSOP rio quente e formada com Ale Couto na lideranca',
          }),
        ),
      ).toBe('results');
    });

    it('"Matheus Machado crava GGMasters High Rollers" -> results', () => {
      expect(
        getNewsTab(
          mkItem({
            id: '5',
            source: 'sites',
            title: 'Matheus Machado crava GGMasters High Rollers e forra pesado na GGPoker',
          }),
        ),
      ).toBe('results');
    });

    it('"Brasileiro HavDen acerta jackpot Spin and Gold" -> results', () => {
      expect(
        getNewsTab(
          mkItem({
            id: '6',
            source: 'sites',
            title: 'Brasileiro "HavDen" acerta jackpot no Spin and Gold da GGPoker e leva US$ 300 mil',
          }),
        ),
      ).toBe('results');
    });
  });
});
