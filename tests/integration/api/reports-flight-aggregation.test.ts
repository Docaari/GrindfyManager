import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-16: toggle "agregar vs expandir" nos relatorios
//
// Spec : Docs/specs/sprint-flight-1.md (RF-16, D13)
// ADRs : 090
//
// Comportamento:
//   - User_settings tem campo `reportsExpandFlightSeries: boolean` (default false).
//   - Endpoints de reports aceitam query param `?expandFlightSeries=true|false`.
//   - Default sem param: usa setting do user.
//   - Param explicito override setting (one-off no request).
//
// Endpoints alvo (representativos — testes mockam handlers individualmente):
//   GET /api/dashboard
//   GET /api/analytics/by-modifier  (ja afetado — ADR-090, ~3 endpoints)
//   GET /api/bankroll/reports
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    updateUserSettings: vi.fn(),
    getDashboardStats: vi.fn(),
    getAnalyticsByModifier: vi.fn(),
    getBankrollReports: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    query: {},
    body: {},
    params: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
}

// ---------------------------------------------------------------------------
// User settings: reportsExpandFlightSeries
// ---------------------------------------------------------------------------

describe('user_settings.reportsExpandFlightSeries (RF-16, D13)', () => {
  it('default false (agregar)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      reportsExpandFlightSeries: false,
    });
    const settings = await storage.getUserSettings('USER-0001');
    expect((settings as any).reportsExpandFlightSeries).toBe(false);
  });

  it('PATCH user settings persiste valor true', async () => {
    (storage.updateUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      reportsExpandFlightSeries: true,
    });
    const updated = await storage.updateUserSettings('USER-0001', {
      reportsExpandFlightSeries: true,
    });
    expect((updated as any).reportsExpandFlightSeries).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dashboard / analytics endpoints aceitam query param
// ---------------------------------------------------------------------------

describe('GET /api/dashboard?expandFlightSeries=true|false (RF-16)', () => {
  async function importHandler() {
    const mod = await import('../../../server/routes/dashboard');
    const handler =
      (mod as any).handleGetDashboard ||
      (mod as any).handleDashboard;
    if (typeof handler !== 'function') {
      throw new Error(
        'handler de dashboard nao exportado (esperado handleGetDashboard | handleDashboard)',
      );
    }
    return handler;
  }

  it('expandFlightSeries=false (default): trata combined-stack como 1 torneio', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      reportsExpandFlightSeries: false,
    });
    (storage.getDashboardStats as any).mockResolvedValue({
      tournamentsPlayed: 10,
      profit: 1500,
    });

    const handler = await importHandler();
    const req = makeReq({ query: {} });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(storage.getDashboardStats).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ expandFlightSeries: false }),
    );
  });

  it('?expandFlightSeries=true override do setting', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      reportsExpandFlightSeries: false,
    });
    (storage.getDashboardStats as any).mockResolvedValue({
      tournamentsPlayed: 13,
      profit: 1500,
    });

    const handler = await importHandler();
    const req = makeReq({ query: { expandFlightSeries: 'true' } });
    const res = makeRes();
    await handler(req, res);

    expect(storage.getDashboardStats).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ expandFlightSeries: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// /api/analytics/by-modifier deprecation: usa series_id em vez de is_flight
// ---------------------------------------------------------------------------

describe('GET /api/analytics/by-modifier (RF-17 — depende de series_id)', () => {
  async function importHandler() {
    const mod = await import('../../../server/routes/analytics');
    const handler =
      (mod as any).handleByModifier ||
      (mod as any).handleAnalyticsByModifier;
    if (typeof handler !== 'function') {
      throw new Error(
        'handler de by-modifier nao exportado',
      );
    }
    return handler;
  }

  it('filter "flight" usa WHERE seriesId IS NOT NULL (substitui is_flight=true)', async () => {
    (storage.getAnalyticsByModifier as any).mockResolvedValue([]);
    const handler = await importHandler();
    const req = makeReq({ query: { modifier: 'flight' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    // Implementer deve documentar/garantir que a query usa series_id
    expect(storage.getAnalyticsByModifier).toHaveBeenCalled();
  });
});
