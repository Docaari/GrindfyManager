/**
 * Test-Writer (Modo TDD - Red Phase) — WAVE FINAL Spotify Polish
 *
 * B-PRODUCTTIER [LOW] — status deriva productTier de me.product PERSISTIDO,
 * nao hardcoded "premium".
 *
 * Bug atual (spotifyAudio.ts:605): `productTier: "premium"` cravado na resposta
 * do status.
 *
 * Contrato esperado: o handler reflete o productTier persistido na row
 * (`row.productTier`). Quando ausente (rows antigas, back-compat), cai pro
 * default "premium" (so premium chegou a conectar ate hoje).
 *
 * NOTA (test-writer -> implementer): nao ha coluna `product_tier` persistida
 * ainda; o fix completo inclui persistir `me.product` no upsert (OAuth callback)
 * + uma migration. Este teste cobre o CONTRATO de leitura do handler (reflete a
 * row). Ver resumo do test-writer (sinalizado como schema-change).
 *
 * Espelha o deps-injection de handleSpotifyListPlaylists.trackCount.test.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    query: {},
    headers: {},
    cookies: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

function storageWithRow(row: any) {
  return {
    getSpotifyToken: vi.fn(async () => row),
  };
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

const baseRow = {
  userId: 'USER-0001',
  disconnectedAt: null,
  displayName: 'Founder',
  connectedAt: new Date('2026-05-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('B-PRODUCTTIER status reflete productTier persistido', () => {
  it('row.productTier="premium" -> resposta productTier="premium"', async () => {
    const mod = await loadHandler();
    const res = makeRes();
    await mod.handleGetSpotifyStatus(
      makeReq() as any,
      res,
      storageWithRow({ ...baseRow, productTier: 'premium' }) as any,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.productTier).toBe('premium');
  });

  it('row.productTier="free" -> resposta productTier="free" (NAO hardcoded premium)', async () => {
    const mod = await loadHandler();
    const res = makeRes();
    await mod.handleGetSpotifyStatus(
      makeReq() as any,
      res,
      storageWithRow({ ...baseRow, productTier: 'free' }) as any,
    );
    expect(res.body.productTier).toBe('free');
  });

  it('row.productTier="open" -> resposta productTier="open"', async () => {
    const mod = await loadHandler();
    const res = makeRes();
    await mod.handleGetSpotifyStatus(
      makeReq() as any,
      res,
      storageWithRow({ ...baseRow, productTier: 'open' }) as any,
    );
    expect(res.body.productTier).toBe('open');
  });

  it('back-compat: row sem productTier -> default "premium"', async () => {
    const mod = await loadHandler();
    const res = makeRes();
    await mod.handleGetSpotifyStatus(
      makeReq() as any,
      res,
      storageWithRow({ ...baseRow }) as any,
    );
    expect(res.body.productTier).toBe('premium');
  });

  it('desconectado -> connected:false (regressao)', async () => {
    const mod = await loadHandler();
    const res = makeRes();
    await mod.handleGetSpotifyStatus(
      makeReq() as any,
      res,
      storageWithRow({ ...baseRow, disconnectedAt: new Date(), productTier: 'free' }) as any,
    );
    expect(res.body.connected).toBe(false);
    expect(res.body.productTier).toBeUndefined();
  });
});
