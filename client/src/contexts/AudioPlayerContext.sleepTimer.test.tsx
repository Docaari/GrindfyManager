/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-NEW.3 + RF-NEW.4 + D8 + D9
 *
 * AudioPlayerContext extensions:
 *  - sleepTimerMinutes: number | null
 *  - sleepTimerRemainingSeconds: number | null
 *  - setSleepTimer(minutes): void   (agenda + ativa)
 *  - cancelSleepTimer(): void
 *  - resetSleepTimer(): void        (interno; chamado em interactions D8)
 *
 * Fire (D9): fade-out linear 5s + driver.pause + restore volume.
 * Interaction reset (D8): play/pause/seek/volume/speed/lessonPick reseta timer.
 * Autoplay NAO reseta.
 *
 * setTimeout drift-resistant: usa targetTimestamp = Date.now() + ms;
 * setInterval 30s checa Date.now() >= targetTimestamp → fire.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// IMPORTANT: padronizar todos os imports do contexto em UM unico estilo (require)
// no mesmo arquivo de teste. Misturar `await import` + `require` em Vitest 4 com
// setup TS handler gera 2 module records distintos -> 2 React.createContext()
// distintos -> Provider e useAudioPlayer no CaptureHook leriam contextos diferentes
// e o hook lancaria "must be used within Provider". Ver CLAUDE.md lesson #41.
function CaptureHook({ onCtx }: { onCtx: (ctx: any) => void }) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./AudioPlayerContext');
  const ctx = mod.useAudioPlayer();
  onCtx(ctx);
  return null;
}

function renderWithCapture() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AudioPlayerProvider } = require('./AudioPlayerContext');
  let captured: any = null;
  render(
    <AudioPlayerProvider>
      <CaptureHook onCtx={(c) => { captured = c; }} />
    </AudioPlayerProvider>,
  );
  return () => captured;
}

describe('AudioPlayerContext sleep timer state (RF-NEW.3)', () => {
  it('default: sleepTimerMinutes=null, remainingSeconds=null', async () => {
    const getCtx = await renderWithCapture();
    const ctx = getCtx();
    expect(ctx.sleepTimerMinutes).toBeNull();
    expect(ctx.sleepTimerRemainingSeconds).toBeNull();
  });

  it('setSleepTimer(30) → sleepTimerMinutes=30 + remaining=1800', async () => {
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(30); });
    const ctx = getCtx();
    expect(ctx.sleepTimerMinutes).toBe(30);
    expect(ctx.sleepTimerRemainingSeconds).toBe(30 * 60);
  });

  it('cancelSleepTimer() limpa state', async () => {
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(30); });
    act(() => { getCtx().cancelSleepTimer(); });
    expect(getCtx().sleepTimerMinutes).toBeNull();
    expect(getCtx().sleepTimerRemainingSeconds).toBeNull();
  });

  it('setSleepTimer(60) substitui timer existente (re-arm)', async () => {
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(15); });
    act(() => { getCtx().setSleepTimer(60); });
    expect(getCtx().sleepTimerMinutes).toBe(60);
    expect(getCtx().sleepTimerRemainingSeconds).toBe(60 * 60);
  });
});

describe('AudioPlayerContext sleep timer interaction reset (D8)', () => {
  it('toggle (play/pause) reseta timer', async () => {
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(15); });
    // avanca 10min — restam 5min
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });
    const before = getCtx().sleepTimerRemainingSeconds;
    expect(before).toBeLessThanOrEqual(5 * 60 + 5);
    // interacao: toggle
    act(() => { getCtx().toggle(); });
    const after = getCtx().sleepTimerRemainingSeconds;
    expect(after).toBe(15 * 60);
    vi.useRealTimers();
  });

  it('seek reseta timer', async () => {
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(15); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    act(() => { getCtx().seek(100); });
    expect(getCtx().sleepTimerRemainingSeconds).toBe(15 * 60);
    vi.useRealTimers();
  });

  it('setVolume reseta timer', async () => {
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(15); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    act(() => { getCtx().setVolume(0.5); });
    expect(getCtx().sleepTimerRemainingSeconds).toBe(15 * 60);
    vi.useRealTimers();
  });

  it('setSpeed reseta timer', async () => {
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(15); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    act(() => { getCtx().setSpeed(1.5); });
    expect(getCtx().sleepTimerRemainingSeconds).toBe(15 * 60);
    vi.useRealTimers();
  });

  it('playTrack (user picks new lesson) reseta timer', async () => {
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(15); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    act(() => {
      getCtx().playTrack({
        source: 'library',
        trackId: 'lesson-x',
        title: 'X',
        audioUrl: '/api/library/lessons/x/audio',
      });
    });
    expect(getCtx().sleepTimerRemainingSeconds).toBe(15 * 60);
    vi.useRealTimers();
  });
});

describe('AudioPlayerContext sleep timer fire (D9 + RF-NEW.4)', () => {
  it('apos minutes*60s: fade-out 5s linear (volume 1 → 0) + pause', async () => {
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setVolume(1); });
    act(() => { getCtx().setSleepTimer(15); });
    // avanca todo o timer (15min)
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60 * 1000); });
    // pos-fire, deve ter iniciado fade-out — volume cai durante 5s
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    const ctxMid = getCtx();
    expect(ctxMid.volume).toBeLessThan(1);
    expect(ctxMid.volume).toBeGreaterThan(0);
    // apos 5s totais de fade
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(getCtx().isPlaying).toBe(false);
    vi.useRealTimers();
  });

  it('apos fire: volume restaurado ao valor pre-fire (NAO persiste 0)', async () => {
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setVolume(0.7); });
    act(() => { getCtx().setSleepTimer(15); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60 * 1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    // volume restaurado
    expect(getCtx().volume).toBeCloseTo(0.7, 2);
    vi.useRealTimers();
  });

  it('fire eh driver-agnostic: chama activeDriver.pause()', async () => {
    // Como o Provider mantem <audio> HTML5 interno, validamos isPlaying=false
    // como proxy. Implementacao final pode chamar audioRef.pause direto.
    vi.useFakeTimers();
    const getCtx = await renderWithCapture();
    act(() => {
      getCtx().playTrack({
        source: 'library',
        trackId: 'l1',
        title: 'L',
        audioUrl: '/api/library/lessons/l1/audio',
      });
    });
    act(() => { getCtx().setSleepTimer(15); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60 * 1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getCtx().isPlaying).toBe(false);
    vi.useRealTimers();
  });
});

describe('AudioPlayerContext sleep timer drift resistance (RNF-05)', () => {
  it('com background tab throttle: usa Date.now() pra fire, NAO countdown puro', async () => {
    // Simula tab inativa: setSystemTime salta direto sem tick gradual.
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    const getCtx = await renderWithCapture();
    act(() => { getCtx().setSleepTimer(15); });
    // pula 16 minutos de uma vez (simula background tab throttle)
    vi.setSystemTime(start + 16 * 60 * 1000);
    // tick interno do recheck (30s interval) → deveria detectar overdue
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getCtx().isPlaying).toBe(false);
    vi.useRealTimers();
  });
});
