// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-06.1 - initiateSpotifyAuth popup blocked fallback
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-06.1 + D15 + ADR-194
//
// Target: client/src/lib/spotify/auth.ts (estende initiateSpotifyAuth)
//
// Contract:
//   - window.open retorna null -> saveOAuthSnapshot + window.location.href = authUrl
//   - popup nao-null mas .closed=true em <1.5s sem postMessage -> mesmo fallback
//   - Snapshot deve ser salvo ANTES de redirecionar (so para nao perder state)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock apiRequest para devolver authUrl deterministico.
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({ authUrl: 'https://accounts.spotify.com/authorize?abc=1' })),
}));

const SS_KEY = 'spotify_oauth_snapshot';

async function loadAuth() {
  return await import('@/lib/spotify/auth');
}

function setLocationHref(spy: any) {
  // Substitui window.location.href com setter espionavel.
  const original = window.location;
  delete (window as any).location;
  (window as any).location = {
    ...original,
    set href(v: string) {
      spy(v);
    },
    get href() {
      return original.href;
    },
    origin: original.origin,
  };
}

describe('initiateSpotifyAuth — popup blocked fallback (RF-06.1)', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {}
    vi.useRealTimers();
  });

  it('window.open retorna null -> saveOAuthSnapshot + window.location.href = authUrl', async () => {
    const { initiateSpotifyAuth } = await loadAuth();
    const hrefSpy = vi.fn();
    setLocationHref(hrefSpy);
    vi.spyOn(window, 'open').mockReturnValue(null as any);

    // O fallback NAO deve throw (e ele NAO resolve — page redirect destroi React).
    // Para o teste, capturamos via timeout curto.
    let threw: any = null;
    let resolved = false;
    void initiateSpotifyAuth()
      .then(() => {
        resolved = true;
      })
      .catch((e) => {
        threw = e;
      });
    // Yield microtask para apiRequest mock resolver + sync redirect code.
    await new Promise((r) => setTimeout(r, 50));

    // Snapshot foi salvo (shape pos HIGH-3+HIGH-4: pathname presente, authUrl ausente).
    const raw = sessionStorage.getItem(SS_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveProperty('pathname');
    expect(parsed.authUrl).toBeUndefined();
    // Redirect disparado (authUrl agora vive APENAS no window.location.href, NAO no snapshot).
    expect(hrefSpy).toHaveBeenCalledWith(
      expect.stringMatching(/accounts\.spotify\.com\/authorize/),
    );
    // NAO deve ter throw SpotifyPopupBlockedError em modo fallback automatico.
    expect(threw).toBeNull();
    expect(resolved).toBe(false); // promise pending; page redirect destroi React.
  });

  it('popup.closed=true em <1.5s sem postMessage -> fallback redirect', async () => {
    const { initiateSpotifyAuth } = await loadAuth();
    const hrefSpy = vi.fn();
    setLocationHref(hrefSpy);

    // popup nao-null mas .closed=true logo apos (Safari async-close).
    const popupMock: any = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popupMock);

    let rejectErr: any = null;
    void initiateSpotifyAuth().catch((e) => {
      rejectErr = e;
    });

    // Simula popup fechando antes do 1.5s sem postMessage.
    setTimeout(() => {
      popupMock.closed = true;
    }, 100);

    // Aguarda > 1.5s pra timeout fallback.
    await new Promise((r) => setTimeout(r, 1800));

    // Implementacao DEVE detectar closed-sem-resolved e disparar fallback
    // saveOAuthSnapshot + window.location.href = authUrl.
    const raw = sessionStorage.getItem(SS_KEY);
    expect(raw).toBeTruthy();
    expect(hrefSpy).toHaveBeenCalledWith(
      expect.stringMatching(/accounts\.spotify\.com\/authorize/),
    );
    // Aceita ambos: reject SpotifyOAuthCancelledError OU resolve via fallback
    // sem reject (page redirect path).
  });
});
