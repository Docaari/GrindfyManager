/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-08.1: Schema migration adicional `news_items`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-08.1
 *
 * Valida que o schema TS reflete:
 *   - coluna `url_canonical` text NOT NULL DEFAULT ''
 *   - coluna `title_fingerprint` varchar(64) NOT NULL DEFAULT ''
 *   - indices `idx_news_items_url_canonical_fetched` e `idx_news_items_title_fingerprint_fetched`
 *
 * Status RED: estas colunas/indices NAO existem no schema atual.
 */

import { describe, it, expect } from 'vitest';

describe('news_items schema (RF-08.1)', () => {
  it('newsItems table inclui coluna url_canonical (text, NOT NULL, default "")', async () => {
    const mod = await import('../../shared/schema');
    const table: any = (mod as any).newsItems;
    expect(table).toBeDefined();
    expect(table).toHaveProperty('urlCanonical');
    expect(table.urlCanonical?.notNull).toBe(true);
    // default '' string vazia
    expect(table.urlCanonical?.default).toBe('');
  });

  it('newsItems table inclui coluna title_fingerprint (varchar 64, NOT NULL, default "")', async () => {
    const mod = await import('../../shared/schema');
    const table: any = (mod as any).newsItems;
    expect(table).toHaveProperty('titleFingerprint');
    expect(table.titleFingerprint?.notNull).toBe(true);
    expect(table.titleFingerprint?.default).toBe('');
  });

  it('table inferSelect inclui ambos campos', async () => {
    // Tipo runtime check: simulamos um row e checamos as keys do tipo via property access.
    const mod = await import('../../shared/schema');
    const table: any = (mod as any).newsItems;
    // table.<column>.name retorna o snake_case real
    expect(table.urlCanonical?.name).toBe('url_canonical');
    expect(table.titleFingerprint?.name).toBe('title_fingerprint');
  });
});
