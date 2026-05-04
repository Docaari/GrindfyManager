/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-09: Cron schedule alterado para `0 15 * * 1` UTC + chama runOrchestration.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-09
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §6
 *
 * Mudancas vs Sprint News-1 cron:
 *   - CRON_EXPR = '0 15 * * 1' (UTC)
 *   - Sem param `timezone: 'America/Sao_Paulo'`
 *   - Substitui `fetchGrokNews` import por `runOrchestration` import
 *   - XAI_API_KEY ausente → cron skip INTEIRO + log error estruturado
 *   - NEWS_FEED_ENABLED=false → cron skip
 *
 * Status RED: o handler atual de `server/jobs/refreshNews.ts` ainda usa
 * `fetchGrokNews` + cron BRT. Implementer reescreve.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted compartilhado para mock de runOrchestration
 *   #5  vi.fn ok (cron.schedule retorna Task, nao constructor)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// vi.hoisted: mocks compartilhados
// =============================================================================
const { cronScheduleMock, runOrchestrationMock } = vi.hoisted(() => ({
  cronScheduleMock: vi.fn(),
  runOrchestrationMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: cronScheduleMock },
  schedule: cronScheduleMock,
}));

vi.mock('../../server/services/news/orchestrator', () => ({
  runOrchestration: runOrchestrationMock,
}));

// =============================================================================
// Env helpers
// =============================================================================
const ORIGINAL_FLAG = process.env.NEWS_FEED_ENABLED;
const ORIGINAL_KEY = process.env.XAI_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEWS_FEED_ENABLED = 'true';
  process.env.XAI_API_KEY = 'test-xai-key-1234567890';
  runOrchestrationMock.mockResolvedValue({
    runId: 'r123',
    sources: 0,
    fetched: 0,
    inserted: 0,
    skipped: { layer1: 0, layer2: 0, layer3: 0 },
    errors: [],
    durationMs: 100,
  });
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.NEWS_FEED_ENABLED;
  else process.env.NEWS_FEED_ENABLED = ORIGINAL_FLAG;
  if (ORIGINAL_KEY === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = ORIGINAL_KEY;
});

// =============================================================================
// Cron registration
// =============================================================================
describe('refreshNewsCron — register (RF-09)', () => {
  it('registra cron com expression "0 15 * * 1" UTC (sem timezone Sao_Paulo)', async () => {
    // RF-09 AC: cron expr correta + sem timezone field
    const mod = await import('../../server/jobs/refreshNews');
    await (mod as any).registerNewsRefreshCron();

    expect(cronScheduleMock).toHaveBeenCalled();
    const callArgs = cronScheduleMock.mock.calls[0];
    expect(callArgs[0]).toBe('0 15 * * 1');
    // Se options forem passados, NAO deve ter timezone Sao_Paulo
    const options = callArgs[2];
    if (options) {
      expect(options.timezone).not.toBe('America/Sao_Paulo');
    }
  });
});

// =============================================================================
// runNewsRefresh dispatches to runOrchestration
// =============================================================================
describe('refreshNewsCron — dispatch (RF-09)', () => {
  it('chama runOrchestration no fire (manual trigger)', async () => {
    // RF-09 AC: handler delega ao orchestrator
    // Importante: invalida cache de modulos para forcar reload
    vi.resetModules();
    const mod = await import('../../server/jobs/refreshNews');
    const fn = (mod as any).runNewsRefresh;
    await fn();

    // Implementer deve substituir loop interno por single call ao orchestrator.
    expect(runOrchestrationMock).toHaveBeenCalledTimes(1);
  });

  it('flag NEWS_FEED_ENABLED=false skipa runOrchestration', async () => {
    // RF-09 AC: flag off skip
    process.env.NEWS_FEED_ENABLED = 'false';
    const mod = await import('../../server/jobs/refreshNews');
    const fn = (mod as any).runNewsRefresh;
    await fn();

    expect(runOrchestrationMock).not.toHaveBeenCalled();
  });

  it('XAI_API_KEY ausente skipa runOrchestration + log error', async () => {
    // RF-09 AC: key ausente → skip INTEIRO + log error
    delete process.env.XAI_API_KEY;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mod = await import('../../server/jobs/refreshNews');
    const fn = (mod as any).runNewsRefresh;
    await fn();

    expect(runOrchestrationMock).not.toHaveBeenCalled();
    // log error estruturado [news/cron]
    const haystack = JSON.stringify(errSpy.mock.calls.flat());
    expect(haystack).toMatch(/news\/cron|XAI_API_KEY/);
  });

  it('XAI_API_KEY muito curta (invalida) skipa', async () => {
    process.env.XAI_API_KEY = 'short';
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const mod = await import('../../server/jobs/refreshNews');
    const fn = (mod as any).runNewsRefresh;
    await fn();

    expect(runOrchestrationMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Manual admin trigger
// =============================================================================
describe('refreshNewsCron — admin trigger compat (RF-09)', () => {
  it('runNewsRefresh exportado mantem assinatura compativel (alias para runOrchestration)', async () => {
    // RF-07 AC: runNewsRefresh continua exportado
    const mod = await import('../../server/jobs/refreshNews');
    expect(typeof (mod as any).runNewsRefresh).toBe('function');
  });

  it('handler retorna metricas do orchestrator', async () => {
    runOrchestrationMock.mockResolvedValueOnce({
      runId: 'r-xyz',
      sources: 15,
      fetched: 87,
      inserted: 42,
      skipped: { layer1: 12, layer2: 25, layer3: 8 },
      errors: [],
      durationMs: 12345,
    });

    const mod = await import('../../server/jobs/refreshNews');
    const result = await (mod as any).runNewsRefresh();

    expect(result).toBeDefined();
    expect(result.inserted).toBe(42);
  });
});
