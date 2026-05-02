// =============================================================================
// AudioPlayerContext - Sprint Biblioteca-1 / RF-08 + D6 + UX Round Implementer.
//
// Mantem 1 audio HTML5 global, sobrevive a navegacao Wouter (mounted ABOVE
// Router em App.tsx). Lesson #12: estado persistente - useState dentro do
// Provider sobrevive a re-mount de paginas porque o Provider mora acima.
//
// F0 (CRITICAL): Real <audio> element rendered inside Provider so that play()
// actually plays sound. Before this fix, the Provider only tracked state and
// no audio ever played. The <audio> element here is shared across all pages.
//
// Surface:
//   useAudioPlayer() -> {
//     play, pause, toggle, close,
//     current, isPlaying,
//     currentSeconds, durationSeconds,
//     seek, setSpeed, skipBack, skipForward,
//     speed,
//   }
//   <AudioPlayerProvider> wrap.
// =============================================================================

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

export interface AudioPlayerLesson {
  lessonId: string;
  audioUrl: string;
  title: string;
  coverUrl?: string | null;
  durationSeconds?: number;
  /** F-A5.5: optional secondary line displayed in StickyAudioBar (course/author) */
  courseTitle?: string | null;
}

interface AudioPlayerCtx {
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
}

const Ctx = createContext<AudioPlayerCtx | null>(null);

const SPEED_STORAGE_KEY = "library:audio:speed";

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
    // ignore - SSR or denied storage
  }
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<AudioPlayerLesson | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [speed, setSpeedState] = useState<number>(() => readStoredSpeed());

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback((lesson: AudioPlayerLesson) => {
    setCurrent(lesson);
    setIsPlaying(true);
    setCurrentSeconds(0);
    setDurationSeconds(lesson.durationSeconds ?? 0);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    setIsPlaying(false);
    setCurrentSeconds(0);
    setDurationSeconds(0);
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
      // ignore - some platforms throw if duration unknown
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

  // Sync isPlaying state -> audio element. play()/pause() are async; ignore
  // AbortError that fires when play() races against a pause() right after.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          // Browser refused autoplay or interrupted - reset state.
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
  }, [isPlaying, current?.audioUrl]);

  // Apply speed when audio element becomes available or speed changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.playbackRate = speed;
    } catch {
      // ignore
    }
  }, [speed, current?.audioUrl]);

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
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/*
        Real audio element. Renders only when a lesson is active. Hidden via
        CSS to avoid taking layout space - controls live in StickyAudioBar /
        PodcastPlayer. preload="metadata" so seeking works without buffering
        the whole file upfront.
      */}
      {current && (
        <audio
          ref={audioRef}
          data-testid="audio-player-element"
          src={current.audioUrl}
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
            setIsPlaying(false);
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
 * an AudioPlayerProvider (e.g. existing LessonViewer.test.tsx).
 */
export function useOptionalAudioPlayer(): AudioPlayerCtx | null {
  return useContext(Ctx);
}
