/**
 * News tabs — Sprint home-reform-5 item 10.
 *
 * 5 abas finais (`Series | Atualizacoes | Estudos | Resultados | Fofocas`)
 * substituem os chips por NewsCategory. Mapping pragmatico:
 *   - series  -> qualquer item com keyword de circuito/torneio-serie
 *   - studies -> source 'studies'
 *   - results -> source 'tournament-results' SEM keyword series
 *   - gossip  -> source 'gossip'
 *   - updates -> source 'tools' ou 'sites' SEM keyword series
 */

import type { NewsItem } from '@shared/types/news';

export type NewsTab = 'series' | 'updates' | 'studies' | 'results' | 'gossip';

export const NEWS_TABS: NewsTab[] = ['series', 'updates', 'studies', 'results', 'gossip'];

export const NEWS_TAB_LABELS: Record<NewsTab, string> = {
  series: 'Series',
  updates: 'Atualizacoes',
  studies: 'Estudos',
  results: 'Resultados',
  gossip: 'Fofocas',
};

const SERIES_RE =
  /\b(scoop|wcoop|wsop|wcoss|festival|series|s[ée]ries?|circuit|circuito|main\s+event|micro|wpt|ept|brkpt|bsop|micromilions?|millions?|championship|liga)\b/i;

export function isSeriesEvent(item: NewsItem): boolean {
  const tags = (item.tags ?? []).join(' ');
  const text = `${item.title} ${item.summary ?? ''} ${tags}`;
  return SERIES_RE.test(text);
}

export function getNewsTab(item: NewsItem): NewsTab {
  if (isSeriesEvent(item)) return 'series';
  if (item.source === 'studies') return 'studies';
  if (item.source === 'tournament-results') return 'results';
  if (item.source === 'gossip') return 'gossip';
  return 'updates';
}
