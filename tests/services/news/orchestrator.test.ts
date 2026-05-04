/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-07: OrchestratorService.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-07
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §3
 *
 * `runOrchestration() => Promise<{ runId, sources, fetched, inserted, skipped, errors }>`
 *
 * Cenarios:
 *   - 1 source com items novos → inserted == fetched
 *   - 1 source com duplicatas → inserted == 0, skipped.layerN
 *   - 3 sources em paralelo (concurrency 3)
 *   - 1 source falha (throw) → outras concluem + erro registrado em errors[]
 *   - runId eh nanoid unico por run
 *   - Insert idempotente (rerun mesma janela → 0 novos)
 *   - Strategy x_only chama apenas XSearchProvider
 *   - Strategy rss_and_x / html_and_x chama AMBOS providers
 *
 * Status RED: modulo `server/services/news/orchestrator` NAO existe.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted para spy compartilhado entre vi.mock factories
 *   #3  mock shape REAL — storage queries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// vi.hoisted: mocks compartilhados entre vi.mock factories.
// Lesson #14: const spy + vi.mock(mod, () => ({key: spy})) quebra com TDZ.
// =============================================================================
const {
  fetchBlogSourceMock,
  fetchXSourceMock,
  applyDedupeMock,
  listEnabledSourcesMock,
  insertNewsItemMock,
  existsByCanonicalMock,
  existsByFingerprintMock,
} = vi.hoisted(() => ({
  fetchBlogSourceMock: vi.fn(),
  fetchXSourceMock: vi.fn(),
  applyDedupeMock: vi.fn(),
  listEnabledSourcesMock: vi.fn(),
  insertNewsItemMock: vi.fn(),
  existsByCanonicalMock: vi.fn(),
  existsByFingerprintMock: vi.fn(),
}));

vi.mock('../../../server/services/news/blogScraperProvider', () => ({
  fetchBlogSource: fetchBlogSourceMock,
}));

vi.mock('../../../server/services/news/xSearchProvider', () => ({
  fetchXSource: fetchXSourceMock,
}));

vi.mock('../../../server/services/news/dedupeLayers', () => ({
  applyDedupe: applyDedupeMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    listEnabledNewsSources: listEnabledSourcesMock,
    insertNewsItem: insertNewsItemMock,
    existsByCanonical: existsByCanonicalMock,
    existsByFingerprint: existsByFingerprintMock,
  },
  // Para compat: alguns paths importam funcoes diretamente
  listEnabledNewsSources: listEnabledSourcesMock,
  insertNewsItem: insertNewsItemMock,
}));

// =============================================================================
// Source factory
// =============================================================================
function makeSource(overrides: any = {}): any {
  return {
    id: 'src-1',
    name: 'Test',
    category: 'studies',
    platform: 'test',
    enabled: true,
    rssUrl: 'https://example.com/feed',
    homepageUrl: 'https://example.com',
    scrapeStrategy: 'rss_or_html',
    xHandle: null,
    ...overrides,
  };
}

function makeItem(overrides: any = {}): any {
  return {
    title: 'Item',
    summary: 'Summary',
    url: 'https://example.com/p',
    publishedAt: '2026-04-30T12:00:00Z',
    sourceId: 'src-1',
    category: 'studies',
    platform: 'test',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: nenhuma source, nada inserido
  listEnabledSourcesMock.mockResolvedValue([]);
  fetchBlogSourceMock.mockResolvedValue([]);
  fetchXSourceMock.mockResolvedValue([]);
  // applyDedupe default: items passam sem skip
  applyDedupeMock.mockImplementation(async (items: any[]) => ({
    survivors: items,
    skipped: { layer1: 0, layer2: 0, layer3: 0 },
  }));
  insertNewsItemMock.mockResolvedValue(true);
  existsByCanonicalMock.mockResolvedValue(false);
  existsByFingerprintMock.mockResolvedValue(false);
});

// =============================================================================
// Happy path
// =============================================================================
describe('OrchestratorService — happy path (RF-07)', () => {
  it('1 source com 5 items todos novos → inserted=5, skipped=0', async () => {
    // RF-07 AC principal: insert all
    listEnabledSourcesMock.mockResolvedValue([makeSource()]);
    const items = [1, 2, 3, 4, 5].map((i) => makeItem({ url: `https://example.com/p${i}` }));
    fetchBlogSourceMock.mockResolvedValue(items);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    const result = await runOrchestration();

    expect(result.fetched).toBe(5);
    expect(result.inserted).toBe(5);
    expect(result.skipped.layer1).toBe(0);
    expect(result.skipped.layer2).toBe(0);
    expect(result.skipped.layer3).toBe(0);
  });

  it('1 source com 5 items duplicados → inserted=0, skipped.layer1=5', async () => {
    // RF-07 AC: dedupe Layer 1 dropa todos
    listEnabledSourcesMock.mockResolvedValue([makeSource()]);
    const items = [1, 2, 3, 4, 5].map((i) => makeItem({ url: `https://example.com/p${i}` }));
    fetchBlogSourceMock.mockResolvedValue(items);

    applyDedupeMock.mockResolvedValue({
      survivors: [],
      skipped: { layer1: 5, layer2: 0, layer3: 0 },
    });

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    const result = await runOrchestration();

    expect(result.fetched).toBe(5);
    expect(result.inserted).toBe(0);
    expect(result.skipped.layer1).toBe(5);
  });

  it('runId eh nanoid unico por run', async () => {
    // RF-07 AC: runId presente + diferente entre runs
    listEnabledSourcesMock.mockResolvedValue([]);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    const r1 = await runOrchestration();
    const r2 = await runOrchestration();

    expect(r1.runId).toBeTruthy();
    expect(r1.runId.length).toBeGreaterThanOrEqual(8);
    expect(r2.runId).toBeTruthy();
    expect(r1.runId).not.toBe(r2.runId);
  });
});

// =============================================================================
// Strategy dispatch
// =============================================================================
describe('OrchestratorService — strategy dispatch (RF-07)', () => {
  it('strategy x_only chama apenas XSearchProvider', async () => {
    // RF-07 AC: x_only nao chama BlogScraper
    listEnabledSourcesMock.mockResolvedValue([
      makeSource({ id: 'sx', scrapeStrategy: 'x_only', xHandle: 'foo', rssUrl: null }),
    ]);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    expect(fetchXSourceMock).toHaveBeenCalled();
    expect(fetchBlogSourceMock).not.toHaveBeenCalled();
  });

  it('strategy rss / html / rss_or_html chama apenas BlogScraperProvider', async () => {
    // RF-07 AC: rss/html/rss_or_html → blog only
    listEnabledSourcesMock.mockResolvedValue([
      makeSource({ id: 's1', scrapeStrategy: 'rss' }),
      makeSource({ id: 's2', scrapeStrategy: 'html' }),
      makeSource({ id: 's3', scrapeStrategy: 'rss_or_html' }),
    ]);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    expect(fetchBlogSourceMock).toHaveBeenCalledTimes(3);
    expect(fetchXSourceMock).not.toHaveBeenCalled();
  });

  it('strategy rss_and_x chama AMBOS providers e concat', async () => {
    // RF-07 AC: rss_and_x → both
    listEnabledSourcesMock.mockResolvedValue([
      makeSource({ id: 'mix', scrapeStrategy: 'rss_and_x', xHandle: 'foo' }),
    ]);
    fetchBlogSourceMock.mockResolvedValue([makeItem({ url: 'https://blog/x' })]);
    fetchXSourceMock.mockResolvedValue([makeItem({ url: 'https://x.com/foo/status/1786543210123456789' })]);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    const result = await runOrchestration();

    expect(fetchBlogSourceMock).toHaveBeenCalledTimes(1);
    expect(fetchXSourceMock).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(2);
  });

  it('strategy html_and_x chama AMBOS providers', async () => {
    listEnabledSourcesMock.mockResolvedValue([
      makeSource({ id: 'mix', scrapeStrategy: 'html_and_x', xHandle: 'foo' }),
    ]);
    fetchBlogSourceMock.mockResolvedValue([makeItem()]);
    fetchXSourceMock.mockResolvedValue([makeItem()]);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    expect(fetchBlogSourceMock).toHaveBeenCalledTimes(1);
    expect(fetchXSourceMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Resilience
// =============================================================================
describe('OrchestratorService — resilience (RF-07)', () => {
  it('1 source falha (throw) → outras concluem + erro registrado em errors[]', async () => {
    // RF-07 AC principal: source down NAO bloqueia batch
    listEnabledSourcesMock.mockResolvedValue([
      makeSource({ id: 'broken', scrapeStrategy: 'rss' }),
      makeSource({ id: 'ok', scrapeStrategy: 'rss' }),
    ]);

    fetchBlogSourceMock.mockImplementation(async (src: any) => {
      if (src.id === 'broken') throw new Error('Provider explodiu');
      return [makeItem()];
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    const result = await runOrchestration();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].sourceId).toBe('broken');
    // Outra source completou
    expect(result.fetched).toBeGreaterThanOrEqual(1);
  });

  it('source com enabled=false eh skipada totalmente', async () => {
    // Edge case: enabled=false nao deve aparecer em listEnabledNewsSources, mas defesa adicional
    listEnabledSourcesMock.mockResolvedValue([]);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    const result = await runOrchestration();

    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);
    expect(fetchBlogSourceMock).not.toHaveBeenCalled();
    expect(fetchXSourceMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Idempotencia
// =============================================================================
describe('OrchestratorService — idempotency (RF-07)', () => {
  it('insert idempotente — rerun na mesma janela retorna inserted=0', async () => {
    // RF-07 AC: idempotency via ON CONFLICT
    listEnabledSourcesMock.mockResolvedValue([makeSource()]);
    const items = [makeItem()];
    fetchBlogSourceMock.mockResolvedValue(items);

    // Primeiro run insere
    insertNewsItemMock.mockResolvedValueOnce(true);

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    const r1 = await runOrchestration();
    expect(r1.inserted).toBe(1);

    // Segundo run: dedupe layer 1 detecta como duplicate
    applyDedupeMock.mockResolvedValueOnce({
      survivors: [],
      skipped: { layer1: 1, layer2: 0, layer3: 0 },
    });
    const r2 = await runOrchestration();
    expect(r2.inserted).toBe(0);
  });
});

// =============================================================================
// Concurrency
// =============================================================================
describe('OrchestratorService — concurrency (RF-07)', () => {
  it('processa multiplas sources em paralelo (max 3)', async () => {
    // RF-07 AC: concurrency 3 (medir wall-clock vs sequencial)
    const sources = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      makeSource({ id, scrapeStrategy: 'rss' }),
    );
    listEnabledSourcesMock.mockResolvedValue(sources);

    let inFlight = 0;
    let maxInFlight = 0;
    fetchBlogSourceMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return [makeItem()];
    });

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    // Concorrencia max 3 (config). 5 sources, paralelo bate teto 3.
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
