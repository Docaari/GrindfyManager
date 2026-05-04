/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeHand2Note`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeHand2Note (RF-05.1)', () => {
  const baseUrl = 'https://hand2note.com';

  it('extrai >= 3 items', async () => {
    const { scrapeHand2Note } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeHand2Note'
    );
    const items = scrapeHand2Note(fixture('hand2note.html'), baseUrl);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('parseia "DD Month YYYY" (28 April 2026)', async () => {
    const { scrapeHand2Note } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeHand2Note'
    );
    const items = scrapeHand2Note(fixture('hand2note.html'), baseUrl);
    const dt = new Date(items[0].publishedAt);
    expect(Number.isNaN(dt.getTime())).toBe(false);
  });

  it('layout-change defense', async () => {
    const { scrapeHand2Note } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeHand2Note'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(scrapeHand2Note(fixture('broken-layout.html'), baseUrl)).toEqual([]);
  });
});
