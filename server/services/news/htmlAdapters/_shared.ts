/**
 * HTML adapter shared utils — Sprint News-3 RF-05.1.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 *
 * Helpers comuns pra todos os adapters HTML:
 *   - parseDateMulti: aceita ISO 8601, "Month Day, Year", "DD/MM/YYYY", "DD Month YYYY"
 *   - resolveUrl: resolve URLs relativas via URL constructor com baseUrl
 *   - truncateSummary: trunca a 500 chars
 *   - finalizeItems: filtra invalidos + trunca top 10 + warn em zero items
 *   - runAdapter: builder declarativo que executa o pipeline padrao dos 9 adapters
 */

import * as cheerio from "cheerio";

export type AdapterItem = {
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
};

const TOP_LIMIT = 10;
const SUMMARY_MAX_LEN = 500;

const MONTHS_PT: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

const MONTHS_EN: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function buildUtcIso(year: number, monthIdx: number, day: number): string | null {
  const dt = new Date(Date.UTC(year, monthIdx, day));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/**
 * Parse multi-formato. Retorna ISO string OR null se invalido.
 */
export function parseDateMulti(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Try native Date parse (ISO 8601, RFC 822, etc).
  const nativeDate = new Date(trimmed);
  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate.toISOString();
  }

  // DD/MM/YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return buildUtcIso(
      parseInt(ddmmyyyy[3], 10),
      parseInt(ddmmyyyy[2], 10) - 1,
      parseInt(ddmmyyyy[1], 10),
    );
  }

  // DD Mon YYYY (PT or EN), e.g. "28 abr 2026" or "28 April 2026".
  const dmy = trimmed.match(/^(\d{1,2})\s+([a-zA-ZçÇãÃáÁéÉíÍóÓúÚâÂêÊîÎôÔûÛ]+)\s+(\d{4})$/);
  if (dmy) {
    const monStr = dmy[2].toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").slice(0, 3);
    const monthIdx = MONTHS_PT[monStr] ?? MONTHS_EN[monStr];
    if (monthIdx !== undefined) {
      return buildUtcIso(parseInt(dmy[3], 10), monthIdx, parseInt(dmy[1], 10));
    }
  }

  // Month Day, Year (EN), e.g. "April 28, 2026" or "May 1, 2026".
  const mdy = trimmed.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const monStr = mdy[1].toLowerCase();
    const monthIdx = MONTHS_EN[monStr] ?? MONTHS_PT[monStr.slice(0, 3)];
    if (monthIdx !== undefined) {
      return buildUtcIso(parseInt(mdy[3], 10), monthIdx, parseInt(mdy[2], 10));
    }
  }

  return null;
}

/**
 * Resolve URL relativa pra absoluta usando baseUrl. Retorna null se o
 * resultante for invalido.
 */
export function resolveUrl(href: string | undefined | null, baseUrl: string): string | null {
  if (!href || typeof href !== "string") return null;
  const trimmed = href.trim();
  if (trimmed.length === 0) return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Trunca summary a 500 chars (RF-05.1 spec). */
export function truncateSummary(s: string | null | undefined): string {
  if (!s || typeof s !== "string") return "";
  const cleaned = s.trim().replace(/\s+/g, " ");
  return cleaned.slice(0, SUMMARY_MAX_LEN);
}

/**
 * Filtra items invalidos (sem title, sem url, ou data nao parseavel).
 * Trunca top 10. Logging warn quando ZERO items survivem (layout-change).
 */
export function finalizeItems(adapterName: string, items: AdapterItem[]): AdapterItem[] {
  const valid = items.filter((it) => it.title && it.url && it.publishedAt);
  if (valid.length === 0) {
    console.warn(
      `[news/html] adapter ${adapterName} returned 0 items, layout may have changed`,
    );
    return [];
  }
  return valid.slice(0, TOP_LIMIT);
}

// =============================================================================
// runAdapter — pipeline declarativo compartilhado pelos 9 adapters HTML.
// Cada adapter passa apenas seletores + estrategias de extracao; o helper
// centraliza load(html), iteracao, validacao e finalizeItems.
// =============================================================================

type CheerioApi = ReturnType<typeof cheerio.load>;
type CheerioWrap = ReturnType<CheerioApi>;

export interface AdapterConfig {
  /** Nome usado em logs de zero-items. */
  name: string;
  /** Seletor de cada item (ex: "article.post"). */
  itemSelector: string;
  /** Como achar o anchor de titulo dentro do item. */
  titleAnchor: (item: CheerioWrap) => CheerioWrap;
  /**
   * Como extrair o texto do titulo. Default: text() do anchor.
   * GTO Wizard Articles e HRC tem titulo num filho do anchor (ex: <h3>).
   */
  titleText?: (item: CheerioWrap, anchor: CheerioWrap) => string;
  /** Como achar o elemento de data. */
  dateSelector: (item: CheerioWrap) => CheerioWrap;
  /**
   * Estrategia de extracao da data:
   *  - 'datetime-attr-or-text': tenta attr('datetime') primeiro, depois text().
   *  - 'text': sempre text().
   */
  dateMode: "datetime-attr-or-text" | "text";
  /** Como achar o elemento de summary. */
  summarySelector: (item: CheerioWrap) => CheerioWrap;
}

export function runAdapter(
  html: string,
  baseUrl: string,
  cfg: AdapterConfig,
): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $(cfg.itemSelector).each((_, el) => {
    const $el = $(el);
    const $anchor = cfg.titleAnchor($el).first();
    const title = (cfg.titleText ? cfg.titleText($el, $anchor) : $anchor.text()).trim();
    const url = resolveUrl($anchor.attr("href"), baseUrl);

    const $date = cfg.dateSelector($el).first();
    const dateRaw =
      cfg.dateMode === "datetime-attr-or-text"
        ? ($date.attr("datetime") ?? $date.text().trim())
        : $date.text().trim();
    const publishedAt = parseDateMulti(dateRaw);

    const summary = truncateSummary(cfg.summarySelector($el).text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems(cfg.name, items);
}
