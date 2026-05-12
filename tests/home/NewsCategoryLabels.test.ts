/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-B7 (CATEGORY_LABELS unico em shared/types/news.ts).
 *
 * Spec: Docs/specs/home-reform-3.md §RF-B7, §RF-B6
 * ADR : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md §2.3
 *
 * Status RED: constantes ainda nao exportadas em shared/types/news.ts.
 * Atualmente NewsSlot.tsx tem `SECTION_LABELS` local com chaves diferentes.
 *
 * Lessons aplicadas:
 *   #11 spec eh fonte de verdade — labels em PT-BR de visiveis
 */

import { describe, it, expect } from 'vitest';

describe('shared/types/news — CATEGORY_LABELS (RF-B7)', () => {
  it('exporta CATEGORY_LABELS com 5 chaves principais', async () => {
    const mod = await import('@shared/types/news');
    expect((mod as any).CATEGORY_LABELS).toBeDefined();
    const keys = Object.keys((mod as any).CATEGORY_LABELS);
    // Pelo menos 5 chaves principais (legacy aliases podem co-existir).
    for (const k of ['tools', 'sites', 'studies', 'tournament-results', 'gossip']) {
      expect(keys).toContain(k);
    }
  });

  it('CATEGORY_LABELS.tools = "Tools"', async () => {
    const { CATEGORY_LABELS } = (await import('@shared/types/news')) as any;
    expect(CATEGORY_LABELS.tools).toBe('Tools');
  });

  it('CATEGORY_LABELS.sites = "Sites"', async () => {
    const { CATEGORY_LABELS } = (await import('@shared/types/news')) as any;
    expect(CATEGORY_LABELS.sites).toBe('Sites');
  });

  it('CATEGORY_LABELS.studies = "Studies"', async () => {
    const { CATEGORY_LABELS } = (await import('@shared/types/news')) as any;
    expect(CATEGORY_LABELS.studies).toBe('Studies');
  });

  it('CATEGORY_LABELS["tournament-results"] = "Resultados"', async () => {
    const { CATEGORY_LABELS } = (await import('@shared/types/news')) as any;
    expect(CATEGORY_LABELS['tournament-results']).toBe('Resultados');
  });

  it('CATEGORY_LABELS.gossip = "Fofocas"', async () => {
    const { CATEGORY_LABELS } = (await import('@shared/types/news')) as any;
    expect(CATEGORY_LABELS.gossip).toBe('Fofocas');
  });
});

describe('shared/types/news — SECTION_LABELS NAO existe mais (RF-B7)', () => {
  it('SECTION_LABELS nao eh exportado de shared/types/news', async () => {
    const mod = (await import('@shared/types/news')) as any;
    expect(mod.SECTION_LABELS).toBeUndefined();
  });
});

describe('shared/types/news — NEWS_CATEGORY_PRIORITY (RF-B6)', () => {
  it('exporta NEWS_CATEGORY_PRIORITY na ordem correta', async () => {
    const { NEWS_CATEGORY_PRIORITY } = (await import('@shared/types/news')) as any;
    // studies tem prioridade maxima (mudanca pos-ADR-110): conteudo de estudo
    // aparece primeiro no feed.
    expect(NEWS_CATEGORY_PRIORITY).toEqual([
      'studies',
      'tools',
      'sites',
      'tournament-results',
      'gossip',
    ]);
  });
});
