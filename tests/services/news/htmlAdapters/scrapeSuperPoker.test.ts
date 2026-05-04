/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeSuperPoker`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeSuperPoker (RF-05.1)', () => {
  const baseUrl = 'https://superpoker.com.br';

  it('extrai >= 3 items com fields completos', async () => {
    const { scrapeSuperPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeSuperPoker'
    );
    const items = scrapeSuperPoker(fixture('superpoker.html'), baseUrl);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('parseia data DD/MM/YYYY', async () => {
    // RF-05.1 AC: parse multi-formato — 28/04/2026
    const { scrapeSuperPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeSuperPoker'
    );
    const items = scrapeSuperPoker(fixture('superpoker.html'), baseUrl);
    expect(items.length).toBeGreaterThan(0);
    // publishedAt eh ISO string OU Date — qualquer parse valido
    const dt = new Date(items[0].publishedAt);
    expect(Number.isNaN(dt.getTime())).toBe(false);
  });

  it('resolve URLs relativas com baseUrl', async () => {
    const { scrapeSuperPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeSuperPoker'
    );
    const items = scrapeSuperPoker(fixture('superpoker.html'), baseUrl);
    for (const it of items) expect(it.url).toContain('superpoker.com.br');
  });

  it('layout-change defense: broken HTML retorna []', async () => {
    const { scrapeSuperPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeSuperPoker'
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = scrapeSuperPoker(fixture('broken-layout.html'), baseUrl);
    expect(items).toEqual([]);
  });
});
