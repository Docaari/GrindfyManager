/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeJurojin`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeJurojin (RF-05.1)', () => {
  const baseUrl = 'https://jurojinpoker.com';

  it('extrai >= 3 items', async () => {
    const { scrapeJurojin } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeJurojin'
    );
    const items = scrapeJurojin(fixture('jurojin.html'), baseUrl);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('parseia data DD/MM/YYYY', async () => {
    const { scrapeJurojin } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeJurojin'
    );
    const items = scrapeJurojin(fixture('jurojin.html'), baseUrl);
    const dt = new Date(items[0].publishedAt);
    expect(Number.isNaN(dt.getTime())).toBe(false);
  });

  it('layout-change defense', async () => {
    const { scrapeJurojin } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeJurojin'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(scrapeJurojin(fixture('broken-layout.html'), baseUrl)).toEqual([]);
  });
});
