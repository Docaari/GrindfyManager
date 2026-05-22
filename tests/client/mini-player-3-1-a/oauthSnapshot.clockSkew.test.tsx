// Sprint MP3.1 Wave A / M6 — clock-skew guard em restoreOAuthSnapshot.
// Snapshots com timestamp > Date.now() + 60s sao descartados (clock tampered
// ou cross-device sync race). Tolerancia 1min para drift normal.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SS_KEY = 'spotify_oauth_snapshot';

async function loadHelpers() {
  return await import('@/lib/spotify/oauthSnapshot');
}

describe('restoreOAuthSnapshot clock-skew (MP3.1 M6)', () => {
  beforeEach(() => {
    try { sessionStorage.clear(); } catch {}
  });
  afterEach(() => {
    try { sessionStorage.clear(); } catch {}
    vi.useRealTimers();
  });

  it('descarta snapshot com timestamp 2min no futuro', async () => {
    const { restoreOAuthSnapshot } = await loadHelpers();
    const now = Date.now();
    const futureSnap = {
      activeTrackId: 't1',
      scrollY: 100,
      queueVersion: 5,
      timestamp: now + 2 * 60 * 1000, // 2min ahead
      pathname: '/grind-live',
    };
    sessionStorage.setItem(SS_KEY, JSON.stringify(futureSnap));
    const restored = restoreOAuthSnapshot();
    expect(restored).toBeNull();
    expect(sessionStorage.getItem(SS_KEY)).toBeNull(); // cleared
  });

  it('aceita snapshot com timestamp 30s no futuro (dentro tolerancia)', async () => {
    const { restoreOAuthSnapshot } = await loadHelpers();
    const now = Date.now();
    const snap = {
      activeTrackId: 't1',
      scrollY: 100,
      queueVersion: 5,
      timestamp: now + 30 * 1000, // 30s ahead — tolerance
      pathname: '/grind-live',
    };
    sessionStorage.setItem(SS_KEY, JSON.stringify(snap));
    const restored = restoreOAuthSnapshot();
    expect(restored).not.toBeNull();
    expect(restored?.activeTrackId).toBe('t1');
  });

  it('aceita snapshot normal (timestamp passado dentro TTL)', async () => {
    const { restoreOAuthSnapshot } = await loadHelpers();
    const snap = {
      activeTrackId: 't2',
      scrollY: 0,
      queueVersion: 1,
      timestamp: Date.now() - 5000,
      pathname: '/',
    };
    sessionStorage.setItem(SS_KEY, JSON.stringify(snap));
    const restored = restoreOAuthSnapshot();
    expect(restored?.activeTrackId).toBe('t2');
  });
});
