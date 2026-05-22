/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.1 / RF-01.4
 *
 * Module: client/src/lib/spotify/auth.ts
 *
 * Exporta (client-side; refresh_token NUNCA chega aqui — ADR-190):
 *  - initiateSpotifyAuth(): Promise<{ accessToken; expiresIn; displayName; productTier }>
 *    Abre popup OAuth, escuta postMessage, resolve com tokens (refresh_token fica no server).
 *  - refreshAccessToken(): Promise<{ accessToken; expiresIn }>
 *    Chama POST /api/audio/spotify/refresh (cookie httpOnly carrega session).
 *  - disconnectSpotify(): Promise<void>
 *    Chama POST /api/audio/spotify/disconnect.
 *  - generatePkceVerifier(): string  (helper interno exportado p/ teste)
 *  - generatePkceChallenge(verifier): Promise<string>
 *  - SpotifyPremiumRequiredError class extends Error
 *  - SpotifyOAuthCancelledError class
 *  - SpotifyPopupBlockedError class
 *
 * Comportamento auth flow:
 *  1. apiRequest('POST', '/api/audio/spotify/oauth-init') → { authUrl, state }
 *  2. window.open(authUrl, 'spotify-auth', '...') → popup
 *  3. window.addEventListener('message', cb): cb valida event.origin === window.location.origin
 *     - event.data.type === 'spotify-oauth-success' → resolve com tokens
 *     - event.data.type === 'spotify-oauth-premium-required' → reject SpotifyPremiumRequiredError
 *  4. popup === null → reject SpotifyPopupBlockedError
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadModule() {
  return await import('./auth');
}

describe('spotify/auth.generatePkceVerifier (RF-01.1)', () => {
  it('verifier tem 43-128 chars (RFC 7636)', async () => {
    const mod = await loadModule();
    const v = mod.generatePkceVerifier();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it('verifier usa apenas charset URL-safe (A-Z a-z 0-9 - . _ ~)', async () => {
    const mod = await loadModule();
    const v = mod.generatePkceVerifier();
    expect(/^[A-Za-z0-9._~-]+$/.test(v)).toBe(true);
  });

  it('2 chamadas → verifiers distintos', async () => {
    const mod = await loadModule();
    expect(mod.generatePkceVerifier()).not.toBe(mod.generatePkceVerifier());
  });
});

describe('spotify/auth.generatePkceChallenge (RF-01.1)', () => {
  it('challenge eh SHA-256 base64url do verifier (len=43)', async () => {
    const mod = await loadModule();
    const verifier = 'A'.repeat(64);
    const challenge = await mod.generatePkceChallenge(verifier);
    expect(typeof challenge).toBe('string');
    expect(challenge.length).toBe(43);
    // base64url charset
    expect(/^[A-Za-z0-9_-]+$/.test(challenge)).toBe(true);
  });
});

describe('spotify/auth.initiateSpotifyAuth (RF-01.1)', () => {
  function stubPopup(opener: any) {
    const popup = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
    };
    (globalThis as any).window.open = vi.fn(() => popup);
    return popup;
  }

  it('popup blocked (window.open retorna null) → throw SpotifyPopupBlockedError', async () => {
    apiRequestMock.mockResolvedValueOnce({
      authUrl: 'https://accounts.spotify.com/authorize?...',
      state: 'abc',
    });
    (globalThis as any).window.open = vi.fn(() => null);

    const mod = await loadModule();
    await expect(mod.initiateSpotifyAuth()).rejects.toBeInstanceOf(mod.SpotifyPopupBlockedError);
  });

  it('postMessage spotify-oauth-success → resolve com tokens', async () => {
    apiRequestMock.mockResolvedValueOnce({
      authUrl: 'https://accounts.spotify.com/authorize?...',
      state: 'abc',
    });
    stubPopup(window);

    const mod = await loadModule();
    const promise = mod.initiateSpotifyAuth();

    // Dispara postMessage do "popup" (mesmo origin)
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

    const result = await promise;
    expect(result.accessToken).toBe('access_abc');
    expect(result.expiresIn).toBe(3600);
    expect(result.displayName).toBe('Test User');
  });

  it('postMessage spotify-oauth-premium-required → reject SpotifyPremiumRequiredError', async () => {
    apiRequestMock.mockResolvedValueOnce({
      authUrl: 'https://accounts.spotify.com/authorize?...',
      state: 'abc',
    });
    stubPopup(window);

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

    await expect(promise).rejects.toBeInstanceOf(mod.SpotifyPremiumRequiredError);
  });

  it('postMessage com origin diferente → ignora (security)', async () => {
    apiRequestMock.mockResolvedValueOnce({
      authUrl: 'https://accounts.spotify.com/authorize?...',
      state: 'abc',
    });
    stubPopup(window);

    vi.useFakeTimers();
    const mod = await loadModule();
    const promise = mod.initiateSpotifyAuth();

    // Mensagem maliciosa de origin externa
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example.com',
        data: { type: 'spotify-oauth-success', accessToken: 'leak' },
      }),
    );

    // Avanca tempo — promise NAO resolve com a mensagem evil
    vi.advanceTimersByTime(1000);

    // Resolve com mensagem legit em seguida
    queueMicrotask(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'spotify-oauth-success',
            accessToken: 'real',
            expiresIn: 3600,
            displayName: 'X',
            productTier: 'premium',
          },
        }),
      );
    });
    vi.useRealTimers();

    const result = await promise;
    expect(result.accessToken).toBe('real');
    expect(result.accessToken).not.toBe('leak');
  });
});

describe('spotify/auth.refreshAccessToken (RF-01.4)', () => {
  it('POST /api/audio/spotify/refresh → retorna { accessToken, expiresIn }', async () => {
    apiRequestMock.mockResolvedValueOnce({
      accessToken: 'NEW_access',
      expiresIn: 3600,
    });
    const mod = await loadModule();
    const out = await mod.refreshAccessToken();
    expect(out.accessToken).toBe('NEW_access');
    expect(out.expiresIn).toBe(3600);
    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/audio/spotify/refresh');
  });

  it('endpoint 401 (session expirou) → throw', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('401'));
    const mod = await loadModule();
    await expect(mod.refreshAccessToken()).rejects.toThrow();
  });
});

describe('spotify/auth.disconnectSpotify (RF-01.6)', () => {
  it('POST /api/audio/spotify/disconnect → resolve void', async () => {
    apiRequestMock.mockResolvedValueOnce(undefined);
    const mod = await loadModule();
    await expect(mod.disconnectSpotify()).resolves.toBeUndefined();
    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/audio/spotify/disconnect');
  });
});

describe('spotify/auth error classes', () => {
  it('SpotifyPremiumRequiredError tem displayName + nome correto', async () => {
    const mod = await loadModule();
    const err = new mod.SpotifyPremiumRequiredError('Joe', 'joe@x.com');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpotifyPremiumRequiredError');
    expect(err.displayName).toBe('Joe');
  });

  it('SpotifyPopupBlockedError eh subclasse Error', async () => {
    const mod = await loadModule();
    const err = new mod.SpotifyPopupBlockedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpotifyPopupBlockedError');
  });
});
