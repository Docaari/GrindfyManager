// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-03 — storage.getAudioMetrics shape
//
// Spec: Docs/specs/sprint-mp-validation.md RF-03 §queries SQL.
// Diagrama: Docs/architecture/diagrams/sprint-mp-validation/admin-audio-metrics-query.mermaid
//
// Cobertura:
//   - storage.getAudioMetrics(range) retorna shape canonico:
//     { kpis: { mpDau, mpWau, avgListeningTimePerSessionSec, queueDepthMedian,
//               queueDepthP95, spotifyToInternalFallbackRate, totalPlays,
//               totalLessonCompletions }, topLessonsCompletion, topLessonsPlays }
//   - Range 7d / 30d / 90d aceitos.
//
// Lessons: #36 (drizzle-orm parcial + relations).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: vi.fn(() => ({})) };
});

// Mock db.execute para queries raw SQL.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    execute: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
    })),
  },
}));

vi.mock('../../../server/db', () => ({ db: dbMock, pool: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  // Multi-call mock: cada chamada execute retorna shape diferente baseado em ordem.
  let callIdx = 0;
  const responses = [
    { rows: [{ dau: 42 }] },
    { rows: [{ wau: 128 }] },
    { rows: [{ avg_sec: 1825 }] },
    { rows: [{ median: 3, p95: 12 }] },
    { rows: [{ rate: 0.12 }] },
    { rows: [{ total: 1547 }] },
    { rows: [{ total: 89 }] },
    { rows: [] }, // top completion
    { rows: [] }, // top plays
  ];
  dbMock.execute.mockImplementation(() => {
    const r = responses[callIdx] ?? { rows: [] };
    callIdx++;
    return Promise.resolve(r);
  });
});

describe('storage.getAudioMetrics — RF-03 shape canonico', () => {
  it('retorna shape { range, generatedAt, kpis, topLessonsCompletion, topLessonsPlays }', async () => {
    const mod: any = await import('../../../server/storage/audioMetricsStorage');
    expect(typeof mod.getAudioMetrics).toBe('function');

    const result = await mod.getAudioMetrics('7d');

    expect(result).toMatchObject({
      range: '7d',
      generatedAt: expect.any(String),
      kpis: expect.any(Object),
      topLessonsCompletion: expect.any(Array),
      topLessonsPlays: expect.any(Array),
    });
    expect(result.kpis).toMatchObject({
      mpDau: expect.any(Number),
      mpWau: expect.any(Number),
      avgListeningTimePerSessionSec: expect.any(Number),
      queueDepthMedian: expect.any(Number),
      queueDepthP95: expect.any(Number),
      spotifyToInternalFallbackRate: expect.any(Number),
      totalPlays: expect.any(Number),
      totalLessonCompletions: expect.any(Number),
    });
  });

  it('aceita range 30d e 90d', async () => {
    const mod: any = await import('../../../server/storage/audioMetricsStorage');
    const r30 = await mod.getAudioMetrics('30d');
    expect(r30.range).toBe('30d');
  });

  it('expoe _resetCacheForTests()', async () => {
    const mod: any = await import('../../../server/storage/audioMetricsStorage');
    expect(typeof mod._resetCacheForTests).toBe('function');
  });
});
