/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-08: Pipeline `applyDedupe` (3 layers ordenados).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-08
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §4
 * Diagrama: Docs/architecture/news-3-dedupe-flow.mermaid
 *
 * Funcao `applyDedupe(items: NewsItem[], deps) => Promise<{ survivors, skipped: { layer1, layer2, layer3 } }>`.
 *
 * Layers:
 *   1. URL canonical (janela 30d)
 *   2. Title fingerprint (janela 30d)
 *   3. URL-in-tweet externo (janela 7d) — apenas para items com x.com/twitter.com
 *
 * Status RED: modulo `server/services/news/dedupeLayers` NAO existe.
 *
 * Lessons aplicadas:
 *   #3 mock shape REAL — deps simulam storage queries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks de queries de existencia (storage layer)
// =============================================================================
const existsByCanonicalMock = vi.fn();
const existsByFingerprintMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Default: nada existe ainda (allow inserts)
  existsByCanonicalMock.mockResolvedValue(false);
  existsByFingerprintMock.mockResolvedValue(false);
});

function makeItem(overrides: any = {}): any {
  return {
    title: 'Test post title',
    summary: 'Test summary content',
    url: 'https://blog.example.com/post-1',
    publishedAt: '2026-04-30T12:00:00Z',
    sourceId: 'test',
    category: 'studies',
    platform: 'test',
    ...overrides,
  };
}

const deps = () => ({
  existsByCanonical: existsByCanonicalMock,
  existsByFingerprint: existsByFingerprintMock,
});

// =============================================================================
// Layer 1: URL canonical (janela 30d)
// =============================================================================
describe('applyDedupe — Layer 1 URL canonical (RF-08)', () => {
  it('Layer 1 hit dropa item + incrementa skipped.layer1', async () => {
    // RF-08 AC: hit canonical → drop
    existsByCanonicalMock.mockImplementation(async (_url: string, days: number) => {
      // window 30d hit
      return days === 30;
    });

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe([makeItem()], deps());

    expect(result.survivors).toHaveLength(0);
    expect(result.skipped.layer1).toBe(1);
    expect(result.skipped.layer2).toBe(0);
    expect(result.skipped.layer3).toBe(0);
  });

  it('Layer 1 miss passa para Layer 2', async () => {
    // RF-08 AC: miss → segue pipeline
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe([makeItem()], deps());

    expect(result.survivors).toHaveLength(1);
    expect(result.skipped.layer1).toBe(0);
  });

  it('Layer 1 com janela respeitada (30d)', async () => {
    // RF-08 AC: query passa days=30
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    await applyDedupe([makeItem()], deps());

    // primeira chamada deve ser Layer 1 com 30d
    expect(existsByCanonicalMock).toHaveBeenCalled();
    const firstCall = existsByCanonicalMock.mock.calls[0];
    expect(firstCall[1]).toBe(30);
  });

  it('Layer 1 log estruturado contem layer:1', async () => {
    // RF-08 AC: log com layer:1
    existsByCanonicalMock.mockResolvedValue(true);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    await applyDedupe([makeItem({ url: 'https://blog.example.com/x' })], deps());

    const logged = infoSpy.mock.calls.flat().filter((a) => typeof a === 'string' || typeof a === 'object');
    const haystack = JSON.stringify(logged);
    expect(haystack).toMatch(/layer.{0,3}1/);
  });
});

// =============================================================================
// Layer 2: Title fingerprint (janela 30d)
// =============================================================================
describe('applyDedupe — Layer 2 title fingerprint (RF-08)', () => {
  it('Layer 2 hit dropa item + log layer:2', async () => {
    // RF-08 AC: titles equivalentes mas URLs distintas → drop layer 2
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(true);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe([makeItem()], deps());

    expect(result.survivors).toHaveLength(0);
    expect(result.skipped.layer2).toBe(1);
    expect(result.skipped.layer1).toBe(0);

    const haystack = JSON.stringify(infoSpy.mock.calls.flat());
    expect(haystack).toMatch(/layer.{0,3}2/);
  });

  it('Layer 2 com janela 30d', async () => {
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    await applyDedupe([makeItem()], deps());

    expect(existsByFingerprintMock).toHaveBeenCalled();
    const call = existsByFingerprintMock.mock.calls[0];
    expect(call[1]).toBe(30);
  });

  it('Layer 1 sempre antes de Layer 2 (ordem fixa)', async () => {
    // RF-08 AC: ordem L1 → L2 → L3
    existsByCanonicalMock.mockResolvedValue(true); // hit em L1
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe([makeItem()], deps());

    expect(result.skipped.layer1).toBe(1);
    // L2 nao deve ser chamado se L1 ja dropou
    expect(existsByFingerprintMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Layer 3: URL-in-tweet externo (janela 7d) — apenas X items
// =============================================================================
describe('applyDedupe — Layer 3 URL-in-tweet (RF-08)', () => {
  it('item nao-X passa direto sem checagem de Layer 3', async () => {
    // RF-08 AC: Layer 3 ignora items nao-X (blog) — passa direto
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe(
      [makeItem({ url: 'https://blog.example.com/post', summary: 'See https://other.com/x' })],
      deps(),
    );

    expect(result.survivors).toHaveLength(1);
    expect(result.skipped.layer3).toBe(0);
  });

  it('tweet citando URL ja indexada (canonical match janela 7d) eh dropado', async () => {
    // RF-08 AC: tweet redundante drop layer 3
    let canonCallCount = 0;
    existsByCanonicalMock.mockImplementation(async (_url: string, days: number) => {
      canonCallCount += 1;
      // primeira chamada: Layer 1 (30d) — miss.
      // segunda chamada: Layer 3 com 7d — hit.
      if (days === 30) return false;
      if (days === 7) return true;
      return false;
    });
    existsByFingerprintMock.mockResolvedValue(false);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe(
      [
        makeItem({
          url: 'https://x.com/PokerStars/status/1786543210123456789',
          summary: 'Confira o post: https://blog.example.com/cited-post',
        }),
      ],
      deps(),
    );

    expect(result.survivors).toHaveLength(0);
    expect(result.skipped.layer3).toBe(1);

    const haystack = JSON.stringify(infoSpy.mock.calls.flat());
    expect(haystack).toMatch(/layer.{0,3}3/);
  });

  it('tweet sem URLs externas no summary passa', async () => {
    // RF-08 AC: tweet sem links externos passa
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe(
      [
        makeItem({
          url: 'https://x.com/PokerStars/status/1786543210123456789',
          summary: 'Tweet sem links externos. Apenas texto.',
        }),
      ],
      deps(),
    );

    expect(result.survivors).toHaveLength(1);
    expect(result.skipped.layer3).toBe(0);
  });

  it('tweet com URL t.co/x.com no summary nao conta (apenas externos)', async () => {
    // RF-04+RF-08: filtragem self-X
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe(
      [
        makeItem({
          url: 'https://x.com/foo/status/1786543210123456789',
          summary: 'See https://t.co/abc and https://x.com/other/status/1',
        }),
      ],
      deps(),
    );

    expect(result.survivors).toHaveLength(1);
  });

  it('Layer 3 usa janela 7d (nao 30d)', async () => {
    // RF-08 AC: janela 7d distinta de L1/L2
    existsByCanonicalMock.mockImplementation(async (_url: string, days: number) => {
      // any 30d false; 7d false (no hit anywhere)
      return false;
    });
    existsByFingerprintMock.mockResolvedValue(false);

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    await applyDedupe(
      [
        makeItem({
          url: 'https://x.com/PokerStars/status/1786543210123456789',
          summary: 'Veja https://blog.example.com/post',
        }),
      ],
      deps(),
    );

    // Esperamos pelo menos uma chamada com days=7 (Layer 3)
    const calls = existsByCanonicalMock.mock.calls;
    const has7d = calls.some((c) => c[1] === 7);
    expect(has7d).toBe(true);
  });
});

// =============================================================================
// Cross-source NAO eh dedupe explicito (decisao founder)
// =============================================================================
describe('applyDedupe — multi item flow (RF-08)', () => {
  it('multiplos items sao processados independentemente', async () => {
    existsByCanonicalMock.mockResolvedValue(false);
    existsByFingerprintMock.mockResolvedValue(false);

    const items = [
      makeItem({ url: 'https://a.com/x' }),
      makeItem({ url: 'https://b.com/y' }),
      makeItem({ url: 'https://c.com/z' }),
    ];

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe(items, deps());

    expect(result.survivors).toHaveLength(3);
    expect(result.skipped.layer1 + result.skipped.layer2 + result.skipped.layer3).toBe(0);
  });

  it('mistura de hits e survivors retorna conta correta', async () => {
    let count = 0;
    existsByCanonicalMock.mockImplementation(async (_url: string, days: number) => {
      if (days !== 30) return false;
      count += 1;
      // Primeiro item: hit. Segundo: miss. Terceiro: miss.
      return count === 1;
    });
    existsByFingerprintMock.mockResolvedValue(false);

    const items = [
      makeItem({ url: 'https://a.com/dup' }),
      makeItem({ url: 'https://b.com/y' }),
      makeItem({ url: 'https://c.com/z' }),
    ];

    const { applyDedupe } = await import('../../../server/services/news/dedupeLayers');
    const result = await applyDedupe(items, deps());

    expect(result.survivors).toHaveLength(2);
    expect(result.skipped.layer1).toBe(1);
  });
});
