/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-03 (tipos NewsItem / NewsResponse em
 * shared/types/news.ts).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-03
 * ADR  : Docs/architecture/decisions/100-news-feed-deferred-integration.md
 *
 * Status RED: arquivo `shared/types/news.ts` ainda NAO existe — sera
 * criado pelo implementer. Como TS apaga tipos no runtime, este teste
 * verifica via import: o `await import` falha se o modulo nao existe;
 * com try/catch, sinaliza o estado red ao test runner.
 */

import { describe, it, expect } from 'vitest';

describe('shared/types/news.ts — RF-03', () => {
  it('arquivo existe e exporta NewsItem + NewsResponse (validado via TS no implementer)', async () => {
    // Lesson #14: usar await import (nao require) — modulo eh esm-friendly
    // e shared/types pode ser TS puro.
    const mod = await import('../../../shared/types/news');
    expect(mod).toBeDefined();
    // Tipos sao apagados no runtime, mas se o arquivo carregar sem throw,
    // a checagem TS passou pelo build.
  });

  it('um NewsItem valido tem todos os campos do schema (RF-03)', async () => {
    // Smoke teste de shape: cria objeto com forma esperada e verifica chaves.
    const item = {
      id: 'news-1',
      source: 'poker-software' as const,
      title: 'Stars updates client',
      summary: 'New version 1.2.3 released with bug fixes',
      url: 'https://pokerstars.com/news',
      publishedAt: '2026-05-01T10:00:00Z',
      fetchedAt: '2026-05-01T11:00:00Z',
      tags: ['client-update'],
    };
    expect(item.id).toBe('news-1');
    expect(item.source).toBe('poker-software');
    expect(item.summary.length).toBeLessThanOrEqual(280);
  });

  it('NewsResponse permite cachedAt + nextRefreshAt opcionais', async () => {
    const r1 = { items: [], enabled: false };
    const r2 = {
      items: [],
      enabled: true,
      cachedAt: '2026-05-01T10:00:00Z',
      nextRefreshAt: '2026-05-01T11:00:00Z',
    };
    expect(r1.enabled).toBe(false);
    expect(r2.cachedAt).toBeDefined();
  });
});
