/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-6: User settings stops routes
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-6)
 *
 * Endpoints:
 *   GET  /api/user-settings/stops
 *   PUT  /api/user-settings/stops
 *   POST /api/user-settings/stops/release (debug)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const stopServiceMock = {
  assertNotStopLocked: vi.fn(),
  evaluateStops: vi.fn(),
  getCurrentDayDeltaUsd: vi.fn(),
  releaseLock: vi.fn(),
};

vi.mock('../../../server/services/stopService', () => ({
  stopService: stopServiceMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
  },
}));

import {
  handleGetUserSettingsStops,
  handlePutUserSettingsStops,
  handlePostUserSettingsStopsRelease,
} from '../../../server/routes/auth';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({
    bankrollManagementEnabled: true,
    stopLossUsd: '300',
    stopWinUsd: '500',
    stopLockUntil: null,
    stopLockDurationHours: 12,
  });
  stopServiceMock.getCurrentDayDeltaUsd.mockResolvedValue(-50);
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
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

describe('GET /api/user-settings/stops', () => {
  it('happy path: 200 com config + currentDayDeltaUsd', async () => {
    const res = makeRes();
    await handleGetUserSettingsStops(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.stopLossUsd).toBeDefined();
    expect(res.body.currentDayDeltaUsd).toBeDefined();
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetUserSettingsStops(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('user sem stops configurados: stopLossUsd=null, stopWinUsd=null', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: null,
      stopWinUsd: null,
    });
    const res = makeRes();
    await handleGetUserSettingsStops(makeReq() as any, res);
    expect(res.body.stopLossUsd).toBeNull();
    expect(res.body.stopWinUsd).toBeNull();
  });
});

describe('PUT /api/user-settings/stops', () => {
  it('happy path: 200 atualiza valores', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(
      makeReq({
        body: { stopLossUsd: 500, stopWinUsd: 1000, stopLockDurationHours: 24 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('stopLossUsd=null desativa stop-loss', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(
      makeReq({ body: { stopLossUsd: null, stopWinUsd: 1000 } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it('stopLossUsd negativo -> 400', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(
      makeReq({ body: { stopLossUsd: -50, stopWinUsd: 100 } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('stopLockDurationHours > 72 -> 400', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(
      makeReq({
        body: { stopLossUsd: 100, stopLockDurationHours: 100 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('stopLockDurationHours < 1 -> 400', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(
      makeReq({
        body: { stopLossUsd: 100, stopLockDurationHours: 0 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/user-settings/stops/release', () => {
  it('happy path: 200 chama releaseLock', async () => {
    const res = makeRes();
    await handlePostUserSettingsStopsRelease(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(stopServiceMock.releaseLock).toHaveBeenCalledWith('USER-0001');
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostUserSettingsStopsRelease(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});
