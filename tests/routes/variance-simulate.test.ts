/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint VR-1 — RF-02: Refactored endpoint POST /api/variance/simulate
 *
 * Spec  : Docs/specs/sprint-variance-reform.md (RF-02)
 * ADR   : 211 (variance native monte carlo engine)
 * Diag  : Docs/architecture/diagrams/variance-reform/simulation-sequence.mermaid
 *
 * Endpoints under test:
 *   POST /api/variance/simulate      — canonical (NEW)
 *   POST /api/primedope/simulate     — backward-compat alias
 *
 * Coverage:
 *   - POST /api/variance/simulate returns native result with source='native'
 *   - POST /api/primedope/simulate backward-compat returns same result
 *   - Zod validates VarianceSimulationInput (groups, weeks, simulations)
 *   - Cache hit returns cached result when hash identical and < 5min
 *   - Cache miss runs engine and persists to primedope_runs
 *   - No rate limit (consecutive requests succeed without 429)
 *   - No external fetch to primedope.com
 *   - source: 'native' for fresh simulation
 *   - source: 'cache' for cache hit
 *   - Invalid input returns 400
 *   - Auth required (would be 401 without JWT)
 *
 * Lessons applied:
 *   #3  shape REAL — mock storage returns realistic primedope_runs row
 *   #5  vi.fn() ok (no constructors)
 *   #14 vi.hoisted for mocks referenced in vi.mock factory
 *   #34 injected storage pattern for handler tests
 *
 * Status RED: endpoint not yet rewired to native engine.
 *             server/services/varianceEngine.ts DOES NOT EXIST.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// vi.hoisted — spies shared across vi.mock factory (lesson #14)
// =============================================================================
const {
  runMonteCarloSimulationMock,
  findRecentPrimedopeRunByHashMock,
  insertPrimedopeRunMock,
  computeInputHashMock,
  buildHashableInputMock,
  trackerEmitMock,
} = vi.hoisted(() => ({
  runMonteCarloSimulationMock: vi.fn(),
  findRecentPrimedopeRunByHashMock: vi.fn(),
  insertPrimedopeRunMock: vi.fn(),
  computeInputHashMock: vi.fn(),
  buildHashableInputMock: vi.fn(),
  trackerEmitMock: vi.fn(),
}));

// Mock the NEW engine module (DOES NOT EXIST YET)
vi.mock('../../server/services/varianceEngine', () => ({
  runMonteCarloSimulation: (input: any) =>
    runMonteCarloSimulationMock(input),
}));

// Mock storage
vi.mock('../../server/storage', () => ({
  storage: {
    findRecentPrimedopeRunByHash: (...args: any[]) =>
      findRecentPrimedopeRunByHashMock(...args),
    insertPrimedopeRun: (...args: any[]) =>
      insertPrimedopeRunMock(...args),
    listPrimedopeRunsForUser: vi.fn().mockResolvedValue([]),
    getPrimedopeRunById: vi.fn(),
    setPrimedopeRunPinned: vi.fn(),
    countPrimedopeRunsForUser: vi.fn().mockResolvedValue(0),
  },
}));

// Mock primedopeIntegration helpers that are KEPT
vi.mock('../../server/services/primedopeIntegration', () => ({
  computeInputHash: (...args: any[]) => computeInputHashMock(...args),
  buildHashableInput: (...args: any[]) => buildHashableInputMock(...args),
  resolveExchangeRates: vi.fn().mockResolvedValue({ BRL: 5.0, EUR: 0.93 }),
  nativeToUsd: vi.fn((amount: number, currency: string) =>
    currency === 'USD' ? amount : amount / 5.0
  ),
}));

// Mock tracker
vi.mock('../../server/utils/tracker', () => ({
  emit: (event: string, payload: any) => trackerEmitMock(event, payload),
}));

// Auth mock — requireAuth passes with fixed user
vi.mock('../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'usr_pk_vr1',
      userPlatformId: 'USER-VR1',
      email: 'vr@test.com',
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// App builder — imports the route module that will be MODIFIED
// ---------------------------------------------------------------------------
async function buildApp() {
  const { default: primedopeRouter } = await import(
    '../../server/routes/primedope'
  );
  const app = express();
  app.use(express.json());
  // Both paths route to the same router
  app.use('/api/primedope', primedopeRouter);
  app.use('/api/variance', primedopeRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Native-format simulation result (VarianceSimulationResult) */
const nativeResult = {
  ev: 10798,
  stdDev: 7200,
  profitablePct: 93.2,
  totalTournaments: 1440,
  totalInvested: 71988,
  percentiles: {
    p0_15: -12000,
    p2_5: -3171,
    p15: 3627,
    p30: 6927,
    p50: 10327,
    p70: 13727,
    p85: 17627,
    p97_5: 25227,
    p99_85: 33000,
  },
  drawdown: {
    mean: 4200,
    median: 2787,
    p95: 6737,
    p99: 12000,
    worst: 18273,
  },
  groupContributions: [
    { name: 'G1 High mix', count: 60, invested: 9780, expectedProfit: 1467 },
    { name: 'G2 Mid Vanilla', count: 336, invested: 24864, expectedProfit: 3730 },
  ],
  histogram: [
    { bucketStart: -15000, bucketEnd: -10000, count: 50 },
    { bucketStart: -10000, bucketEnd: -5000, count: 200 },
    { bucketStart: -5000, bucketEnd: 0, count: 480 },
    { bucketStart: 0, bucketEnd: 5000, count: 1800 },
    { bucketStart: 5000, bucketEnd: 10000, count: 3200 },
    { bucketStart: 10000, bucketEnd: 15000, count: 2500 },
    { bucketStart: 15000, bucketEnd: 20000, count: 1200 },
    { bucketStart: 20000, bucketEnd: 25000, count: 400 },
    { bucketStart: 25000, bucketEnd: 30000, count: 150 },
    { bucketStart: 30000, bucketEnd: 35000, count: 20 },
  ],
  simulationsRun: 10000,
  elapsedMs: 310,
};

/** Valid input payload for POST /api/variance/simulate (new format) */
const validVariancePayload = {
  groups: [
    {
      name: 'G1 High',
      buyIn: 163,
      field: 2200,
      roi: 0.15,
      count: 60,
      isPKO: false,
    },
    {
      name: 'G2 Mid Vanilla',
      buyIn: 74,
      field: 700,
      roi: 0.15,
      count: 336,
      isPKO: false,
    },
  ],
  weeks: 12,
  simulations: 10000,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  runMonteCarloSimulationMock.mockReturnValue(nativeResult);
  computeInputHashMock.mockReturnValue('a'.repeat(64));
  buildHashableInputMock.mockReturnValue(validVariancePayload);
  findRecentPrimedopeRunByHashMock.mockResolvedValue(null);
  insertPrimedopeRunMock.mockImplementation(async (row: any) => ({
    ...row,
    id: row.id ?? 'pdr_vr1_test',
    createdAt: new Date(),
  }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/variance/simulate — canonical endpoint', () => {
  it('returns 200 with native result and source=native', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send(validVariancePayload);

    expect(r.status).toBe(200);
    expect(r.body.source).toBe('native');
    expect(typeof r.body.ev).toBe('number');
    expect(typeof r.body.stdDev).toBe('number');
    expect(typeof r.body.profitablePct).toBe('number');
    expect(typeof r.body.elapsedMs).toBe('number');
    expect(r.body.percentiles).toBeDefined();
    expect(r.body.drawdown).toBeDefined();
    expect(r.body.histogram).toBeDefined();
    expect(r.body.groupContributions).toBeDefined();
  });

  it('calls runMonteCarloSimulation with the input', async () => {
    const app = await buildApp();
    await supertest(app)
      .post('/api/variance/simulate')
      .send(validVariancePayload);

    expect(runMonteCarloSimulationMock).toHaveBeenCalledTimes(1);
    const callArg = runMonteCarloSimulationMock.mock.calls[0][0];
    expect(callArg.groups).toHaveLength(2);
    expect(callArg.weeks).toBe(12);
  });

  it('persists result in primedope_runs with source=native', async () => {
    const app = await buildApp();
    await supertest(app)
      .post('/api/variance/simulate')
      .send(validVariancePayload);

    expect(insertPrimedopeRunMock).toHaveBeenCalledTimes(1);
    const inserted = insertPrimedopeRunMock.mock.calls[0][0];
    expect(inserted.source).toBe('native');
  });
});

describe('POST /api/primedope/simulate — backward-compat alias', () => {
  it('returns same native result as /api/variance/simulate', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/primedope/simulate')
      .send(validVariancePayload);

    expect(r.status).toBe(200);
    expect(r.body.source).toBe('native');
    expect(r.body.ev).toBe(nativeResult.ev);
  });
});

describe('Cache behavior', () => {
  it('cache hit returns cached result with source=cache when hash < 5min', async () => {
    findRecentPrimedopeRunByHashMock.mockResolvedValue({
      id: 'pdr_cached',
      userId: 'USER-VR1',
      inputHash: 'a'.repeat(64),
      resultJson: nativeResult,
      source: 'native',
      latencyMs: 300,
      createdAt: new Date(Date.now() - 60_000), // 1 min ago
    });

    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send(validVariancePayload);

    expect(r.status).toBe(200);
    expect(r.body.source).toBe('cache');
    // Engine should NOT have been called
    expect(runMonteCarloSimulationMock).not.toHaveBeenCalled();
    // Should NOT insert a new row
    expect(insertPrimedopeRunMock).not.toHaveBeenCalled();
  });

  it('cache miss (no recent row) runs engine and persists', async () => {
    findRecentPrimedopeRunByHashMock.mockResolvedValue(null);

    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send(validVariancePayload);

    expect(r.status).toBe(200);
    expect(r.body.source).toBe('native');
    expect(runMonteCarloSimulationMock).toHaveBeenCalledTimes(1);
    expect(insertPrimedopeRunMock).toHaveBeenCalledTimes(1);
  });
});

describe('No rate limit', () => {
  it('consecutive requests succeed without 429', async () => {
    const app = await buildApp();

    const r1 = await supertest(app)
      .post('/api/variance/simulate')
      .send(validVariancePayload);
    expect(r1.status).toBe(200);

    // Second immediate request — should NOT get 429
    const r2 = await supertest(app)
      .post('/api/variance/simulate')
      .send(validVariancePayload);
    expect(r2.status).toBe(200);
    // No retryAfterMs in response
    expect(r2.body.retryAfterMs).toBeUndefined();
  });
});

describe('No external fetch', () => {
  it('does not call global.fetch to primedope.com', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    try {
      const app = await buildApp();
      await supertest(app)
        .post('/api/variance/simulate')
        .send(validVariancePayload);

      // fetch should NEVER be called (no external dependency)
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Zod validation', () => {
  it('rejects missing groups array (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send({ weeks: 12 });
    expect(r.status).toBe(400);
  });

  it('rejects empty groups array (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send({ groups: [], weeks: 12 });
    expect(r.status).toBe(400);
  });

  it('rejects weeks outside allowed values (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send({ ...validVariancePayload, weeks: 7 });
    expect(r.status).toBe(400);
  });

  it('rejects group without required fields (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send({
        groups: [{ name: 'Incomplete' }],
        weeks: 12,
      });
    expect(r.status).toBe(400);
  });

  it('accepts valid input with optional seed (200)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/variance/simulate')
      .send({ ...validVariancePayload, seed: 42 });
    expect(r.status).toBe(200);
  });
});
