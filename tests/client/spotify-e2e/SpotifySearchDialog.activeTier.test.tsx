// =============================================================================
// Test-Writer (Modo TDD - Red Phase / nao-regressao RF-08 + contrato RF-02/RF-03)
// Sprint Spotify E2E
//
// Componente alvo: client/src/components/audio-player/SpotifySearchDialog.tsx
//
// RF-08 (invariante): ELIGIBLE_TIERS inclui 'active' — assinante pago no enum
// real (trial/active/expired/admin). Sem isso, plano 'active' (founder) cai no
// caminho de tier-bloqueado (UpgradeCTA) em vez de ver o catalogo. O teste prova
// que tier='active' + conectado renderiza as TABS (Buscar/Playlists), nao a CTA
// de upgrade.
//
// RF-02 -> RF-01 (contrato): clicar num resultado de busca chama
// playTrack({ source:'spotify', trackId:'spotify:track:...' }).
//
// RF-03 (contrato): drill-in de playlist lista as tracks; tocar usa o mesmo
// caminho de RF-01.
//
// Lessons: #14/#38 (require no top-level, NAO misturar await import), #27
// (Radix Tabs onClick redundante / userEvent), #29 (QueryClientProvider).
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
  SpotifyApiError: class SpotifyApiError extends Error {
    status: number;
    constructor(opts: { status: number; message?: string }) {
      super(opts.message ?? 'err');
      this.status = opts.status;
    }
  },
}));

let mockUserTier = 'active';
let mockSpotifyConnected = true;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { userPlatformId: 'USER-0005', subscriptionPlan: mockUserTier },
    isAuthenticated: true,
    isAdmin: false,
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@/hooks/useSpotifyStatus', () => ({
  useSpotifyStatus: () => ({
    isConnected: mockSpotifyConnected,
    productTier: mockSpotifyConnected ? 'premium' : null,
    displayName: 'Founder',
    isLoading: false,
  }),
}));

const mockEmitAudioEvent = vi.fn(() => Promise.resolve());
vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: mockEmitAudioEvent,
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

const mockPlayTrack = vi.fn();
const mockAddToQueue = vi.fn(() => true);
vi.mock('@/contexts/AudioPlayerContext', () => ({
  useAudioPlayer: () => ({
    playTrack: mockPlayTrack,
    addToQueue: mockAddToQueue,
    activeTrack: null,
    activeSource: null,
    isPlaying: false,
  }),
  AudioPlayerProvider: ({ children }: any) => children,
}));

function wrap(children: React.ReactNode) {
  const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function loadDialog() {
  return require('@/components/audio-player/SpotifySearchDialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserTier = 'active';
  mockSpotifyConnected = true;
  mockSearchTracks.mockResolvedValue({ tracks: [] });
  mockListPlaylists.mockResolvedValue({
    playlists: [],
    total: 0,
    truncated: false,
  });
  mockListPlaylistTracks.mockResolvedValue({
    tracks: [],
    total: 0,
    truncated: false,
  });
});

describe('SpotifySearchDialog — tier active eh elegivel (RF-08)', () => {
  it('tier=active + conectado -> renderiza TABS (nao UpgradeCTA)', async () => {
    mockUserTier = 'active';
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));

    expect(await screen.findByTestId('tab-search')).toBeInTheDocument();
    expect(screen.getByTestId('tab-playlists')).toBeInTheDocument();
    expect(screen.queryByTestId('spotify-upgrade-cta')).toBeNull();
  });

  it('tier=free -> UpgradeCTA (nao TABS) — gate negativo continua valendo', async () => {
    mockUserTier = 'free';
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));

    expect(await screen.findByTestId('spotify-upgrade-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-search')).toBeNull();
  });
});

describe('SpotifySearchDialog — clicar resultado chama playTrack spotify (RF-02 -> RF-01)', () => {
  it('click numa search-result-row -> playTrack({source:spotify, trackId})', async () => {
    mockUserTier = 'active';
    mockSearchTracks.mockResolvedValue({
      tracks: [
        {
          trackId: 'spotify:track:abc',
          title: 'Bohemian Rhapsody',
          artists: ['Queen'],
          durationSec: 354,
          previewUrl: null,
          coverUrl: null,
          album: 'A Night at the Opera',
        },
      ],
    });
    const { SpotifySearchDialog } = loadDialog();
    render(
      wrap(
        <SpotifySearchDialog
          open={true}
          onOpenChange={() => {}}
          initialQuery="bohemian"
        />,
      ),
    );

    const row = await screen.findByTestId('search-result-row');
    fireEvent.click(row);

    await waitFor(() => {
      expect(mockPlayTrack).toHaveBeenCalled();
    });
    const arg = mockPlayTrack.mock.calls[0][0];
    expect(arg.source).toBe('spotify');
    expect(arg.trackId).toBe('spotify:track:abc');
  });
});

describe('SpotifySearchDialog — playlists drill-in (RF-03)', () => {
  it('clica playlist -> lista tracks da playlist', async () => {
    mockUserTier = 'active';
    mockListPlaylists.mockResolvedValue({
      playlists: [
        {
          playlistId: 'pl1aaaaaaaaaaaaaaaaaaaaa',
          name: 'Minha Playlist',
          trackCount: 2,
          coverUrl: null,
          ownerName: 'Founder',
          isCollaborative: false,
          isPublic: false,
        },
      ],
      total: 1,
      truncated: false,
    });
    mockListPlaylistTracks.mockResolvedValue({
      tracks: [
        {
          trackId: 'spotify:track:p1',
          title: 'Track da playlist',
          artists: ['X'],
          durationSec: 200,
          previewUrl: null,
          coverUrl: null,
          album: '',
        },
      ],
      total: 1,
      truncated: false,
    });

    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));

    // Vai pra aba Playlists (Radix: onClick redundante presente — fireEvent.click ok, lesson #27).
    fireEvent.click(await screen.findByTestId('tab-playlists'));

    const plRow = await screen.findByTestId('playlist-row');
    fireEvent.click(plRow);

    // Drill-in: tracks da playlist aparecem.
    expect(await screen.findByTestId('playlist-track-row')).toBeInTheDocument();
    // Breadcrumb de voltar disponivel.
    expect(screen.getByTestId('playlist-breadcrumb-back')).toBeInTheDocument();
  });
});
