import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #4 — RF-04 endpoint: GET /api/analytics/tilt-type-distribution
//
// Spec: Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md (RF-04)
// ADR : Docs/architecture/decisions/232-fase-c-4-tilt-tipado-7-tipos-antidoto.md (D-2/D-3)
//
// Handler exportado de server/routes/cooldownAnalytics.ts (NAO existe ainda):
//   GET /api/analytics/tilt-type-distribution -> handleTiltTypeDistribution
//
// Padrao espelha fase-b-mental-analytics-routes.test.ts:
//   - import { storage } direto (NAO injectedStorage — D-3)
//   - vi.mock('../../../server/storage')
//   - handler (req, res) de 2 args
//   - 401 sem user / 200 happy / 7d-30d-90d / 400 invalido / ownership /
//     cache 5min / 500 erro com console.error antes (lesson #9)
//   - PII: resposta sem texto livre (action)
//
// Lessons: #3 (mock shape real), #9 (console.error antes do 500), #30 (.test.ts = node).
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    // metodo novo Fase C #4
    getTiltTypeDistribution: vi.fn(),
    // irmaos pre-existentes (o modulo importa storage inteiro)
    getCooldownComplianceMetrics: vi.fn(),
    getStarredHandsDistribution: vi.fn(),
    getCooldownImpactMetrics: vi.fn(),
    getTopLessons: vi.fn(),
    getWarmupComplianceMetrics: vi.fn(),
    getAbGameDistribution: vi.fn(),
  },
}));

import {
  handleTiltTypeDistribution,
  registerCooldownAnalyticsRoutes,
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

const TILT_FIXTURE = {
  period: '30d',
  totalAssessments: 7,
  typedCount: 7,
  dominant: 'injustice',
  distribution: [
    { tiltType: 'injustice', count: 5, sharePct: 0.714 },
    { tiltType: 'revenge', count: 2, sharePct: 0.286 },
  ],
  dataSufficiency: 'ok',
};

// ============================================================================
// auth
// ============================================================================

describe('GET /api/analytics/tilt-type-distribution - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
    expect(storage.getTiltTypeDistribution).not.toHaveBeenCalled();
  });
});

// ============================================================================
// happy path
// ============================================================================

describe('GET /api/analytics/tilt-type-distribution - happy path', () => {
  beforeEach(() => {
    (storage.getTiltTypeDistribution as any).mockResolvedValue(TILT_FIXTURE);
  });

  it('200 com period default 30d e shape completo', async () => {
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(TILT_FIXTURE);
    expect(storage.getTiltTypeDistribution).toHaveBeenCalledWith('USER-0001', '30d');
  });

  it('200 com period=7d explicito', async () => {
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq({ query: { period: '7d' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.getTiltTypeDistribution).toHaveBeenCalledWith('USER-0001', '7d');
  });

  it('200 com period=90d', async () => {
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq({ query: { period: '90d' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.getTiltTypeDistribution).toHaveBeenCalledWith('USER-0001', '90d');
  });

  it('Cache-Control max-age=300', async () => {
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq() as any, res);
    const cc = res.headers['Cache-Control'] ?? res.headers['cache-control'];
    expect(/max-age=300/.test(String(cc))).toBe(true);
  });
});

// ============================================================================
// validacao de period
// ============================================================================

describe('GET /api/analytics/tilt-type-distribution - period invalido', () => {
  it('400 quando period invalido (ex: "foo")', async () => {
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq({ query: { period: 'foo' } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(storage.getTiltTypeDistribution).not.toHaveBeenCalled();
  });

  it('400 quando period="1y"', async () => {
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq({ query: { period: '1y' } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(storage.getTiltTypeDistribution).not.toHaveBeenCalled();
  });
});

// ============================================================================
// janela vazia (200 com distribution [], nao 404)
// ============================================================================

describe('GET /api/analytics/tilt-type-distribution - sem dados', () => {
  it('200 com distribution [] / dominant null / dataSufficiency low (nao 404)', async () => {
    (storage.getTiltTypeDistribution as any).mockResolvedValue({
      period: '30d',
      totalAssessments: 0,
      typedCount: 0,
      dominant: null,
      distribution: [],
      dataSufficiency: 'low',
    });
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.distribution).toEqual([]);
    expect(res.body.dominant).toBeNull();
    expect(res.body.dataSufficiency).toBe('low');
  });
});

// ============================================================================
// ownership
// ============================================================================

describe('GET /api/analytics/tilt-type-distribution - ownership', () => {
  it('passa req.user.userPlatformId (ignora query.userId)', async () => {
    (storage.getTiltTypeDistribution as any).mockResolvedValue(TILT_FIXTURE);
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq({ query: { userId: 'USER-9999' } }) as any, res);
    expect(storage.getTiltTypeDistribution).toHaveBeenCalledWith('USER-0001', '30d');
  });

  it('user B nao recebe dados de user A (handler usa o userId do token)', async () => {
    (storage.getTiltTypeDistribution as any).mockResolvedValue(TILT_FIXTURE);
    const res = makeRes();
    await handleTiltTypeDistribution(
      makeReq({ user: { userPlatformId: 'USER-B' }, query: { userId: 'USER-A' } }) as any,
      res,
    );
    expect(storage.getTiltTypeDistribution).toHaveBeenCalledWith('USER-B', '30d');
    expect(storage.getTiltTypeDistribution).not.toHaveBeenCalledWith('USER-A', expect.anything());
  });
});

// ============================================================================
// PII — resposta sem texto livre
// ============================================================================

describe('GET /api/analytics/tilt-type-distribution - PII (R5)', () => {
  it('resposta serializada nao contem chave "action"', async () => {
    (storage.getTiltTypeDistribution as any).mockResolvedValue(TILT_FIXTURE);
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq() as any, res);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('action');
  });
});

// ============================================================================
// erro de storage -> 500 com console.error antes (lesson #9)
// ============================================================================

describe('GET /api/analytics/tilt-type-distribution - erro de storage', () => {
  it('500 com console.error antes do fallback (lesson #9), nao 200 mascarado', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (storage.getTiltTypeDistribution as any).mockRejectedValue(new Error('DB explodiu'));
    const res = makeRes();
    await handleTiltTypeDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================================
// Smoke de registro (aditivo, nao quebra rotas Fase B / cooldown)
// ============================================================================

describe('registerCooldownAnalyticsRoutes - registra rota Fase C #4', () => {
  it('registra GET /api/analytics/tilt-type-distribution + mantem rotas anteriores', async () => {
    expect(typeof registerCooldownAnalyticsRoutes).toBe('function');

    const registered: Array<{ method: string; path: string }> = [];
    const fakeApp: any = {
      get: (path: string, ..._handlers: any[]) => {
        registered.push({ method: 'get', path });
      },
      post: () => {},
      put: () => {},
      delete: () => {},
    };

    registerCooldownAnalyticsRoutes(fakeApp);

    const paths = registered.map((r) => r.path);
    expect(paths).toContain('/api/analytics/tilt-type-distribution');
    // aditivo: rotas Fase B + cooldown continuam registradas
    expect(paths).toContain('/api/analytics/abgame-distribution');
    expect(paths).toContain('/api/analytics/warmup-compliance');
    expect(paths).toContain('/api/analytics/cooldown-compliance');
  });
});
