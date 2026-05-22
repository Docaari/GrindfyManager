// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-06.1 - oauthSnapshot helpers
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-06.1 + D15 + D16 + ADR-194
//
// Target: client/src/lib/spotify/oauthSnapshot.ts (NOVO)
//
// Contract (post-R1 fix wave HIGH-3 + HIGH-4):
//   - saveOAuthSnapshot(authUrl: string): void
//       Salva em sessionStorage.spotify_oauth_snapshot:
//         {
//           activeTrackId: string | null,
//           scrollY: number,
//           queueVersion: number,
//           timestamp: number,
//           pathname: string,   // HIGH-3: pathname pra redirect home pos-OAuth restore
//         }
//       HIGH-4: authUrl removido do snapshot (campo morto sem consumer).
//       authUrl continua sendo PARAMETRO da funcao (usado pelo caller pra
//       window.location.href fallback), mas NAO eh persistido no snapshot.
//       NUNCA inclui tokens, secrets ou PII.
//   - restoreOAuthSnapshot(): { scrollY: number; activeTrackId: string | null; pathname?: string } | null
//       TTL 10min. Apos restore, limpa sessionStorage.
// =============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const SS_KEY = 'spotify_oauth_snapshot';
const LS_QUEUE_KEY = 'audio.queue.v1';

async function loadHelpers() {
  const mod: any = await import('@/lib/spotify/oauthSnapshot');
  return mod;
}

describe('oauthSnapshot helpers (RF-06.1)', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem(LS_QUEUE_KEY);
    } catch {}
    // Reset scroll position.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  afterEach(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem(LS_QUEUE_KEY);
    } catch {}
    delete (window as any).__audioPlayerActiveTrackId;
  });

  // ---------------------------------------------------------------------------
  // saveOAuthSnapshot
  // ---------------------------------------------------------------------------
  it('saveOAuthSnapshot: persiste shape correto em sessionStorage', async () => {
    const { saveOAuthSnapshot } = await loadHelpers();
    Object.defineProperty(window, 'scrollY', { value: 250, configurable: true });
    (window as any).__audioPlayerActiveTrackId = 'L1';
    try {
      localStorage.setItem(LS_QUEUE_KEY, JSON.stringify({ version: 42 }));
    } catch {}

    saveOAuthSnapshot('https://accounts.spotify.com/authorize?abc');

    const raw = sessionStorage.getItem(SS_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.activeTrackId).toBe('L1');
    expect(parsed.scrollY).toBe(250);
    expect(parsed.queueVersion).toBe(42);
    expect(typeof parsed.timestamp).toBe('number');
    // HIGH-3: pathname capturado do window.location pra redirect home pos-OAuth.
    expect(typeof parsed.pathname).toBe('string');
    // HIGH-4: authUrl NAO persiste no snapshot (campo morto removido).
    expect(parsed.authUrl).toBeUndefined();
  });

  it('saveOAuthSnapshot: captura window.location.pathname (HIGH-3)', async () => {
    const { saveOAuthSnapshot } = await loadHelpers();
    // jsdom default location.pathname eh '/'. Confirma que helper le do window
    // no momento do save (NAO hardcoded).
    saveOAuthSnapshot('https://example.com');
    const parsed = JSON.parse(sessionStorage.getItem(SS_KEY)!);
    expect(parsed.pathname).toBe(window.location.pathname);
    expect(typeof parsed.pathname).toBe('string');
    expect(parsed.pathname.length).toBeGreaterThan(0);
  });

  it('saveOAuthSnapshot: queueVersion fallback 0 quando localStorage queue ausente', async () => {
    const { saveOAuthSnapshot } = await loadHelpers();
    saveOAuthSnapshot('https://example.com');
    const parsed = JSON.parse(sessionStorage.getItem(SS_KEY)!);
    expect(parsed.queueVersion).toBe(0);
  });

  it('saveOAuthSnapshot: NUNCA contem token/secret/PII', async () => {
    const { saveOAuthSnapshot } = await loadHelpers();
    // Inject possiveis sources de leak.
    (window as any).__audioPlayerActiveTrackId = 'L1';
    try {
      sessionStorage.setItem('access_token', 'AT-LEAKABLE');
      localStorage.setItem('refresh_token', 'RT-LEAKABLE');
    } catch {}
    saveOAuthSnapshot('https://example.com/foo');

    const raw = sessionStorage.getItem(SS_KEY)!;
    expect(raw).not.toContain('LEAKABLE');
    expect(raw).not.toContain('access_token');
    expect(raw).not.toContain('refresh_token');
    // Shape: somente keys whitelisted (HIGH-3 adicionou pathname, HIGH-4 removeu authUrl).
    const parsed = JSON.parse(raw);
    const allowedKeys = ['activeTrackId', 'scrollY', 'queueVersion', 'timestamp', 'pathname'];
    Object.keys(parsed).forEach((k) => {
      expect(allowedKeys).toContain(k);
    });
  });

  // ---------------------------------------------------------------------------
  // restoreOAuthSnapshot
  // ---------------------------------------------------------------------------
  it('restoreOAuthSnapshot: sem snapshot -> null', async () => {
    const { restoreOAuthSnapshot } = await loadHelpers();
    expect(restoreOAuthSnapshot()).toBeNull();
  });

  it('restoreOAuthSnapshot: snapshot fresh (<10min) -> retorna scrollY + activeTrackId', async () => {
    const { saveOAuthSnapshot, restoreOAuthSnapshot } = await loadHelpers();
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    (window as any).__audioPlayerActiveTrackId = 'L42';
    saveOAuthSnapshot('https://example.com');

    const restored = restoreOAuthSnapshot();
    expect(restored).not.toBeNull();
    expect(restored!.scrollY).toBe(500);
    expect(restored!.activeTrackId).toBe('L42');
  });

  it('restoreOAuthSnapshot: TTL 10min expirado -> null + limpa sessionStorage', async () => {
    const { restoreOAuthSnapshot } = await loadHelpers();
    const expired = {
      activeTrackId: 'L1',
      scrollY: 100,
      queueVersion: 0,
      timestamp: Date.now() - 11 * 60 * 1000, // 11min atras
      pathname: '/',
    };
    sessionStorage.setItem(SS_KEY, JSON.stringify(expired));

    const restored = restoreOAuthSnapshot();
    expect(restored).toBeNull();
    expect(sessionStorage.getItem(SS_KEY)).toBeNull();
  });

  it('restoreOAuthSnapshot: TTL borda 10min exato -> aceita ou rejeita (smoke); apos 10min1s rejeita', async () => {
    const { restoreOAuthSnapshot } = await loadHelpers();
    const borderline = {
      activeTrackId: 'L1',
      scrollY: 0,
      queueVersion: 0,
      timestamp: Date.now() - (10 * 60 * 1000 + 1000), // 10min + 1s
      pathname: '/',
    };
    sessionStorage.setItem(SS_KEY, JSON.stringify(borderline));
    expect(restoreOAuthSnapshot()).toBeNull();
  });

  it('restoreOAuthSnapshot: snapshot corrupt -> null + cleanup', async () => {
    const { restoreOAuthSnapshot } = await loadHelpers();
    sessionStorage.setItem(SS_KEY, 'not-json{');
    expect(() => restoreOAuthSnapshot()).not.toThrow();
    expect(restoreOAuthSnapshot()).toBeNull();
  });

  it('restoreOAuthSnapshot: chamada idempotente — apos restore, sessionStorage limpo (single-use)', async () => {
    const { saveOAuthSnapshot, restoreOAuthSnapshot } = await loadHelpers();
    saveOAuthSnapshot('https://example.com');
    const first = restoreOAuthSnapshot();
    expect(first).not.toBeNull();
    const second = restoreOAuthSnapshot();
    expect(second).toBeNull();
  });
});
