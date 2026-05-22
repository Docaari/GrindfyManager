// LibraryAudioDriver — HTML5 <audio> wrapper. Sprint Mini Player 1 / RF-06 / ADR-187.

import type {
  AudioDriverEvent,
  AudioTrack,
  AudioTrackSource,
  IAudioSourceDriver,
} from "./types";

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

export class LibraryAudioDriver implements IAudioSourceDriver {
  readonly source: AudioTrackSource = "library";
  private audioEl: HTMLAudioElement;
  private listeners: Map<AudioDriverEvent, Set<(data?: any) => void>>;
  private nativeHandlers: Map<AudioDriverEvent, (e: Event) => void>;

  constructor(audioEl: HTMLAudioElement) {
    this.audioEl = audioEl;
    this.listeners = new Map();
    this.nativeHandlers = new Map();
  }

  async load(track: AudioTrack): Promise<void> {
    if (track.audioUrl) {
      this.audioEl.src = track.audioUrl;
    }
  }

  async play(): Promise<void> {
    // Older browsers may return undefined instead of a Promise from play().
    const p = this.audioEl.play();
    if (p && typeof (p as any).then === "function") {
      await p;
    }
  }

  pause(): void {
    try {
      this.audioEl.pause();
    } catch {
      // ignore
    }
  }

  seek(seconds: number): void {
    try {
      this.audioEl.currentTime = Math.max(0, seconds);
    } catch {
      // ignore
    }
  }

  setVolume(v: number): void {
    try {
      this.audioEl.volume = clamp(v, 0, 1);
    } catch {
      // ignore
    }
  }

  setSpeed(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    try {
      this.audioEl.playbackRate = rate;
    } catch {
      // ignore
    }
  }

  getCurrentTime(): number {
    return Number.isFinite(this.audioEl.currentTime)
      ? this.audioEl.currentTime
      : 0;
  }

  getDuration(): number {
    return Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : 0;
  }

  on(event: AudioDriverEvent, handler: (data?: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
      const nativeHandler = (e: Event) => {
        const set = this.listeners.get(event);
        if (set) {
          for (const h of set) {
            try {
              h(e);
            } catch {
              // ignore handler errors
            }
          }
        }
      };
      this.nativeHandlers.set(event, nativeHandler);
      this.audioEl.addEventListener(event, nativeHandler);
    }
    const set = this.listeners.get(event)!;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  destroy(): void {
    for (const [event, handler] of this.nativeHandlers.entries()) {
      try {
        this.audioEl.removeEventListener(event, handler);
      } catch {
        // ignore
      }
    }
    this.listeners.clear();
    this.nativeHandlers.clear();
    try {
      this.audioEl.pause();
    } catch {
      // ignore
    }
  }
}
