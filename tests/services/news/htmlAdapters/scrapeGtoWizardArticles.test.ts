/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeGtoWizardArticles`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeGtoWizardArticles (RF-05.1)', () => {
  const baseUrl = 'https://blog.gtowizard.com';

  it('extrai >= 3 items', async () => {
    const { scrapeGtoWizardArticles } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeGtoWizardArticles'
    );
    const items = scrapeGtoWizardArticles(
      fixture('gto-wizard-articles.html'),
      baseUrl,
    );
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('layout-change defense', async () => {
    const { scrapeGtoWizardArticles } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeGtoWizardArticles'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(scrapeGtoWizardArticles(fixture('broken-layout.html'), baseUrl)).toEqual([]);
  });
});
