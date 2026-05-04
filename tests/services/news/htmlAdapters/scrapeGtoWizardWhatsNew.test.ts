/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeGtoWizardWhatsNew`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeGtoWizardWhatsNew (RF-05.1)', () => {
  const baseUrl = 'https://blog.gtowizard.com';

  it('extrai >= 3 items', async () => {
    const { scrapeGtoWizardWhatsNew } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeGtoWizardWhatsNew'
    );
    const items = scrapeGtoWizardWhatsNew(
      fixture('gto-wizard-whatsnew.html'),
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
    const { scrapeGtoWizardWhatsNew } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeGtoWizardWhatsNew'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(scrapeGtoWizardWhatsNew(fixture('broken-layout.html'), baseUrl)).toEqual([]);
  });
});
