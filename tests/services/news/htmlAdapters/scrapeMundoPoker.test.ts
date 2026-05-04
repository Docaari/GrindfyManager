/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05.1: HTML adapter `scrapeMundoPoker`.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05.1
 *
 * Status RED: adapter NAO existe.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../fixtures/news-html/', name), 'utf8');

describe('scrapeMundoPoker (RF-05.1)', () => {
  const baseUrl = 'https://mundopoker.com.br';

  it('extrai >= 3 items com fields completos', async () => {
    // RF-05.1 AC: cada adapter extrai >= 3 items
    const { scrapeMundoPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeMundoPoker'
    );
    const html = fixture('mundopoker.html');
    const items = scrapeMundoPoker(html, baseUrl);

    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.publishedAt).toBeTruthy();
    }
  });

  it('resolve URLs relativas para absolutas via baseUrl', async () => {
    // RF-05.1 AC: URL relativa /noticia/x → https://mundopoker.com.br/noticia/x
    const { scrapeMundoPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeMundoPoker'
    );
    const items = scrapeMundoPoker(fixture('mundopoker.html'), baseUrl);
    for (const it of items) {
      expect(it.url.startsWith('https://') || it.url.startsWith('http://')).toBe(true);
      expect(it.url).toContain('mundopoker.com.br');
    }
  });

  it('layout-change defense: HTML sem article tags retorna []', async () => {
    // RF-05.1 AC: layout quebrado → []
    const { scrapeMundoPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeMundoPoker'
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = scrapeMundoPoker(fixture('broken-layout.html'), baseUrl);
    expect(items).toEqual([]);
    // log warn esperado
    warnSpy.mockRestore();
  });

  it('items invalidos (sem title ou url) sao dropados', async () => {
    // RF-05.1 AC: items malformados nao incluidos
    const { scrapeMundoPoker } = await import(
      '../../../../server/services/news/htmlAdapters/scrapeMundoPoker'
    );
    const html = `<html><body>
      <article class="post"><h2 class="entry-title"><a href="/x">Title OK</a></h2><time datetime="2026-04-28">28 abr 2026</time></article>
      <article class="post"><h2 class="entry-title"><a href=""></a></h2><time datetime="2026-04-28">28 abr 2026</time></article>
      <article class="post"><h2 class="entry-title">No link</h2><time datetime="2026-04-28">28 abr 2026</time></article>
    </body></html>`;
    const items = scrapeMundoPoker(html, baseUrl);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Title OK');
  });
});
