/**
 * Test-Writer (Modo TDD).
 *
 * Sprint home-reform-5 item 10 — helper newsTabs.
 * Spec: Docs/specs/home-reform-5.md item 10.
 */

import { describe, it, expect } from 'vitest';
import { getNewsTab, isSeriesEvent, NEWS_TABS, NEWS_TAB_LABELS } from '@/lib/newsTabs';
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

describe('getNewsTab', () => {
  it('item com keyword series mapeia para "series" mesmo se source for tournament-results', () => {
    const item = mkItem({ id: 'a', source: 'tournament-results', title: 'WCOOP Main Event chega ao FT' });
    expect(getNewsTab(item)).toBe('series');
  });

  it('source studies mapeia para "studies"', () => {
    expect(getNewsTab(mkItem({ id: 'a', source: 'studies', title: 'GTO heuristic' }))).toBe('studies');
  });

  it('source tournament-results sem keyword series mapeia para "results"', () => {
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
});
