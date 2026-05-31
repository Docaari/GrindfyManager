/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — SpotifySearchDialog estados + a11y:
 *   - B-PLCOUNT-1 (RF-01, client render): card de playlist NAO mostra "0 tracks"
 *     quando trackCount === null (omite); mostra "Sem faixas" p/ 0; "{n} faixas"
 *     p/ >0; sem string "tracks" em ingles.
 *   - B-PLERR-1 (RF-02): PlaylistsPanel trata erro: 401->ReconnectCTA,
 *     429->RateLimitBanner, generico-> bloco PT-BR + botao retry (refetch).
 *     NAO mostra "Voce nao tem playlists" mentiroso em erro.
 *   - B-SEARCH-ERR (RF-04): busca trata erro generico (500) -> bloco PT-BR +
 *     retry (NAO "Nenhum resultado").
 *   - B-A11Y-DIALOG (RF-05): DialogPrimitive.Content tem Description (sr-only).
 *
 * Lesson #38 — so `await import`. Lesson #28 — telemetria path exato.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import React from 'react';

const mockSearchTracks = vi.fn();
const mockListPlaylists = vi.fn();
const mockListPlaylistTracks = vi.fn();

vi.mock('@/lib/audio-engine/spotifyApiClient', () => ({
  searchTracks: mockSearchTracks,
  listPlaylists: mockListPlaylists,
  listPlaylistTracks: mockListPlaylistTracks,
  spotifyKeys: {
    search: (q: string) => ['spotify', 'search', q],
    playlists: () => ['spotify', 'playlists'],
    playlistTracks: (id: string) => ['spotify', 'playlist', id, 'tracks'],
  },
}));

let mockUserTier = 'premium';
let mockSpotifyConnected = true;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { userPlatformId: 'USER-0001', subscriptionPlan: mockUserTier },
    isAuthenticated: true,
    isAdmin: false,
  }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock('@/hooks/useSpotifyStatus', () => ({
  useSpotifyStatus: () => ({
    isConnected: mockSpotifyConnected,
    productTier: 'premium',
    displayName: 'Test User',
    isLoading: false,
  }),
  SPOTIFY_STATUS_QUERY_KEY: ['spotify-status'],
}));
vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/contexts/AudioPlayerContext', () => ({
  useAudioPlayer: () => ({
    playTrack: vi.fn(),
    addToQueue: vi.fn(() => true),
    clearQueue: vi.fn(),
    activeTrack: null,
    activeSource: null,
    isPlaying: false,
  }),
  AudioPlayerProvider: ({ children }: any) => children,
}));

let RQ: any;
async function setup() {
  RQ = await import('@tanstack/react-query');
  const mod = await import('@/components/audio-player/SpotifySearchDialog');
  return mod.SpotifySearchDialog;
}
function wrap(children: React.ReactNode) {
  const qc = new RQ.QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return React.createElement(RQ.QueryClientProvider, { client: qc }, children);
}

function apiError(status: number) {
  const e: any = new Error(`HTTP ${status}`);
  e.status = status;
  e.name = 'SpotifyApiError';
  return e;
}

async function gotoPlaylists() {
  const tab = await screen.findByTestId('tab-playlists');
  await act(async () => {
    fireEvent.click(tab);
    fireEvent.mouseDown(tab);
  });
}

beforeEach(() => {
  mockSearchTracks.mockReset();
  mockListPlaylists.mockReset();
  mockListPlaylistTracks.mockReset();
  mockUserTier = 'premium';
  mockSpotifyConnected = true;
});

// ---------------------------------------------------------------------------
// B-PLCOUNT-1 (client render) — count omitido / PT-BR
// ---------------------------------------------------------------------------
describe('PlaylistsPanel count render (B-PLCOUNT-1 / RF-01)', () => {
  function plRow(trackCount: number | null) {
    return {
      playlists: [{ playlistId: 'pl1', name: 'Minha Playlist', trackCount, coverUrl: null, ownerName: 'O', isCollaborative: false, isPublic: true }],
      total: 1,
      truncated: false,
    };
  }

  it('trackCount === null -> NAO mostra count ("tracks"/"faixas"/"null") — omite a linha', async () => {
    mockListPlaylists.mockResolvedValue(plRow(null));
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    await gotoPlaylists();
    const row = await screen.findByTestId('playlist-row');
    const txt = (row.textContent ?? '').toLowerCase();
    // count desconhecido => linha omitida: sem "tracks", sem "faixas", sem "null".
    expect(txt).not.toContain('tracks');
    expect(txt).not.toContain('faixas');
    expect(txt).not.toContain('null');
    // o nome da playlist ainda aparece (nao quebrou o card).
    expect(txt).toContain('minha playlist');
  });

  it('trackCount === 0 -> "Sem faixas"', async () => {
    mockListPlaylists.mockResolvedValue(plRow(0));
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    await gotoPlaylists();
    await screen.findByTestId('playlist-row');
    expect(screen.getByText(/sem faixas/i)).toBeInTheDocument();
  });

  it('trackCount === 25 -> "25 faixas" (PT-BR, nao "tracks")', async () => {
    mockListPlaylists.mockResolvedValue(plRow(25));
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    await gotoPlaylists();
    await screen.findByTestId('playlist-row');
    expect(screen.getByText(/25 faixas/i)).toBeInTheDocument();
    expect(screen.queryByText(/25 tracks/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B-PLERR-1 — erro na lista de playlists (nao mentir "sem playlists")
// ---------------------------------------------------------------------------
describe('PlaylistsPanel error states (B-PLERR-1 / RF-02)', () => {
  it('erro generico (500) -> bloco PT-BR + botao retry (NAO "Voce nao tem playlists")', async () => {
    mockListPlaylists.mockRejectedValue(apiError(500));
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    await gotoPlaylists();
    await waitFor(() => {
      expect(screen.getByTestId('playlist-list-retry')).toBeInTheDocument();
    });
    expect(screen.queryByText(/voce nao tem playlists/i)).toBeNull();
  });

  it('botao retry da lista chama refetch (nova request)', async () => {
    mockListPlaylists.mockRejectedValue(apiError(500));
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    await gotoPlaylists();
    const retry = await screen.findByTestId('playlist-list-retry');
    mockListPlaylists.mockResolvedValueOnce({ playlists: [], total: 0, truncated: false });
    const before = mockListPlaylists.mock.calls.length;
    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => {
      expect(mockListPlaylists.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('401 na lista -> ReconnectCTA (nao bloco generico)', async () => {
    mockListPlaylists.mockRejectedValue(apiError(401));
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    await gotoPlaylists();
    await waitFor(() => {
      expect(screen.getByTestId('spotify-reconnect-cta')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// B-SEARCH-ERR — erro generico na busca (500) -> bloco + retry
// ---------------------------------------------------------------------------
describe('SearchPanel error generico (B-SEARCH-ERR / RF-04)', () => {
  it('erro 500 na busca -> bloco PT-BR + botao retry (NAO "Nenhum resultado")', async () => {
    mockSearchTracks.mockRejectedValue(apiError(500));
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="miles" />));
    await waitFor(() => {
      expect(screen.getByTestId('spotify-search-retry')).toBeInTheDocument();
    });
    expect(screen.queryByText(/nenhum resultado/i)).toBeNull();
  });

  it('busca 0 resultados -> empty state (spotify-search-empty), NAO bloco de erro', async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [], cached: false });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="miles" />));
    await waitFor(() => {
      expect(screen.getByTestId('spotify-search-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('spotify-search-retry')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B-A11Y-DIALOG — Description sr-only no DialogPrimitive.Content
// ---------------------------------------------------------------------------
describe('SpotifySearchDialog a11y Description (B-A11Y-DIALOG / RF-05)', () => {
  it('Content tem aria-describedby apontando p/ um elemento presente no DOM', async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [], cached: false });
    const Dialog = await setup();
    const { baseElement } = render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    await screen.findByTestId('tab-search');
    const content = baseElement.querySelector('[role="dialog"]');
    expect(content).toBeTruthy();
    const describedBy = content?.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const descEl = baseElement.querySelector(`#${CSS.escape(describedBy as string)}`);
    expect(descEl).toBeTruthy();
  });
});
