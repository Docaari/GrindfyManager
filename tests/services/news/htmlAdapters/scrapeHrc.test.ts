/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeHrc`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeHrc (RF-05.1)', () => {
  const baseUrl = 'https://www.holdemresources.net';

  it('extrai >= 3 items', async () => {
    const { scrapeHrc } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeHrc'
    );
    const items = scrapeHrc(fixture('hrc.html'), baseUrl);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('resolve URL relativa /blog/x → absoluta', async () => {
    const { scrapeHrc } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeHrc'
    );
    const items = scrapeHrc(fixture('hrc.html'), baseUrl);
    for (const it of items) expect(it.url).toContain('holdemresources.net');
  });

  it('layout-change defense', async () => {
    const { scrapeHrc } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeHrc'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(scrapeHrc(fixture('broken-layout.html'), baseUrl)).toEqual([]);
  });
});
