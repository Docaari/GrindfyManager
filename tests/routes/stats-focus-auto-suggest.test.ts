/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-3.3 POST /api/stats/focus/auto-suggest
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-3.3
 * ADRs : 127 (curated themes hybrid taxonomy) + 116 (focus_stats)
 *
 * Cobertura:
 *   - 200 cria 3 rows top severity quando user tem 0 focus
 *   - 409 quando user ja tem 3 focus no mes (idempotent)
 *   - 200 + warnings quando < 3 leaks detectados (low data)
 *   - 400 month invalido
 *   - 400 month futuro
 *   - 401 sem auth
 *   - matching theme via linkedStats: row recebe studyThemeId preenchido
 *   - sem matching theme: row recebe studyThemeId=null
 *
 * Lessons:
 *   #14 vi.hoisted para mocks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getStatsLeaksMock,
  countUserFocusStatsMock,
  createUserFocusStatMock,
  findCuratedThemeByLinkedStatMock,
} = vi.hoisted(() => ({
  getStatsLeaksMock: vi.fn(),
  countUserFocusStatsMock: vi.fn(),
  createUserFocusStatMock: vi.fn(),
  findCuratedThemeByLinkedStatMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getStatsLeaks: getStatsLeaksMock,
    countUserFocusStats: countUserFocusStatsMock,
    createUserFocusStat: createUserFocusStatMock,
    findCuratedThemeByLinkedStat: findCuratedThemeByLinkedStatMock,
  },
}));

function makeReqRes(opts: { userId?: string | null; body?: any; query?: any }) {
  const req: any = {
    user: opts.userId ? { userPlatformId: opts.userId } : null,
    body: opts.body ?? {},
    query: opts.query ?? {},
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return { req, res };
}

async function loadRoute() {
  return await import('../../server/routes/focus-stats-auto-suggest');
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Auth
// =============================================================================
describe('POST /api/stats/focus/auto-suggest — Auth', () => {
  it('401 sem userId', async () => {
    const route: any = await loadRoute();
    const handler = route.handleAutoSuggestFocusStats || route.default;
    const { req, res } = makeReqRes({ userId: null });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// Validacao
// =============================================================================
describe('POST /api/stats/focus/auto-suggest — Validacao', () => {
  it('400 quando month formato invalido', async () => {
    const route: any = await loadRoute();
    const handler = route.handleAutoSuggestFocusStats || route.default;
    const { req, res } = makeReqRes({ userId: 'USER-0001', query: { month: 'maio-2026' } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando month no futuro', async () => {
    const route: any = await loadRoute();
    const handler = route.handleAutoSuggestFocusStats || route.default;
    const { req, res } = makeReqRes({ userId: 'USER-0001', query: { month: '2099-01' } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// Idempotency
// =============================================================================
describe('POST /api/stats/focus/auto-suggest — Idempotency', () => {
  it('409 quando user ja tem 3 focus stats no mes', async () => {
    countUserFocusStatsMock.mockResolvedValue(3);
    const route: any = await loadRoute();
    const handler = route.handleAutoSuggestFocusStats || route.default;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);
    expect(res.statusCode).toBe(409);
  });
});

// =============================================================================
// Happy path com matches em curated themes
// =============================================================================
describe('POST /api/stats/focus/auto-suggest — Happy path', () => {
  it('cria 3 rows quando user tem 0 focus + 3 leaks detected + matching themes', async () => {
    countUserFocusStatsMock.mockResolvedValue(0);
    getStatsLeaksMock.mockResolvedValue([
      { statId: 'cbet_flop_oop', severity: 0.45 },
      { statId: 'threebet_pct', severity: 0.30 },
      { statId: 'rfi_overall', severity: 0.20 },
    ]);
    findCuratedThemeByLinkedStatMock
      .mockResolvedValueOnce({ id: 'th-cbet', isCurated: true, linkedStats: ['cbet_flop_oop'] })
      .mockResolvedValueOnce({ id: 'th-3bet', isCurated: true, linkedStats: ['threebet_pct'] })
      .mockResolvedValueOnce(null); // sem match para rfi_overall

    let createCount = 0;
    createUserFocusStatMock.mockImplementation(async (input: any) => {
      createCount += 1;
      return {
        id: `ufs-${createCount}`,
        userId: input.userId,
        statId: input.statId,
        studyThemeId: input.studyThemeId,
        month: input.month,
      };
    });

    const route: any = await loadRoute();
    const handler = route.handleAutoSuggestFocusStats || route.default;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.created).toHaveLength(3);
    expect(createUserFocusStatMock).toHaveBeenCalledTimes(3);

    // Primeiro com theme, segundo com theme, terceiro NULL
    const calls = createUserFocusStatMock.mock.calls.map((c: any[]) => c[0]);
    expect(calls[0].studyThemeId).toBe('th-cbet');
    expect(calls[1].studyThemeId).toBe('th-3bet');
    expect(calls[2].studyThemeId).toBeNull();
  });

  it('warnings populated quando < 3 leaks detected (low data)', async () => {
    countUserFocusStatsMock.mockResolvedValue(0);
    getStatsLeaksMock.mockResolvedValue([
      { statId: 'cbet_flop_oop', severity: 0.45 },
    ]);
    findCuratedThemeByLinkedStatMock.mockResolvedValue(null);
    createUserFocusStatMock.mockResolvedValue({
      id: 'ufs-1', userId: 'USER-0001', statId: 'cbet_flop_oop', studyThemeId: null, month: '2026-05',
    });

    const route: any = await loadRoute();
    const handler = route.handleAutoSuggestFocusStats || route.default;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.created).toHaveLength(1);
    expect(Array.isArray(res.body?.warnings)).toBe(true);
    expect(res.body.warnings.length).toBeGreaterThan(0);
  });

  it('zero leaks: cria 0 rows + warning', async () => {
    countUserFocusStatsMock.mockResolvedValue(0);
    getStatsLeaksMock.mockResolvedValue([]);
    const route: any = await loadRoute();
    const handler = route.handleAutoSuggestFocusStats || route.default;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body?.created).toHaveLength(0);
  });
});
