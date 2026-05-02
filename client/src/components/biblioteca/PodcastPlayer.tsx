// =============================================================================
// PodcastPlayer - Sprint Biblioteca-1 / UX Round Implementer F10.
//
// Custom audio player for podcast format. Replaces the bare <audio controls>
// inside LessonViewer when format is podcast. Reuses AudioPlayerContext so
// playback state persists across navigation (Lesson #12).
//
// Controls:
//   - Cover art (large, centered)
//   - Skip back 15s | Play/Pause | Skip forward 15s
//   - Seek bar (clickable)
//   - Speed dropdown (0.75 / 1 / 1.25 / 1.5 / 1.75 / 2)
//   - Time current / total
//
// Round 2 additions:
//   - D5: keyboard shortcuts (Space = play/pause, ArrowLeft/Right = skip 15s)
//   - F-A5.5: courseTitle prop wired into AudioPlayerLesson so the sticky bar
//     can show a secondary line.
// =============================================================================

import React, { useEffect, useRef } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function formatMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface PodcastPlayerProps {
  lessonId: string;
  audioUrl: string;
  title: string;
  coverUrl?: string | null;
  durationSeconds?: number;
  /** F-A5.5: optional secondary line shown in StickyAudioBar */
  courseTitle?: string | null;
}

export function PodcastPlayer({
  lessonId,
  audioUrl,
  title,
  coverUrl,
  durationSeconds,
  courseTitle,
}: PodcastPlayerProps) {
  const {
    current,
    isPlaying,
    currentSeconds,
    durationSeconds: ctxDuration,
    speed,
    play,
    toggle,
    seek,
    setSpeed,
    skipBack,
    skipForward,
  } = useAudioPlayer();

  // Hooks first (lesson #1).
  // Auto-load this lesson into the global context if not already current.
  useEffect(() => {
    if (current?.lessonId !== lessonId) {
      play({
        lessonId,
        audioUrl,
        title,
        coverUrl: coverUrl ?? null,
        durationSeconds,
        courseTitle: courseTitle ?? null,
      });
    }
    // We deliberately do NOT auto-play if user already paused via the global
    // bar - the play() above starts playback for the new lesson which is the
    // expected behavior when opening the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, audioUrl]);

  // D5: keyboard shortcuts on the player container. Space = toggle, Arrows =
  // skip 15s. Ignored when focus sits inside an input/select to keep typing
  // intact.
  const containerRef = useRef<HTMLDivElement | null>(null);
  function handleKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA")
    ) {
      return;
    }
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      skipBack(15);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      skipForward(15);
    }
  }

  const isThisLessonActive = current?.lessonId === lessonId;
  const effectiveDuration = isThisLessonActive
    ? ctxDuration || (durationSeconds ?? 0)
    : durationSeconds ?? 0;
  const effectiveCurrent = isThisLessonActive ? currentSeconds : 0;
  const pct =
    effectiveDuration > 0
      ? Math.max(0, Math.min(100, (effectiveCurrent / effectiveDuration) * 100))
      : 0;

  function handleSeekChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    const target = (v / 100) * effectiveDuration;
    seek(target);
  }

  function handleSpeedChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v) || v <= 0) return;
    setSpeed(v);
  }

  return (
    <div
      data-testid="podcast-player"
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Player de podcast"
      onKeyDown={handleKeyDown}
      className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4 focus:outline-none focus:ring-2 focus:ring-green-500/40"
    >
      {coverUrl && (
        <div className="mx-auto w-48 h-48 rounded-lg overflow-hidden bg-gray-800">
          <img
            src={coverUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <h3 className="text-center text-lg font-semibold text-white">{title}</h3>

      {/* Seek bar */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={pct}
          onChange={handleSeekChange}
          data-testid="podcast-player-seek"
          aria-label="Posicao da reproducao"
          className="w-full accent-green-500"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span data-testid="podcast-player-time-current">
            {formatMmSs(effectiveCurrent)}
          </span>
          <span data-testid="podcast-player-time-total">
            {formatMmSs(effectiveDuration)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => skipBack(15)}
          data-testid="podcast-player-skip-back"
          aria-label="Voltar 15 segundos"
          className="p-2 rounded-full text-gray-300 hover:text-white hover:bg-gray-800"
        >
          <SkipBack size={22} />
        </button>
        <button
          type="button"
          onClick={toggle}
          data-testid="podcast-player-toggle"
          aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          className="p-3 rounded-full bg-green-600 text-white hover:bg-green-500"
        >
          {isPlaying ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button
          type="button"
          onClick={() => skipForward(15)}
          data-testid="podcast-player-skip-forward"
          aria-label="Avancar 15 segundos"
          className="p-2 rounded-full text-gray-300 hover:text-white hover:bg-gray-800"
        >
          <SkipForward size={22} />
        </button>
      </div>

      {/* Speed */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <label htmlFor={`speed-${lessonId}`}>Velocidade</label>
        <select
          id={`speed-${lessonId}`}
          data-testid="podcast-player-speed"
          value={String(speed)}
          onChange={handleSpeedChange}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default PodcastPlayer;
