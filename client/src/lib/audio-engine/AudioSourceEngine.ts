// AudioSourceEngine — facade routing by track.source.
// Sprint Mini Player 1 / RF-06 / ADR-187.
// Sprint Mini Player 2 (CRITICAL-1) — adiciona `spotifyDriverFactory` opcional.
// Factory eh injetada pelo AudioPlayerContext quando o user conecta o Spotify
// (Provider re-cria o Engine com a factory atrelada aos tokens em closure).
// Quando ausente, playTrack(spotify) ainda throw "not implemented" — preserva
// o comportamento default + o test em tests/client/mini-player/
// AudioSourceEngine.test.tsx que exige esse throw.

import type {
  AudioDriverEvent,
  AudioTrack,
  IAudioSourceDriver,
} from "./types";
import { LibraryAudioDriver } from "./LibraryAudioDriver";

export type SpotifyDriverFactory = (track: AudioTrack) => IAudioSourceDriver;

export interface DriverSwitchInfo {
  from: string | null;
  to: string;
  reason: "initial" | "source_changed";
}

interface EngineOptions {
  audioElement?: HTMLAudioElement | null;
  spotifyDriverFactory?: SpotifyDriverFactory;
  onDriverSwitch?: (info: DriverSwitchInfo) => void;
}

function runAll(fns: Array<() => void>): void {
  for (const fn of fns) {
    try {
      fn();
    } catch {
      // best-effort cleanup
    }
  }
}

export class AudioSourceEngine {
  activeDriver: IAudioSourceDriver | null = null;
  private audioElement: HTMLAudioElement | null;
  private spotifyDriverFactory: SpotifyDriverFactory | null;
  private onDriverSwitch: ((info: DriverSwitchInfo) => void) | null;
  private engineListeners: Map<AudioDriverEvent, Set<(data?: any) => void>>;
  private driverUnsubscribers: Array<() => void>;

  constructor(opts: EngineOptions = {}) {
    this.audioElement = opts.audioElement ?? null;
    this.spotifyDriverFactory = opts.spotifyDriverFactory ?? null;
    this.onDriverSwitch = opts.onDriverSwitch ?? null;
    this.engineListeners = new Map();
    this.driverUnsubscribers = [];
  }

  setOnDriverSwitch(cb: ((info: DriverSwitchInfo) => void) | null): void {
    this.onDriverSwitch = cb;
  }

  setAudioElement(el: HTMLAudioElement | null): void {
    this.audioElement = el;
  }

  setSpotifyDriverFactory(factory: SpotifyDriverFactory | null): void {
    this.spotifyDriverFactory = factory;
  }

  getActiveDriver(): IAudioSourceDriver | null {
    return this.activeDriver;
  }

  async playTrack(track: AudioTrack): Promise<void> {
    if (!this.activeDriver || this.activeDriver.source !== track.source) {
      const from = this.activeDriver?.source ?? null;
      if (this.activeDriver) {
        runAll(this.driverUnsubscribers);
        this.driverUnsubscribers = [];
        this.activeDriver.destroy();
        this.activeDriver = null;
      }
      this.activeDriver = this.createDriver(track);
      this.rebindEngineEvents();
      // CRITICAL-4 telemetry — driver swap event.
      if (this.onDriverSwitch) {
        try {
          this.onDriverSwitch({
            from,
            to: track.source,
            reason: from === null ? "initial" : "source_changed",
          });
        } catch {
          // never throw
        }
      }
    }
    await this.activeDriver.load(track);
    await this.activeDriver.play();
  }

  pause(): void {
    this.activeDriver?.pause();
  }

  seek(seconds: number): void {
    this.activeDriver?.seek(seconds);
  }

  setVolume(v: number): void {
    this.activeDriver?.setVolume(v);
  }

  setSpeed(rate: number): void {
    this.activeDriver?.setSpeed(rate);
  }

  getCurrentTime(): number {
    return this.activeDriver?.getCurrentTime() ?? 0;
  }

  getDuration(): number {
    return this.activeDriver?.getDuration() ?? 0;
  }

  on(event: AudioDriverEvent, handler: (data?: any) => void): () => void {
    if (!this.engineListeners.has(event)) {
      this.engineListeners.set(event, new Set());
    }
    const set = this.engineListeners.get(event)!;
    set.add(handler);
    // Ensures the current driver has a subscription for this event.
    this.rebindEngineEvents();
    return () => {
      set.delete(handler);
    };
  }

  destroy(): void {
    runAll(this.driverUnsubscribers);
    this.driverUnsubscribers = [];
    this.activeDriver?.destroy();
    this.activeDriver = null;
    this.engineListeners.clear();
  }

  private createDriver(track: AudioTrack): IAudioSourceDriver {
    if (track.source === "library") {
      if (this.audioElement) {
        return new LibraryAudioDriver(this.audioElement);
      }
      // In tests the engine may be created without a real element; fall back to
      // a detached <audio> so basic ops don't crash. Real playback still needs
      // the provider to wire the actual element via setAudioElement().
      if (typeof document !== "undefined" && typeof document.createElement === "function") {
        return new LibraryAudioDriver(document.createElement("audio"));
      }
      throw new Error("AudioSourceEngine: no audio element bound for library driver");
    }
    if (track.source === "spotify") {
      if (this.spotifyDriverFactory) {
        return this.spotifyDriverFactory(track);
      }
      // CRITICAL-1: factory ausente -> user nao conectou Spotify ainda. Manter
      // throw default (alinhado com tests/client/mini-player/
      // AudioSourceEngine.test.tsx que exige "Spotify driver not implemented"
      // quando nao ha factory injetada).
      throw new Error("Spotify driver not implemented");
    }
    throw new Error(`Unknown audio source: ${(track as any).source}`);
  }

  private rebindEngineEvents(): void {
    if (!this.activeDriver) return;
    runAll(this.driverUnsubscribers);
    this.driverUnsubscribers = [];
    for (const [event, handlers] of this.engineListeners.entries()) {
      const unsub = this.activeDriver.on(event, (data) => {
        for (const h of handlers) {
          try {
            h(data);
          } catch {
            // ignore handler errors
          }
        }
      });
      this.driverUnsubscribers.push(unsub);
    }
  }
}

export function createAudioSourceEngine(opts: EngineOptions = {}): AudioSourceEngine {
  return new AudioSourceEngine(opts);
}
