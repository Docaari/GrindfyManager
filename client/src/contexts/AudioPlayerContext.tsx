// AudioPlayerContext — Sprint Biblioteca-1 + Sprint Mini Player 1 (RF-07).
//
// Mantem 1 <audio> HTML5 global, sobrevive a navegacao Wouter (mounted ACIMA
// do Router em App.tsx — lesson #12: estado persistente).
//
// Sprint Mini Player 1 estende a surface com:
//   - volume / isMuted (D5, RF-03), activeSource / activeTrack
//   - playTrack(AudioTrack, courseContext?), playNext / playPrevious (RF-02 / RF-05)
//   - displayMode FSM (ADR-188), autoplay sequencial onEnded (RF-05)
//   - telemetry source='mini_player' (D13/D21), Media Session API (D17),
//     fullscreen handler (D22)
//
// Back-compat (RF-14): play(lesson) legado mapeia para playTrack(library);
// useOptionalAudioPlayer() retorna null sem Provider.

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  canExpand as fsmCanExpand,
  nextOnClose as fsmNextOnClose,
  nextOnFullscreenExit as fsmNextOnFullscreenExit,
  nextOnPlayTrack as fsmNextOnPlayTrack,
} from "@/lib/audio-engine/displayModeFsm";
import { sanitizeCoverUrl } from "@/lib/audio-engine/sanitizeCoverUrl";
import type {
  AudioTrack,
  AudioTrackSource,
  CourseContext,
  DisplayMode,
} from "@/lib/audio-engine/types";

export interface AudioPlayerLesson {
  lessonId: string;
  audioUrl: string;
  title: string;
  coverUrl?: string | null;
  durationSeconds?: number;
  courseTitle?: string | null;
}

interface AudioPlayerCtx {
  // === existing Biblioteca-1 ===
  current: AudioPlayerLesson | null;
  isPlaying: boolean;
  currentSeconds: number;
  durationSeconds: number;
  speed: number;
  play: (lesson: AudioPlayerLesson) => void;
  pause: () => void;
  toggle: () => void;
  close: () => void;
  seek: (seconds: number) => void;
  setSpeed: (rate: number) => void;
  skipBack: (seconds?: number) => void;
  skipForward: (seconds?: number) => void;
  // === Sprint Mini Player 1 ===
  volume: number;
  isMuted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  activeSource: AudioTrackSource | null;
  activeTrack: AudioTrack | null;
  playTrack: (track: AudioTrack, courseContext?: CourseContext) => void;
  playNext: () => void;
  playPrevious: () => void;
  courseContext: CourseContext | null;
  displayMode: DisplayMode;
  setDisplayMode: (m: DisplayMode) => void;
}

const Ctx = createContext<AudioPlayerCtx | null>(null);

const SPEED_STORAGE_KEY = "library:audio:speed";
const VOLUME_STORAGE_KEY = "library:audio:volume";

function readStoredSpeed(): number {
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    if (!raw) return 1;
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v <= 0) return 1;
    return v;
  } catch {
    return 1;
  }
}

function writeStoredSpeed(v: number): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(v));
  } catch {
    // ignore
  }
}

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw == null) return 1;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(1, v));
  } catch {
    return 1;
  }
}

function writeStoredVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(v));
  } catch {
    // ignore
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function trackToLesson(track: AudioTrack | null): AudioPlayerLesson | null {
  if (!track) return null;
  if (track.source !== "library") return null;
  return {
    lessonId: track.trackId,
    audioUrl: track.audioUrl ?? "",
    title: track.title,
    coverUrl: track.coverUrl ?? null,
    durationSeconds: track.durationSeconds,
    courseTitle: track.courseTitle ?? null,
  };
}

function lessonToTrack(lesson: AudioPlayerLesson): AudioTrack {
  return {
    source: "library",
    trackId: lesson.lessonId,
    title: lesson.title,
    coverUrl: lesson.coverUrl ?? null,
    courseTitle: lesson.courseTitle ?? null,
    durationSeconds: lesson.durationSeconds,
    audioUrl: lesson.audioUrl,
  };
}

// Best-effort telemetry — never throws. D13/D21.
function emitTelemetry(eventType: string, payload: Record<string, any>): void {
  try {
    const body = JSON.stringify({
      eventType,
      source: "mini_player",
      ...payload,
      timestamp: new Date().toISOString(),
    });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      try {
        navigator.sendBeacon("/api/library/events", body);
        return;
      } catch {
        // fall through to fetch
      }
    }
    if (typeof fetch === "function") {
      try {
        const p = fetch("/api/library/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
            // ignore network errors (test envs use relative URLs)
          });
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // never throw
  }
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [activeTrack, setActiveTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [speed, setSpeedState] = useState<number>(() => readStoredSpeed());
  const [volume, setVolumeState] = useState<number>(() => readStoredVolume());
  const [isMuted, setIsMuted] = useState(false);
  const [courseContext, setCourseContext] = useState<CourseContext | null>(
    null,
  );
  const [displayMode, setDisplayModeState] = useState<DisplayMode>("hidden");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const courseContextRef = useRef<CourseContext | null>(null);
  courseContextRef.current = courseContext;
  const activeTrackRef = useRef<AudioTrack | null>(null);
  activeTrackRef.current = activeTrack;
  // D22 fullscreen: remember displayMode before fullscreen so we can restore.
  const displayModeBeforeFullscreenRef = useRef<DisplayMode | null>(null);

  // === Derived: current (back-compat projection) ===
  const current = useMemo<AudioPlayerLesson | null>(
    () => trackToLesson(activeTrack),
    [activeTrack],
  );

  // === playTrack (RF-07) ===
  const playTrack = useCallback(
    (track: AudioTrack, ctxArg?: CourseContext) => {
      setActiveTrack(track);
      setIsPlaying(true);
      setCurrentSeconds(0);
      setDurationSeconds(track.durationSeconds ?? 0);
      if (ctxArg) {
        setCourseContext(ctxArg);
      }
      setDisplayModeState((prev) => fsmNextOnPlayTrack(prev));
    },
    [],
  );

  // === play(lesson) legado (RF-14 back-compat wrapper) ===
  const play = useCallback(
    (lesson: AudioPlayerLesson) => {
      // Legacy path: do NOT set courseContext (preserves Biblioteca-1).
      playTrack(lessonToTrack(lesson));
    },
    [playTrack],
  );

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const close = useCallback(() => {
    setActiveTrack(null);
    setIsPlaying(false);
    setCurrentSeconds(0);
    setDurationSeconds(0);
    setCourseContext(null);
    setDisplayModeState((prev) => fsmNextOnClose(prev));
  }, []);

  const seek = useCallback((seconds: number) => {
    const a = audioRef.current;
    if (!a) {
      setCurrentSeconds(Math.max(0, seconds));
      return;
    }
    try {
      const target = Math.max(0, Math.min(seconds, a.duration || seconds));
      a.currentTime = target;
      setCurrentSeconds(target);
    } catch {
      // ignore
    }
  }, []);

  const setSpeed = useCallback((rate: number) => {
    if (!Number.isFinite(rate) || rate <= 0) return;
    setSpeedState(rate);
    writeStoredSpeed(rate);
    const a = audioRef.current;
    if (a) {
      try {
        a.playbackRate = rate;
      } catch {
        // ignore
      }
    }
  }, []);

  const skipBack = useCallback(
    (seconds = 15) => {
      seek(Math.max(0, currentSeconds - seconds));
    },
    [seek, currentSeconds],
  );

  const skipForward = useCallback(
    (seconds = 15) => {
      seek(currentSeconds + seconds);
    },
    [seek, currentSeconds],
  );

  // === volume + isMuted ===
  const setVolume = useCallback((v: number) => {
    const clamped = clamp01(v);
    setVolumeState(clamped);
    writeStoredVolume(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  // Apply volume + mute to underlying <audio>
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.volume = isMuted ? 0 : volume;
    } catch {
      // ignore
    }
  }, [volume, isMuted, activeTrack?.audioUrl]);

  // === displayMode setter with guard ===
  const setDisplayMode = useCallback((m: DisplayMode) => {
    if (m === "expanded" && !fsmCanExpand(activeTrackRef.current)) {
      // eslint-disable-next-line no-console
      console.warn(
        "[AudioPlayer] setDisplayMode('expanded') ignored: no active track",
      );
      return;
    }
    setDisplayModeState(m);
  }, []);

  // === playNext / playPrevious (RF-02) ===
  const playNext = useCallback(() => {
    const ctxArg = courseContextRef.current;
    if (!ctxArg) return;
    const nextIndex = ctxArg.currentIndex + 1;
    if (nextIndex >= ctxArg.lessons.length) return;
    const next = ctxArg.lessons[nextIndex];
    playTrack(next, { ...ctxArg, currentIndex: nextIndex });
    emitTelemetry("next", {
      lessonId: next.trackId,
      trigger: "manual",
    });
  }, [playTrack]);

  const playPrevious = useCallback(() => {
    const ctxArg = courseContextRef.current;
    if (!ctxArg) return;
    const prevIndex = ctxArg.currentIndex - 1;
    if (prevIndex < 0) return;
    const prev = ctxArg.lessons[prevIndex];
    playTrack(prev, { ...ctxArg, currentIndex: prevIndex });
    emitTelemetry("previous", {
      lessonId: prev.trackId,
      trigger: "manual",
    });
  }, [playTrack]);

  // === Autoplay sequencial (RF-05) ===
  const tryAutoplayNext = useCallback(() => {
    const ctxArg = courseContextRef.current;
    if (!ctxArg) {
      setIsPlaying(false);
      return;
    }
    const nextIndex = ctxArg.currentIndex + 1;
    if (nextIndex >= ctxArg.lessons.length) {
      setIsPlaying(false);
      return;
    }
    const next = ctxArg.lessons[nextIndex];
    if (next.hasAccess === false) {
      setIsPlaying(false);
      return;
    }
    playTrack(next, { ...ctxArg, currentIndex: nextIndex });
    emitTelemetry("next", {
      lessonId: next.trackId,
      trigger: "autoplay",
    });
  }, [playTrack]);

  // Sync isPlaying state -> audio element.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          setIsPlaying(false);
        });
      }
    } else {
      try {
        a.pause();
      } catch {
        // ignore
      }
    }
  }, [isPlaying, activeTrack?.audioUrl]);

  // Apply speed when audio element becomes available or speed changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.playbackRate = speed;
    } catch {
      // ignore
    }
  }, [speed, activeTrack?.audioUrl]);

  // === D17 Media Session API ===
  // HIGH-2 fix: handlers via ref pra evitar re-register a cada timeupdate
  // (~4x/s). Antes: deps incluiam playPrevious/playNext/skipBack/skipForward
  // que mudam toda vez que currentSeconds muda → Safari throws
  // NotSupportedError ao re-registrar acoes nao suportadas em loop.
  const navHandlersRef = useRef({ playPrevious, playNext, skipBack, skipForward });
  useEffect(() => {
    navHandlersRef.current = { playPrevious, playNext, skipBack, skipForward };
  }, [playPrevious, playNext, skipBack, skipForward]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    if (!current) return;
    const ms: any = (navigator as any).mediaSession;
    try {
      const MediaMetadataCtor: any = (globalThis as any).MediaMetadata;
      if (typeof MediaMetadataCtor === "function") {
        const safeCover = sanitizeCoverUrl(current.coverUrl);
        ms.metadata = new MediaMetadataCtor({
          title: current.title,
          artist: current.courseTitle ?? "Grindfy",
          artwork: safeCover
            ? [{ src: safeCover, sizes: "512x512" }]
            : [],
        });
      }
    } catch {
      // ignore — best-effort
    }
    const actions: Array<[string, () => void]> = [
      ["play", () => setIsPlaying(true)],
      ["pause", () => setIsPlaying(false)],
      ["previoustrack", () => navHandlersRef.current.playPrevious()],
      ["nexttrack", () => navHandlersRef.current.playNext()],
      ["seekbackward", () => navHandlersRef.current.skipBack(15)],
      ["seekforward", () => navHandlersRef.current.skipForward(15)],
    ];
    // Track somente as acoes que foram efetivamente registradas — o cleanup
    // so chama setActionHandler(null) nessas, evitando NotSupportedError em
    // Safari em acoes ja nao suportadas.
    const registered: string[] = [];
    for (const [name, handler] of actions) {
      try {
        ms.setActionHandler(name, handler);
        registered.push(name);
      } catch {
        // unsupported action — skip
      }
    }
    return () => {
      for (const name of registered) {
        try {
          ms.setActionHandler(name, null);
        } catch {
          // ignore
        }
      }
    };
  }, [current]);

  // === D22 Fullscreen handler ===
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      const isFullscreen = (document as any).fullscreenElement !== null;
      if (isFullscreen && displayMode !== "hidden") {
        displayModeBeforeFullscreenRef.current = displayMode;
        setDisplayModeState("hidden");
      } else if (
        !isFullscreen &&
        displayModeBeforeFullscreenRef.current
      ) {
        // HIGH-3 fix: usar FSM helper. Restora 'bar' em vez do mode salvo
        // (RF-04 + QA cenario 19: ao sair fullscreen, sempre voltar pra bar
        // mesmo se antes do fullscreen estava em 'expanded' — expanded e estado
        // efemero, nao deve sobreviver a context switch grande).
        const next = fsmNextOnFullscreenExit(
          displayModeBeforeFullscreenRef.current,
          !!activeTrackRef.current,
        );
        setDisplayModeState(next);
        displayModeBeforeFullscreenRef.current = null;
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [displayMode]);

  const value = useMemo<AudioPlayerCtx>(
    () => ({
      current,
      isPlaying,
      currentSeconds,
      durationSeconds,
      speed,
      play,
      pause,
      toggle,
      close,
      seek,
      setSpeed,
      skipBack,
      skipForward,
      volume,
      isMuted,
      setVolume,
      toggleMute,
      activeSource: activeTrack?.source ?? null,
      activeTrack,
      playTrack,
      playNext,
      playPrevious,
      courseContext,
      displayMode,
      setDisplayMode,
    }),
    [
      current,
      isPlaying,
      currentSeconds,
      durationSeconds,
      speed,
      play,
      pause,
      toggle,
      close,
      seek,
      setSpeed,
      skipBack,
      skipForward,
      volume,
      isMuted,
      setVolume,
      toggleMute,
      activeTrack,
      playTrack,
      playNext,
      playPrevious,
      courseContext,
      displayMode,
      setDisplayMode,
    ],
  );

  const audioSrc =
    activeTrack?.source === "library" ? activeTrack.audioUrl : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {audioSrc && (
        <audio
          ref={audioRef}
          data-testid="audio-player-element"
          src={audioSrc}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(e) => {
            const a = e.currentTarget;
            if (Number.isFinite(a.duration) && a.duration > 0) {
              setDurationSeconds(a.duration);
            }
          }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (Number.isFinite(a.currentTime)) {
              setCurrentSeconds(a.currentTime);
            }
          }}
          onEnded={() => {
            tryAutoplayNext();
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  }
  return ctx;
}

/**
 * Optional accessor: returns null when no AudioPlayerProvider is mounted
 * upstream. Useful for components rendered in test contexts that do not wrap
 * an AudioPlayerProvider.
 */
export function useOptionalAudioPlayer(): AudioPlayerCtx | null {
  return useContext(Ctx);
}
