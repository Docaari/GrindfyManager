// =============================================================================
// StickyAudioBar - Sprint Biblioteca-1 / RF-08 + D6 + UX Round.
//
// Mini-player flutuante que aparece em mobile (<1024px) quando ha audio
// rodando via AudioPlayerContext.
//
// UX Round Implementer:
//   F8  - thin progress bar at top showing position/duration percentage
//   F19 - skip back 15s button
// =============================================================================

import React from "react";
import { SkipBack } from "lucide-react";
import { useOptionalAudioPlayer } from "@/contexts/AudioPlayerContext";

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  // Prefer matchMedia; mas em jsdom basico (polyfill devolve sempre false),
  // tambem checamos innerWidth como sinal corroborante. Se ambos forem
  // <=1024 ou mobile, renderiza. Mantem comportamento de prod (matchMedia
  // verdadeiro) e atende test envs onde matchMedia eh stub.
  let mqMobile = false;
  if (typeof window.matchMedia === "function") {
    try {
      mqMobile = window.matchMedia("(max-width: 1023px)").matches;
    } catch {
      // ignore
    }
  }
  if (mqMobile) return true;
  const w = window.innerWidth ?? 0;
  return w > 0 && w <= 1024;
}

export function StickyAudioBar() {
  // Sprint Bloco-A-Polish: usar useOptionalAudioPlayer pra que pode renderizar
  // em paginas (LessonHeroPage) sem AudioPlayerProvider explicito acima — em
  // contextos de teste a barra simplesmente retorna null.
  const ctx = useOptionalAudioPlayer();

  // Hooks first (lesson #1) - early return depois.
  if (!ctx) return null;
  const { current, isPlaying, currentSeconds, durationSeconds, toggle, close, skipBack } = ctx;
  if (!current) return null;
  if (!isMobileViewport()) return null;

  // F8: progress percentage. Fallback to 0 when duration unknown.
  const pct =
    durationSeconds > 0
      ? Math.max(0, Math.min(100, (currentSeconds / durationSeconds) * 100))
      : 0;

  return (
    <div
      data-testid="sticky-audio-bar"
      role="complementary"
      aria-label="Player de audio em background"
      className="fixed bottom-0 inset-x-0 z-50 bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center gap-3"
    >
      {/* F8: thin progress bar at the top of the bar */}
      <div
        data-testid="sticky-audio-bar-progress"
        aria-hidden
        className="absolute top-0 left-0 right-0 h-0.5 bg-gray-700"
      >
        <div
          className="h-full bg-green-400 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      {current.coverUrl && (
        <img
          src={current.coverUrl}
          alt={current.title}
          className="w-10 h-10 rounded object-cover flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p
          data-testid="sticky-audio-bar-title"
          className="text-sm font-medium text-white truncate"
        >
          {current.title}
        </p>
        {current.courseTitle && (
          <p
            data-testid="sticky-audio-bar-subtitle"
            className="text-[11px] text-gray-400 truncate"
          >
            {current.courseTitle}
          </p>
        )}
      </div>

      {/* F19: skip back 15s */}
      <button
        type="button"
        data-testid="sticky-audio-bar-skip-back"
        onClick={() => skipBack(15)}
        className="p-1.5 rounded text-gray-300 hover:text-white"
        aria-label="Voltar 15 segundos"
      >
        <SkipBack size={16} />
      </button>

      <button
        data-testid="sticky-audio-bar-toggle"
        onClick={toggle}
        className="px-3 py-1 rounded bg-green-600 text-white text-xs font-medium"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <button
        data-testid="sticky-audio-bar-close"
        onClick={close}
        className="px-2 py-1 rounded text-gray-400 hover:text-white"
        aria-label="Fechar player"
      >
        x
      </button>
    </div>
  );
}

export default StickyAudioBar;
