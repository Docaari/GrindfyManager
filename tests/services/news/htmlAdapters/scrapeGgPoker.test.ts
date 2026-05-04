/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeGgPoker`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeGgPoker (RF-05.1)', () => {
  const baseUrl = 'https://ggpoker.com';

  it('extrai >= 3 items com fields completos', async () => {
    const { scrapeGgPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeGgPoker'
    );
    const items = scrapeGgPoker(fixture('ggpoker.html'), baseUrl);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('parseia data Month Day, Year ("May 1, 2026")', async () => {
    // RF-05.1 AC: parse multi-formato
    const { scrapeGgPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeGgPoker'
    );
    const items = scrapeGgPoker(fixture('ggpoker.html'), baseUrl);
    expect(items.length).toBeGreaterThan(0);
    const dt = new Date(items[0].publishedAt);
    expect(Number.isNaN(dt.getTime())).toBe(false);
  });

  it('layout-change defense', async () => {
    const { scrapeGgPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeGgPoker'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(scrapeGgPoker(fixture('broken-layout.html'), baseUrl)).toEqual([]);
  });
});
