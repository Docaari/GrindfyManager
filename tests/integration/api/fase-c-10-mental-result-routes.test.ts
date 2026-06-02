import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #10 — RF-01/02/03 endpoints:
//   GET /api/analytics/mental-result/tilt   -> handleMentalResultTilt
//   GET /api/analytics/mental-result/focus  -> handleMentalResultFocus
//   GET /api/analytics/mental-result/abgame -> handleMentalResultAbgame
//
// Spec: Docs/specs/sprint-fase-c-10-mental-resultado-2026-06-02.md
// ADR : Docs/architecture/decisions/233-fase-c-10-mental-result-insights.md (D-1/D-5)
//
// Handlers exportados de server/routes/cooldownAnalytics.ts (NAO existem ainda).
// D-1: 1 metodo storage.getMentalResultInsights -> 3 handlers fatiam o sub-bloco
// (result.tilt / result.focus / result.abgame).
//
// Padrao espelha fase-c-4-tilt-type-distribution-route.test.ts:
//   - import { storage } direto (NAO injectedStorage — D-5)
//   - vi.mock('../../../server/storage')
//   - handler (req, res) de 2 args
//   - 401 sem user / 200 happy / 7d-30d-90d / 400 invalido / ownership /
//     cache 5min / 500 erro com console.error antes (lesson #9)
//   - PII: resposta sem texto livre (action/cGame/lesson)
//
// Lessons: #3 (mock shape real), #9 (console.error antes do 500), #30 (.test.ts = node).
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    // metodo novo Fase C #10 (unico que os 3 handlers consomem — D-1)
    getMentalResultInsights: vi.fn(),
    // irmaos pre-existentes (o modulo importa storage inteiro)
    getCooldownComplianceMetrics: vi.fn(),
    getStarredHandsDistribution: vi.fn(),
    getCooldownImpactMetrics: vi.fn(),
    getTopLessons: vi.fn(),
    getWarmupComplianceMetrics: vi.fn(),
    getAbGameDistribution: vi.fn(),
    getTiltTypeDistribution: vi.fn(),
  },
}));

import {
  handleMentalResultTilt,
  handleMentalResultFocus,
  handleMentalResultAbgame,
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

// Fixture do metodo unico (shape MentalResultInsights). Inclui campos de texto
// livre PROPOSITALMENTE para garantir que o handler nao os repassa (mas o storage
// ja agrega; estes fixtures NUNCA carregam action/cGame/lesson — so numeros/enums).
const INSIGHTS_FIXTURE = {
  tilt: {
    period: '30d',
    baseline: { n: 8, avgPnlUsd: -10, medianPnlUsd: -5, dataSufficiency: 'ok' },
    buckets: [
      { key: 'injustice', n: 4, avgPnlUsd: -40, medianPnlUsd: -40, dataSufficiency: 'ok', deltaVsBaseline: -30 },
    ],
    dataSufficiency: 'ok',
  },
  focus: {
    period: '30d',
    baseline: { n: 8, avgPnlUsd: -10, medianPnlUsd: -5, dataSufficiency: 'ok' },
    buckets: [
      { key: 'alto', n: 4, avgPnlUsd: 20, medianPnlUsd: 20, dataSufficiency: 'ok', deltaVsBaseline: 30 },
      { key: 'medio', n: 2, avgPnlUsd: -5, medianPnlUsd: -5, dataSufficiency: 'low', deltaVsBaseline: 5 },
      { key: 'baixo', n: 2, avgPnlUsd: -40, medianPnlUsd: -40, dataSufficiency: 'low', deltaVsBaseline: -30 },
    ],
    dataSufficiency: 'ok',
  },
  abgame: {
    period: '30d',
    baseline: { n: 8, avgPnlUsd: -10, medianPnlUsd: -5, dataSufficiency: 'ok' },
    buckets: [
      { key: 'a_dominant', n: 4, avgPnlUsd: 30, medianPnlUsd: 30, dataSufficiency: 'ok', deltaVsBaseline: 40 },
      { key: 'bc_present', n: 4, avgPnlUsd: -50, medianPnlUsd: -50, dataSufficiency: 'ok', deltaVsBaseline: -40 },
    ],
    dataSufficiency: 'ok',
  },
};

// Tabela: (nome do bloco, handler, chave do sub-bloco esperada na resposta)
const CASES: Array<[string, (req: any, res: any) => Promise<void>, 'tilt' | 'focus' | 'abgame']> = [
  ['tilt', handleMentalResultTilt, 'tilt'],
  ['focus', handleMentalResultFocus, 'focus'],
  ['abgame', handleMentalResultAbgame, 'abgame'],
];

// ============================================================================
// auth
// ============================================================================

describe('GET /api/analytics/mental-result/* - auth', () => {
  it.each(CASES)('%s: 401 quando req.user ausente', async (_name, handler) => {
    const res = makeRes();
    await handler(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
    expect(storage.getMentalResultInsights).not.toHaveBeenCalled();
  });
});

// ============================================================================
// happy path — handler devolve SO o seu sub-bloco
// ============================================================================

describe('GET /api/analytics/mental-result/* - happy path', () => {
  beforeEach(() => {
    (storage.getMentalResultInsights as any).mockResolvedValue(INSIGHTS_FIXTURE);
  });

  it.each(CASES)('%s: 200 com period default 30d devolve apenas o sub-bloco', async (_name, handler, key) => {
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual((INSIGHTS_FIXTURE as any)[key]);
    expect(storage.getMentalResultInsights).toHaveBeenCalledWith('USER-0001', '30d');
  });

  it.each(CASES)('%s: 200 com period=7d explicito', async (_name, handler) => {
    const res = makeRes();
    await handler(makeReq({ query: { period: '7d' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.getMentalResultInsights).toHaveBeenCalledWith('USER-0001', '7d');
  });

  it.each(CASES)('%s: 200 com period=90d', async (_name, handler) => {
    const res = makeRes();
    await handler(makeReq({ query: { period: '90d' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.getMentalResultInsights).toHaveBeenCalledWith('USER-0001', '90d');
  });

  it.each(CASES)('%s: Cache-Control max-age=300', async (_name, handler) => {
    const res = makeRes();
    await handler(makeReq() as any, res);
    const cc = res.headers['Cache-Control'] ?? res.headers['cache-control'];
    expect(/max-age=300/.test(String(cc))).toBe(true);
  });
});

// ============================================================================
// validacao de period
// ============================================================================

describe('GET /api/analytics/mental-result/* - period invalido', () => {
  it.each(CASES)('%s: 400 quando period invalido ("1y")', async (_name, handler) => {
    const res = makeRes();
    await handler(makeReq({ query: { period: '1y' } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(storage.getMentalResultInsights).not.toHaveBeenCalled();
  });

  it.each(CASES)('%s: 400 quando period="foo"', async (_name, handler) => {
    const res = makeRes();
    await handler(makeReq({ query: { period: 'foo' } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(storage.getMentalResultInsights).not.toHaveBeenCalled();
  });
});

// ============================================================================
// janela vazia (200, nao 404)
// ============================================================================

describe('GET /api/analytics/mental-result/* - sem dados', () => {
  it.each(CASES)('%s: 200 com baseline.n=0 / dataSufficiency low (nao 404)', async (_name, handler, key) => {
    const emptySet = {
      period: '30d',
      baseline: { n: 0, avgPnlUsd: null, medianPnlUsd: null, dataSufficiency: 'low' },
      buckets: [],
      dataSufficiency: 'low',
    };
    (storage.getMentalResultInsights as any).mockResolvedValue({
      tilt: emptySet,
      focus: { ...emptySet },
      abgame: { ...emptySet },
    });
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.baseline.n).toBe(0);
    expect(res.body.baseline.avgPnlUsd).toBeNull();
    expect(res.body.dataSufficiency).toBe('low');
  });
});

// ============================================================================
// ownership
// ============================================================================

describe('GET /api/analytics/mental-result/* - ownership', () => {
  it.each(CASES)('%s: passa req.user.userPlatformId (ignora query.userId)', async (_name, handler) => {
    (storage.getMentalResultInsights as any).mockResolvedValue(INSIGHTS_FIXTURE);
    const res = makeRes();
    await handler(makeReq({ query: { userId: 'USER-9999' } }) as any, res);
    expect(storage.getMentalResultInsights).toHaveBeenCalledWith('USER-0001', '30d');
  });

  it.each(CASES)('%s: user B nao recebe dados de user A', async (_name, handler) => {
    (storage.getMentalResultInsights as any).mockResolvedValue(INSIGHTS_FIXTURE);
    const res = makeRes();
    await handler(
      makeReq({ user: { userPlatformId: 'USER-B' }, query: { userId: 'USER-A' } }) as any,
      res,
    );
    expect(storage.getMentalResultInsights).toHaveBeenCalledWith('USER-B', '30d');
    expect(storage.getMentalResultInsights).not.toHaveBeenCalledWith('USER-A', expect.anything());
  });
});

// ============================================================================
// PII — resposta sem texto livre
// ============================================================================

describe('GET /api/analytics/mental-result/* - PII (D5)', () => {
  it.each(CASES)('%s: resposta serializada nao contem action/cGame/lesson', async (_name, handler) => {
    (storage.getMentalResultInsights as any).mockResolvedValue(INSIGHTS_FIXTURE);
    const res = makeRes();
    await handler(makeReq() as any, res);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('action');
    expect(serialized).not.toContain('cGame');
    expect(serialized).not.toContain('lesson');
  });
});

// ============================================================================
// erro de storage -> 500 com console.error antes (lesson #9)
// ============================================================================

describe('GET /api/analytics/mental-result/* - erro de storage', () => {
  it.each(CASES)('%s: 500 com console.error antes (lesson #9), nao 200 mascarado', async (_name, handler) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (storage.getMentalResultInsights as any).mockRejectedValue(new Error('DB explodiu'));
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================================
// Smoke de registro (aditivo, nao quebra rotas Fase B/C #4/cooldown)
// ============================================================================

describe('registerCooldownAnalyticsRoutes - registra rotas Fase C #10', () => {
  it('registra os 3 GET mental-result/* + mantem rotas anteriores', () => {
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
    // novas (Fase C #10)
    expect(paths).toContain('/api/analytics/mental-result/tilt');
    expect(paths).toContain('/api/analytics/mental-result/focus');
    expect(paths).toContain('/api/analytics/mental-result/abgame');
    // aditivo: rotas anteriores continuam registradas (presenca individual — lesson #8)
    expect(paths).toContain('/api/analytics/tilt-type-distribution');
    expect(paths).toContain('/api/analytics/abgame-distribution');
    expect(paths).toContain('/api/analytics/cooldown-compliance');
  });
});
