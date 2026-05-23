/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-03 — Token bucket (180 req/min/user)
 *
 * Module alvo: server/services/spotifyRateLimit.ts (NOVO)
 *
 * Exporta:
 *   - createTokenBucket(opts?): TokenBucket
 *   - TokenBucket.consume(userId): { allowed: true, remaining: number } | { allowed: false, retryAfterMs: number, remaining: 0 }
 *   - TokenBucket._resetForTests(): void
 *
 * Politica: capacity=180, refillRate=3 tokens/s (180/60), por userId.
 * Resets per-user (user A drena sem afetar user B). In-memory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadModule() {
  return await import('../../../server/services/spotifyRateLimit');
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('spotifyRateLimit token bucket (RF-03 / spec §6.1)', () => {
  it('bucket inicial: 180 tokens disponiveis', async () => {
    const mod = await loadModule();
    const bucket = (mod as any).createTokenBucket();
    const r = bucket.consume('USER-A');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(179);
  });

  it('consome 1 por request — 180 requests succeed', async () => {
    const mod = await loadModule();
    const bucket = (mod as any).createTokenBucket();
    let lastRemaining = 180;
    for (let i = 0; i < 180; i++) {
      const r = bucket.consume('USER-A');
      expect(r.allowed).toBe(true);
      lastRemaining = r.remaining;
    }
    expect(lastRemaining).toBe(0);
  });

  it('181a request denied (bucket exhausted)', async () => {
    const mod = await loadModule();
    const bucket = (mod as any).createTokenBucket();
    for (let i = 0; i < 180; i++) bucket.consume('USER-A');
    const r = bucket.consume('USER-A');
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(typeof r.retryAfterMs).toBe('number');
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('refill: apos 1s real (advanceTimers), ~3 tokens recovered', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const mod = await loadModule();
    const bucket = (mod as any).createTokenBucket();
    // drena
    for (let i = 0; i < 180; i++) bucket.consume('USER-A');
    expect(bucket.consume('USER-A').allowed).toBe(false);
    // avanca 1s — refill 3 tokens
    vi.setSystemTime(new Date('2026-01-01T00:00:01Z'));
    const r1 = bucket.consume('USER-A');
    expect(r1.allowed).toBe(true);
    const r2 = bucket.consume('USER-A');
    expect(r2.allowed).toBe(true);
    const r3 = bucket.consume('USER-A');
    expect(r3.allowed).toBe(true);
    const r4 = bucket.consume('USER-A');
    expect(r4.allowed).toBe(false); // so 3 refills em 1s
  });

  it('refill total apos 60s (180 tokens restaurados)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const mod = await loadModule();
    const bucket = (mod as any).createTokenBucket();
    for (let i = 0; i < 180; i++) bucket.consume('USER-A');
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    let allowedAfter = 0;
    for (let i = 0; i < 200; i++) {
      if (bucket.consume('USER-A').allowed) allowedAfter++;
    }
    expect(allowedAfter).toBeGreaterThanOrEqual(180);
  });

  it('bucket separado por userId (user A drena, user B intocado)', async () => {
    const mod = await loadModule();
    const bucket = (mod as any).createTokenBucket();
    for (let i = 0; i < 180; i++) bucket.consume('USER-A');
    expect(bucket.consume('USER-A').allowed).toBe(false);
    const rB = bucket.consume('USER-B');
    expect(rB.allowed).toBe(true);
    expect(rB.remaining).toBe(179);
  });

  it('opts overrides (capacity + refillPerSec) — testes custom rate', async () => {
    const mod = await loadModule();
    const bucket = (mod as any).createTokenBucket({ capacity: 5, refillPerSec: 1 });
    for (let i = 0; i < 5; i++) {
      expect(bucket.consume('USER-Z').allowed).toBe(true);
    }
    expect(bucket.consume('USER-Z').allowed).toBe(false);
  });
});
