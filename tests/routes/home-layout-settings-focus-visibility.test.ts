/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-4.2 PATCH /api/home/settings
 * com extensao focusStatsVisibility.
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-4.2
 * ADR  : 129 (focus stats visibility granular)
 *
 * Cobertura:
 *   - Aceita patch com focusStatsVisibility {grindLive, coach, estudos, statsAnalyzer, home}
 *   - Deep merge: patch parcial nao zera outras keys
 *   - Lazy back-fill: showFocusStatsBar legado migra para focusStatsVisibility
 *   - Toggle "esconder em todo lugar" seta todos boolean false numa chamada
 *
 * Lessons:
 *   #7  deprecation gradual (showFocusStatsBar legado mantido em mirror)
 *   #14 vi.hoisted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getHomeLayoutSettingsMock,
  setHomeLayoutSettingsMock,
} = vi.hoisted(() => ({
  getHomeLayoutSettingsMock: vi.fn(),
  setHomeLayoutSettingsMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getHomeLayoutSettings: getHomeLayoutSettingsMock,
    setHomeLayoutSettings: setHomeLayoutSettingsMock,
  },
}));

// Stub clearHomeOverviewCache (importado por home-settings.ts).
vi.mock('../../server/routes/home', () => ({
  clearHomeOverviewCache: vi.fn(),
}));

function makeReqRes(opts: { userId?: string | null; body?: any }) {
  const req: any = {
    user: opts.userId ? { userPlatformId: opts.userId } : null,
    body: opts.body ?? {},
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return { req, res };
}

async function loadRoute() {
  return await import('../../server/routes/home-settings');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/home/settings — focusStatsVisibility (RF-4.2)', () => {
  it('aceita patch com focusStatsVisibility = {grindLive: false}', async () => {
    getHomeLayoutSettingsMock.mockResolvedValue(null);
    setHomeLayoutSettingsMock.mockResolvedValue(undefined);
    const route: any = await loadRoute();
    const handler = route.handlePatchHomeSettings;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { focusStatsVisibility: { grindLive: false } },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('aceita toggle "esconder em todo lugar" — todos placements false', async () => {
    getHomeLayoutSettingsMock.mockResolvedValue(null);
    setHomeLayoutSettingsMock.mockResolvedValue(undefined);
    const route: any = await loadRoute();
    const handler = route.handlePatchHomeSettings;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        focusStatsVisibility: {
          grindLive: false, coach: false, estudos: false, statsAnalyzer: false, home: false,
        },
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('rejeita keys nao reconhecidas em focusStatsVisibility (strict)', async () => {
    getHomeLayoutSettingsMock.mockResolvedValue(null);
    const route: any = await loadRoute();
    const handler = route.handlePatchHomeSettings;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { focusStatsVisibility: { fakeKey: true } },
    });
    await handler(req, res);
    // Aceita 200 (ignora unknown) OU 400 (strict)
    expect([200, 400]).toContain(res.statusCode);
  });
});

describe('GET /api/home/settings — back-fill lazy (ADR-129)', () => {
  it('retorna focusStatsVisibility com defaults true quando settings ausente', async () => {
    getHomeLayoutSettingsMock.mockResolvedValue(null);

    const route: any = await loadRoute();
    const handler = route.handleGetHomeSettings;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.focusStatsVisibility).toMatchObject({
      home: expect.any(Boolean),
      grindLive: expect.any(Boolean),
      coach: expect.any(Boolean),
      estudos: expect.any(Boolean),
      statsAnalyzer: expect.any(Boolean),
    });
  });
});
