/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-03 — Cache store TTL 5min
 *
 * Module alvo: server/services/spotifyCatalogCache.ts (NOVO)
 *
 * Exporta:
 *   - createCatalogCache(opts?): CatalogCache
 *   - CatalogCache.get(userId, endpoint, query): any | null
 *   - CatalogCache.set(userId, endpoint, query, value): void
 *   - CatalogCache.invalidate(userId): void   (limpa todas keys do user)
 *   - CatalogCache._resetForTests(): void
 *
 * Politica: TTL 5min default. Key composta (userId, endpoint, queryHash).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadModule() {
  return await import('../../../server/services/spotifyCatalogCache');
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('spotifyCatalogCache (RF-03)', () => {
  it('set + get retorna valor identico (mesmo userId, endpoint, query)', async () => {
    const mod = await loadModule();
    const cache = (mod as any).createCatalogCache();
    cache.set('USER-A', 'search', { q: 'lofi', limit: 20 }, { tracks: [{ id: 1 }] });
    const got = cache.get('USER-A', 'search', { q: 'lofi', limit: 20 });
    expect(got).toBeTruthy();
    expect(got.tracks[0].id).toBe(1);
  });

  it('get retorna null para key diferente (q distinto)', async () => {
    const mod = await loadModule();
    const cache = (mod as any).createCatalogCache();
    cache.set('USER-A', 'search', { q: 'lofi' }, { tracks: [] });
    expect(cache.get('USER-A', 'search', { q: 'jazz' })).toBeNull();
  });

  it('get retorna null para userId diferente (isolamento per-user)', async () => {
    const mod = await loadModule();
    const cache = (mod as any).createCatalogCache();
    cache.set('USER-A', 'search', { q: 'lofi' }, { tracks: [] });
    expect(cache.get('USER-B', 'search', { q: 'lofi' })).toBeNull();
  });

  it('expira automaticamente apos TTL 5min', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const mod = await loadModule();
    const cache = (mod as any).createCatalogCache();
    cache.set('USER-A', 'playlists', { limit: 50 }, { items: [{ id: 'p1' }] });
    expect(cache.get('USER-A', 'playlists', { limit: 50 })).toBeTruthy();
    // avanca 4min 59s — ainda valido
    vi.setSystemTime(new Date('2026-01-01T00:04:59Z'));
    expect(cache.get('USER-A', 'playlists', { limit: 50 })).toBeTruthy();
    // avanca pra 5min 1s — expirado
    vi.setSystemTime(new Date('2026-01-01T00:05:01Z'));
    expect(cache.get('USER-A', 'playlists', { limit: 50 })).toBeNull();
  });

  it('invalidate(userId) limpa todas keys daquele user', async () => {
    const mod = await loadModule();
    const cache = (mod as any).createCatalogCache();
    cache.set('USER-A', 'search', { q: 'a' }, { x: 1 });
    cache.set('USER-A', 'playlists', { limit: 50 }, { y: 2 });
    cache.set('USER-B', 'search', { q: 'a' }, { z: 3 });
    cache.invalidate('USER-A');
    expect(cache.get('USER-A', 'search', { q: 'a' })).toBeNull();
    expect(cache.get('USER-A', 'playlists', { limit: 50 })).toBeNull();
    // user B intocado
    expect(cache.get('USER-B', 'search', { q: 'a' })).toBeTruthy();
  });

  it('key sensivel a ordem de query (semantica: shape consistente)', async () => {
    const mod = await loadModule();
    const cache = (mod as any).createCatalogCache();
    cache.set('USER-A', 'search', { q: 'lofi', limit: 20 }, { v: 1 });
    // Mesmo query (ordem irrelevante mas mesma identidade semantica) bate.
    const got = cache.get('USER-A', 'search', { limit: 20, q: 'lofi' });
    expect(got).toBeTruthy();
  });

  it('opts.ttlMs override (TTL custom)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const mod = await loadModule();
    const cache = (mod as any).createCatalogCache({ ttlMs: 60_000 }); // 1min
    cache.set('USER-A', 'search', { q: 'x' }, { v: 1 });
    vi.setSystemTime(new Date('2026-01-01T00:00:59Z'));
    expect(cache.get('USER-A', 'search', { q: 'x' })).toBeTruthy();
    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'));
    expect(cache.get('USER-A', 'search', { q: 'x' })).toBeNull();
  });
});
