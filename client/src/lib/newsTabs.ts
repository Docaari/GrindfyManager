/**
 * News tabs — Sprint home-reform-5 item 10 + fix 2026-05-05.
 *
 * 5 abas finais (`Series | Atualizacoes | Estudos | Resultados | Fofocas`)
 * substituem os chips por NewsCategory.
 *
 * Mapping (precedencia de cima pra baixo):
 *   1. source 'studies'   -> 'studies'
 *   2. resultado de jogador (crava/conquista/forra/leva/acerta/wins/etc)
 *      -> 'results' (mesmo se title menciona serie, ex: "Pertile conquista
 *      anel WSOP Super Circuit" eh resultado, nao schedule de serie)
 *   3. keyword serie sem verbo de resultado -> 'series'
 *   4. source 'tournament-results' -> 'results'
 *   5. source 'gossip' -> 'gossip'
 *   6. demais (tools/sites) -> 'updates'
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

// Verbos/keywords que indicam RESULTADO (jogador X fez Y), tem prioridade
// sobre series. Subset alinhado com server/services/news/categorizeItem.ts.
const RESULTS_RE =
  /\b(crava|cravou|cravando|conquist[ao]u?|conquistar|venc[eu](?:u|ram)?|forr[ao]u?|forrando|forrar|ganh[aou]u?|ganhador|campe[aã]o|champion(?:ship)?|wins?|won|takes\s+down|leva\s+(?:US\$|R\$|€|\$|seis|sete|oito|cinco|tr[êe]s|quatro)|acerta\s+jackpot|jackpot|anel|bracelete|bracelet|first\s+place|second\s+place|mesa\s+final|final\s+table|quarteto\s+final|deep\s+run|FT\b|chega\s+ao\s+FT|avan[çc]a|lider(?:a|an[çc]a|ou)?|chip\s+leader|big\s+stack|hit\s+(?:gigante|milion|enorme|grande)|vice-?campe[ãa]|vice(?!-presi)|soma\s+(?:t[ií]tulo|vice|pr[êe]mio)|HU\s+(?:com|brasileiro)|elimina|sequ[êe]ncia\s+de\s+pr[êe]mi|pr[êe]mio\s+milion[áa]rio)\b/i;

export function isSeriesEvent(item: NewsItem): boolean {
  const tags = (item.tags ?? []).join(' ');
  const text = `${item.title} ${item.summary ?? ''} ${tags}`;
  return SERIES_RE.test(text);
}

export function isResultEvent(item: NewsItem): boolean {
  const tags = (item.tags ?? []).join(' ');
  const text = `${item.title} ${item.summary ?? ''} ${tags}`;
  return RESULTS_RE.test(text);
}

export function getNewsTab(item: NewsItem): NewsTab {
  if (item.source === 'studies') return 'studies';
  // Resultado de jogador prevalece sobre menciona de serie.
  if (isResultEvent(item)) return 'results';
  if (isSeriesEvent(item)) return 'series';
  if (item.source === 'tournament-results') return 'results';
  if (item.source === 'gossip') return 'gossip';
  return 'updates';
}
