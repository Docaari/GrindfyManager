// AudioSourceEngine — facade routing by track.source.
// Sprint Mini Player 1 / RF-06 / ADR-187.
// SpotifyAudioDriver is intentionally NOT imported eagerly: Phase 1 throws
// before instantiation, avoiding bundle bloat + test resolver edge cases.

import type {
  AudioDriverEvent,
  AudioTrack,
  IAudioSourceDriver,
} from "./types";
import { LibraryAudioDriver } from "./LibraryAudioDriver";

interface EngineOptions {
  audioElement?: HTMLAudioElement | null;
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
  private engineListeners: Map<AudioDriverEvent, Set<(data?: any) => void>>;
  private driverUnsubscribers: Array<() => void>;

  constructor(opts: EngineOptions = {}) {
    this.audioElement = opts.audioElement ?? null;
    this.engineListeners = new Map();
    this.driverUnsubscribers = [];
  }

  setAudioElement(el: HTMLAudioElement | null): void {
    this.audioElement = el;
  }

  getActiveDriver(): IAudioSourceDriver | null {
    return this.activeDriver;
  }

  async playTrack(track: AudioTrack): Promise<void> {
    if (!this.activeDriver || this.activeDriver.source !== track.source) {
      if (this.activeDriver) {
        runAll(this.driverUnsubscribers);
        this.driverUnsubscribers = [];
        this.activeDriver.destroy();
        this.activeDriver = null;
      }
      this.activeDriver = this.createDriver(track);
      this.rebindEngineEvents();
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
