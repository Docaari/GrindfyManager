import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — Analytics endpoints
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-06)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Endpoints (handlers exportados de server/routes/cooldownAnalytics.ts — NAO existe):
//   GET /api/analytics/cooldown-compliance         -> handleCooldownCompliance
//   GET /api/analytics/starred-hands-distribution  -> handleStarredHandsDistribution
//   GET /api/analytics/cooldown-impact             -> handleCooldownImpact
//   GET /api/analytics/top-lessons                 -> handleTopLessons
//
// Regras-chave:
//   - 401 sem auth
//   - 200 happy path period=30d (default)
//   - 7d / 30d / 90d aceitos
//   - period invalido -> 400
//   - ownership rigoroso: storage chamado com req.user.userPlatformId
//   - cache 5min (Cache-Control header)
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getCooldownComplianceMetrics: vi.fn(),
    getStarredHandsDistribution: vi.fn(),
    getCooldownImpactMetrics: vi.fn(),
    getTopLessons: vi.fn(),
  },
}));

import {
  handleCooldownCompliance,
  handleStarredHandsDistribution,
  handleCooldownImpact,
  handleTopLessons,
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
    if (typeof k === 'object') {
      Object.assign(res.headers, k);
    } else {
      res.headers[k] = v;
    }
    return res;
  };
  res.setHeader = (k: string, v: any) => {
    res.headers[k] = v;
    return res;
  };
  return res;
}

// ============================================================================
// GET /api/analytics/cooldown-compliance
// ============================================================================

describe('GET /api/analytics/cooldown-compliance - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleCooldownCompliance(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
    expect(storage.getCooldownComplianceMetrics).not.toHaveBeenCalled();
  });
});

describe('GET /api/analytics/cooldown-compliance - happy path', () => {
  beforeEach(() => {
    (storage.getCooldownComplianceMetrics as any).mockResolvedValue({
      total: 30,
      completed: 18,
      complianceRate: 0.6,
    });
  });

  it('200 com period default 30d', async () => {
    const res = makeRes();
    await handleCooldownCompliance(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ total: 30, completed: 18, complianceRate: 0.6 });
    expect(storage.getCooldownComplianceMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '30d',
    );
  });

  it('200 com period=7d explicito', async () => {
    const res = makeRes();
    await handleCooldownCompliance(
      makeReq({ query: { period: '7d' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.getCooldownComplianceMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '7d',
    );
  });

  it('200 com period=90d', async () => {
    const res = makeRes();
    await handleCooldownCompliance(
      makeReq({ query: { period: '90d' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.getCooldownComplianceMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '90d',
    );
  });

  it('400 quando period invalido (ex: "1y")', async () => {
    const res = makeRes();
    await handleCooldownCompliance(
      makeReq({ query: { period: '1y' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.getCooldownComplianceMetrics).not.toHaveBeenCalled();
  });

  it('200 vazio quando 0 sessoes (total=0, completed=0, complianceRate=0)', async () => {
    (storage.getCooldownComplianceMetrics as any).mockResolvedValue({
      total: 0,
      completed: 0,
      complianceRate: 0,
    });
    const res = makeRes();
    await handleCooldownCompliance(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.complianceRate).toBe(0);
  });

  it('Cache-Control 5min (max-age=300)', async () => {
    (storage.getCooldownComplianceMetrics as any).mockResolvedValue({
      total: 1,
      completed: 1,
      complianceRate: 1,
    });
    const res = makeRes();
    await handleCooldownCompliance(makeReq() as any, res);
    const cacheCtrl =
      res.headers['Cache-Control'] ?? res.headers['cache-control'];
    // Aceita "max-age=300" OU "private, max-age=300"
    expect(/max-age=300/.test(String(cacheCtrl))).toBe(true);
  });
});

describe('GET /api/analytics/cooldown-compliance - ownership', () => {
  it('passa req.user.userPlatformId (NAO confia em query)', async () => {
    (storage.getCooldownComplianceMetrics as any).mockResolvedValue({
      total: 1,
      completed: 0,
      complianceRate: 0,
    });
    const res = makeRes();
    await handleCooldownCompliance(
      makeReq({ query: { userId: 'USER-9999' } }) as any,
      res,
    );
    expect(storage.getCooldownComplianceMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '30d',
    );
  });
});

// ============================================================================
// GET /api/analytics/starred-hands-distribution
// ============================================================================

describe('GET /api/analytics/starred-hands-distribution - auth', () => {
  it('401 sem user', async () => {
    const res = makeRes();
    await handleStarredHandsDistribution(
      makeReq({ user: undefined }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/analytics/starred-hands-distribution - happy path', () => {
  it('200 retorna agregado por type, ordenado desc', async () => {
    (storage.getStarredHandsDistribution as any).mockResolvedValue([
      { type: 'tilt', count: 12 },
      { type: 'leak', count: 7 },
      { type: 'mistake', count: 3 },
    ]);
    const res = makeRes();
    await handleStarredHandsDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].type).toBe('tilt');
    expect(res.body[0].count).toBe(12);
    expect(res.body[0].count).toBeGreaterThanOrEqual(res.body[1].count);
  });

  it('200 vazio quando sem starred hands', async () => {
    (storage.getStarredHandsDistribution as any).mockResolvedValue([]);
    const res = makeRes();
    await handleStarredHandsDistribution(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('400 com period invalido', async () => {
    const res = makeRes();
    await handleStarredHandsDistribution(
      makeReq({ query: { period: '5x' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('Cache-Control 5min', async () => {
    (storage.getStarredHandsDistribution as any).mockResolvedValue([]);
    const res = makeRes();
    await handleStarredHandsDistribution(makeReq() as any, res);
    const cc = res.headers['Cache-Control'] ?? res.headers['cache-control'];
    expect(/max-age=300/.test(String(cc))).toBe(true);
  });
});

// ============================================================================
// GET /api/analytics/cooldown-impact
// ============================================================================

describe('GET /api/analytics/cooldown-impact - auth', () => {
  it('401 sem user', async () => {
    const res = makeRes();
    await handleCooldownImpact(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/analytics/cooldown-impact - happy path', () => {
  it('200 retorna {withCooldown, withoutCooldown, delta}', async () => {
    (storage.getCooldownImpactMetrics as any).mockResolvedValue({
      withCooldown: { avgRoi: 0.18 },
      withoutCooldown: { avgRoi: 0.05 },
      delta: 0.13,
    });
    const res = makeRes();
    await handleCooldownImpact(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.withCooldown.avgRoi).toBe(0.18);
    expect(res.body.withoutCooldown.avgRoi).toBe(0.05);
    expect(typeof res.body.delta).toBe('number');
  });

  it('200 vazio (zero sessoes) retorna delta=0', async () => {
    (storage.getCooldownImpactMetrics as any).mockResolvedValue({
      withCooldown: { avgRoi: 0 },
      withoutCooldown: { avgRoi: 0 },
      delta: 0,
    });
    const res = makeRes();
    await handleCooldownImpact(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.delta).toBe(0);
  });

  it('400 com period invalido', async () => {
    const res = makeRes();
    await handleCooldownImpact(
      makeReq({ query: { period: 'yesterday' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('passa userId autenticado (ownership)', async () => {
    (storage.getCooldownImpactMetrics as any).mockResolvedValue({
      withCooldown: { avgRoi: 0 },
      withoutCooldown: { avgRoi: 0 },
      delta: 0,
    });
    const res = makeRes();
    await handleCooldownImpact(
      makeReq({ query: { userId: 'USER-9999' } }) as any,
      res,
    );
    expect(storage.getCooldownImpactMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '30d',
    );
  });

  it('Cache-Control 5min', async () => {
    (storage.getCooldownImpactMetrics as any).mockResolvedValue({
      withCooldown: { avgRoi: 0 },
      withoutCooldown: { avgRoi: 0 },
      delta: 0,
    });
    const res = makeRes();
    await handleCooldownImpact(makeReq() as any, res);
    const cc = res.headers['Cache-Control'] ?? res.headers['cache-control'];
    expect(/max-age=300/.test(String(cc))).toBe(true);
  });
});

// ============================================================================
// GET /api/analytics/top-lessons
// ============================================================================

describe('GET /api/analytics/top-lessons - auth', () => {
  it('401 sem user', async () => {
    const res = makeRes();
    await handleTopLessons(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/analytics/top-lessons - happy path', () => {
  it('200 retorna top 30 tokens com count', async () => {
    const mockTokens = Array.from({ length: 30 }, (_, i) => ({
      token: `palavra${i}`,
      count: 30 - i,
    }));
    (storage.getTopLessons as any).mockResolvedValue(mockTokens);
    const res = makeRes();
    await handleTopLessons(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(30);
  });

  it('200 vazio quando 0 lessons', async () => {
    (storage.getTopLessons as any).mockResolvedValue([]);
    const res = makeRes();
    await handleTopLessons(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('200 cada token tem > 3 chars (sanitizer enforced)', async () => {
    (storage.getTopLessons as any).mockResolvedValue([
      { token: 'paciencia', count: 5 },
      { token: 'volume', count: 3 },
    ]);
    const res = makeRes();
    await handleTopLessons(makeReq() as any, res);
    for (const item of res.body) {
      expect(item.token.length).toBeGreaterThan(3);
    }
  });

  it('400 com period invalido', async () => {
    const res = makeRes();
    await handleTopLessons(
      makeReq({ query: { period: 'forever' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('Cache-Control 5min', async () => {
    (storage.getTopLessons as any).mockResolvedValue([]);
    const res = makeRes();
    await handleTopLessons(makeReq() as any, res);
    const cc = res.headers['Cache-Control'] ?? res.headers['cache-control'];
    expect(/max-age=300/.test(String(cc))).toBe(true);
  });

  it('passa userId autenticado (ownership)', async () => {
    (storage.getTopLessons as any).mockResolvedValue([]);
    const res = makeRes();
    await handleTopLessons(
      makeReq({ query: { userId: 'USER-9999' } }) as any,
      res,
    );
    expect(storage.getTopLessons).toHaveBeenCalledWith('USER-0001', '30d');
  });
});
