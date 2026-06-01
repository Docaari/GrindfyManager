/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase B — RF-01/RF-02 endpoints (mental analytics)
 *
 * Spec : Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md (RF-01/RF-02)
 * ADR  : Docs/architecture/decisions/228-fase-b-lead-measures-warmup-compliance-abgame-distribution.md (D-B1/D-B2/D-B7)
 *
 * Handlers exportados de server/routes/cooldownAnalytics.ts (NAO existem ainda):
 *   GET /api/analytics/warmup-compliance   -> handleWarmupCompliance
 *   GET /api/analytics/abgame-distribution -> handleAbGameDistribution
 *
 * Padrao espelha cooldown-analytics.test.ts:
 *   - import { storage } direto (NAO injectedStorage — DEC-B2/D-B2)
 *   - vi.mock('../../../server/storage')
 *   - handlers (req, res) de 2 args
 *   - 401 sem user / 200 happy / 7d-30d-90d / 400 invalido / ownership / cache 5min / 500 erro
 *
 * Lessons: #9 (console.error antes do 500), #30 (.test.ts = node).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    // metodos novos Fase B
    getWarmupComplianceMetrics: vi.fn(),
    getAbGameDistribution: vi.fn(),
    // irmaos pre-existentes (o modulo importa storage inteiro)
    getCooldownComplianceMetrics: vi.fn(),
    getStarredHandsDistribution: vi.fn(),
    getCooldownImpactMetrics: vi.fn(),
    getTopLessons: vi.fn(),
  },
}));

import {
  handleWarmupCompliance,
  handleAbGameDistribution,
} from '../../../server/routes/cooldownAnalytics';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.set = (k: any, v?: any) => {
    if (typeof k === 'object') Object.assign(res.headers, k);
    else res.headers[k] = v;
    return res;
  };
  res.setHeader = (k: string, v: any) => {
    res.headers[k] = v;
    return res;
  };
  return res;
}

const WARMUP_FIXTURE = {
  total: 10,
  completed: 7,
  complianceRate: 0.7,
  abortedCount: 2,
  decisionNotToPlayCount: 1,
  overrideUsedCount: 0,
};

const ABGAME_FIXTURE = {
  journaledSessions: 5,
  aGameItemCount: 12,
  bGameItemCount: 6,
  cGameEntryCount: 3,
  avgAGamePerSession: 2.4,
  avgBGamePerSession: 1.2,
  abShare: { aGamePct: 0.667, bGamePct: 0.333 },
  cGameThemes: [{ token: 'paciencia', count: 4 }],
};

// ============================================================================
// GET /api/analytics/warmup-compliance
// ============================================================================

describe('GET /api/analytics/warmup-compliance - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleWarmupCompliance(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
    expect(storage.getWarmupComplianceMetrics).not.toHaveBeenCalled();
  });
});

describe('GET /api/analytics/warmup-compliance - happy path', () => {
  beforeEach(() => {
    (storage.getWarmupComplianceMetrics as any).mockResolvedValue(WARMUP_FIXTURE);
  });

  it('200 com period default 30d e shape completo', async () => {
    const res = makeRes();
    await handleWarmupCompliance(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(WARMUP_FIXTURE);
    expect(storage.getWarmupComplianceMetrics).toHaveBeenCalledWith('USER-0001', '30d');
  });

  it('200 com period=7d explicito', async () => {
    const res = makeRes();
    await handleWarmupCompliance(makeReq({ query: { period: '7d' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.getWarmupComplianceMetrics).toHaveBeenCalledWith('USER-0001', '7d');
  });

  it('200 com period=90d', async () => {
    const res = makeRes();
    await handleWarmupCompliance(makeReq({ query: { period: '90d' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.getWarmupComplianceMetrics).toHaveBeenCalledWith('USER-0001', '90d');
  });

  it('400 quando period invalido (ex: "banana")', async () => {
    const res = makeRes();
    await handleWarmupCompliance(makeReq({ query: { period: 'banana' } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(storage.getWarmupComplianceMetrics).not.toHaveBeenCalled();
  });

  it('Cache-Control max-age=300', async () => {
    const res = makeRes();
    await handleWarmupCompliance(makeReq() as any, res);
    const cc = res.headers['Cache-Control'] ?? res.headers['cache-control'];
    expect(/max-age=300/.test(String(cc))).toBe(true);
  });
});

describe('GET /api/analytics/warmup-compliance - ownership', () => {
  it('passa req.user.userPlatformId (ignora query.userId)', async () => {
    (storage.getWarmupComplianceMetrics as any).mockResolvedValue(WARMUP_FIXTURE);
    const res = makeRes();
    await handleWarmupCompliance(makeReq({ query: { userId: 'USER-9999' } }) as any, res);
    expect(storage.getWarmupComplianceMetrics).toHaveBeenCalledWith('USER-0001', '30d');
  });
});

describe('GET /api/analytics/warmup-compliance - erro de storage', () => {
  it('500 com console.error antes (lesson #9)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (storage.getWarmupComplianceMetrics as any).mockRejectedValue(new Error('DB explodiu'));
    const res = makeRes();
    await handleWarmupCompliance(makeReq() as any, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================================
// GET /api/analytics/abgame-distribution
// ============================================================================

describe('GET /api/analytics/abgame-distribution - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleAbGameDistribution(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
    expect(storage.getAbGameDistribution).not.toHaveBeenCalled();
  });
});

describe('GET /api/analytics/abgame-distribution - happy path', () => {
  beforeEach(() => {
    (storage.getAbGameDistribution as any).mockResolvedValue(ABGAME_FIXTURE);
  });

  it('200 com period default 30d e shape completo', async () => {
    const res = makeRes();
    await handleAbGameDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(ABGAME_FIXTURE);
    expect(storage.getAbGameDistribution).toHaveBeenCalledWith('USER-0001', '30d');
  });

  it('200 com period=7d e period=90d', async () => {
    const res1 = makeRes();
    await handleAbGameDistribution(makeReq({ query: { period: '7d' } }) as any, res1);
    expect(storage.getAbGameDistribution).toHaveBeenCalledWith('USER-0001', '7d');

    const res2 = makeRes();
    await handleAbGameDistribution(makeReq({ query: { period: '90d' } }) as any, res2);
    expect(storage.getAbGameDistribution).toHaveBeenCalledWith('USER-0001', '90d');
  });

  it('400 quando period invalido', async () => {
    const res = makeRes();
    await handleAbGameDistribution(makeReq({ query: { period: '1y' } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(storage.getAbGameDistribution).not.toHaveBeenCalled();
  });

  it('200 shape vazio coerente quando sem dados (nao 404)', async () => {
    (storage.getAbGameDistribution as any).mockResolvedValue({
      journaledSessions: 0,
      aGameItemCount: 0,
      bGameItemCount: 0,
      cGameEntryCount: 0,
      avgAGamePerSession: 0,
      avgBGamePerSession: 0,
      abShare: { aGamePct: 0, bGamePct: 0 },
      cGameThemes: [],
    });
    const res = makeRes();
    await handleAbGameDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.journaledSessions).toBe(0);
    expect(res.body.cGameThemes).toEqual([]);
  });

  it('Cache-Control max-age=300', async () => {
    const res = makeRes();
    await handleAbGameDistribution(makeReq() as any, res);
    const cc = res.headers['Cache-Control'] ?? res.headers['cache-control'];
    expect(/max-age=300/.test(String(cc))).toBe(true);
  });

  it('ownership: passa userId do token, ignora query', async () => {
    const res = makeRes();
    await handleAbGameDistribution(makeReq({ query: { userId: 'USER-9999' } }) as any, res);
    expect(storage.getAbGameDistribution).toHaveBeenCalledWith('USER-0001', '30d');
  });
});

describe('GET /api/analytics/abgame-distribution - erro de storage', () => {
  it('500 com console.error antes (lesson #9)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (storage.getAbGameDistribution as any).mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await handleAbGameDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================================
// Smoke de registro (D-B7 — guard leve, sem shadowing complexo)
// ============================================================================

describe('registerCooldownAnalyticsRoutes - registra rotas Fase B', () => {
  it('registra GET /api/analytics/warmup-compliance e /abgame-distribution com requireAuth', async () => {
    const mod: any = await import('../../../server/routes/cooldownAnalytics');
    expect(typeof mod.registerCooldownAnalyticsRoutes).toBe('function');

    const registered: Array<{ method: string; path: string }> = [];
    const fakeApp: any = {
      get: (path: string, ..._handlers: any[]) => {
        registered.push({ method: 'get', path });
      },
      post: () => {},
      put: () => {},
      delete: () => {},
    };

    mod.registerCooldownAnalyticsRoutes(fakeApp);

    const paths = registered.map((r) => r.path);
    expect(paths).toContain('/api/analytics/warmup-compliance');
    expect(paths).toContain('/api/analytics/abgame-distribution');
    // rotas pre-existentes continuam registradas (aditivo, nao quebra cooldown)
    expect(paths).toContain('/api/analytics/cooldown-compliance');
    expect(paths).toContain('/api/analytics/top-lessons');
  });
});
