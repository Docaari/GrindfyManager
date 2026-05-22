// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-11 - useMiniPlayerHeight hook
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-11
// ADR: 188 - Mini Player CSS variable --mini-player-height
//
// Target: client/src/hooks/useMiniPlayerHeight.ts (NAO EXISTE)
//
// Tabela esperada:
//   hidden, qualquer viewport -> 0
//   bar/expanded, mobile <768 -> 64
//   bar/expanded, tablet 768-1023 -> 72
//   bar/expanded, desktop >=1024 -> 80
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

function loadModules() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/contexts/AudioPlayerContext'),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/hooks/useMiniPlayerHeight'),
  };
}

function mockViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  (window as any).matchMedia = (query: string) => {
    let matches = false;
    if (/min-width:\s*1024/.test(query)) matches = width >= 1024;
    else if (/min-width:\s*768/.test(query)) matches = width >= 768;
    else if (/max-width:\s*1023/.test(query)) matches = width <= 1023;
    else if (/max-width:\s*767/.test(query)) matches = width <= 767;
    return {
      matches, media: query,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    };
  };
}

function Probe() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useMiniPlayerHeight } = require('@/hooks/useMiniPlayerHeight');
  const ctx = useAudioPlayer();
  const h = useMiniPlayerHeight();
  return (
    <>
      <button
        data-testid="seed"
        onClick={() => ctx.playTrack({ source: 'library', trackId: 'a', title: 'A', audioUrl: '/a' })}
      >
        seed
      </button>
      <button data-testid="close" onClick={() => ctx.close()}>close</button>
      <span data-testid="height">{String(h)}</span>
    </>
  );
}

beforeEach(() => {
  try {
    localStorage.removeItem('library:audio:volume');
  } catch {}
});

describe('useMiniPlayerHeight (RF-11)', () => {
  it('retorna 0 quando displayMode === "hidden" (desktop)', () => {
    mockViewport(1280);
    const { AudioPlayerProvider } = loadModules();
    render(<AudioPlayerProvider><Probe /></AudioPlayerProvider>);
    expect(screen.getByTestId('height').textContent).toBe('0');
  });

  it('retorna 80 em desktop >=1024 quando track ativa', async () => {
    mockViewport(1280);
    const { AudioPlayerProvider } = loadModules();
    render(<AudioPlayerProvider><Probe /></AudioPlayerProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('height').textContent).toBe('80');
  });

  it('retorna 72 em tablet 768-1023 quando track ativa', async () => {
    mockViewport(900);
    const { AudioPlayerProvider } = loadModules();
    render(<AudioPlayerProvider><Probe /></AudioPlayerProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('height').textContent).toBe('72');
  });

  it('retorna 64 em mobile <768 quando track ativa', async () => {
    mockViewport(360);
    const { AudioPlayerProvider } = loadModules();
    render(<AudioPlayerProvider><Probe /></AudioPlayerProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('height').textContent).toBe('64');
  });

  it('retorna 0 apos close() (displayMode -> hidden)', async () => {
    mockViewport(1280);
    const { AudioPlayerProvider } = loadModules();
    render(<AudioPlayerProvider><Probe /></AudioPlayerProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    await user.click(screen.getByTestId('close'));
    expect(screen.getByTestId('height').textContent).toBe('0');
  });
});
