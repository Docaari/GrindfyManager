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
// Sprint Mini Player 2 (CRITICAL-2/4 + HIGH-3/4/5) — audio telemetry
// canonica + Engine ref pra driver-agnostic ops.
import { emitAudioEvent } from "@/lib/audio-telemetry";
// Sprint MP2 R2-H1 fix — Engine + Spotify driver wire pra playback funcional.
import {
  createAudioSourceEngine,
  type AudioSourceEngine,
  type DriverSwitchInfo,
} from "@/lib/audio-engine/AudioSourceEngine";
import { SpotifyAudioDriver } from "@/lib/audio-engine/SpotifyAudioDriver";
import { refreshAccessToken } from "@/lib/spotify/auth";
// Sprint Mini Player 3 / RF-05 — queue state hook (MP3.1 R1 fix wave: CRITICAL-2).
// Surface exposta via context para QueuePopover + add-to-queue em LessonPicker.
import { useQueueState, type RepeatMode, type QueueItem, type AudioTrackLike } from "@/hooks/useQueueState";
// Sprint Mini Player 3.1 Wave B / TIER 3 #4 — cross-reload resume snapshot.
import {
  writeResumeSnapshot,
  readResumeSnapshot,
  clearResumeSnapshot,
} from "@/lib/audio-engine/resumeSession";

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
  // === Sprint Mini Player 2 (RF-NEW.3) ===
  sleepTimerMinutes: number | null;
  sleepTimerRemainingSeconds: number | null;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  resetSleepTimer: () => void;
  // === Sprint Mini Player 2 (HIGH-5 + CRITICAL-2) — Spotify connect surface.
  // Chamado pelo SpotifyConnectionPanel apos initiateSpotifyAuth resolver
  // sucesso. Cria SpotifyAudioDriver via Engine factory.
  connectSpotify: (
    accessToken: string,
    expiresIn: number,
    displayName?: string,
  ) => void;
  disconnectSpotifyDriver: () => void;
  isSpotifyConnected: boolean;
  // === Sprint Mini Player 3 (RF-05) — Queue surface (MP3.1 R1 fix wave CRITICAL-2).
  queueItems: QueueItem[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  addToQueue: (track: AudioTrackLike) => boolean;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  skipToQueueItem: (id: string) => void;
  reorderQueue: (fromIdx: number, toIdx: number) => void;
  // === Sprint Mini Player 3.1 Wave B / TIER 3 #5 + #6 — Error + Buffering surface.
  loadError: string | null;
  retryCurrent: () => void;
  clearLoadError: () => void;
  isBuffering: boolean;
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

  // === Sprint Mini Player 2 (RF-NEW.3) — Sleep timer state ===
  const [sleepTimerMinutes, setSleepTimerMinutesState] = useState<number | null>(
    null,
  );
  const [sleepTimerRemainingSeconds, setSleepTimerRemainingSeconds] = useState<
    number | null
  >(null);
  // Target timestamp drift-resistant (D9 / RNF-05).
  const sleepTargetRef = useRef<number | null>(null);
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sleepFadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const volumeBeforeFadeRef = useRef<number | null>(null);
  const sleepTimerActiveMinutesRef = useRef<number | null>(null);
  // Latest volume for fade restore (avoid stale closure).
  const volumeRef = useRef<number>(volume);
  volumeRef.current = volume;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const courseContextRef = useRef<CourseContext | null>(null);
  courseContextRef.current = courseContext;
  const activeTrackRef = useRef<AudioTrack | null>(null);
  activeTrackRef.current = activeTrack;
  // D22 fullscreen: remember displayMode before fullscreen so we can restore.
  const displayModeBeforeFullscreenRef = useRef<DisplayMode | null>(null);

  // === Sprint Mini Player 2 (CRITICAL-2 + HIGH-3/4/5) — Spotify wire-up ===
  // Token + driver guardados em refs em memoria (NUNCA em storage — refresh
  // token fica no server, ADR-190). Engine eh lazy-instanciada quando precisa
  // tocar track Spotify pela primeira vez.
  const spotifyTokenRef = useRef<{
    accessToken: string;
    expiresIn: number;
    displayName?: string;
  } | null>(null);
  const spotifyDriverRef = useRef<any | null>(null);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  // MP2 R2-H1: Engine ref pra delegar playback Spotify ao driver real.
  // Library path continua usando <audio> HTML5 direto (audioRef) — Engine eh
  // criada lazy somente quando connectSpotify habilita o driver Spotify.
  const engineRef = useRef<AudioSourceEngine | null>(null);
  const engineUnsubscribersRef = useRef<Array<() => void>>([]);

  // === Sprint Mini Player 3 / RF-05 — Queue state (MP3.1 R1 fix wave CRITICAL-2).
  // Hook gerencia localStorage `audio.queue.v1` + cross-tab sync. Toda mutacao
  // bump version + persiste debounced.
  const queue = useQueueState();

  // === Sprint Mini Player 3.1 Wave B / TIER 3 #5 + #6 — Error + Buffering state.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const retryCountRef = useRef<number>(0);
  const bufferingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 3;
  const BUFFERING_TIMEOUT_MS = 10000;

  const clearBufferingTimeout = useCallback(() => {
    if (bufferingTimeoutRef.current) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }
  }, []);

  const armBufferingTimeout = useCallback(() => {
    clearBufferingTimeout();
    bufferingTimeoutRef.current = setTimeout(() => {
      // TIER 3 #6 -> #5: timeout buffering = trata como erro.
      setIsBuffering(false);
      setLoadError("timeout");
      emitAudioEvent("audio_track_error", {
        reason: "buffering_timeout",
      });
    }, BUFFERING_TIMEOUT_MS);
  }, [clearBufferingTimeout]);

  // === Sprint Mini Player 3 / RF-06.1 — sync __audioPlayerActiveTrackId.
  // MP3.1 R1 fix HIGH-2: oauthSnapshot.readActiveTrackId() le esta global.
  // Sem isso, snapshot.activeTrackId fica sempre null + restore nao recupera
  // a aula corrente apos OAuth redirect fallback.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__audioPlayerActiveTrackId = activeTrack?.trackId ?? null;
    return () => {
      // Cleanup so quando track sai (nao no unmount do Provider, pra evitar
      // reset durante OAuth redirect que destroi o Provider mas mantem snapshot).
    };
  }, [activeTrack?.trackId]);

  // MP2 R2-H1: subscribe events do driver ativo para refletir state.
  const bindEngineEvents = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    // Cleanup antigos.
    for (const u of engineUnsubscribersRef.current) {
      try {
        u();
      } catch {
        // ignore
      }
    }
    engineUnsubscribersRef.current = [];
    engineUnsubscribersRef.current.push(
      eng.on("timeupdate", (data: any) => {
        const t = data?.currentTime;
        if (Number.isFinite(t)) {
          setCurrentSeconds(t);
          // TIER 3 #6: 1o timeupdate signala playback iniciou -> sai buffering.
          clearBufferingTimeout();
          setIsBuffering(false);
        }
      }),
    );
    engineUnsubscribersRef.current.push(
      eng.on("durationchange", (data: any) => {
        const d = data?.duration;
        if (Number.isFinite(d) && d > 0) setDurationSeconds(d);
      }),
    );
    engineUnsubscribersRef.current.push(
      eng.on("ended", () => {
        // Mesma logica do <audio> onEnded — tenta autoplay sequencial.
        tryAutoplayNextRef.current?.();
      }),
    );
    engineUnsubscribersRef.current.push(
      eng.on("error", (err: any) => {
        emitAudioEvent("audio_driver_error", {
          message: String(err?.message ?? err),
        });
        // TIER 3 #5: surface error pra UI driver-agnostic.
        clearBufferingTimeout();
        setIsBuffering(false);
        setLoadError(String(err?.message ?? "driver_error"));
        emitAudioEvent("audio_track_error", {
          source: "driver",
          message: String(err?.message ?? err),
        });
      }),
    );
  }, [clearBufferingTimeout]);

  // Ref pra tryAutoplayNext (declarado depois — evita TDZ).
  const tryAutoplayNextRef = useRef<(() => void) | null>(null);

  // === Derived: current (back-compat projection) ===
  const current = useMemo<AudioPlayerLesson | null>(
    () => trackToLesson(activeTrack),
    [activeTrack],
  );

  // =========================================================================
  // Sprint Mini Player 2 (RF-NEW.3 / RF-NEW.4) — Sleep Timer logic
  // =========================================================================
  const clearSleepTimers = useCallback(() => {
    if (sleepIntervalRef.current) {
      clearInterval(sleepIntervalRef.current);
      sleepIntervalRef.current = null;
    }
    if (sleepFadeIntervalRef.current) {
      clearInterval(sleepFadeIntervalRef.current);
      sleepFadeIntervalRef.current = null;
    }
  }, []);

  const handleSleepTimerFire = useCallback(() => {
    // D9: fade-out 5s linear (volume -> 0), then pause, restore volume.
    // HIGH-3/4: driver-agnostic — alem do setIsPlaying(false), tambem
    // pausa o spotifyDriverRef caso ativo (HtmlAudio sync via efeito).
    const startVolume = volumeRef.current;
    volumeBeforeFadeRef.current = startVolume;
    const FADE_MS = 5000;
    const STEP_MS = 100;
    const totalSteps = FADE_MS / STEP_MS;
    let stepIdx = 0;
    if (sleepFadeIntervalRef.current) {
      clearInterval(sleepFadeIntervalRef.current);
    }
    sleepFadeIntervalRef.current = setInterval(() => {
      stepIdx += 1;
      const t = stepIdx / totalSteps;
      const next = Math.max(0, startVolume * (1 - t));
      setVolumeState(clamp01(next));
      // HIGH-3: aplicar fade no driver Spotify tambem.
      try {
        spotifyDriverRef.current?.setVolume?.(clamp01(next));
      } catch {
        // ignore
      }
      if (stepIdx >= totalSteps) {
        // fade complete
        if (sleepFadeIntervalRef.current) {
          clearInterval(sleepFadeIntervalRef.current);
          sleepFadeIntervalRef.current = null;
        }
        // HIGH-4: pause driver-agnostic — useEffect [isPlaying]
        // ja pausa <audio> HtmlAudio; aqui chamamos pause direto no driver
        // Spotify caso esteja ativo.
        try {
          spotifyDriverRef.current?.pause?.();
        } catch {
          // ignore
        }
        setIsPlaying(false);
        // restore volume
        setVolumeState(startVolume);
        try {
          spotifyDriverRef.current?.setVolume?.(startVolume);
        } catch {
          // ignore
        }
        // clear sleep state
        sleepTargetRef.current = null;
        sleepTimerActiveMinutesRef.current = null;
        setSleepTimerMinutesState(null);
        setSleepTimerRemainingSeconds(null);
        // CRITICAL-4 telemetry — sleep_timer_fired.
        emitAudioEvent("sleep_timer_fired", {});
      }
    }, STEP_MS);
  }, []);

  const armSleepTimer = useCallback(
    (minutes: number) => {
      clearSleepTimers();
      const totalMs = minutes * 60 * 1000;
      const target = Date.now() + totalMs;
      sleepTargetRef.current = target;
      sleepTimerActiveMinutesRef.current = minutes;
      setSleepTimerMinutesState(minutes);
      setSleepTimerRemainingSeconds(minutes * 60);
      // Tick interval (30s) — recheck Date.now() para drift-resistance.
      const TICK_MS = 30 * 1000;
      sleepIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const t = sleepTargetRef.current;
        if (!t) return;
        const remainingMs = t - now;
        if (remainingMs <= 0) {
          // fire
          if (sleepIntervalRef.current) {
            clearInterval(sleepIntervalRef.current);
            sleepIntervalRef.current = null;
          }
          handleSleepTimerFire();
          return;
        }
        setSleepTimerRemainingSeconds(Math.ceil(remainingMs / 1000));
      }, TICK_MS);
    },
    [clearSleepTimers, handleSleepTimerFire],
  );

  const setSleepTimer = useCallback(
    (minutes: number) => {
      armSleepTimer(minutes);
      // CRITICAL-4 + HIGH-7 telemetry.
      emitAudioEvent("sleep_timer_activated", { minutes });
    },
    [armSleepTimer],
  );

  const cancelSleepTimer = useCallback(() => {
    const wasActive = sleepTimerActiveMinutesRef.current;
    clearSleepTimers();
    sleepTargetRef.current = null;
    sleepTimerActiveMinutesRef.current = null;
    setSleepTimerMinutesState(null);
    setSleepTimerRemainingSeconds(null);
    // HIGH-6: restaurar volume se fade-out estava em progresso.
    if (volumeBeforeFadeRef.current !== null) {
      setVolumeState(volumeBeforeFadeRef.current);
      try {
        spotifyDriverRef.current?.setVolume?.(volumeBeforeFadeRef.current);
      } catch {
        // ignore
      }
      volumeBeforeFadeRef.current = null;
    }
    if (wasActive !== null) {
      // CRITICAL-4 + HIGH-7 telemetry.
      emitAudioEvent("sleep_timer_cancelled", { minutes: wasActive });
    }
  }, [clearSleepTimers]);

  const resetSleepTimer = useCallback(() => {
    const m = sleepTimerActiveMinutesRef.current;
    if (m === null) return;
    armSleepTimer(m);
  }, [armSleepTimer]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearSleepTimers();
      // Reviewer MEDIUM-2: limpar buffering timeout pra evitar setState pos-unmount.
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      // MP2 R2-H1: destruir Engine + unsubscribe events.
      for (const u of engineUnsubscribersRef.current) {
        try {
          u();
        } catch {
          // ignore
        }
      }
      engineUnsubscribersRef.current = [];
      try {
        engineRef.current?.destroy();
      } catch {
        // ignore
      }
      engineRef.current = null;
    };
  }, [clearSleepTimers]);

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
      // D8: user interaction (lesson pick) reseta timer.
      resetSleepTimer();
      // TIER 3 #5 + #6: nova track -> reset error + arma buffering.
      setLoadError(null);
      retryCountRef.current = 0;
      setIsBuffering(true);
      armBufferingTimeout();
      // MP2 R2-H1: para Spotify, delegar playback real ao driver via Engine.
      // Library continua via <audio> HTML5 (sync state -> audio element abaixo).
      if (track.source === "spotify") {
        const eng = engineRef.current;
        if (!eng) {
          // Factory nao injetada -> usuario nao conectou Spotify ainda.
          // Throw seria duro; emite telemetria + pausa state.
          emitAudioEvent("audio_driver_error", {
            reason: "spotify_not_connected",
          });
          setIsPlaying(false);
          return;
        }
        // Fire-and-forget: Engine roteia ao SpotifyAudioDriver. Eventos
        // do driver atualizam currentSeconds/durationSeconds via bindEngineEvents.
        (async () => {
          try {
            await eng.playTrack(track);
            spotifyDriverRef.current = eng.getActiveDriver?.() ?? null;
          } catch (err) {
            emitAudioEvent("audio_driver_error", {
              message: String((err as any)?.message ?? err),
            });
            setIsPlaying(false);
          }
        })();
      }
    },
    [resetSleepTimer, armBufferingTimeout],
  );

  // === TIER 3 #5: retry + clear ===
  const retryCurrent = useCallback(() => {
    const track = activeTrackRef.current;
    if (!track) return;
    if (retryCountRef.current >= MAX_RETRIES) {
      // permanente; UI deve mostrar skip CTA
      return;
    }
    retryCountRef.current += 1;
    setLoadError(null);
    setIsBuffering(true);
    armBufferingTimeout();
    emitAudioEvent("audio_track_retry", {
      attempt: retryCountRef.current,
      trackId: track.trackId,
    });
    if (track.source === "library") {
      const a = audioRef.current;
      if (a) {
        try {
          a.load();
          const p = a.play();
          if (p && typeof p.then === "function") {
            p.catch(() => {
              setIsPlaying(false);
            });
          }
        } catch {
          // ignore
        }
      }
    } else {
      const eng = engineRef.current;
      if (eng) {
        (async () => {
          try {
            await eng.playTrack(track);
          } catch (err) {
            setLoadError(String((err as any)?.message ?? err));
          }
        })();
      }
    }
  }, [armBufferingTimeout]);

  const clearLoadError = useCallback(() => {
    setLoadError(null);
  }, []);

  // === play(lesson) legado (RF-14 back-compat wrapper) ===
  const play = useCallback(
    (lesson: AudioPlayerLesson) => {
      // Legacy path: do NOT set courseContext (preserves Biblioteca-1).
      playTrack(lessonToTrack(lesson));
    },
    [playTrack],
  );

  // HIGH-6: limpar fade-out + restaurar volume original ao usuario interagir
  // com play/pause direto (ex: clica play durante fade). Sem isso, o fade
  // continua reduzindo o volume e o user fica "no escuro" sobre o porque.
  const clearFadeAndRestoreVolume = useCallback(() => {
    if (sleepFadeIntervalRef.current) {
      clearInterval(sleepFadeIntervalRef.current);
      sleepFadeIntervalRef.current = null;
    }
    if (volumeBeforeFadeRef.current !== null) {
      const restored = volumeBeforeFadeRef.current;
      setVolumeState(restored);
      try {
        spotifyDriverRef.current?.setVolume?.(restored);
      } catch {
        // ignore
      }
      volumeBeforeFadeRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    clearFadeAndRestoreVolume();
    setIsPlaying(false);
  }, [clearFadeAndRestoreVolume]);

  const toggle = useCallback(() => {
    clearFadeAndRestoreVolume();
    setIsPlaying((p) => !p);
    // D8: toggle reseta sleep timer.
    resetSleepTimer();
  }, [clearFadeAndRestoreVolume, resetSleepTimer]);

  const close = useCallback(() => {
    setActiveTrack(null);
    setIsPlaying(false);
    setCurrentSeconds(0);
    setDurationSeconds(0);
    setCourseContext(null);
    setDisplayModeState((prev) => fsmNextOnClose(prev));
    // TIER 3 #4/#5/#6: limpa snapshot + reset error/buffering.
    clearResumeSnapshot();
    setLoadError(null);
    setIsBuffering(false);
    clearBufferingTimeout();
  }, [clearBufferingTimeout]);

  const seek = useCallback((seconds: number) => {
    // MP2 R2-H1: Spotify path -> driver.seek (REST PUT /me/player/seek).
    if (activeTrackRef.current?.source === "spotify") {
      const drv = spotifyDriverRef.current;
      try {
        drv?.seek?.(Math.max(0, seconds));
      } catch {
        // ignore
      }
      setCurrentSeconds(Math.max(0, seconds));
      resetSleepTimer();
      return;
    }
    const a = audioRef.current;
    if (!a) {
      setCurrentSeconds(Math.max(0, seconds));
      // D8: seek reseta sleep timer.
      resetSleepTimer();
      return;
    }
    try {
      const target = Math.max(0, Math.min(seconds, a.duration || seconds));
      a.currentTime = target;
      setCurrentSeconds(target);
    } catch {
      // ignore
    }
    resetSleepTimer();
  }, [resetSleepTimer]);

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
    // MP2 R2-M2 (DEFER MP3): speed select deveria estar HIDDEN no UI quando
    // activeTrack.source === 'spotify' (Spotify Web Playback nao suporta
    // variable speed — SpotifyAudioDriver.setSpeed eh no-op com console.warn).
    // Atual: setSpeed roda silenciosamente em Spotify (no-op no driver). UI
    // (MiniPlayerBar/Expanded) deve esconder o controle pra evitar confusao
    // do user. Tracked como MP3 follow-up.
    // D8: setSpeed reseta sleep timer.
    resetSleepTimer();
  }, [resetSleepTimer]);

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
    // D8: setVolume reseta sleep timer.
    resetSleepTimer();
  }, [resetSleepTimer]);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  // Apply volume + mute to underlying <audio> + Spotify driver.
  useEffect(() => {
    const effectiveVolume = isMuted ? 0 : volume;
    const a = audioRef.current;
    if (a) {
      try {
        a.volume = effectiveVolume;
      } catch {
        // ignore
      }
    }
    // MP2 R2-H1: propagar tambem ao Spotify driver (Web Playback SDK).
    try {
      spotifyDriverRef.current?.setVolume?.(effectiveVolume);
    } catch {
      // ignore
    }
  }, [volume, isMuted, activeTrack?.audioUrl, activeTrack?.source]);

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
  // MP3.1 R1 fix CRITICAL-2: tambem respeita queue + repeatMode + shuffle.
  //   1. repeatMode='one' -> replay current track via seek(0).
  //   2. courseContext + nextIndex < length -> proxima aula do curso.
  //   3. queue nao vazio -> shift head (skipToQueueItem do head equivale a pop).
  //   4. repeatMode='all' + courseContext -> volta pra primeira do curso.
  const tryAutoplayNext = useCallback(() => {
    // repeat one — replay.
    if (queue.repeatMode === "one" && activeTrackRef.current) {
      const a = audioRef.current;
      if (a) {
        try {
          a.currentTime = 0;
        } catch {
          // ignore
        }
      }
      setCurrentSeconds(0);
      setIsPlaying(true);
      return;
    }

    const ctxArg = courseContextRef.current;
    if (ctxArg) {
      const nextIndex = ctxArg.currentIndex + 1;
      if (nextIndex < ctxArg.lessons.length) {
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
        return;
      }
      // curso terminou — fallback queue + repeat-all.
      if (queue.repeatMode === "all" && ctxArg.lessons.length > 0) {
        const next = ctxArg.lessons[0];
        if (next.hasAccess !== false) {
          playTrack(next, { ...ctxArg, currentIndex: 0 });
          return;
        }
      }
    }

    // Fallback: pega proxima da fila (se existir).
    // MP3 R2 MEDIUM-NEW-1: respeitar shuffledOrder quando shuffle on.
    if (queue.queue && queue.queue.length > 0) {
      let nextItem: (typeof queue.queue)[number] | undefined;
      if (queue.shuffleEnabled && queue.shuffledOrder && queue.shuffledOrder.length > 0) {
        // Itera shuffledOrder ate achar item ainda na queue (defensive contra dessincronizacao).
        for (const sid of queue.shuffledOrder) {
          const found = queue.queue.find((q) => q.id === sid);
          if (found) {
            nextItem = found;
            break;
          }
        }
      }
      // Fallback linear (shuffle off, shuffledOrder vazio/stale, ou order ids fora da queue).
      if (!nextItem) {
        nextItem = queue.queue[0];
      }
      if (nextItem?.track) {
        // Remove o item consumido -> proxima vira o novo head (e tambem limpa do shuffledOrder via removeFromQueue).
        queue.removeFromQueue(nextItem.id);
        playTrack(nextItem.track as AudioTrack);
        emitTelemetry("next", {
          lessonId: nextItem.track.trackId,
          trigger: "autoplay_queue",
        });
        return;
      }
    }

    setIsPlaying(false);
  }, [playTrack, queue]);
  // MP2 R2-H1: manter ref atualizada pro Engine `ended` handler chamar autoplay.
  tryAutoplayNextRef.current = tryAutoplayNext;

  // Sync isPlaying state -> audio element (library) ou driver (spotify).
  useEffect(() => {
    // Spotify path: pause/play via driver. spotifyDriverRef setado no playTrack.
    if (activeTrack?.source === "spotify") {
      const drv = spotifyDriverRef.current;
      if (!drv) return;
      try {
        if (isPlaying) {
          // play() do driver eh async + idempotente; engine ja chamou no playTrack.
          // Aqui cobre toggle pause->play.
          drv.play?.();
        } else {
          drv.pause?.();
        }
      } catch {
        // ignore
      }
      return;
    }
    // Library path: <audio> HTML5.
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
  }, [isPlaying, activeTrack?.audioUrl, activeTrack?.source]);

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

  // === Sprint Mini Player 2 (CRITICAL-2 + HIGH-5) — connectSpotify ===
  // Recebe access_token + expiresIn pos initiateSpotifyAuth. Guarda em closure
  // ref (NUNCA em storage). O driver real eh lazy-instanciado quando o user
  // toca uma track Spotify (factory injetada na Engine, via ref).
  //
  // MP2 R2-H1 fix: cria Engine se ainda nao existe + injeta factory que
  // monta SpotifyAudioDriver com refresh callback + telemetry + premium gate.
  const connectSpotify = useCallback(
    (accessToken: string, expiresIn: number, displayName?: string) => {
      spotifyTokenRef.current = { accessToken, expiresIn, displayName };
      setIsSpotifyConnected(true);
      // MP2 R2-H1: instancia Engine + injeta factory pro driver Spotify.
      if (!engineRef.current) {
        engineRef.current = createAudioSourceEngine({
          onDriverSwitch: (info: DriverSwitchInfo) => {
            emitAudioEvent("audio_driver_switch", {
              from: info.from,
              to: info.to,
              reason: info.reason,
            });
          },
        });
        bindEngineEvents();
      }
      // Re-injeta factory sempre (caso reconnect com token novo).
      engineRef.current.setSpotifyDriverFactory((track: AudioTrack) => {
        const driver = new SpotifyAudioDriver({
          accessToken,
          expiresIn,
          refresh: async () => {
            const r = await refreshAccessToken();
            return { accessToken: r.accessToken, expiresIn: r.expiresIn };
          },
          telemetry: (action, payload) => {
            try {
              emitAudioEvent(action as any, payload as any);
            } catch {
              // ignore
            }
          },
          onTokenRefreshed: (newToken, newExp) => {
            spotifyTokenRef.current = {
              accessToken: newToken,
              expiresIn: newExp,
              displayName: spotifyTokenRef.current?.displayName,
            };
          },
          onReconnectFailed: () => {
            // Falha de reconnect -> limpa driver + state.
            try {
              spotifyDriverRef.current?.destroy?.();
            } catch {
              // ignore
            }
            spotifyDriverRef.current = null;
            setIsSpotifyConnected(false);
            emitAudioEvent("spotify_reconnect_failed", {});
          },
        });
        // Connect SDK -> deviceId pronto.
        // Fire-and-forget: connect e async, mas o driver guarda currentTrack
        // em load() + play() respeita deviceId nulo (no-op ate ready).
        try {
          (driver as any).connect?.();
        } catch {
          // ignore
        }
        return driver;
      });
      // CRITICAL-4 telemetry.
      emitAudioEvent("spotify_connected", { hasDisplayName: !!displayName });
    },
    [bindEngineEvents],
  );

  const disconnectSpotifyDriver = useCallback(() => {
    // MP2 R2-M1: se track Spotify ativa, parar playback + limpar UI.
    const wasPlayingSpotify =
      activeTrackRef.current?.source === "spotify";
    try {
      spotifyDriverRef.current?.destroy?.();
    } catch {
      // ignore
    }
    spotifyDriverRef.current = null;
    spotifyTokenRef.current = null;
    // Remove factory da Engine (sem destruir Engine — pode haver library).
    if (engineRef.current) {
      try {
        engineRef.current.setSpotifyDriverFactory(null);
      } catch {
        // ignore
      }
    }
    setIsSpotifyConnected(false);
    if (wasPlayingSpotify) {
      // Limpa state alinhado a close().
      setActiveTrack(null);
      setIsPlaying(false);
      setCurrentSeconds(0);
      setDurationSeconds(0);
      setCourseContext(null);
      setDisplayModeState((prev) => fsmNextOnClose(prev));
    }
    // CRITICAL-4 telemetry.
    emitAudioEvent("spotify_disconnected", {});
  }, []);

  // === TIER 3 #4 — Cross-reload resume snapshot ===
  // Boot: tenta restaurar last session (no auto-play; user clica play).
  const didRestoreRef = useRef(false);
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    const snap = readResumeSnapshot();
    if (!snap) return;
    // NAO restaura activeTrack inteiro — apenas o trackId + segundos.
    // Componentes que conhecem o catalogo (LessonPicker) podem oferecer
    // "continuar de onde parou" via snapshot.trackId. Aqui restauramos
    // apenas currentSeconds quando a track for tocada novamente com mesmo id.
    // Estado expoe via leitura externa (window flag p/ debug; OAuth ja usa similar).
    try {
      (window as any).__audioPlayerLastResumeSnapshot = snap;
    } catch {
      // ignore
    }
  }, []);

  // Persist snapshot throttled durante playback (reviewer HIGH-1).
  // Antes: debounce 2s reschedulado a cada timeupdate (~4x/s) -> nunca persistia
  // durante playback continuo, so em pause/beforeunload. Crash sem beforeunload
  // perdia tudo.
  // Agora: setInterval 10s enquanto playing -> snapshot atualizado mesmo em
  // playback longo. Pause/beforeunload continuam imediatos (efeitos abaixo).
  const persistIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPersistedSecondsRef = useRef<number>(0);
  useEffect(() => {
    if (persistIntervalRef.current) {
      clearInterval(persistIntervalRef.current);
      persistIntervalRef.current = null;
    }
    if (!activeTrack || !isPlaying) return;
    persistIntervalRef.current = setInterval(() => {
      const t = activeTrackRef.current;
      if (!t) return;
      // Skip write se posicao nao mudou (track parada por outro motivo).
      if (Math.abs(currentSeconds - lastPersistedSecondsRef.current) < 1) {
        return;
      }
      lastPersistedSecondsRef.current = currentSeconds;
      writeResumeSnapshot({
        trackId: t.trackId,
        currentSeconds,
        isPlaying: true,
        timestamp: Date.now(),
      });
    }, 10000);
    return () => {
      if (persistIntervalRef.current) {
        clearInterval(persistIntervalRef.current);
        persistIntervalRef.current = null;
      }
    };
  }, [activeTrack?.trackId, isPlaying, currentSeconds]);

  // Persist on pause + beforeunload (immediate, bypass debounce).
  useEffect(() => {
    if (!activeTrack) return;
    if (isPlaying) return; // pause-event window: persist immediate
    try {
      writeResumeSnapshot({
        trackId: activeTrack.trackId,
        currentSeconds,
        isPlaying: false,
        timestamp: Date.now(),
      });
    } catch {
      // ignore
    }
  }, [isPlaying, activeTrack, currentSeconds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeUnload = () => {
      const t = activeTrackRef.current;
      if (!t) return;
      try {
        writeResumeSnapshot({
          trackId: t.trackId,
          currentSeconds,
          isPlaying,
          timestamp: Date.now(),
        });
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [currentSeconds, isPlaying]);

  // === Heartbeat (CRITICAL-4) — emit `audio_driver_active` a cada 60s ===
  useEffect(() => {
    if (!isPlaying || !activeTrack) return;
    const driver = activeTrack.source;
    const intervalId = setInterval(() => {
      emitAudioEvent("audio_driver_active", {
        driver,
        trackId: activeTrack.trackId,
      });
    }, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [isPlaying, activeTrack]);

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
      // Sprint Mini Player 2 (RF-NEW.3).
      sleepTimerMinutes,
      sleepTimerRemainingSeconds,
      setSleepTimer,
      cancelSleepTimer,
      resetSleepTimer,
      // Sprint Mini Player 2 (CRITICAL-2 + HIGH-5).
      connectSpotify,
      disconnectSpotifyDriver,
      isSpotifyConnected,
      // Sprint Mini Player 3 (RF-05) MP3.1 R1 fix CRITICAL-2.
      queueItems: queue.queue,
      repeatMode: queue.repeatMode,
      shuffleEnabled: queue.shuffleEnabled,
      addToQueue: queue.addToQueue,
      removeFromQueue: queue.removeFromQueue,
      clearQueue: queue.clearQueue,
      setRepeatMode: queue.setRepeatMode,
      toggleShuffle: queue.toggleShuffle,
      skipToQueueItem: queue.skipToQueueItem,
      reorderQueue: queue.reorderQueue,
      // Sprint Mini Player 3.1 Wave B / TIER 3 #5 + #6.
      loadError,
      retryCurrent,
      clearLoadError,
      isBuffering,
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
      sleepTimerMinutes,
      sleepTimerRemainingSeconds,
      setSleepTimer,
      cancelSleepTimer,
      resetSleepTimer,
      connectSpotify,
      disconnectSpotifyDriver,
      isSpotifyConnected,
      queue.queue,
      queue.repeatMode,
      queue.shuffleEnabled,
      queue.addToQueue,
      queue.removeFromQueue,
      queue.clearQueue,
      queue.setRepeatMode,
      queue.toggleShuffle,
      queue.skipToQueueItem,
      queue.reorderQueue,
      loadError,
      retryCurrent,
      clearLoadError,
      isBuffering,
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
          onCanPlay={() => {
            clearBufferingTimeout();
            setIsBuffering(false);
          }}
          onWaiting={() => {
            setIsBuffering(true);
            armBufferingTimeout();
          }}
          onError={(e) => {
            const err: any = (e.currentTarget as HTMLAudioElement)?.error;
            const message = err?.message ?? `code_${err?.code ?? "unknown"}`;
            clearBufferingTimeout();
            setIsBuffering(false);
            setLoadError(String(message));
            emitAudioEvent("audio_track_error", {
              source: "html_audio",
              message: String(message),
            });
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
