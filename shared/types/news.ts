/**
 * RF-03 — NewsItem / NewsResponse (TDD red-phase types)
 *
 * Sprint home-reform-1. Tipos contratados pela ADR-100 §2.
 *
 * Implementer NAO precisa modificar — schema esta congelado em Onda 1.
 * Onda 3 (xAI Grok integration) poderia evoluir mas seria via campo opcional
 * (zero breaking change).
 */

export interface NewsItem {
  id: string;
  source: 'poker-software' | 'reserved-future';
  title: string;
  /** <= 280 chars (validacao runtime em Onda 3 via Zod) */
  summary: string;
  url: string;
  /** ISO 8601 */
  publishedAt: string;
  /** ISO 8601 — quando o backend buscou o item */
  fetchedAt: string;
  tags?: string[];
}

export interface NewsResponse {
  items: NewsItem[];
  enabled: boolean;
  cachedAt?: string;
  nextRefreshAt?: string;
}
