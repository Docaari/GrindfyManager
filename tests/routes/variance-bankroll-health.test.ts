/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase D #8 — Painel BRM/RoR ao vivo
 *
 * Spec : Docs/specs/sprint-fase-d-brm-ror-2026-06-02.md (RF-03)
 * ADR  : 236 (D-5 rota no varianceRouter, D-6 cache brm:${userId})
 *
 * Endpoint sob teste:
 *   GET /api/variance/bankroll-health
 *
 * Cobertura:
 *   - 401 sem auth.
 *   - 200 com payload de buildBankrollHealth (banca+historico).
 *   - 200 (NAO 500) quando no_bankroll.
 *   - Cache: 1a chamada chama o service; 2a (<1h) é cache hit (service NAO chamado).
 *   - invalidateHistoricalStatsCache(userId) busta o brm: key → service re-chamado.
 *
 * Lessons aplicadas:
 *   #3  shape REAL — service retorna BankrollHealthResult (mock no shape do ADR).
 *   #14 vi.hoisted para spy compartilhado no vi.mock factory.
 *   #34 service injetavel; aqui mockamos o modulo do service (route chama service).
 *
 * Status RED: a rota GET /bankroll-health NAO existe em server/routes/variance.ts;
 *             server/services/bankrollHealth.ts NAO existe (mock cobre import).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted — spy do service compartilhado no factory (lesson #14)
// ---------------------------------------------------------------------------
const { buildBankrollHealthMock } = vi.hoisted(() => ({
  buildBankrollHealthMock: vi.fn(),
}));

// Mock do service (DOES NOT EXIST YET) — a rota o consome.
vi.mock('../../server/services/bankrollHealth', () => ({
  buildBankrollHealth: (...args: any[]) => buildBankrollHealthMock(...args),
}));

// Auth mock — requireAuth swappable (hoisted) p/ poder simular o gate rejeitando
// (lesson #25: a versão anterior setava user incondicionalmente e tornava o 401
// inalcançável — requireAuth roda DEPOIS de qualquer pre-middleware do teste).
const { requireAuthMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn((req: any, _res: any, next: any) => {
    req.user = {
      id: 'usr_pk_brm',
      userPlatformId: 'USER-BRM',
      email: 'brm@test.com',
    };
    next();
  }),
}));
vi.mock('../../server/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => requireAuthMock(req, res, next),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Fixtures — BankrollHealthResult (shape do ADR-236 D-1)
// ---------------------------------------------------------------------------
function makeHealthResult(over: Partial<any> = {}) {
  return {
    bankrollUsd: 5000,
    roiMean: 0.1,
    stdDev: 7200,
    riskOfRuinPct: 3.2,
    classification: 'healthy',
    dataSufficiency: 'ok',
    sampleSize: 300,
    bisOfMargin: 250,
    groupsUsed: 1,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// App builder — monta o varianceRouter (que sera MODIFICADO)
// ---------------------------------------------------------------------------
async function buildApp() {
  const mod = await import('../../server/routes/variance');
  const router = (mod as any).default;
  const app = express();
  app.use(express.json());
  app.use('/api/variance', router);
  return { app, mod };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildBankrollHealthMock.mockResolvedValue(makeHealthResult());
});

// =============================================================================
// Auth
// =============================================================================
describe('GET /api/variance/bankroll-health — auth', () => {
  it('sem auth → requireAuth bloqueia com 401', async () => {
    // requireAuth É o gate (em prod ele responde 401 quando não há token).
    // Simulamos o gate rejeitando — não chama next(), responde 401 ele mesmo.
    requireAuthMock.mockImplementationOnce((_req: any, res: any, _next: any) => {
      res.status(401).json({ message: 'Unauthorized' });
    });
    const { app } = await buildApp();
    const r = await supertest(app).get('/api/variance/bankroll-health');
    expect(r.status).toBe(401);
  });
});

// =============================================================================
// Happy path
// =============================================================================
describe('GET /api/variance/bankroll-health — payload', () => {
  it('com banca+historico → 200 com payload de buildBankrollHealth', async () => {
    const { app } = await buildApp();
    const r = await supertest(app).get('/api/variance/bankroll-health');

    expect(r.status).toBe(200);
    expect(r.body.bankrollUsd).toBe(5000);
    expect(r.body.riskOfRuinPct).toBe(3.2);
    expect(r.body.classification).toBe('healthy');
    expect(r.body.dataSufficiency).toBe('ok');
    expect(r.body.sampleSize).toBe(300);
    expect(r.body.bisOfMargin).toBe(250);
    expect(r.body.groupsUsed).toBe(1);
  });

  it('chama buildBankrollHealth com o userId do token', async () => {
    const { app } = await buildApp();
    await supertest(app).get('/api/variance/bankroll-health');

    expect(buildBankrollHealthMock).toHaveBeenCalledTimes(1);
    expect(buildBankrollHealthMock.mock.calls[0][0]).toBe('USER-BRM');
  });

  it('no_bankroll → 200 (NAO 500), payload degradado', async () => {
    buildBankrollHealthMock.mockResolvedValue(
      makeHealthResult({
        dataSufficiency: 'no_bankroll',
        bankrollUsd: 0,
        riskOfRuinPct: null,
        classification: null,
        bisOfMargin: null,
        groupsUsed: 0,
        sampleSize: 0,
      }),
    );

    const { app } = await buildApp();
    const r = await supertest(app).get('/api/variance/bankroll-health');

    expect(r.status).toBe(200);
    expect(r.body.dataSufficiency).toBe('no_bankroll');
    expect(r.body.riskOfRuinPct).toBeNull();
  });

  it('none (sem historico) → 200 com rorPct null', async () => {
    buildBankrollHealthMock.mockResolvedValue(
      makeHealthResult({
        dataSufficiency: 'none',
        riskOfRuinPct: null,
        classification: null,
        groupsUsed: 0,
        sampleSize: 0,
      }),
    );

    const { app } = await buildApp();
    const r = await supertest(app).get('/api/variance/bankroll-health');

    expect(r.status).toBe(200);
    expect(r.body.dataSufficiency).toBe('none');
    expect(r.body.riskOfRuinPct).toBeNull();
  });
});

// =============================================================================
// Cache (D-6) — reusa app.locals._varianceCache + generation
// =============================================================================
describe('GET /api/variance/bankroll-health — cache (brm:${userId})', () => {
  it('1a chamada chama o service; 2a (<1h) é cache hit (service NAO re-chamado)', async () => {
    const { app } = await buildApp();

    const r1 = await supertest(app).get('/api/variance/bankroll-health');
    expect(r1.status).toBe(200);
    expect(buildBankrollHealthMock).toHaveBeenCalledTimes(1);

    // 2a chamada no MESMO app (mesmo app.locals._varianceCache) → cache hit
    const r2 = await supertest(app).get('/api/variance/bankroll-health');
    expect(r2.status).toBe(200);
    expect(r2.body.riskOfRuinPct).toBe(3.2);
    // service NAO deve rodar de novo (RoR é caro — MC 10k)
    expect(buildBankrollHealthMock).toHaveBeenCalledTimes(1);
  });

  it('invalidateHistoricalStatsCache(userId) busta o brm: → service re-chamado', async () => {
    const { app, mod } = await buildApp();

    await supertest(app).get('/api/variance/bankroll-health');
    expect(buildBankrollHealthMock).toHaveBeenCalledTimes(1);

    // upload handler chama isto; deve bustar TODAS as keys do user (incl brm:)
    (mod as any).invalidateHistoricalStatsCache('USER-BRM');

    await supertest(app).get('/api/variance/bankroll-health');
    expect(buildBankrollHealthMock).toHaveBeenCalledTimes(2);
  });
});
