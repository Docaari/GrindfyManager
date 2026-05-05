/**
 * News types — ADR-106 (Onda 3 expansao xAI Grok integration) +
 * ADR-110 (Onda 3 ranking + zoning).
 *
 * Sprint home-reform-1 (Onda 1) congelou enum em 'poker-software' | 'reserved-future'.
 * ADR-106 revoga §2.B do ADR-100 e expande pra 4 sources com opt-in granular.
 * ADR-110 introduz CATEGORY_LABELS + NEWS_CATEGORY_PRIORITY como fontes unicas.
 *
 * BREAKING CHANGE controlado: 'poker-software' (ADR-100) virou 'market' (ADR-106).
 * Migracao em runtime: provider/storage convertem 'poker-software' -> 'market'.
 * Tests existentes (news-stub, news-types) atualizados pra novo enum.
 */

export type NewsSource =
  | 'tools'
  | 'sites'
  | 'gossip'
  | 'tournament-results'
  | 'studies'
  | 'reserved-future'
  /** @deprecated substituido por 'tools' + 'sites'. Mantido pra compat. */
  | 'market'
  /** @deprecated alias de 'market'. Mantido para compat com testes Onda 1. */
  | 'poker-software';

export type NewsCategory = NewsSource; // alias semantico

export interface NewsEngagement {
  likes?: number;
  views?: number;
  comments?: number;
}

export interface NewsItem {
  id: string;
  source: NewsSource;
  /** Slug da plataforma/veiculo: 'hand2note', 'pokerstars', 'cardplayer-br'. */
  platform: string;
  title: string;
  /** <= 280 chars. */
  summary: string;
  url: string;
  /** ISO 8601 */
  publishedAt: string;
  /** ISO 8601 — quando o backend buscou o item. */
  fetchedAt: string;
  thumbnailUrl?: string | null;
  engagement?: NewsEngagement;
  tags?: string[];
}

export interface NewsResponse {
  items: NewsItem[];
  enabled: boolean;
  cachedAt?: string;
  nextRefreshAt?: string;
}

/**
 * Preferencias do usuario por categoria. master `enabled` controla a categoria
 * inteira; `platformToggles` controla plataformas individuais.
 */
export interface UserNewsPreference {
  category: NewsSource;
  enabled: boolean;
  platformToggles: Record<string, boolean>;
}

export interface UserNewsPreferencesResponse {
  preferences: UserNewsPreference[];
  /** Plataformas detectadas via CSV imports do user (interesse implicito). */
  detectedPlatforms: string[];
  /** Catalogo completo de plataformas/veiculos disponiveis por categoria. */
  catalog: Record<NewsSource, NewsSourceCatalogEntry[]>;
}

export interface NewsSourceCatalogEntry {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string | null;
  category: NewsSource;
}

// =============================================================================
// ADR-110 §2.3 / RF-B6, RF-B7 — fontes unicas de label + prioridade.
// =============================================================================

/**
 * Ordem fixa de prioridade de categorias usada em:
 *   - tiebreak do ranking server-side (`rankNewsFeed`)
 *   - ordem dos chips no NewsFeed (apos chip "Todas")
 *
 * Alteracoes nesta constante mudam comportamento visual + ranking. Trate como
 * contrato estavel.
 */
export const NEWS_CATEGORY_PRIORITY: NewsCategory[] = [
  'studies',
  'tools',
  'sites',
  'tournament-results',
  'gossip',
];

/**
 * Labels visiveis ao user (PT-BR). Inclui aliases legacy (market, poker-software,
 * reserved-future) para nao quebrar testes Onda 1 e compat com dados antigos.
 *
 * RF-B7: NewsSlot, NewsFeed e NewsPreferencesDialog consomem dessa fonte unica.
 */
export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  tools: 'Tools',
  sites: 'Sites',
  studies: 'Studies',
  'tournament-results': 'Resultados',
  gossip: 'Fofocas',
  // Aliases legacy — preservados pra compat ADR-100.
  market: 'Mercado',
  'reserved-future': 'Reservado',
  'poker-software': 'Mercado',
};
