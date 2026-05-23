// Sprint Mini Player 3 / RF-05.2/03/04 — QueuePopover (Queue UI).
// ADR-193 + D9 + D12 + D13. Lista de QueueItem com clear/repeat/shuffle/skip/remove.
// Drag-and-drop via dnd-kit lazy (ErrorBoundary fallback caso falha de load — lesson #29).

import React, { Component } from "react";
import { formatDuration } from "@/lib/audio-engine/formatDuration";
import {
  sanitizeCoverUrl,
  sanitizeSpotifyCoverUrl,
} from "@/lib/audio-engine/sanitizeCoverUrl";

type RepeatMode = "off" | "all" | "one";

interface QueueItemShape {
  id: string;
  addedAt: number;
  track: {
    source: "library" | "spotify";
    trackId: string;
    title: string;
    audioUrl?: string;
    coverUrl?: string | null;
    durationSeconds?: number;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueueItemShape[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  onRemove: (id: string) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onClear: () => void;
  onSkip: (id: string) => void;
  onRepeatChange: (mode: RepeatMode) => void;
  onToggleShuffle: () => void;
}

interface BoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

/**
 * Local ErrorBoundary (lesson #29). Captura render error caso dnd-kit lazy
 * import falhe ou throw inesperado. Mantem queue funcional (skip/remove)
 * mesmo sem drag-and-drop.
 */
class QueueErrorBoundary extends Component<
  BoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("[QueueErrorBoundary] captured render error:", error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function nextRepeatMode(curr: RepeatMode): RepeatMode {
  if (curr === "off") return "all";
  if (curr === "all") return "one";
  return "off";
}

function QueueItemRow({
  item,
  onRemove,
  onSkip,
}: {
  item: QueueItemShape;
  onRemove: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const isSpotify = item.track.source === "spotify";
  // Sprint SPOTIFY-DEEP / RF-05 — cover Spotify strict whitelist.
  const coverUrlSanitized = isSpotify
    ? sanitizeSpotifyCoverUrl(item.track.coverUrl ?? null)
    : sanitizeCoverUrl(item.track.coverUrl ?? null);
  return (
    <li
      data-testid={`queue-item-${item.id}`}
      className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/5"
    >
      {coverUrlSanitized ? (
        <img
          src={coverUrlSanitized}
          alt=""
          className="w-8 h-8 rounded object-cover flex-shrink-0"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-white">{item.track.title}</div>
        <div className="text-xs text-gray-400">
          {formatDuration(item.track.durationSeconds ?? null)}
          {isSpotify ? (
            <span
              data-testid="queue-badge-spotify"
              aria-label="Spotify"
              title="Spotify"
              className="ml-2 rounded bg-green-700/30 px-1 text-[10px] text-green-300"
            >
              Spotify
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        data-testid={`queue-item-skip-${item.id}`}
        aria-label={`Tocar ${item.track.title}`}
        onClick={() => onSkip(item.id)}
        className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10"
      >
        Tocar
      </button>
      <button
        type="button"
        data-testid={`queue-item-remove-${item.id}`}
        aria-label={`Remover ${item.track.title} da fila`}
        onClick={() => onRemove(item.id)}
        className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10"
      >
        X
      </button>
    </li>
  );
}

export function QueuePopover(props: Props) {
  const {
    open,
    queue,
    repeatMode,
    shuffleEnabled,
    onRemove,
    onClear,
    onSkip,
    onRepeatChange,
    onToggleShuffle,
  } = props;

  if (!open) return null;

  const fallback = (
    <div
      data-testid="queue-popover"
      role="dialog"
      aria-label="Fila de reproducao"
      className="fixed bottom-20 right-4 z-50 w-80 rounded-md border border-white/10 bg-gray-900 p-3 text-sm text-white"
    >
      <p className="text-xs text-red-400">Queue indisponivel.</p>
    </div>
  );

  return (
    <QueueErrorBoundary fallback={fallback}>
      <div
        data-testid="queue-popover"
        role="dialog"
        aria-label="Fila de reproducao"
        className="fixed bottom-20 right-4 z-50 w-80 rounded-md border border-white/10 bg-gray-900 p-3 text-sm text-white shadow-lg"
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Fila ({queue.length})</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="queue-shuffle-btn"
              aria-label={shuffleEnabled ? "Desativar shuffle" : "Ativar shuffle"}
              onClick={onToggleShuffle}
              className={
                "rounded px-2 py-1 text-xs " +
                (shuffleEnabled
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:bg-white/10")
              }
            >
              Shuffle
            </button>
            <button
              type="button"
              data-testid="queue-repeat-btn"
              aria-label={`Repeat: ${repeatMode}`}
              onClick={() => onRepeatChange(nextRepeatMode(repeatMode))}
              className={
                "rounded px-2 py-1 text-xs " +
                (repeatMode === "off"
                  ? "text-gray-400 hover:bg-white/10"
                  : "bg-white/10 text-white")
              }
            >
              Repeat {repeatMode === "one" ? "1" : ""}
            </button>
            <button
              type="button"
              data-testid="queue-clear-btn"
              aria-label="Limpar fila"
              onClick={onClear}
              className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10"
            >
              Limpar
            </button>
          </div>
        </div>
        {queue.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">
            Fila vazia. Adicione aulas via biblioteca.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {queue.map((item) => (
              <QueueItemRow
                key={item.id}
                item={item}
                onRemove={onRemove}
                onSkip={onSkip}
              />
            ))}
          </ul>
        )}
      </div>
    </QueueErrorBoundary>
  );
}

export default QueuePopover;
