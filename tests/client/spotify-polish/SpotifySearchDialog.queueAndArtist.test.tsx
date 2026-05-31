/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — SpotifySearchDialog:
 *   - B-QUEUE-1 (D2): semantica replace-vs-append.
 *     "Tocar tudo" / play avulso da busca / play por faixa no drill-in => clearQueue() ANTES.
 *     "Adicionar tudo" / botao "+" => ANEXAM (sem clearQueue).
 *   - B-ARTIST-1 (D8): onPlay/onAdd/onPlayAll/onAddAll passam
 *     artist = track.artists.join(", ") no objeto de playTrack/addToQueue.
 *   - D2 drill-in: cada playlist-track-row clicavel toca i + enfileira i+1..n.
 *
 * Lesson #3 — mock de useAudioPlayer com clearQueue REAL (vi.fn) capturando a
 * chamada; o resto do dialog e producao. Lesson #38 — so `await import`.
 * Lesson #28 — vi.mock por path exato (telemetria: activity-telemetry).
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
    isAdmin: mockUserTier === 'admin',
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@/hooks/useSpotifyStatus', () => ({
  useSpotifyStatus: () => ({
    isConnected: mockSpotifyConnected,
    productTier: mockSpotifyConnected ? 'premium' : null,
    displayName: 'Test User',
    isLoading: false,
  }),
  SPOTIFY_STATUS_QUERY_KEY: ['spotify-status'],
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
const mockClearQueue = vi.fn();
vi.mock('@/contexts/AudioPlayerContext', () => ({
  useAudioPlayer: () => ({
    playTrack: mockPlayTrack,
    addToQueue: mockAddToQueue,
    clearQueue: mockClearQueue,
    activeTrack: null,
    activeSource: null,
    isPlaying: false,
  }),
  AudioPlayerProvider: ({ children }: any) => children,
}));

function wrap(children: React.ReactNode) {
  const qc = new QueryClientGlobal();
  return React.createElement(QueryProviderGlobal, { client: qc }, children);
}

// QueryClient/Provider carregados via await import (lesson #38) — resolvidos no setup().
let QueryClientGlobal: any;
let QueryProviderGlobal: any;

async function setup() {
  const rq = await import('@tanstack/react-query');
  QueryClientGlobal = function () {
    return new rq.QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
  };
  QueryProviderGlobal = rq.QueryClientProvider;
  const mod = await import('@/components/audio-player/SpotifySearchDialog');
  return mod.SpotifySearchDialog;
}

function track(i: number, artists: string[] = ['Artist A', 'Artist B']) {
  return {
    trackId: `spotify:track:t${i}`,
    title: `Track ${i}`,
    artists,
    durationSec: 200,
    previewUrl: null,
    coverUrl: `https://i.scdn.co/${i}`,
    album: 'A',
  };
}

beforeEach(() => {
  mockSearchTracks.mockReset();
  mockListPlaylists.mockReset();
  mockListPlaylistTracks.mockReset();
  mockEmitAudioEvent.mockClear();
  mockPlayTrack.mockClear();
  mockAddToQueue.mockClear();
  mockClearQueue.mockClear();
  mockUserTier = 'premium';
  mockSpotifyConnected = true;
});

// ---------------------------------------------------------------------------
// B-QUEUE-1 — play avulso da busca SUBSTITUI a fila (clearQueue antes)
// ---------------------------------------------------------------------------
describe('SpotifySearchDialog busca: play SUBSTITUI, "+" ANEXA (B-QUEUE-1 / D2)', () => {
  it('click numa linha de resultado chama clearQueue ANTES de playTrack', async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [track(0)], cached: false });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="miles" />));
    const row = await screen.findByTestId('search-result-row');
    await act(async () => {
      fireEvent.click(row);
    });
    expect(mockClearQueue).toHaveBeenCalled();
    expect(mockPlayTrack).toHaveBeenCalled();
    // ordem: clearQueue antes de playTrack.
    const clearOrder = mockClearQueue.mock.invocationCallOrder[0];
    const playOrder = mockPlayTrack.mock.invocationCallOrder[0];
    expect(clearOrder).toBeLessThan(playOrder);
  });

  it('botao "+" (add) NAO chama clearQueue (anexa)', async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [track(0)], cached: false });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="miles" />));
    const addBtn = await screen.findByTestId('search-result-add-0');
    await act(async () => {
      fireEvent.click(addBtn);
    });
    expect(mockAddToQueue).toHaveBeenCalled();
    expect(mockClearQueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B-ARTIST-1 — onPlay/onAdd propagam artist = artists.join(", ")
// ---------------------------------------------------------------------------
describe('SpotifySearchDialog propaga artist (B-ARTIST-1 / D8)', () => {
  it('onPlay passa artist juntando os artists', async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [track(0, ['Miles', 'Coltrane'])], cached: false });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="miles" />));
    const row = await screen.findByTestId('search-result-row');
    await act(async () => {
      fireEvent.click(row);
    });
    const arg = mockPlayTrack.mock.calls[0][0];
    expect(arg.artist).toBe('Miles, Coltrane');
  });

  it('onAdd passa artist juntando os artists', async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [track(0, ['Miles', 'Coltrane'])], cached: false });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="miles" />));
    const addBtn = await screen.findByTestId('search-result-add-0');
    await act(async () => {
      fireEvent.click(addBtn);
    });
    const arg = mockAddToQueue.mock.calls[0][0];
    expect(arg.artist).toBe('Miles, Coltrane');
  });
});

// ---------------------------------------------------------------------------
// B-QUEUE-1 + D2 — drill-in: "Tocar tudo" substitui, "Adicionar tudo" anexa,
//                  faixa clicavel toca i + enfileira i+1..n
// ---------------------------------------------------------------------------
describe('SpotifySearchDialog playlist drill-in (B-QUEUE-1 / D2)', () => {
  async function openDrillIn(Dialog: any) {
    mockListPlaylists.mockResolvedValue({
      playlists: [{ playlistId: 'pl1', name: 'PL', trackCount: 3, coverUrl: null, ownerName: 'O', isCollaborative: false, isPublic: true }],
      total: 1,
      truncated: false,
    });
    mockListPlaylistTracks.mockResolvedValue({
      tracks: [track(1), track(2), track(3)],
      total: 3,
      truncated: false,
    });
    render(wrap(<Dialog open={true} onOpenChange={() => {}} />));
    // vai pra aba Playlists.
    const tabPlaylists = await screen.findByTestId('tab-playlists');
    await act(async () => {
      fireEvent.click(tabPlaylists);
      fireEvent.mouseDown(tabPlaylists);
    });
    const row = await screen.findByTestId('playlist-row');
    await act(async () => {
      fireEvent.click(row);
    });
    await screen.findByTestId('playlist-play-all');
  }

  it('"Tocar tudo" chama clearQueue ANTES de playTrack (substitui)', async () => {
    const Dialog = await setup();
    await openDrillIn(Dialog);
    const playAll = screen.getByTestId('playlist-play-all');
    await act(async () => {
      fireEvent.click(playAll);
    });
    await waitFor(() => expect(mockPlayTrack).toHaveBeenCalled());
    expect(mockClearQueue).toHaveBeenCalled();
    const clearOrder = mockClearQueue.mock.invocationCallOrder[0];
    const playOrder = mockPlayTrack.mock.invocationCallOrder[0];
    expect(clearOrder).toBeLessThan(playOrder);
  });

  it('"Adicionar tudo" NAO chama clearQueue (anexa)', async () => {
    const Dialog = await setup();
    await openDrillIn(Dialog);
    const addAll = screen.getByTestId('playlist-add-all');
    await act(async () => {
      fireEvent.click(addAll);
    });
    await waitFor(() => expect(mockAddToQueue).toHaveBeenCalled());
    expect(mockClearQueue).not.toHaveBeenCalled();
  });

  it('clicar a faixa i do drill-in: clearQueue + playTrack(i) + enfileira i+1..n', async () => {
    const Dialog = await setup();
    await openDrillIn(Dialog);
    const rows = screen.getAllByTestId('playlist-track-row');
    expect(rows.length).toBe(3);
    // clica a 2a faixa (index 1).
    await act(async () => {
      fireEvent.click(rows[1]);
    });
    await waitFor(() => expect(mockPlayTrack).toHaveBeenCalled());
    expect(mockClearQueue).toHaveBeenCalled();
    // playTrack foi com a faixa index 1 (track t2).
    const playedArg = mockPlayTrack.mock.calls[0][0];
    expect(playedArg.trackId).toBe('spotify:track:t2');
    // enfileirou a faixa seguinte (t3), NAO a anterior (t1).
    const queued = mockAddToQueue.mock.calls.map((c: any[]) => c[0].trackId);
    expect(queued).toContain('spotify:track:t3');
    expect(queued).not.toContain('spotify:track:t1');
  });

  it('"Tocar tudo" propaga artist da primeira faixa', async () => {
    const Dialog = await setup();
    await openDrillIn(Dialog);
    const playAll = screen.getByTestId('playlist-play-all');
    await act(async () => {
      fireEvent.click(playAll);
    });
    await waitFor(() => expect(mockPlayTrack).toHaveBeenCalled());
    expect(mockPlayTrack.mock.calls[0][0].artist).toBe('Artist A, Artist B');
  });
});
