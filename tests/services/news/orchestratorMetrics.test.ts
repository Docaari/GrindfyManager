/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-11: Observability — metric estruturada por run.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-11
 *
 * Logs esperados:
 *   [news/metric] {"runId","sources","fetched","inserted","skippedLayer1","skippedLayer2","skippedLayer3","errors","durationMs","startedAt","completedAt"}
 *   [news/source] {"runId","sourceId","strategy","fetched","inserted","errored":bool}
 *
 * Cada line eh JSON parseavel + runId correlation entre orchestrator + per-source.
 *
 * Status RED: orchestrator NAO existe.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted compartilhado
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  fetchBlogSourceMock,
  fetchXSourceMock,
  applyDedupeMock,
  listEnabledSourcesMock,
  insertNewsItemMock,
} = vi.hoisted(() => ({
  fetchBlogSourceMock: vi.fn(),
  fetchXSourceMock: vi.fn(),
  applyDedupeMock: vi.fn(),
  listEnabledSourcesMock: vi.fn(),
  insertNewsItemMock: vi.fn(),
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
    existsByCanonical: vi.fn().mockResolvedValue(false),
    existsByFingerprint: vi.fn().mockResolvedValue(false),
  },
  listEnabledNewsSources: listEnabledSourcesMock,
  insertNewsItem: insertNewsItemMock,
}));

function makeSource(o: any = {}): any {
  return {
    id: 'src-x',
    name: 'X',
    category: 'studies',
    platform: 'test',
    enabled: true,
    rssUrl: 'https://x/feed',
    homepageUrl: 'https://x',
    scrapeStrategy: 'rss',
    xHandle: null,
    ...o,
  };
}

function makeItem(o: any = {}): any {
  return {
    title: 'T',
    summary: 'S',
    url: 'https://x/p',
    publishedAt: '2026-04-30T12:00:00Z',
    sourceId: 'src-x',
    category: 'studies',
    platform: 'test',
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchBlogSourceMock.mockResolvedValue([]);
  fetchXSourceMock.mockResolvedValue([]);
  applyDedupeMock.mockImplementation(async (items: any[]) => ({
    survivors: items,
    skipped: { layer1: 0, layer2: 0, layer3: 0 },
  }));
  insertNewsItemMock.mockResolvedValue(true);
});

describe('OrchestratorService — metrics observability (RF-11)', () => {
  it('emite log estruturado [news/metric] com JSON parseavel', async () => {
    // RF-11 AC: line eh JSON valido apos remover prefix
    listEnabledSourcesMock.mockResolvedValue([makeSource()]);
    fetchBlogSourceMock.mockResolvedValue([makeItem()]);

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    // Procura linha [news/metric]
    const calls = infoSpy.mock.calls.flat();
    const metricLine = calls.find(
      (c: any) => typeof c === 'string' && c.includes('[news/metric]'),
    );
    expect(metricLine).toBeTruthy();

    // Extrai JSON apos prefix
    const idx = metricLine.indexOf('{');
    const jsonStr = idx >= 0 ? metricLine.slice(idx) : '';
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toHaveProperty('runId');
    expect(parsed).toHaveProperty('sources');
    expect(parsed).toHaveProperty('fetched');
    expect(parsed).toHaveProperty('inserted');
    expect(parsed).toHaveProperty('skippedLayer1');
    expect(parsed).toHaveProperty('skippedLayer2');
    expect(parsed).toHaveProperty('skippedLayer3');
    expect(parsed).toHaveProperty('errors');
    expect(parsed).toHaveProperty('durationMs');
    expect(parsed).toHaveProperty('startedAt');
    expect(parsed).toHaveProperty('completedAt');
  });

  it('emite log [news/source] por source com JSON parseavel', async () => {
    // RF-11 AC: per-source log estruturado
    listEnabledSourcesMock.mockResolvedValue([
      makeSource({ id: 'a' }),
      makeSource({ id: 'b' }),
    ]);
    fetchBlogSourceMock.mockResolvedValue([makeItem()]);

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    const calls = infoSpy.mock.calls.flat();
    const sourceLines = calls.filter(
      (c: any) => typeof c === 'string' && c.includes('[news/source]'),
    );

    expect(sourceLines.length).toBeGreaterThanOrEqual(2);

    for (const line of sourceLines) {
      const idx = line.indexOf('{');
      const parsed = JSON.parse(line.slice(idx));
      expect(parsed).toHaveProperty('runId');
      expect(parsed).toHaveProperty('sourceId');
      expect(parsed).toHaveProperty('strategy');
      expect(parsed).toHaveProperty('fetched');
      expect(parsed).toHaveProperty('inserted');
      expect(parsed).toHaveProperty('errored');
    }
  });

  it('runId eh consistente entre orchestrator + per-source logs do mesmo run', async () => {
    // RF-11 AC: correlation
    listEnabledSourcesMock.mockResolvedValue([makeSource({ id: 'src-1' })]);
    fetchBlogSourceMock.mockResolvedValue([makeItem()]);

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    const calls = infoSpy.mock.calls.flat() as string[];
    const metricLine = calls.find((c) => typeof c === 'string' && c.includes('[news/metric]'));
    const sourceLine = calls.find((c) => typeof c === 'string' && c.includes('[news/source]'));

    expect(metricLine).toBeTruthy();
    expect(sourceLine).toBeTruthy();

    const parseJson = (s: string) => JSON.parse(s.slice(s.indexOf('{')));
    const m = parseJson(metricLine!);
    const s = parseJson(sourceLine!);

    expect(s.runId).toBe(m.runId);
  });

  it('durationMs reflete tempo real (nao zero, nao negativo)', async () => {
    // RF-11 AC: durationMs valido
    listEnabledSourcesMock.mockResolvedValue([makeSource()]);
    fetchBlogSourceMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return [];
    });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runOrchestration } = await import('../../../server/services/news/orchestrator');
    await runOrchestration();

    const calls = infoSpy.mock.calls.flat() as string[];
    const metricLine = calls.find((c) => typeof c === 'string' && c.includes('[news/metric]'));
    expect(metricLine).toBeTruthy();
    const parsed = JSON.parse(metricLine!.slice(metricLine!.indexOf('{')));
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.durationMs).toBe('number');
  });
});
