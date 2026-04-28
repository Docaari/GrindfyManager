// =============================================================================
// SessionSpotsList — Sprint F2 W3 (RF-08)
// Lista lateral renderizada no Cooldown (Bloco 1) com prints da sessao atual.
// Cada item: thumbnail draggable + click preview + botao "Revisar Depois".
//
// Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-08)
// Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2A)
// C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
//
// Lessons aplicadas:
//   #1  hooks first (este componente nao tem hooks; render puro)
//   #2  data-testid estavel (session-spots-list, session-spot-item-{id},
//                            session-spots-empty, spot-review-later-{id})
//   #11 default minimo — apenas o que a spec define
// =============================================================================
import { SPOT_DRAG_MIME, getSpotImageUrl } from "@/lib/spotConstants";

export interface SessionSpot {
  id: string;
  imageUrl: string;
  sessionTournamentId?: string | null;
  pastedAt: string;
}

export interface SessionSpotsListProps {
  sessionId: string;
  spots: SessionSpot[];
  onPreview?: (spotId: string) => void;
  onReviewLater?: (spotId: string) => void;
  emptyMessage?: string;
}

export default function SessionSpotsList(props: SessionSpotsListProps) {
  const {
    spots,
    onPreview,
    onReviewLater,
    emptyMessage = "Nenhum print colado nesta sessao.",
  } = props;

  if (!spots || spots.length === 0) {
    return (
      <div
        data-testid="session-spots-empty"
        className="rounded border border-dashed p-3 text-xs text-muted-foreground"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-testid="session-spots-list"
      className="space-y-2"
      aria-label="Prints colados nesta sessao"
    >
      {spots.map((s) => (
        <div
          key={s.id}
          data-testid={`session-spot-item-${s.id}`}
          draggable={true}
          onDragStart={(e) => {
            e.dataTransfer.setData(SPOT_DRAG_MIME, s.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => onPreview?.(s.id)}
          className="flex items-center gap-2 rounded border p-2 cursor-grab active:cursor-grabbing hover:bg-muted/50"
        >
          <img
            src={getSpotImageUrl(s.id)}
            alt="Spot"
            className="h-12 w-12 rounded object-cover"
            draggable={false}
            loading="lazy"
          />
          <div className="flex-1 text-xs text-muted-foreground">
            <div>Drag para revisar</div>
          </div>
          <button
            type="button"
            data-testid={`spot-review-later-${s.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onReviewLater?.(s.id);
            }}
            className="rounded border px-2 py-1 text-[10px]"
          >
            Revisar Depois
          </button>
        </div>
      ))}
    </div>
  );
}
