/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — D7 (status reconciliation):
 *   - B-DISCONNECT-SYNC: disconnectSpotify() (auth.ts) deve invalidar
 *     ["spotify-status"] DENTRO do helper (hoje so faz o POST; caller invalida).
 *   - B-PANEL-401: fetcher de status unificado e resiliente — exportar
 *     `fetchSpotifyStatus` de useSpotifyStatus.ts. 401 retorna {connected:false}
 *     (NAO desloga; usa fetch, nao apiRequest).
 *
 * Lesson #29: singleton queryClient mockado (NAO useQueryClient).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiRequestMock, invalidateQueriesMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: invalidateQueriesMock },
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function invalidatedSpotifyStatus(): boolean {
  return invalidateQueriesMock.mock.calls.some((c) => {
    const arg = c[0];
    const key = Array.isArray(arg) ? arg : arg?.queryKey;
    return Array.isArray(key) && key[0] === 'spotify-status';
  });
}

// ---------------------------------------------------------------------------
// B-DISCONNECT-SYNC — disconnectSpotify invalida status no helper
// ---------------------------------------------------------------------------
describe('disconnectSpotify invalida ["spotify-status"] (B-DISCONNECT-SYNC / D7)', () => {
  it('apos POST de disconnect, invalida ["spotify-status"]', async () => {
    apiRequestMock.mockResolvedValueOnce({ ok: true });
    const mod = await import('@/lib/spotify/auth');
    await mod.disconnectSpotify();
    expect(invalidatedSpotifyStatus()).toBe(true);
  });

  it('chama o POST /disconnect ANTES de invalidar (ordem)', async () => {
    const order: string[] = [];
    apiRequestMock.mockImplementationOnce(async () => {
      order.push('post');
      return { ok: true };
    });
    invalidateQueriesMock.mockImplementation(() => {
      order.push('invalidate');
    });
    const mod = await import('@/lib/spotify/auth');
    await mod.disconnectSpotify();
    expect(order[0]).toBe('post');
    expect(order).toContain('invalidate');
  });
});

// ---------------------------------------------------------------------------
// B-PANEL-401 — fetchSpotifyStatus SSoT resiliente (exportado)
// ---------------------------------------------------------------------------
describe('fetchSpotifyStatus resiliente (B-PANEL-401 / D7)', () => {
  it('exporta fetchSpotifyStatus de useSpotifyStatus.ts', async () => {
    const mod = await import('@/hooks/useSpotifyStatus');
    expect(typeof (mod as any).fetchSpotifyStatus).toBe('function');
  });

  it('200 connected -> retorna o payload', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true, productTier: 'premium', displayName: 'F' }),
    });
    const mod = await import('@/hooks/useSpotifyStatus');
    const out = await (mod as any).fetchSpotifyStatus();
    expect(out.connected).toBe(true);
  });

  it('401 -> retorna {connected:false} (NAO desloga; usa fetch resiliente)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    (globalThis as any).fetch = fetchMock;
    const mod = await import('@/hooks/useSpotifyStatus');
    const out = await (mod as any).fetchSpotifyStatus();
    expect(out).toEqual({ connected: false });
    // resiliencia: usa fetch, nunca apiRequest (que dispara logout global).
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('usa o mesmo SPOTIFY_STATUS_QUERY_KEY exportado (paridade hook+painel)', async () => {
    const mod = await import('@/hooks/useSpotifyStatus');
    expect(mod.SPOTIFY_STATUS_QUERY_KEY[0]).toBe('spotify-status');
  });
});
