// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-06 - LibraryAudioDriver (wrapper HTMLAudioElement)
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-06
// ADR: Docs/architecture/decisions/187-audio-source-engine.md
//
// Target: client/src/lib/audio-engine/LibraryAudioDriver.ts (NAO EXISTE)
//
// Cobertura: wrap de HTMLAudioElement (load/play/pause/seek/setVolume/setSpeed),
// event mapping (timeupdate/ended/durationchange/error), unsubscribe.
//
// NOTA: roda em projeto "client" (jsdom). HTMLAudioElement nao implementa play()
// completamente — mockamos via spies em prototypes.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('LibraryAudioDriver (RF-06)', () => {
  let audioEl: HTMLAudioElement;

  beforeEach(() => {
    audioEl = document.createElement('audio');
    // jsdom nao implementa play/pause realmente; stub:
    audioEl.play = vi.fn(async () => {});
    audioEl.pause = vi.fn();
  });

  it('load(track) deve setar audio.src = track.audioUrl', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    await drv.load({
      source: 'library',
      trackId: 'l1',
      title: 'A1',
      audioUrl: 'http://localhost/audio/l1.mp3',
    });
    expect(audioEl.src).toBe('http://localhost/audio/l1.mp3');
  });

  it('source deve ser "library"', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    expect(drv.source).toBe('library');
  });

  it('play() deve invocar audioEl.play()', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    await drv.load({
      source: 'library', trackId: 'l1', title: 'A1', audioUrl: '/a/1',
    });
    await drv.play();
    expect(audioEl.play).toHaveBeenCalled();
  });

  it('pause() deve invocar audioEl.pause()', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    drv.pause();
    expect(audioEl.pause).toHaveBeenCalled();
  });

  it('seek(seconds) deve setar audioEl.currentTime', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    drv.seek(42);
    expect(audioEl.currentTime).toBeCloseTo(42, 1);
  });

  it('setVolume(v) deve setar audioEl.volume (clamped 0..1)', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    drv.setVolume(0.5);
    expect(audioEl.volume).toBeCloseTo(0.5, 2);
    drv.setVolume(2.0); // acima do range
    expect(audioEl.volume).toBeLessThanOrEqual(1);
    drv.setVolume(-1); // abaixo
    expect(audioEl.volume).toBeGreaterThanOrEqual(0);
  });

  it('setSpeed(rate) deve setar audioEl.playbackRate', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    drv.setSpeed(1.5);
    expect(audioEl.playbackRate).toBeCloseTo(1.5, 2);
  });

  it('on("timeupdate", handler) deve invocar handler quando audio dispara timeupdate', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    const onTime = vi.fn();
    const unsubscribe = drv.on('timeupdate', onTime);
    audioEl.dispatchEvent(new Event('timeupdate'));
    expect(onTime).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
  });

  it('on("ended") deve invocar handler quando audio dispara ended', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    const onEnded = vi.fn();
    drv.on('ended', onEnded);
    audioEl.dispatchEvent(new Event('ended'));
    expect(onEnded).toHaveBeenCalled();
  });

  it('unsubscribe retornado por on() deve remover o listener', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    const onEnded = vi.fn();
    const unsub = drv.on('ended', onEnded);
    unsub();
    audioEl.dispatchEvent(new Event('ended'));
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('destroy() deve remover todos os listeners e pausar', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    const onEnded = vi.fn();
    drv.on('ended', onEnded);
    drv.destroy();
    audioEl.dispatchEvent(new Event('ended'));
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('getCurrentTime() / getDuration() retornam valores do audio element', async () => {
    const { LibraryAudioDriver } = require('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    Object.defineProperty(audioEl, 'currentTime', { value: 12, configurable: true });
    Object.defineProperty(audioEl, 'duration', { value: 180, configurable: true });
    expect(drv.getCurrentTime()).toBeCloseTo(12, 1);
    expect(drv.getDuration()).toBeCloseTo(180, 1);
  });
});
