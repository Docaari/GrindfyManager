/**
 * Test — Sprint home-reform-5 item 11.
 *
 * Spec: Docs/specs/home-reform-5.md item 11.
 *
 * Cobre handlers /api/home/settings:
 *   - GET: 401 sem userId; 200 com defaults quando coluna NULL; 200 com
 *     payload merged quando coluna setada.
 *   - PATCH: 401 sem userId; 400 com shape invalido; 200 com merge
 *     persistido + payload retornado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getHomeLayoutSettings: vi.fn(),
    setHomeLayoutSettings: vi.fn(),
  },
}));

vi.mock('../../../server/routes/home', () => ({
  clearHomeOverviewCache: vi.fn(),
}));

import {
  handleGetHomeSettings,
  handlePatchHomeSettings,
} from '../../../server/routes/home-settings';
import { storage } from '../../../server/storage';
import { clearHomeOverviewCache } from '../../../server/routes/home';
import { DEFAULT_HOME_LAYOUT_SETTINGS } from '../../../shared/types/homeSettings';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k.toLowerCase()] = v;
    return res;
  };
  res.set = res.setHeader;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/home/settings', () => {
  it('401 quando userId ausente', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleGetHomeSettings(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('NULL stored -> retorna defaults', async () => {
    (storage.getHomeLayoutSettings as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await handleGetHomeSettings(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(DEFAULT_HOME_LAYOUT_SETTINGS);
  });

  it('partial stored -> mescla com defaults', async () => {
    (storage.getHomeLayoutSettings as any).mockResolvedValue({
      visibility: { news: false },
      performanceFromGrind: false,
    });
    const req = makeReq();
    const res = makeRes();
    await handleGetHomeSettings(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.visibility.news).toBe(false);
    expect(res.body.visibility.headerStrip).toBe(true);
    expect(res.body.performanceFromGrind).toBe(false);
  });

  it('storage failure -> 500', async () => {
    (storage.getHomeLayoutSettings as any).mockRejectedValue(new Error('db down'));
    const req = makeReq();
    const res = makeRes();
    await handleGetHomeSettings(req, res);
    expect(res.statusCode).toBe(500);
  });
});

describe('PATCH /api/home/settings', () => {
  it('401 quando userId ausente', async () => {
    const req = makeReq({ user: undefined, body: {} });
    const res = makeRes();
    await handlePatchHomeSettings(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('400 quando body shape invalido', async () => {
    const req = makeReq({
      body: { visibility: { unknown: true } },
    });
    const res = makeRes();
    await handlePatchHomeSettings(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando performanceFromGrind nao boolean', async () => {
    const req = makeReq({ body: { performanceFromGrind: 1 } });
    const res = makeRes();
    await handlePatchHomeSettings(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('200 + persiste merge + invalida cache home overview', async () => {
    (storage.getHomeLayoutSettings as any).mockResolvedValue(null);
    (storage.setHomeLayoutSettings as any).mockResolvedValue(undefined);
    const req = makeReq({
      body: { visibility: { news: false } },
    });
    const res = makeRes();
    await handlePatchHomeSettings(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.visibility.news).toBe(false);
    expect(res.body.visibility.headerStrip).toBe(true);
    expect(storage.setHomeLayoutSettings).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({
        visibility: expect.objectContaining({ news: false }),
        performanceFromGrind: true,
      }),
    );
    expect(clearHomeOverviewCache).toHaveBeenCalledWith('USER-0001');
  });

  it('aceita patch vazio (no-op) -> retorna defaults', async () => {
    (storage.getHomeLayoutSettings as any).mockResolvedValue(null);
    (storage.setHomeLayoutSettings as any).mockResolvedValue(undefined);
    const req = makeReq({ body: {} });
    const res = makeRes();
    await handlePatchHomeSettings(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(DEFAULT_HOME_LAYOUT_SETTINGS);
  });

  it('persiste falha -> 500', async () => {
    (storage.getHomeLayoutSettings as any).mockResolvedValue(null);
    (storage.setHomeLayoutSettings as any).mockRejectedValue(new Error('db down'));
    const req = makeReq({ body: { visibility: { news: false } } });
    const res = makeRes();
    await handlePatchHomeSettings(req, res);
    expect(res.statusCode).toBe(500);
  });
});
