// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — GET /api/stats-analyzer/snapshots/compare (RF-16)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-16 endpoint compare 3-way)
// ADR  : 066 (3-way comparison semantics)
//
// Convencao: handler testado diretamente com mocks. Implementer ira criar
// `handleCompareSnapshots` em `server/routes/statsAnalyzer.ts`.
//
// Modulo NAO existe ainda — red phase.
//
// Mocks:
//   - storage.getHudStatSnapshot (validar ownership + existencia)
//   - storage.getHudLayout (resolver targets + customs)
//
// Comportamentos:
//   - 200 com shape RF-16 (snap1, snap2, groups, summary)
//   - 401 sem auth
//   - 403 quando snap1 OR snap2 nao pertencem ao user
//   - 404 quando snapshot nao existe (ou deletado durante request)
//   - Auto-reorder por captured_at (snap1 sempre mais antigo)
//   - status enum (both_in_target/improving/regressing/etc) calculado server
//   - trend ↑↓→ baseado em delta + direction + unit threshold
//   - direction lower_better inverte sinal visual
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getHudStatSnapshot: vi.fn(),
    getHudLayout: vi.fn(),
    getHudStatSnapshots: vi.fn(),
  },
}));

// Modulos NAO existem — red phase
import { handleCompareSnapshots } from '../../../server/routes/statsAnalyzer';
import { storage } from '../../../server/storage';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'pro' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res; };
  return res;
}

const layoutBase = {
  id: 'lyt-1',
  userId: 'USER-0001',
  name: 'PT4',
  // V2 sections preservadas + V3 fields_json (custom + targetOverride)
  sections: [],
  fields_json: [],
};

const snap1Old = {
  id: 'snap-old',
  userId: 'USER-0001',
  layoutId: 'lyt-1',
  capturedAt: new Date('2026-04-17T10:00:00Z'),
  source: 'manual',
  values: {
    vpip: 22,
    pfr: 18,
    wwsf_pct: 40,           // higher_better, fora target [45,55]
    fold_to_3bet: 55,       // lower_better, dentro [50,60]
  },
  sampleSize: 5400,
};

const snap2New = {
  id: 'snap-new',
  userId: 'USER-0001',
  layoutId: 'lyt-1',
  capturedAt: new Date('2026-05-01T10:00:00Z'),
  source: 'ocr',
  values: {
    vpip: 24,
    pfr: 19,
    wwsf_pct: 48,           // higher_better, dentro [45,55] -> improving
    fold_to_3bet: 70,       // lower_better, fora -> regressing
  },
  sampleSize: 7200,
};

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getHudLayout as any).mockResolvedValue(layoutBase);
  (storage.getHudStatSnapshot as any).mockImplementation(async (id: string, userId: string) => {
    if (userId !== 'USER-0001') return undefined;
    if (id === 'snap-old') return snap1Old;
    if (id === 'snap-new') return snap2New;
    return undefined;
  });
});

// =============================================================================
// Auth
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — auth', () => {
  it('401 sem req.user', async () => {
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({
        user: undefined,
        query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('403 quando snap1 nao pertence ao user', async () => {
    (storage.getHudStatSnapshot as any).mockImplementation(async (id: string) => {
      if (id === 'snap-old') return undefined; // not for this user
      if (id === 'snap-new') return snap2New;
      return undefined;
    });
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect([403, 404]).toContain(res.statusCode);
  });
});

// =============================================================================
// Validation
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — validation', () => {
  it('404 quando snap1 nao existe', async () => {
    (storage.getHudStatSnapshot as any).mockResolvedValue(undefined);
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-missing', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 quando layoutId mismatch (snap nao pertence ao layout)', async () => {
    (storage.getHudStatSnapshot as any).mockImplementation(async (id: string) => {
      if (id === 'snap-old') return { ...snap1Old, layoutId: 'lyt-other' };
      if (id === 'snap-new') return snap2New;
      return undefined;
    });
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// Auto-reorder
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — auto-reorder', () => {
  it('user passa snap1=novo, snap2=antigo -> server reordena cronologico', async () => {
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({
        query: { snap1: 'snap-new', snap2: 'snap-old', layoutId: 'lyt-1' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    // Apos reorder, body.snap1 = mais antigo
    expect(res.body.snap1.id).toBe('snap-old');
    expect(res.body.snap2.id).toBe('snap-new');
  });
});

// =============================================================================
// Response shape
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — response shape', () => {
  it('200 com shape RF-16 (snap1, snap2, groups, summary)', async () => {
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('layoutId');
    expect(res.body).toHaveProperty('snap1');
    expect(res.body).toHaveProperty('snap2');
    expect(res.body).toHaveProperty('groups');
    expect(res.body).toHaveProperty('summary');
    expect(Array.isArray(res.body.groups)).toBe(true);
  });

  it('summary inclui improvingCount, regressingCount, stableCount, snap1OffTarget, snap2OffTarget', async () => {
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.body.summary).toHaveProperty('improvingCount');
    expect(res.body.summary).toHaveProperty('regressingCount');
    expect(res.body.summary).toHaveProperty('stableCount');
    expect(res.body.summary).toHaveProperty('snap1OffTarget');
    expect(res.body.summary).toHaveProperty('snap2OffTarget');
  });
});

// =============================================================================
// Status semantico (improving / regressing)
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — status enum', () => {
  it('wwsf_pct (higher_better, snap1=40 fora -> snap2=48 dentro) -> improving', async () => {
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    const allStats = (res.body.groups as any[]).flatMap((g) => g.stats);
    const wwsf = allStats.find((s: any) => s.id === 'wwsf_pct');
    expect(wwsf).toBeDefined();
    expect(wwsf.status).toBe('improving');
  });

  it('fold_to_3bet (lower_better, snap1=55 dentro -> snap2=70 fora) -> regressing', async () => {
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    const allStats = (res.body.groups as any[]).flatMap((g) => g.stats);
    const fold = allStats.find((s: any) => s.id === 'fold_to_3bet');
    expect(fold).toBeDefined();
    expect(fold.status).toBe('regressing');
  });
});

// =============================================================================
// Null handling
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — null handling', () => {
  it('snap1Value=null -> status snap1_null + delta=null', async () => {
    (storage.getHudStatSnapshot as any).mockImplementation(async (id: string) => {
      if (id === 'snap-old') return { ...snap1Old, values: { ...snap1Old.values, vpip: null } };
      if (id === 'snap-new') return snap2New;
      return undefined;
    });
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    const allStats = (res.body.groups as any[]).flatMap((g) => g.stats);
    const vpip = allStats.find((s: any) => s.id === 'vpip');
    expect(vpip.snap1Value).toBeNull();
    expect(vpip.delta).toBeNull();
    expect(['snap1_null', 'both_null']).toContain(vpip.status);
  });
});

// =============================================================================
// Trend icon (RF-15 server-emit)
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — trend icon', () => {
  it('emite trendIcon (↑↑/↓↓/↑/↓/→) por stat segundo direction + threshold', async () => {
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    const allStats = (res.body.groups as any[]).flatMap((g) => g.stats);
    // wwsf_pct delta=+8 higher_better -> ↑↑
    const wwsf = allStats.find((s: any) => s.id === 'wwsf_pct');
    expect(wwsf.trendIcon).toBe('↑↑');
    // fold_to_3bet delta=+15 lower_better -> ↓↓ (regressing)
    const fold = allStats.find((s: any) => s.id === 'fold_to_3bet');
    expect(fold.trendIcon).toBe('↓↓');
  });
});

// =============================================================================
// Performance
// =============================================================================

describe('GET /api/stats-analyzer/snapshots/compare — performance', () => {
  it('retorna em <300ms para layout com 200+ stats', async () => {
    // Build full snapshot
    const fullValues: Record<string, number> = {};
    const { HUD_STAT_CATALOG } = await import('../../../shared/hud-stat-catalog');
    for (const stat of HUD_STAT_CATALOG) {
      fullValues[stat.id] = (stat.targetMin + stat.targetMax) / 2;
    }
    (storage.getHudStatSnapshot as any).mockImplementation(async (id: string) => {
      if (id === 'snap-old') return { ...snap1Old, values: fullValues };
      if (id === 'snap-new') return { ...snap2New, values: fullValues };
      return undefined;
    });
    const t0 = Date.now();
    const res = makeRes();
    await handleCompareSnapshots(
      makeReq({ query: { snap1: 'snap-old', snap2: 'snap-new', layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(Date.now() - t0).toBeLessThan(300);
    expect(res.statusCode).toBe(200);
  });
});
