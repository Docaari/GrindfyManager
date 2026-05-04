/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-01: Schema migration `news_sources`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-01
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §5
 *
 * Valida o shape do schema TS em shared/schema.ts apos a migration:
 *   - coluna `rss_url` text NULL
 *   - coluna `scrape_strategy` varchar(32) NOT NULL DEFAULT 'html' + CHECK constraint
 *   - coluna `x_handle` varchar(64) NULL (renomeada de `live_search_handle`)
 *   - tipo `ScrapeStrategy` exportado como union literal
 *   - constante `SCRAPE_STRATEGIES` com os 6 valores validos
 *
 * Status RED: estas colunas/tipos NAO existem no schema atual. Implementer
 * vai adicionar via ALTER + RENAME na migration nova.
 */

import { describe, it, expect } from 'vitest';

describe('news_sources schema (RF-01)', () => {
  it('exporta tipo ScrapeStrategy com 6 valores literais', async () => {
    // RF-01 AC: tipo `ScrapeStrategy` union literal (rss|html|x_only|rss_and_x|html_and_x|rss_or_html)
    const mod = await import('../../shared/schema');
    expect(mod).toHaveProperty('SCRAPE_STRATEGIES');
    expect((mod as any).SCRAPE_STRATEGIES).toEqual(
      expect.arrayContaining([
        'rss',
        'html',
        'x_only',
        'rss_and_x',
        'html_and_x',
        'rss_or_html',
      ]),
    );
    expect((mod as any).SCRAPE_STRATEGIES).toHaveLength(6);
  });

  it('expoe schema Zod para ScrapeStrategy', async () => {
    // RF-01 AC: validacao runtime da enum
    const mod = await import('../../shared/schema');
    expect(mod).toHaveProperty('scrapeStrategySchema');
    const schema = (mod as any).scrapeStrategySchema;
    expect(() => schema.parse('rss')).not.toThrow();
    expect(() => schema.parse('html')).not.toThrow();
    expect(() => schema.parse('x_only')).not.toThrow();
    expect(() => schema.parse('rss_and_x')).not.toThrow();
    expect(() => schema.parse('html_and_x')).not.toThrow();
    expect(() => schema.parse('rss_or_html')).not.toThrow();
    expect(() => schema.parse('invalid')).toThrow();
    expect(() => schema.parse('foo')).toThrow();
  });

  it('newsSources table inclui coluna rss_url (text, nullable)', async () => {
    // RF-01 AC: ADD COLUMN rss_url TEXT NULL
    const mod = await import('../../shared/schema');
    const table: any = (mod as any).newsSources;
    expect(table).toBeDefined();
    expect(table).toHaveProperty('rssUrl');
    // Drizzle column inferencia: column.notNull deve ser false (NULL aceito).
    expect(table.rssUrl?.notNull).toBe(false);
  });

  it('newsSources table inclui coluna scrape_strategy (varchar 32, NOT NULL, default html)', async () => {
    // RF-01 AC: ADD COLUMN scrape_strategy VARCHAR(32) NOT NULL DEFAULT 'html'
    const mod = await import('../../shared/schema');
    const table: any = (mod as any).newsSources;
    expect(table).toHaveProperty('scrapeStrategy');
    expect(table.scrapeStrategy?.notNull).toBe(true);
    expect(table.scrapeStrategy?.default).toBe('html');
  });

  it('newsSources table foi renomeada live_search_handle → x_handle', async () => {
    // RF-01 AC: rename + preserva valores
    const mod = await import('../../shared/schema');
    const table: any = (mod as any).newsSources;
    expect(table).toHaveProperty('xHandle');
    // Nao deve ter mais a propriedade antiga
    expect(table).not.toHaveProperty('liveSearchHandle');
  });

  it('inclui as 15 sources locked como InsertNewsSource[]', async () => {
    // Lista canonica do audit Docs/audits/news-x-handles.md.
    // Implementer deve exportar `NEWS_3_SOURCES_LOCKED` para usar no migration UPSERT.
    const mod = await import('../../shared/schema');
    expect(mod).toHaveProperty('NEWS_3_SOURCES_LOCKED');
    const sources = (mod as any).NEWS_3_SOURCES_LOCKED as Array<any>;
    expect(Array.isArray(sources)).toBe(true);
    expect(sources).toHaveLength(15);

    const ids = sources.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'mundopoker',
        'superpoker',
        '888poker',
        'bodog',
        'coinpoker',
        'ggpoker',
        'partypoker',
        'pokerstars',
        'wpn-acr',
        'gto-wizard-studies',
        'gto-wizard',
        'hand2note',
        'hrc',
        'jurojin',
        'sharkscope',
      ]),
    );
  });

  it('retorna 6 ids de drops (legacy) para DELETE CASCADE', async () => {
    // RF-01 AC: drops cravadas-br, chico, ipoker, intuitive-table, holdem-manager, pokertracker.
    const mod = await import('../../shared/schema');
    expect(mod).toHaveProperty('NEWS_3_SOURCES_DROPPED');
    const drops = (mod as any).NEWS_3_SOURCES_DROPPED as string[];
    expect(Array.isArray(drops)).toBe(true);
    expect(drops).toHaveLength(6);
    expect(drops).toEqual(
      expect.arrayContaining([
        'cravadas-br',
        'chico',
        'ipoker',
        'intuitive-table',
        'holdem-manager',
        'pokertracker',
      ]),
    );
  });

  it('cada source locked tem campos obrigatorios', async () => {
    // Sanidade: id + name + category + scrape_strategy + (rss_url OR homepage_url OR x_handle)
    const mod = await import('../../shared/schema');
    const sources = (mod as any).NEWS_3_SOURCES_LOCKED as any[];
    expect(Array.isArray(sources)).toBe(true);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.scrapeStrategy).toBeTruthy();
      // Pelo menos um modo deve ser preenchido.
      expect(s.rssUrl || s.homepageUrl || s.xHandle).toBeTruthy();
    }
  });
});
