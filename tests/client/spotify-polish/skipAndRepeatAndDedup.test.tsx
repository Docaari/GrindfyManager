/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — B-SKIP-1:
 *   ExpandedPlayerDialog passa item.id (string) p/ skipToQueueItem, NAO o idx
 *   (number). Hoje passa idx -> findIndex(-1) -> no-op (clicar "Tocar" na fila
 *   inline nao toca).
 *
 * (B-DEDUP-Q e B-SKIP-2 estao em AudioPlayerContext.spotifyPolish.test.tsx, que
 *  monta o provider REAL — aqui mockamos o context p/ injetar queueItems.)
 *
 * Lesson #28 — vi.mock por path exato. Lesson #38 — so `await import`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';

const skipSpy = vi.fn();

vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
  useLocation: () => ['/', vi.fn()],
  useRoute: () => [false, {}],
}));

vi.mock('@/contexts/AudioPlayerContext', () => ({
  useAudioPlayer: () => ({
    activeTrack: { source: 'spotify', trackId: 'spotify:track:cur', title: 'Now', coverUrl: null },
    displayMode: 'expanded',
    isPlaying: true,
    toggle: vi.fn(),
    skipBack: vi.fn(),
    skipForward: vi.fn(),
    playNext: vi.fn(),
    playPrevious: vi.fn(),
    setDisplayMode: vi.fn(),
    close: vi.fn(),
    activeSource: 'spotify',
    queueItems: [
      { id: 'queue-id-A', addedAt: 1, track: { source: 'spotify', trackId: 'spotify:track:A', title: 'Faixa A' } },
      { id: 'queue-id-B', addedAt: 2, track: { source: 'spotify', trackId: 'spotify:track:B', title: 'Faixa B' } },
    ],
    skipToQueueItem: skipSpy,
  }),
  AudioPlayerProvider: ({ children }: any) => children,
}));

beforeEach(() => {
  skipSpy.mockClear();
});

describe('ExpandedPlayerDialog skipToQueueItem usa item.id (B-SKIP-1)', () => {
  it('clicar um item da fila chama skipToQueueItem com a STRING id (nao o number idx)', async () => {
    const mod = await import('@/components/audio-player/ExpandedPlayerDialog');
    const ExpandedPlayerDialog = (mod as any).ExpandedPlayerDialog;
    render(<ExpandedPlayerDialog />);

    const queueSection = await screen.findByTestId('expanded-queue');
    const buttons = queueSection.querySelectorAll('button');
    await act(async () => {
      fireEvent.click(buttons[0]);
    });

    expect(skipSpy).toHaveBeenCalled();
    const arg = skipSpy.mock.calls[0][0];
    // Deve ser a string id do item, NAO o index numerico 0.
    expect(typeof arg).toBe('string');
    expect(arg).toBe('queue-id-A');
  });
});
