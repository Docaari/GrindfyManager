// AudioSourceEngine type definitions — Sprint Mini Player 1 / RF-06 / ADR-187.
// Discriminated union `AudioTrack` + `IAudioSourceDriver` interface. Phase 1
// implements `LibraryAudioDriver`; Spotify driver is a stub (Sprint Mini Player 2).

export type AudioTrackSource = "library" | "spotify";

export interface AudioTrack {
  source: AudioTrackSource;
  trackId: string; // lessonId for library, spotify URI for spotify
  title: string;
  coverUrl?: string | null;
  courseTitle?: string | null;
  durationSeconds?: number;
  audioUrl?: string; // present when source='library'
  hasAccess?: boolean; // used by autoplay gate (RF-05)
}

export type AudioDriverEvent = "timeupdate" | "ended" | "durationchange" | "error";

export interface IAudioSourceDriver {
  readonly source: AudioTrackSource;
  load(track: AudioTrack): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  setSpeed(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
  on(event: AudioDriverEvent, handler: (data?: any) => void): () => void;
}

export interface CourseContext {
  courseSlug: string;
  lessons: AudioTrack[];
  currentIndex: number;
}

export type DisplayMode = "hidden" | "bar" | "expanded";
