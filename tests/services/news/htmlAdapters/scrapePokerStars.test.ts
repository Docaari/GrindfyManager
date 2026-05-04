/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapePokerStars`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapePokerStars (RF-05.1)', () => {
  const baseUrl = 'https://www.pokerstars.com';

  it('extrai >= 3 items com fields completos', async () => {
    const { scrapePokerStars } = await import(
      '../../../../server/services/news/htmlAdapters/scrapePokerStars'
    );
    const items = scrapePokerStars(fixture('pokerstars.html'), baseUrl);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('parseia ISO 8601 (YYYY-MM-DD)', async () => {
    const { scrapePokerStars } = await import(
      '../../../../server/services/news/htmlAdapters/scrapePokerStars'
    );
    const items = scrapePokerStars(fixture('pokerstars.html'), baseUrl);
    const dt = new Date(items[0].publishedAt);
    expect(Number.isNaN(dt.getTime())).toBe(false);
  });

  it('layout-change defense', async () => {
    const { scrapePokerStars } = await import(
      '../../../../server/services/news/htmlAdapters/scrapePokerStars'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(scrapePokerStars(fixture('broken-layout.html'), baseUrl)).toEqual([]);
  });
});
