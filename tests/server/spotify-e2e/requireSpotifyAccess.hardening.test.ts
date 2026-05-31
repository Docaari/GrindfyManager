/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify E2E — RF-07 (hardening do requireSpotifyAccess / GOTCHA).
 *
 * Module: server/services/spotifyAccess.ts
 *
 * Contrato NOVO (ADR-220 D6): no catch do decrypt, DISTINGUIR:
 *   - Erro de PROGRAMACAO (dep ausente -> `tokenCrypto.decryptRefreshToken` e
 *     undefined -> TypeError "is not a function" / "Cannot read properties of
 *     undefined") -> lanca erro de config claro (SpotifyAccessError
 *     reason='config_missing') e NAO chama markSpotifyDisconnected. NUNCA
 *     desconecta o usuario por bug de chamada (scripts de diagnostico
 *     desconectavam o founder a cada run).
 *   - CORRUPCAO REAL do ciphertext (decrypt lanca erro NAO-TypeError, ex.
 *     "Unsupported state or unable to authenticate data" do AES-GCM) ->
 *     comportamento preservado: markSpotifyDisconnected + invalid_refresh.
 *
 * RED esperado:
 *   - Hoje QUALQUER throw no decrypt cai no mesmo catch -> sempre marca
 *     disconnect. O teste de "dep ausente" espera NAO marcar disconnect (falha).
 *
 * Lessons #34/#36 — deps injetadas, service nao importa @shared/schema no topo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

async function loadModule() {
  return await import('../../../server/services/spotifyAccess');
}

function makeStorageStub(rowOverrides: any = {}) {
  return {
    getSpotifyToken: vi.fn(async () => ({
      userId: 'USER-0005',
      refreshTokenEncrypted: 'ENC_CIPHER',
      refreshTokenIv: 'ENC_IV',
      refreshTokenAuthTag: 'ENC_TAG',
      accessTokenHash: 'hash',
      expiresAt: new Date(Date.now() - 10_000), // expirado -> for refresh path
      scopes: ['streaming'],
      disconnectedAt: null,
      displayName: 'Founder',
      spotifyUserId: 'sp_5',
      refreshFailureCount: 0,
      ...rowOverrides,
    })),
    markSpotifyDisconnected: vi.fn(async () => {}),
    incrementRefreshFailureCount: vi.fn(async () => 1),
    updateRefreshSuccess: vi.fn(async () => {}),
    upsertSpotifyToken: vi.fn(async () => {}),
  };
}

const accessCacheStub = () => ({
  get: vi.fn(() => null),
  set: vi.fn(),
  invalidate: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'cid_test';
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
});

describe('requireSpotifyAccess — dep tokenCrypto ausente NAO desconecta (RF-07)', () => {
  it('tokenCrypto undefined -> erro de config E markSpotifyDisconnected NAO chamado', async () => {
    const mod = await loadModule();
    const storage = makeStorageStub();
    let thrown: any = null;
    try {
      await (mod as any).requireSpotifyAccess('USER-0005', {
        storage,
        fetchFn: vi.fn(),
        // tokenCrypto AUSENTE (de proposito — simula GOTCHA do script de diag).
        tokenCrypto: undefined,
        accessCache: accessCacheStub(),
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    // NAO pode marcar disconnect por erro de programacao.
    expect(storage.markSpotifyDisconnected).not.toHaveBeenCalled();
  });

  it('tokenCrypto.decryptRefreshToken undefined (objeto parcial) -> NAO desconecta', async () => {
    const mod = await loadModule();
    const storage = makeStorageStub();
    let thrown: any = null;
    try {
      await (mod as any).requireSpotifyAccess('USER-0005', {
        storage,
        fetchFn: vi.fn(),
        // objeto presente mas SEM o metodo -> chamada vira TypeError.
        tokenCrypto: {} as any,
        accessCache: accessCacheStub(),
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(storage.markSpotifyDisconnected).not.toHaveBeenCalled();
  });

  it('reason do erro de config distingue de invalid_refresh', async () => {
    const mod = await loadModule();
    const storage = makeStorageStub();
    let thrown: any = null;
    try {
      await (mod as any).requireSpotifyAccess('USER-0005', {
        storage,
        fetchFn: vi.fn(),
        tokenCrypto: {} as any,
        accessCache: accessCacheStub(),
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    // erro de programacao NAO deve ser reportado como invalid_refresh.
    expect(thrown.reason).not.toBe('invalid_refresh');
    // config_missing (ou outro reason de config) — distinto de corrupcao real.
    expect(['config_missing']).toContain(thrown.reason);
  });
});

describe('requireSpotifyAccess — corrupcao REAL do ciphertext PRESERVA disconnect (RF-07)', () => {
  // Fix-wave RF-07 (refinado): TypeError NAO eh sempre erro de programacao. O
  // AES-256-GCM do Node lanca TypeError para IV/auth-tag com tamanho invalido
  // (corrupcao REAL) — esse caso DEVE desconectar, ao contrario do TypeError de
  // dep ausente ("is not a function").
  it('decrypt lanca TypeError de IV invalido (Invalid initialization vector) -> markSpotifyDisconnected + invalid_refresh', async () => {
    const mod = await loadModule();
    const storage = makeStorageStub();
    const tokenCrypto = {
      decryptRefreshToken: vi.fn(() => {
        throw new TypeError('Invalid initialization vector');
      }),
      encryptRefreshToken: vi.fn(),
    };
    let thrown: any = null;
    try {
      await (mod as any).requireSpotifyAccess('USER-0005', {
        storage,
        fetchFn: vi.fn(),
        tokenCrypto,
        accessCache: accessCacheStub(),
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('invalid_refresh');
    expect(storage.markSpotifyDisconnected).toHaveBeenCalled();
  });

  it('decrypt lanca TypeError de auth tag invalida -> markSpotifyDisconnected + invalid_refresh', async () => {
    const mod = await loadModule();
    const storage = makeStorageStub();
    const tokenCrypto = {
      decryptRefreshToken: vi.fn(() => {
        throw new TypeError('Invalid authentication tag length: 12');
      }),
      encryptRefreshToken: vi.fn(),
    };
    let thrown: any = null;
    try {
      await (mod as any).requireSpotifyAccess('USER-0005', {
        storage,
        fetchFn: vi.fn(),
        tokenCrypto,
        accessCache: accessCacheStub(),
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('invalid_refresh');
    expect(storage.markSpotifyDisconnected).toHaveBeenCalled();
  });

  it('decrypt lanca erro NAO-TypeError (AES-GCM auth fail) -> markSpotifyDisconnected + invalid_refresh', async () => {
    const mod = await loadModule();
    const storage = makeStorageStub();
    const tokenCrypto = {
      decryptRefreshToken: vi.fn(() => {
        // Erro tipico de ciphertext corrompido (NAO TypeError).
        throw new Error('Unsupported state or unable to authenticate data');
      }),
      encryptRefreshToken: vi.fn(),
    };
    let thrown: any = null;
    try {
      await (mod as any).requireSpotifyAccess('USER-0005', {
        storage,
        fetchFn: vi.fn(),
        tokenCrypto,
        accessCache: accessCacheStub(),
      });
    } catch (e: any) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.reason).toBe('invalid_refresh');
    expect(storage.markSpotifyDisconnected).toHaveBeenCalled();
  });
});
