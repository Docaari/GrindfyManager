// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-07 - LibraryAudioDriver.destroy() libera recurso
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-07
//
// Target: client/src/lib/audio-engine/LibraryAudioDriver.ts (existe, refactor)
//
// Cobertura:
//   - destroy() chama audioEl.pause()
//   - destroy() chama audioEl.removeAttribute('src') OU seta src = '' (libera buffer)
//   - destroy() chama audioEl.load() (cancela pending requests)
//   - destroy() pode ser chamado duas vezes sem crash (idempotente)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('LibraryAudioDriver.destroy (RF-07)', () => {
  let audioEl: HTMLAudioElement;
  let pauseSpy: ReturnType<typeof vi.fn>;
  let loadSpy: ReturnType<typeof vi.fn>;
  let removeAttrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    audioEl = document.createElement('audio');
    audioEl.src = 'http://localhost/audio/l1.mp3';

    pauseSpy = vi.fn();
    audioEl.pause = pauseSpy;

    // jsdom nao tem audio.load() implementado; stub:
    loadSpy = vi.fn();
    (audioEl as any).load = loadSpy;

    removeAttrSpy = vi.spyOn(audioEl, 'removeAttribute');
  });

  it('destroy() pausa o audio antes de liberar recurso', async () => {
    const { LibraryAudioDriver } = await import('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    drv.destroy();
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('destroy() libera audioEl.src (removeAttribute ou empty string)', async () => {
    const { LibraryAudioDriver } = await import('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    drv.destroy();

    // Aceita uma das duas estrategias canonicas: removeAttribute('src')
    // OU audioEl.src = '' (resultado equivalente — src "vazio" no DOM).
    const removeAttrCalledWithSrc =
      removeAttrSpy.mock.calls.some((args) => args[0] === 'src');
    const srcCleared = !audioEl.src || audioEl.src === '' || audioEl.src === window.location.href;

    expect(removeAttrCalledWithSrc || srcCleared).toBe(true);
  });

  it('destroy() chama audioEl.load() para cancelar pending requests', async () => {
    const { LibraryAudioDriver } = await import('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    drv.destroy();
    expect(loadSpy).toHaveBeenCalled();
  });

  it('destroy() chamado 2x e idempotente (sem crash)', async () => {
    const { LibraryAudioDriver } = await import('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    expect(() => {
      drv.destroy();
      drv.destroy();
    }).not.toThrow();
  });

  it('destroy() ainda remove listeners (regressao MP1)', async () => {
    const { LibraryAudioDriver } = await import('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);
    const onEnded = vi.fn();
    drv.on('ended', onEnded);
    drv.destroy();
    audioEl.dispatchEvent(new Event('ended'));
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('destroy() chama pause ANTES de cleanup (ordem importa)', async () => {
    const { LibraryAudioDriver } = await import('@/lib/audio-engine/LibraryAudioDriver');
    const drv = new LibraryAudioDriver(audioEl);

    const callOrder: string[] = [];
    audioEl.pause = vi.fn(() => callOrder.push('pause'));
    (audioEl as any).load = vi.fn(() => callOrder.push('load'));
    removeAttrSpy.mockRestore();
    vi.spyOn(audioEl, 'removeAttribute').mockImplementation((name: string) => {
      callOrder.push(`removeAttribute:${name}`);
    });

    drv.destroy();

    // pause deve ser primeiro
    expect(callOrder[0]).toBe('pause');
    // load deve aparecer apos pause
    const loadIdx = callOrder.indexOf('load');
    const pauseIdx = callOrder.indexOf('pause');
    expect(loadIdx).toBeGreaterThan(pauseIdx);
  });
});
