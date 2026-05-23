/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-03 — helper requireSpotifyAccess
 *
 * Module alvo: server/services/spotifyAccess.ts (NOVO)
 *
 * Exporta:
 *   - requireSpotifyAccess(userId, deps): Promise<{ accessToken: string }>
 *   - class SpotifyAccessError extends Error { reason: 'not_connected'|'tier_blocked'|'invalid_refresh'|'refresh_network'|'config_missing' }
 *
 * Comportamento:
 *   - access_token valido (expires_at > now + 60s) → return direto.
 *   - expirado (<60s) → refresh chamado, encrypt new refresh_token se rotacionado, save, return novo access.
 *   - refresh invalid_grant → throw SpotifyAccessError('invalid_refresh') + cleanup (markSpotifyDisconnected).
 *   - refresh network throw → throw SpotifyAccessError('refresh_network'). NAO marca disconnect.
 *   - SPOTIFY_CLIENT_ID/SECRET ausentes → throw SpotifyAccessError('config_missing').
 *
 * Lesson #34 — deps injetadas (storage, fetchFn, tokenCrypto). Lesson #36 —
 * service nao importa @shared/schema no topo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

async function loadModule() {
  return await import('../../../server/services/spotifyAccess');
}

function makeStorageStub(rowOverrides: any = {}) {
  return {
    getSpotifyToken: vi.fn(async () => ({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'ENC_CIPHER',
      refreshTokenIv: 'ENC_IV',
      refreshTokenAuthTag: 'ENC_TAG',
      accessTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: ['streaming'],
      disconnectedAt: null,
      displayName: 'X',
      spotifyUserId: 'sp_1',
      refreshFailureCount: 0,
      ...rowOverrides,
    })),
    markSpotifyDisconnected: vi.fn(async () => {}),
    incrementRefreshFailureCount: vi.fn(async () => 1),
    updateRefreshSuccess: vi.fn(async () => {}),
    upsertSpotifyToken: vi.fn(async () => {}),
  };
}

const tokenCryptoStub = {
  decryptRefreshToken: vi.fn(() => 'REFRESH_PLAIN'),
  encryptRefreshToken: vi.fn((rt: string) => ({
    ciphertext: `enc(${rt})`,
    iv: 'iv2',
    authTag: 'tag2',
  })),
};

// In-memory access_token cache (helper pode usar para evitar refresh dupla):
// O helper deve resolver access via Spotify refresh quando expirado; o teste
// nao depende de cache aqui.

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'cid_test';
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
  tokenCryptoStub.decryptRefreshToken.mockReturnValue('REFRESH_PLAIN');
});

describe('requireSpotifyAccess (RF-03)', () => {
  it('access valido (expira em 1h) → retorna sem chamar refresh', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    expect(typeof requireSpotifyAccess).toBe('function');

    const storage = makeStorageStub();
    const fetchFn = vi.fn();
    // O helper NAO tem access_token plaintext armazenado — entao a unica forma
    // de "valido sem refresh" eh quando o helper opta por refresh-on-demand
    // SEMPRE (porque so guardamos hash). O contrato real: se expiresAt no
    // futuro + ja existir access_token em memoria de processo (cache), nao
    // refresca. Test verifica que a CHAMADA passa cache opcional.
    const accessCache = { get: vi.fn(() => 'CACHED_ACCESS'), set: vi.fn(), invalidate: vi.fn() };
    const result = await requireSpotifyAccess('USER-0001', {
      storage,
      fetchFn,
      tokenCrypto: tokenCryptoStub,
      accessCache,
    });
    expect(result.accessToken).toBe('CACHED_ACCESS');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('expirado (<60s) → refresh chamado + retorna novo access', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    const storage = makeStorageStub({ expiresAt: new Date(Date.now() - 10_000) });
    const accessCache = { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'NEW_ACCESS',
        expires_in: 3600,
        // sem refresh_token novo (rotation opcional)
      }),
      headers: { get: () => null },
    }));
    const result = await requireSpotifyAccess('USER-0001', {
      storage,
      fetchFn,
      tokenCrypto: tokenCryptoStub,
      accessCache,
    });
    expect(result.accessToken).toBe('NEW_ACCESS');
    expect(fetchFn).toHaveBeenCalled();
    const callUrl = String(fetchFn.mock.calls[0][0]);
    expect(callUrl).toContain('accounts.spotify.com/api/token');
    expect(storage.updateRefreshSuccess).toHaveBeenCalled();
    expect(accessCache.set).toHaveBeenCalled();
  });

  it('refresh rotacionado: encrypt novo refresh_token + save', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    const storage = makeStorageStub({ expiresAt: new Date(Date.now() - 10_000) });
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'NEW_ACCESS',
        expires_in: 3600,
        refresh_token: 'ROTATED_REFRESH',
      }),
      headers: { get: () => null },
    }));
    await requireSpotifyAccess('USER-0001', {
      storage,
      fetchFn,
      tokenCrypto: tokenCryptoStub,
      accessCache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(tokenCryptoStub.encryptRefreshToken).toHaveBeenCalledWith('ROTATED_REFRESH');
    expect(storage.upsertSpotifyToken).toHaveBeenCalled();
  });

  it('invalid_grant → throw SpotifyAccessError reason=invalid_refresh + markSpotifyDisconnected', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    const SpotifyAccessError = (mod as any).SpotifyAccessError;
    expect(typeof SpotifyAccessError).toBe('function');

    const storage = makeStorageStub({ expiresAt: new Date(Date.now() - 10_000) });
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
      headers: { get: () => null },
    }));
    let thrown: any = null;
    try {
      await requireSpotifyAccess('USER-0001', {
        storage,
        fetchFn,
        tokenCrypto: tokenCryptoStub,
        accessCache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('invalid_refresh');
    expect(storage.markSpotifyDisconnected).toHaveBeenCalled();
  });

  it('network throw no refresh → SpotifyAccessError reason=refresh_network (NAO marca disconnect)', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    const storage = makeStorageStub({ expiresAt: new Date(Date.now() - 10_000) });
    const fetchFn = vi.fn(async () => { throw new Error('ETIMEDOUT'); });
    let thrown: any = null;
    try {
      await requireSpotifyAccess('USER-0001', {
        storage,
        fetchFn,
        tokenCrypto: tokenCryptoStub,
        accessCache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('refresh_network');
    expect(storage.markSpotifyDisconnected).not.toHaveBeenCalled();
  });

  it('SPOTIFY_CLIENT_ID ausente → SpotifyAccessError reason=config_missing', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    delete process.env.SPOTIFY_CLIENT_ID;
    const storage = makeStorageStub({ expiresAt: new Date(Date.now() - 10_000) });
    let thrown: any = null;
    try {
      await requireSpotifyAccess('USER-0001', {
        storage,
        fetchFn: vi.fn(),
        tokenCrypto: tokenCryptoStub,
        accessCache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('config_missing');
    process.env.SPOTIFY_CLIENT_ID = 'cid_test';
  });

  it('row null → SpotifyAccessError reason=not_connected', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    const storage = makeStorageStub();
    storage.getSpotifyToken.mockResolvedValueOnce(null);
    let thrown: any = null;
    try {
      await requireSpotifyAccess('USER-0001', {
        storage,
        fetchFn: vi.fn(),
        tokenCrypto: tokenCryptoStub,
        accessCache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('not_connected');
  });

  it('disconnectedAt setado → SpotifyAccessError reason=not_connected', async () => {
    const mod = await loadModule();
    const requireSpotifyAccess = (mod as any).requireSpotifyAccess;
    const storage = makeStorageStub({ disconnectedAt: new Date() });
    let thrown: any = null;
    try {
      await requireSpotifyAccess('USER-0001', {
        storage,
        fetchFn: vi.fn(),
        tokenCrypto: tokenCryptoStub,
        accessCache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('not_connected');
  });
});
