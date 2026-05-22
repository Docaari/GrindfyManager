// SpotifyAudioDriver — stub. Sprint Mini Player 1 / RF-06 / ADR-187.
// Throws `not_implemented` for all write ops. Real implementation lands in
// Sprint Mini Player 2 (Spotify Web Playback SDK).

import type {
  AudioDriverEvent,
  AudioTrack,
  AudioTrackSource,
  IAudioSourceDriver,
} from "./types";

const NOT_IMPLEMENTED = "Spotify driver not implemented";

export class SpotifyAudioDriver implements IAudioSourceDriver {
  readonly source: AudioTrackSource = "spotify";

  async load(_track: AudioTrack): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async play(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  pause(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  seek(_seconds: number): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  setVolume(_v: number): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  setSpeed(_rate: number): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  getCurrentTime(): number {
    return 0;
  }

  getDuration(): number {
    return 0;
  }

  on(_event: AudioDriverEvent, _handler: (data?: any) => void): () => void {
    return () => {};
  }

  destroy(): void {}
}
