/**
 * Test-Writer (Modo TDD - Red Phase) — WAVE FINAL Spotify Polish
 *
 * B-PREVIEW-IDX [MED] — SpotifySearchDialog rastreia o preview por trackId
 *   (nao por index). Trocar a query reseta o preview.
 *   Bug atual: `activePreviewIdx: number` + `result.data.tracks[idx]` -> ao
 *   trocar a busca, o index aponta pra outra faixa (preview errado / stale).
 *
 * B-DURATION-0 [LOW] — render OCULTA a duracao quando 0/ausente (sem "0:00").
 *   Bug atual: formatDuration(0) === "0:00" sempre renderiza.
 *
 * Harness espelha tests/client/spotify-polish/SpotifySearchDialog.statesAndA11y.
 * Lesson #38 — so `await import`. Lesson #3 — shapes reais de SearchTracksResponse.
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'premium' },
    isAuthenticated: true,
    isAdmin: false,
  }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock('@/hooks/useSpotifyStatus', () => ({
  useSpotifyStatus: () => ({
    isConnected: true,
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

function track(id: string, opts: { durationSec?: number; previewUrl?: string | null } = {}) {
  return {
    trackId: `spotify:track:${id}`,
    title: `Title ${id}`,
    artists: ['Artist'],
    durationSec: opts.durationSec ?? 120,
    previewUrl: opts.previewUrl === undefined ? `https://p.scdn.co/mp3/${id}` : opts.previewUrl,
    coverUrl: null,
    album: 'Album',
  };
}

beforeEach(() => {
  mockSearchTracks.mockReset();
  mockListPlaylists.mockReset();
  mockListPlaylistTracks.mockReset();
});

// ---------------------------------------------------------------------------
// B-PREVIEW-IDX — preview por trackId
// ---------------------------------------------------------------------------
describe('B-PREVIEW-IDX preview rastreado por trackId', () => {
  it('clicar preview da faixa expoe o trackId no audio (data-preview-track-id)', async () => {
    mockSearchTracks.mockResolvedValue({
      tracks: [track('alpha'), track('beta')],
      cached: false,
    });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="jazz" />));

    const btn = await screen.findByTestId('search-result-preview-1');
    await act(async () => {
      fireEvent.click(btn);
    });

    const audio = await screen.findByTestId('spotify-preview-audio');
    // o preview deve estar amarrado ao trackId da faixa 'beta' (index 1),
    // nao a um index solto.
    expect(audio.getAttribute('data-preview-track-id')).toBe('spotify:track:beta');
  });

  it('trocar a query reseta o preview (audio some)', async () => {
    mockSearchTracks.mockResolvedValue({
      tracks: [track('alpha'), track('beta')],
      cached: false,
    });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="jazz" />));

    const btn = await screen.findByTestId('search-result-preview-0');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(await screen.findByTestId('spotify-preview-audio')).toBeInTheDocument();

    // troca a query -> nova busca -> preview deve resetar.
    const input = screen.getByTestId('spotify-search-input') as HTMLInputElement;
    mockSearchTracks.mockResolvedValue({
      tracks: [track('gamma'), track('delta')],
      cached: false,
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'rock blues' } });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('spotify-preview-audio')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// B-DURATION-0 — oculta "0:00"
// ---------------------------------------------------------------------------
describe('B-DURATION-0 oculta duracao ausente/zero', () => {
  it('faixa com durationSec=0 NAO renderiza "0:00"', async () => {
    mockSearchTracks.mockResolvedValue({
      tracks: [track('zero', { durationSec: 0 })],
      cached: false,
    });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="jazz" />));

    const row = await screen.findByTestId('search-result-row');
    expect((row.textContent ?? '')).not.toContain('0:00');
  });

  it('faixa com durationSec>0 renderiza a duracao normalmente (regressao)', async () => {
    mockSearchTracks.mockResolvedValue({
      tracks: [track('ok', { durationSec: 125 })],
      cached: false,
    });
    const Dialog = await setup();
    render(wrap(<Dialog open={true} onOpenChange={() => {}} initialQuery="jazz" />));

    const row = await screen.findByTestId('search-result-row');
    expect(row.textContent ?? '').toContain('2:05');
  });
});
