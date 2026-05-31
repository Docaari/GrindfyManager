// =============================================================================
// Test-Writer (Modo TDD - Red Phase / RF-04 + nao-regressao RF-08)
// Sprint Spotify E2E
//
// Componente alvo: client/src/components/audio-player/EmptyStateCTA.tsx
//
// RF-04: ao conectar com sucesso, o componente invalida ["spotify-status"]
// (singleton queryClient, lesson #29) E propaga o token via connectSpotify.
//
// RF-08 (invariante): quando isSpotifyConnected, o botao "Conectar Spotify"
// some e aparece "Buscar no Spotify" — sem reload (gate via context).
//
// Lessons: #14/#38 (require top-level), #29 (singleton queryClient).
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

const { initiateSpotifyAuthMock, invalidateQueriesMock } = vi.hoisted(() => ({
  initiateSpotifyAuthMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}));

class FakePremiumError extends Error {
  constructor() {
    super('premium');
    this.name = 'SpotifyPremiumRequiredError';
  }
}

vi.mock('@/lib/spotify/auth', () => ({
  initiateSpotifyAuth: initiateSpotifyAuthMock,
  SpotifyPremiumRequiredError: FakePremiumError,
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: invalidateQueriesMock },
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
}));

// Context mock — controla isSpotifyConnected + captura connectSpotify.
let mockIsSpotifyConnected = false;
const mockConnectSpotify = vi.fn();
vi.mock('@/contexts/AudioPlayerContext', () => ({
  useAudioPlayer: () => ({
    isSpotifyConnected: mockIsSpotifyConnected,
    activeSource: null,
    activeTrack: null,
    connectSpotify: mockConnectSpotify,
  }),
  AudioPlayerProvider: ({ children }: any) => children,
}));

function loadCTA() {
  return require('@/components/audio-player/EmptyStateCTA');
}

function invalidatedSpotifyStatus(): boolean {
  return invalidateQueriesMock.mock.calls.some((c) => {
    const arg = c[0];
    const key = Array.isArray(arg) ? arg : arg?.queryKey;
    return Array.isArray(key) && key[0] === 'spotify-status';
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSpotifyConnected = false;
  initiateSpotifyAuthMock.mockReset();
  invalidateQueriesMock.mockReset();
  mockConnectSpotify.mockReset();
});

describe('EmptyStateCTA — connect sucesso invalida ["spotify-status"] (RF-04)', () => {
  it('connect resolve -> invalida ["spotify-status"] + connectSpotify(token)', async () => {
    initiateSpotifyAuthMock.mockResolvedValueOnce({
      accessToken: 'ACCESS_X',
      expiresIn: 3600,
      displayName: 'Founder',
    });
    const { EmptyStateCTA } = loadCTA();
    render(<EmptyStateCTA />);

    fireEvent.click(screen.getByTestId('mini-player-empty-spotify-connect'));

    await waitFor(() => {
      expect(invalidatedSpotifyStatus()).toBe(true);
    });
    expect(mockConnectSpotify).toHaveBeenCalledWith('ACCESS_X', 3600, 'Founder');
  });

  it('usa o singleton queryClient (lesson #29) — invalidateQueriesMock chamado', async () => {
    initiateSpotifyAuthMock.mockResolvedValueOnce({
      accessToken: 'A',
      expiresIn: 3600,
      displayName: 'X',
    });
    const { EmptyStateCTA } = loadCTA();
    render(<EmptyStateCTA />);
    fireEvent.click(screen.getByTestId('mini-player-empty-spotify-connect'));
    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalled();
    });
  });
});

describe('EmptyStateCTA — gate connect->search sem reload (RF-08)', () => {
  it('desconectado -> mostra botao "Conectar Spotify"', () => {
    mockIsSpotifyConnected = false;
    const { EmptyStateCTA } = loadCTA();
    render(<EmptyStateCTA />);
    expect(
      screen.getByTestId('mini-player-empty-spotify-connect'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mini-player-empty-spotify-search')).toBeNull();
  });

  it('conectado -> mostra botao "Buscar no Spotify" (connect some)', () => {
    mockIsSpotifyConnected = true;
    const { EmptyStateCTA } = loadCTA();
    render(<EmptyStateCTA />);
    expect(
      screen.getByTestId('mini-player-empty-spotify-search'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mini-player-empty-spotify-connect')).toBeNull();
  });
});
