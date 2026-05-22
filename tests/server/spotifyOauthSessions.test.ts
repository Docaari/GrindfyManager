/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — ADR-190 § OAuth pending sessions
 *
 * Module: server/services/spotifyOauthSessions.ts
 *
 * In-memory Map TTL 10min para state+verifier durante OAuth flow.
 * (Single-instance MVP — Redis em pos-MVP).
 *
 * Exporta:
 *  - putOauthSession(sessionId, payload): void
 *  - getOauthSession(sessionId): payload | null  (expira apos 10min)
 *  - deleteOauthSession(sessionId): void
 *  - _resetForTests(): void
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadModule() {
  return await import('../../server/services/spotifyOauthSessions');
}

beforeEach(async () => {
  const mod = await loadModule().catch(() => null);
  if (mod && typeof (mod as any)._resetForTests === 'function') {
    (mod as any)._resetForTests();
  }
  vi.useRealTimers();
});

describe('spotifyOauthSessions (ADR-190)', () => {
  it('put + get retorna payload identico', async () => {
    const mod = await loadModule();
    mod.putOauthSession('sess-1', {
      userId: 'USER-0001',
      codeVerifier: 'v'.repeat(64),
      state: 's'.repeat(32),
      createdAt: Date.now(),
    });
    const got = mod.getOauthSession('sess-1');
    expect(got).toBeTruthy();
    expect(got!.userId).toBe('USER-0001');
    expect(got!.codeVerifier.length).toBe(64);
  });

  it('get sessionId inexistente → null', async () => {
    const mod = await loadModule();
    expect(mod.getOauthSession('nope')).toBeNull();
  });

  it('TTL 10min: session expira apos 600s', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    const mod = await loadModule();
    if (typeof (mod as any)._resetForTests === 'function') (mod as any)._resetForTests();
    mod.putOauthSession('sess-2', {
      userId: 'USER-0001',
      codeVerifier: 'v'.repeat(64),
      state: 's'.repeat(32),
      createdAt: start,
    });
    expect(mod.getOauthSession('sess-2')).toBeTruthy();
    // avanca 601s
    vi.setSystemTime(start + 601 * 1000);
    expect(mod.getOauthSession('sess-2')).toBeNull();
  });

  it('delete remove session', async () => {
    const mod = await loadModule();
    mod.putOauthSession('sess-3', {
      userId: 'U',
      codeVerifier: 'v'.repeat(64),
      state: 's'.repeat(32),
      createdAt: Date.now(),
    });
    mod.deleteOauthSession('sess-3');
    expect(mod.getOauthSession('sess-3')).toBeNull();
  });
});
