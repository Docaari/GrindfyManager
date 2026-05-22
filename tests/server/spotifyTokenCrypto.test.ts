/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — ADR-190 § Encryption details
 *
 * Module: server/services/spotifyTokenCrypto.ts
 *
 * Exporta:
 *  - encryptRefreshToken(plaintext: string): { ciphertext: string; iv: string; authTag: string }
 *  - decryptRefreshToken(row: { refreshTokenEncrypted, refreshTokenIv, refreshTokenAuthTag }): string
 *
 * Algoritmo: AES-256-GCM (Node crypto stdlib).
 * Key: hex 64 chars (32 bytes) em env var SPOTIFY_TOKEN_ENCRYPTION_KEY.
 * IV: 12 bytes random POR token.
 * Auth tag: 16 bytes (autenticidade).
 */

import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  // Key estavel pra testes determinares de roundtrip
  process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
});

async function loadModule() {
  return await import('../../server/services/spotifyTokenCrypto');
}

describe('spotifyTokenCrypto (ADR-190)', () => {
  it('encrypt + decrypt = identidade (roundtrip)', async () => {
    const mod = await loadModule();
    const plain = 'AQDxKdRwTkVl_long_refresh_token_xyz_1234567890';
    const enc = mod.encryptRefreshToken(plain);
    expect(enc.ciphertext).toBeTruthy();
    expect(enc.iv).toBeTruthy();
    expect(enc.authTag).toBeTruthy();
    const decrypted = mod.decryptRefreshToken({
      refreshTokenEncrypted: enc.ciphertext,
      refreshTokenIv: enc.iv,
      refreshTokenAuthTag: enc.authTag,
    });
    expect(decrypted).toBe(plain);
  });

  it('encrypt 2x do mesmo plaintext → IVs diferentes', async () => {
    const mod = await loadModule();
    const plain = 'same-token';
    const a = mod.encryptRefreshToken(plain);
    const b = mod.encryptRefreshToken(plain);
    expect(a.iv).not.toBe(b.iv);
    // ciphertext deve ser diferente tambem (mesmo plain, IV != → ciphertext !=)
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('decrypt com auth tag adulterada → throw (integrity check falha)', async () => {
    const mod = await loadModule();
    const plain = 'refresh_token_value';
    const enc = mod.encryptRefreshToken(plain);
    expect(() =>
      mod.decryptRefreshToken({
        refreshTokenEncrypted: enc.ciphertext,
        refreshTokenIv: enc.iv,
        refreshTokenAuthTag: '00'.repeat(16),
      }),
    ).toThrow();
  });

  it('decrypt com IV adulterado → throw', async () => {
    const mod = await loadModule();
    const enc = mod.encryptRefreshToken('plain');
    expect(() =>
      mod.decryptRefreshToken({
        refreshTokenEncrypted: enc.ciphertext,
        refreshTokenIv: '00'.repeat(12),
        refreshTokenAuthTag: enc.authTag,
      }),
    ).toThrow();
  });

  it('boot fail: SPOTIFY_TOKEN_ENCRYPTION_KEY ausente → encryptRefreshToken throw', async () => {
    delete process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
    const mod = await loadModule();
    expect(() => mod.encryptRefreshToken('x')).toThrow(/SPOTIFY_TOKEN_ENCRYPTION_KEY/);
  });

  it('boot fail: key com tamanho errado → throw', async () => {
    process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = 'a'.repeat(10); // nao eh 32 bytes hex
    const mod = await loadModule();
    expect(() => mod.encryptRefreshToken('x')).toThrow();
  });

  it('ciphertext eh base64-safe (NAO contem caracteres de URL/header conflict)', async () => {
    const mod = await loadModule();
    const enc = mod.encryptRefreshToken('plain-token-12345');
    expect(/^[A-Za-z0-9+/=_-]+$/.test(enc.ciphertext)).toBe(true);
  });
});
