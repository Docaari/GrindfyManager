// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-03 — canary drift entre audio_* (legacy ADR-191)
// e audio.* (dot-namespace ADR-207).
//
// Spec ADR-207 §Consequences:
//   "MP-VALIDATION mantem nomes legacy audio_* ja em prod e usa dot-namespace
//    apenas para os 17 eventos novos. Sem rewrite retroativo."
//
// Cobertura:
//   - Quando legacy `audio_*` count != dot `audio.*` count em janela 7d
//     (drift > 20%), endpoint expoe `canaryDrift: true`.
//   - Quando counts proximos (<= 20% diff), `canaryDrift: false`.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: vi.fn(() => ({})) };
});

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
});

describe('RF-03 canary drift audio_* legacy vs audio.* novo', () => {
  it('drift > 20% → canaryDrift: true', async () => {
    // Sequencia de mocks: legacy count = 1000, novo count = 100 (drift 90%).
    let idx = 0;
    const seq = [
      { rows: [{ dau: 1 }] },
      { rows: [{ wau: 1 }] },
      { rows: [{ avg_sec: 1 }] },
      { rows: [{ median: 1, p95: 1 }] },
      { rows: [{ rate: 0 }] },
      { rows: [{ total: 1 }] },
      { rows: [{ total: 1 }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ legacy_count: 1000 }] },
      { rows: [{ dot_count: 100 }] },
    ];
    dbMock.execute.mockImplementation(() => Promise.resolve(seq[idx++] ?? { rows: [] }));

    const mod: any = await import('../../../server/storage/audioMetricsStorage');
    if (typeof mod._resetCacheForTests === 'function') mod._resetCacheForTests();
    const result = await mod.getAudioMetrics('7d');

    expect(result.canaryDrift).toBe(true);
  });

  it('drift <= 20% → canaryDrift: false', async () => {
    let idx = 0;
    const seq = [
      { rows: [{ dau: 1 }] },
      { rows: [{ wau: 1 }] },
      { rows: [{ avg_sec: 1 }] },
      { rows: [{ median: 1, p95: 1 }] },
      { rows: [{ rate: 0 }] },
      { rows: [{ total: 1 }] },
      { rows: [{ total: 1 }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ legacy_count: 100 }] },
      { rows: [{ dot_count: 90 }] },
    ];
    dbMock.execute.mockImplementation(() => Promise.resolve(seq[idx++] ?? { rows: [] }));

    const mod: any = await import('../../../server/storage/audioMetricsStorage');
    if (typeof mod._resetCacheForTests === 'function') mod._resetCacheForTests();
    const result = await mod.getAudioMetrics('7d');

    expect(result.canaryDrift).toBe(false);
  });
});
