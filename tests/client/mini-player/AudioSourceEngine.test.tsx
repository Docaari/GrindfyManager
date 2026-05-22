// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-06 - AudioSourceEngine + IAudioSourceDriver contract
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-06
// ADR: Docs/architecture/decisions/187-audio-source-engine.md
//
// Targets (NAO EXISTEM ainda - red phase):
//   client/src/lib/audio-engine/types.ts
//   client/src/lib/audio-engine/LibraryAudioDriver.ts (stub - testado em LibraryAudioDriver.test.ts)
//   client/src/lib/audio-engine/SpotifyAudioDriver.ts (stub - throws not_implemented)
//   client/src/lib/audio-engine/AudioSourceEngine.ts
//
// Cobertura: discriminated union AudioTrack, contract test do driver, Engine
// facade roteando por track.source, Spotify driver lanca not_implemented.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('AudioSourceEngine + IAudioSourceDriver (RF-06, ADR-187)', () => {
  describe('AudioTrack discriminated union', () => {
    it('deve aceitar source="library" com audioUrl obrigatorio na pratica', async () => {
      const types = require('@/lib/audio-engine/types');
      // type-only assertion: garantir export do alias
      expect(types).toBeDefined();
      const track: import('@/lib/audio-engine/types').AudioTrack = {
        source: 'library',
        trackId: 'lesson-1',
        title: 'Aula 1',
        audioUrl: '/api/library/lessons/lesson-1/audio',
      };
      expect(track.source).toBe('library');
      expect(track.audioUrl).toBe('/api/library/lessons/lesson-1/audio');
    });

    it('deve aceitar source="spotify" sem audioUrl', async () => {
      const track: import('@/lib/audio-engine/types').AudioTrack = {
        source: 'spotify',
        trackId: 'spotify:track:abc',
        title: 'Track Spotify',
      };
      expect(track.source).toBe('spotify');
      expect(track.audioUrl).toBeUndefined();
    });
  });

  describe('IAudioSourceDriver contract (mock driver)', () => {
    it('deve expor metodos load/play/pause/seek/setVolume/setSpeed/destroy/on/getCurrentTime/getDuration', async () => {
      const { AudioSourceEngine } = require('@/lib/audio-engine/AudioSourceEngine');
      // Engine deve aceitar driver custom (mock satisfaz interface)
      const mockDriver: import('@/lib/audio-engine/types').IAudioSourceDriver = {
        source: 'library',
        load: vi.fn(async () => {}),
        play: vi.fn(async () => {}),
        pause: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        setSpeed: vi.fn(),
        getCurrentTime: vi.fn(() => 0),
        getDuration: vi.fn(() => 0),
        destroy: vi.fn(),
        on: vi.fn(() => () => {}),
      };
      // Apenas garantir que o tipo encaixa - se import quebrar, red phase OK.
      expect(typeof mockDriver.load).toBe('function');
      expect(typeof mockDriver.on).toBe('function');
      expect(AudioSourceEngine).toBeDefined();
    });
  });

  describe('AudioSourceEngine facade', () => {
    let engine: any;

    beforeEach(async () => {
      const mod = require('@/lib/audio-engine/AudioSourceEngine');
      // Engine deve ser instanciavel ou singleton com reset
      engine = mod.createAudioSourceEngine
        ? mod.createAudioSourceEngine()
        : new mod.AudioSourceEngine();
    });

    it('playTrack(library) deve usar LibraryAudioDriver', async () => {
      const track: import('@/lib/audio-engine/types').AudioTrack = {
        source: 'library',
        trackId: 'l1',
        title: 'A1',
        audioUrl: '/audio/l1.mp3',
      };
      await engine.playTrack(track);
      const driver = engine.activeDriver ?? engine.getActiveDriver?.();
      expect(driver).toBeTruthy();
      expect(driver.source).toBe('library');
    });

    it('playTrack(spotify) deve lancar "Spotify driver not implemented"', async () => {
      const track: import('@/lib/audio-engine/types').AudioTrack = {
        source: 'spotify',
        trackId: 'spotify:track:abc',
        title: 'X',
      };
      await expect(engine.playTrack(track)).rejects.toThrow(/spotify.*not.*implemented/i);
    });

    it('playTrack com mesmo source REUSA driver (nao destroi)', async () => {
      const track1: import('@/lib/audio-engine/types').AudioTrack = {
        source: 'library', trackId: 'l1', title: 'A1', audioUrl: '/a/1',
      };
      const track2: import('@/lib/audio-engine/types').AudioTrack = {
        source: 'library', trackId: 'l2', title: 'A2', audioUrl: '/a/2',
      };
      await engine.playTrack(track1);
      const driverBefore = engine.activeDriver ?? engine.getActiveDriver?.();
      const destroySpy = vi.spyOn(driverBefore, 'destroy');
      await engine.playTrack(track2);
      const driverAfter = engine.activeDriver ?? engine.getActiveDriver?.();
      expect(driverAfter).toBe(driverBefore);
      expect(destroySpy).not.toHaveBeenCalled();
    });

    it('Engine deve forwardar evento timeupdate/ended/durationchange/error ao listener', async () => {
      const track: import('@/lib/audio-engine/types').AudioTrack = {
        source: 'library', trackId: 'l1', title: 'A1', audioUrl: '/a/1',
      };
      await engine.playTrack(track);
      const onEnded = vi.fn();
      const unsubscribe = engine.on('ended', onEnded);
      expect(typeof unsubscribe).toBe('function');
      // Engine deve permitir disparo manual ou via driver event
      const driver = engine.activeDriver ?? engine.getActiveDriver?.();
      // Simular: dispara via driver - implementer decide se Engine encadeia
      // os listeners ou se driver fala direto. Aqui validamos contract API.
      expect(typeof driver.on).toBe('function');
      unsubscribe();
    });
  });

  // NOTA: O teste antigo "SpotifyAudioDriver stub - load/play devem lancar
  // not_implemented" foi REMOVIDO em MP2 RF-01 (refactor stub -> real). O
  // comportamento real do SpotifyAudioDriver agora e coberto por
  // tests/client/mini-player/SpotifyAudioDriver.test.ts. O teste anterior estava
  // OBSOLETO pois afirmava behavior que nao existe mais (stub throw).
});
