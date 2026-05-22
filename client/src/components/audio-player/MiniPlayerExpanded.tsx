// MiniPlayerExpanded — Sprint Mini Player 1 / RF-04.
// Painel renderizado acima da bar quando displayMode === 'expanded'.
// Cover 120x120 + lista readonly das aulas do curso.

import React from "react";
import { ChevronDown, X } from "lucide-react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

export function MiniPlayerExpanded() {
  const { activeTrack, displayMode, courseContext, setDisplayMode, close } =
    useAudioPlayer();

  if (displayMode !== "expanded" || !activeTrack) return null;

  const lessons: any[] = courseContext?.lessons ?? [];
  const currentIndex: number = courseContext?.currentIndex ?? -1;

  return (
    <>
      <div
        data-testid="mini-player-expanded-backdrop"
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setDisplayMode("bar")}
      />
      <div
        data-testid="mini-player-expanded"
        role="dialog"
        aria-modal="false"
        aria-label="Player expandido"
        className="fixed left-0 right-0 bottom-[var(--mini-player-height,80px)] z-45 mx-auto max-w-3xl p-6 bg-gray-900/95 rounded-t-lg border border-white/10"
        style={{
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-white">
            {activeTrack.title ?? ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="mini-player-expanded-minimize"
              aria-label="Minimizar"
              title="Minimizar"
              className="p-2 hover:bg-white/10 rounded-md text-white"
              onClick={() => setDisplayMode("bar")}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="mini-player-expanded-close"
              aria-label="Fechar player"
              title="Fechar"
              className="p-2 hover:bg-white/10 rounded-md text-white"
              onClick={() => close()}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-6">
          {activeTrack.coverUrl ? (
            <img
              src={activeTrack.coverUrl}
              alt=""
              className="w-[120px] h-[120px] rounded-lg object-cover"
            />
          ) : (
            <div className="w-[120px] h-[120px] rounded-lg bg-gray-700" />
          )}

          <div className="flex-1 min-w-0">
            {activeTrack.courseTitle ? (
              <div className="text-sm text-gray-400 mb-2">
                {activeTrack.courseTitle}
              </div>
            ) : null}

            <ul className="space-y-1 max-h-[40vh] overflow-y-auto">
              {lessons.map((lesson: any, idx: number) => {
                const isCurrent = idx === currentIndex;
                return (
                  <li
                    key={lesson.trackId ?? idx}
                    data-mini-player-current={isCurrent ? "true" : "false"}
                    className={
                      "px-3 py-2 rounded-md text-sm " +
                      (isCurrent
                        ? "bg-emerald-500/20 text-white"
                        : "text-gray-300 hover:bg-white/5")
                    }
                  >
                    {lesson.title ?? ""}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
