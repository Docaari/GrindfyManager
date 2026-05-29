import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint F4 W1 — PrimeDope smoke E2E
//
// Cobertura end-to-end (mockando PrimeDope HTTP + DB storage):
//   1. user autenticado POST /api/primedope/simulate com payload real
//   2. resposta valida (source=primedope)
//   3. primedope_runs persistido (insertPrimedopeRun chamado)
//   4. GET /api/primedope/runs lista correto
//   5. POST /api/primedope/runs/:id/pin toggle pinned
//
// Este teste integra: routes/primedope -> primedopeIntegration -> storage -> tracker.
// =============================================================================

const trackerEmit = vi.fn();
vi.mock('../../server/utils/tracker', () => ({
  emit: (e: string, p: any) => trackerEmit(e, p),
}));

// Mock storage minimo para o smoke
const storageMock: any = {
  findRecentPrimedopeRunByHash: vi.fn(async () => null),
  findFallbackPrimedopeRun: vi.fn(async () => null),
  insertPrimedopeRun: vi.fn(async (row: any) => ({
    ...row,
    id: 'pdr_smoke_id',
    createdAt: new Date(),
  })),
  listPrimedopeRunsForUser: vi.fn(async () => [
    {
      id: 'pdr_smoke_id',
      userId: 'USER-SMK',
      profileLetter: 'A',
      dayOfWeek: 2,
      pinned: false,
      createdAt: new Date(),
      resultJson: { ev: 100 },
    },
  ]),
  getPrimedopeRunById: vi.fn(async (id: string) => ({
    id,
    userId: 'USER-SMK',
    pinned: false,
  })),
  setPrimedopeRunPinned: vi.fn(async (input: any) => ({
    id: input.id,
    pinned: input.pinned,
  })),
  getUserSettings: vi.fn(async () => ({ exchangeRates: { BRL: 5.0 } })),
  listWalletsByUser: vi.fn(async () => []),
};
vi.mock('../../server/storage', () => ({ storage: storageMock }));

vi.mock('../../server/services/walletService', () => ({
  walletService: {
    getConsolidatedBalance: vi.fn(async () => ({ totalUsd: 5000, wallets: [] })),
  },
}));

// (reviewer fix CRITICAL #1): mock shape REAL com userPlatformId.
vi.mock('../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'usr_pk_smk', userPlatformId: 'USER-SMK', email: 's@s.com' };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

const fetchMock = vi.fn();
const originalFetch = (globalThis as any).fetch;

import express from 'express';
import supertest from 'supertest';

beforeEach(() => {
  vi.clearAllMocks();
  trackerEmit.mockClear();
  Object.values(storageMock).forEach((fn: any) => fn.mockReset && fn.mockReset?.());
  storageMock.findRecentPrimedopeRunByHash.mockResolvedValue(null);
  storageMock.findFallbackPrimedopeRun.mockResolvedValue(null);
  storageMock.insertPrimedopeRun.mockImplementation(async (row: any) => ({
    ...row,
    id: 'pdr_smoke_id',
    createdAt: new Date(),
  }));
  storageMock.listPrimedopeRunsForUser.mockResolvedValue([
    {
      id: 'pdr_smoke_id',
      userId: 'USER-SMK',
      profileLetter: 'A',
      dayOfWeek: 2,
      pinned: false,
      createdAt: new Date(),
    },
  ]);
  storageMock.getPrimedopeRunById.mockResolvedValue({
    id: 'pdr_smoke_id',
    userId: 'USER-SMK',
    pinned: false,
  });
  storageMock.setPrimedopeRunPinned.mockResolvedValue({
    id: 'pdr_smoke_id',
    pinned: true,
  });
  storageMock.getUserSettings.mockResolvedValue({ exchangeRates: { BRL: 5.0 } });
  storageMock.listWalletsByUser.mockResolvedValue([]);

  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({
      ev: 100,
      roiPct: 10,
      stdDev: 200,
      riskOfRuinPct: 4,
      confidenceIntervals: {
        p70: { low: -50, high: 250 },
        p95: { low: -150, high: 350 },
        p997: { low: -250, high: 450 },
      },
      minBankroll: { p50: 200, p15: 500, p05: 800, p01: 1200 },
      histogram_path: '/charts/h.png',
      random_runs_path: '/charts/r.png',
    }),
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  (globalThis as any).fetch = fetchMock;
});

async function buildApp() {
  const { default: primedopeRouter } = await import('../../server/routes/primedope');
  const app = express();
  app.use(express.json());
  app.use('/api/primedope', primedopeRouter);
  return app;
}

describe('PrimeDope smoke E2E', () => {
  it('full flow: simulate -> persist -> list -> pin', async () => {
    const app = await buildApp();
    // Formato NATIVO (ADR-211/216/217) — engine Monte Carlo local.
    const payload = {
      bankrollUsd: 5000,
      weeks: 1,
      groups: [
        {
          name: 'GG MTT',
          buyIn: 5,
          field: 1000,
          roi: 0.12,
          count: 1,
          isPKO: false,
          placesPaidPct: 0.15,
          rakePct: 0.1,
        },
      ],
    };

    // STEP 1 — simulate
    const sim = await supertest(app).post('/api/primedope/simulate').send(payload);
    expect(sim.status).toBe(200);
    expect(sim.body.source).toBe('native');
    expect(storageMock.insertPrimedopeRun).toHaveBeenCalledTimes(1);

    // STEP 2 — list runs
    const list = await supertest(app).get('/api/primedope/runs?profileLetter=A&dayOfWeek=2');
    expect(list.status).toBe(200);
    const items = Array.isArray(list.body) ? list.body : list.body.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].id).toBe('pdr_smoke_id');

    // STEP 3 — pin run
    const pin = await supertest(app).post('/api/primedope/runs/pdr_smoke_id/pin');
    expect(pin.status).toBe(200);
    expect(pin.body.pinned).toBe(true);
    expect(storageMock.setPrimedopeRunPinned).toHaveBeenCalled();

    // tracker emitiu eventos esperados
    const events = trackerEmit.mock.calls.map((c) => c[0]);
    expect(events).toContain('variance_simulation_run');
    expect(events).toContain('primedope_run_pinned');

    (globalThis as any).fetch = originalFetch;
  });
});
