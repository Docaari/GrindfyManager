/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify E2E — RF-04 (connect -> conectado sem reload).
 *
 * Module: client/src/lib/spotify/auth.ts
 *
 * Contrato NOVO: no SUCESSO do connect (postMessage `spotify-oauth-success` OU
 * `resolveViaStatusFallback` retornando sucesso), o fluxo deve invalidar
 * `queryClient.invalidateQueries({ queryKey: ["spotify-status"] })` EXATAMENTE
 * uma vez, para que `useSpotifyStatus` (staleTime ~60s) refaca o fetch e o gate
 * visual convirja para "conectado" sem F5.
 *
 * Hoje `auth.ts` NAO importa/usa `queryClient` no caminho de sucesso (so os
 * componentes invalidam). Esta spec centraliza a invalidacao no `auth.ts`.
 *
 * RED esperado: invalidateQueriesMock nao e chamado (auth.ts ainda nao invalida).
 *
 * Lesson #29: usa o singleton `queryClient` (mockado), NAO `useQueryClient`.
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

async function loadModule() {
  return await import('@/lib/spotify/auth');
}

function stubPopup() {
  const popup = { closed: false, close: vi.fn(), focus: vi.fn() };
  (globalThis as any).window.open = vi.fn(() => popup);
  return popup;
}

function invalidatedSpotifyStatus(): boolean {
  return invalidateQueriesMock.mock.calls.some((c) => {
    const arg = c[0];
    const key = Array.isArray(arg) ? arg : arg?.queryKey;
    return Array.isArray(key) && key[0] === 'spotify-status';
  });
}

describe('initiateSpotifyAuth — invalida ["spotify-status"] no sucesso (RF-04)', () => {
  it('postMessage spotify-oauth-success -> invalida ["spotify-status"]', async () => {
    apiRequestMock.mockResolvedValueOnce({
      authUrl: 'https://accounts.spotify.com/authorize?...',
      state: 'abc',
    });
    stubPopup();

    const mod = await loadModule();
    const promise = mod.initiateSpotifyAuth();
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'spotify-oauth-success',
            accessToken: 'access_abc',
            expiresIn: 3600,
            displayName: 'Test User',
            productTier: 'premium',
          },
        }),
      );
    }, 0);

    await promise;
    expect(invalidatedSpotifyStatus()).toBe(true);
  });

  it('invalida ["spotify-status"] EXATAMENTE uma vez por connect bem-sucedido', async () => {
    apiRequestMock.mockResolvedValueOnce({
      authUrl: 'https://accounts.spotify.com/authorize?...',
      state: 'abc',
    });
    stubPopup();

    const mod = await loadModule();
    const promise = mod.initiateSpotifyAuth();
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'spotify-oauth-success',
            accessToken: 'a',
            expiresIn: 3600,
            displayName: 'X',
            productTier: 'premium',
          },
        }),
      );
    }, 0);

    await promise;
    const count = invalidateQueriesMock.mock.calls.filter((c) => {
      const arg = c[0];
      const key = Array.isArray(arg) ? arg : arg?.queryKey;
      return Array.isArray(key) && key[0] === 'spotify-status';
    }).length;
    expect(count).toBe(1);
  });

  it('premium-required NAO invalida ["spotify-status"] (nao conectou)', async () => {
    apiRequestMock.mockResolvedValueOnce({
      authUrl: 'https://accounts.spotify.com/authorize?...',
      state: 'abc',
    });
    stubPopup();

    const mod = await loadModule();
    const promise = mod.initiateSpotifyAuth();
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'spotify-oauth-premium-required',
            displayName: 'Free Joe',
          },
        }),
      );
    }, 0);

    await expect(promise).rejects.toBeInstanceOf(
      mod.SpotifyPremiumRequiredError,
    );
    expect(invalidatedSpotifyStatus()).toBe(false);
  });
});

describe('resolveViaStatusFallback — invalida ["spotify-status"] no sucesso (RF-04)', () => {
  it('status connected + refresh ok -> retorna success E invalida ["spotify-status"]', async () => {
    // 1o fetch: /status -> connected.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connected: true,
        displayName: 'Founder',
        productTier: 'premium',
      }),
    });
    (globalThis as any).fetch = fetchMock;
    // apiRequest('POST', '/refresh', ..., { silentMode }) -> access token.
    apiRequestMock.mockResolvedValueOnce({
      accessToken: 'ACCESS_X',
      expiresIn: 3600,
    });

    const mod = await loadModule();
    const out = await mod.resolveViaStatusFallback();
    expect(out?.accessToken).toBe('ACCESS_X');
    expect(invalidatedSpotifyStatus()).toBe(true);
  });

  it('status NAO connected -> retorna null E NAO invalida', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connected: false }),
    });
    (globalThis as any).fetch = fetchMock;

    const mod = await loadModule();
    const out = await mod.resolveViaStatusFallback();
    expect(out).toBeNull();
    expect(invalidatedSpotifyStatus()).toBe(false);
  });
});
