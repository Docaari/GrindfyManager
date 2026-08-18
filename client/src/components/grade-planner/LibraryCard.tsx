import { useState, useRef, useEffect } from "react";
import { Trash2, Plus } from "lucide-react";
import { getPlannerSiteColor, getPlannerSpeedColor, getPlannerTypeColor } from "@/lib/poker-colors";
import { formatBuyIn } from "@shared/platform-currency";
import { Badge } from "@/components/ui/badge";

/** Delay (ms) antes do X de exclusao aparecer ao passar o mouse no card. */
export const LIBRARY_CARD_DELETE_REVEAL_MS = 650;

interface LibraryCardProps {
  tournament: any;
  compact?: boolean;
  onTrash?: (id: string) => void;
  /** When provided, the card renders as a draggable item */
  dragHandleProps?: any;
  innerRef?: any;
  draggableProps?: any;
  /**
   * Sprint day-detail-zoom-1 §RF-04(c) — mobile click-to-add fallback.
   * Quando true, renderiza botao "+" no canto. Default false (back-compat).
   */
  showAddInlineButton?: boolean;
  /** Callback do botao "+" mobile. */
  onAddInline?: () => void;
  /**
   * Sprint grade-planner-library-and-multi-day §RF-03 (ADR-245 §D3).
   * Quando presente, o card responde ao clique (abre a escolha de dias) alem do
   * arrasto. OPCIONAL de proposito: sem ela o card segue como hoje, so
   * arrastavel — e o que mantem BibliotecaEmbedded intocado.
   * Quem filtra clique falso pos-arrasto e o caller (library-click-guard.ts).
   */
  onCardClick?: () => void;
}

const SOURCE_ICONS: Record<string, string> = {
  manual: "M",
  suprema: "S",
  "grind-live": "G",
};

const SPEED_BADGE_STYLES: Record<string, string> = {
  Normal: "bg-gray-500 text-white",
  Turbo: "bg-yellow-600/80 text-yellow-100",
  Hyper: "bg-red-600/80 text-red-100",
};

const TYPE_BADGE_STYLES: Record<string, string> = {
  Vanilla: "bg-blue-600/60 text-blue-200",
  PKO: "bg-green-600/60 text-green-200",
  Mystery: "bg-amber-600/60 text-amber-200",
};

export function LibraryCard({
  tournament,
  compact = false,
  onTrash,
  dragHandleProps,
  innerRef,
  draggableProps,
  showAddInlineButton = false,
  onAddInline,
  onCardClick,
}: LibraryCardProps) {
  const siteColor = getPlannerSiteColor(tournament.site);
  const parsedBuyIn = parseFloat(tournament.buyIn || "0");
  const buyIn = isNaN(parsedBuyIn) ? 0 : parsedBuyIn;

  // Exclusao: o X so aparece depois de LIBRARY_CARD_DELETE_REVEAL_MS com o
  // mouse parado no card. Atraso deliberado — o card e draggable (cursor-grab),
  // um X instantaneo no hover atrapalha o arrasto e gera exclusao acidental.
  const [showDelete, setShowDelete] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!onTrash) return;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(
      () => setShowDelete(true),
      LIBRARY_CARD_DELETE_REVEAL_MS,
    );
  };

  const handleMouseLeave = () => {
    if (revealTimer.current) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    setShowDelete(false);
  };

  // Affordance do clique (RF-03). Sem `onCardClick` nada disso e emitido: o card
  // continua exatamente o de hoje (so arrastavel).
  const clickable = typeof onCardClick === "function";
  // `role` entra DEPOIS de dragHandleProps de proposito: o rbd marca todo drag
  // handle como role="button" (react-beautiful-dnd.cjs.js:7925). Card sem acao
  // de clique nao e botao — anunciar "button" sem clique associado engana o
  // leitor de tela. O tabIndex/data-rbd-* do rbd continuam intactos, entao o
  // arrasto por teclado nao muda.
  const clickableProps: Record<string, unknown> = clickable
    ? {
        role: "button",
        title: "Clique para escolher os dias da semana",
        onClick: () => onCardClick?.(),
      }
    : { role: undefined };

  if (compact) {
    return (
      <div
        ref={innerRef}
        {...draggableProps}
        {...dragHandleProps}
        {...clickableProps}
        data-testid={`library-card-${tournament.id}`}
        className={`flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-700 transition-colors group ${
          clickable ? "cursor-pointer" : "cursor-grab"
        }`}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${siteColor}`} />
        <span className="text-emerald-400 font-bold text-sm flex-shrink-0">
          ${buyIn.toFixed(0)}
        </span>
        <span className="text-white text-xs truncate flex-1 min-w-0">
          {tournament.name || tournament.site}
        </span>
        {showAddInlineButton && onAddInline && (
          <button
            type="button"
            data-testid={`library-card-add-inline-${tournament.id}`}
            onClick={(e) => { e.stopPropagation(); onAddInline(); }}
            className="ml-auto flex-shrink-0 w-6 h-6 flex items-center justify-center rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={innerRef}
      {...draggableProps}
      {...dragHandleProps}
      {...clickableProps}
      data-testid={`library-card-${tournament.id}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`bg-gray-800 border border-gray-700 rounded-lg p-3 hover:border-gray-500 transition-colors group shadow-lg shadow-black/20 ${
        clickable ? "cursor-pointer" : "cursor-grab"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Site color indicator */}
        <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${siteColor}`} />

        <div className="flex-1 min-w-0">
          {/* Buy-in in green, large */}
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold text-xl">
              {formatBuyIn(tournament.buyIn || "0", tournament.site)}
            </span>
            <span className="text-xs text-gray-400 uppercase">
              {SOURCE_ICONS[tournament.source] || ""}
            </span>
          </div>

          {/* Tournament name */}
          <div className="text-white text-base truncate mt-0.5">
            {tournament.name || tournament.site}
          </div>

          {/* Site + time */}
          <div className="text-gray-400 text-xs mt-1">
            {tournament.site}
            {tournament.time && ` - ${tournament.time}`}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 mt-2">
            {tournament.speed && tournament.speed !== "Normal" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${SPEED_BADGE_STYLES[tournament.speed] || "bg-gray-500 text-white"}`}>
                {tournament.speed}
              </span>
            )}
            {tournament.speed === "Normal" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500 text-white">
                Normal
              </span>
            )}
            {tournament.type && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGE_STYLES[tournament.type] || "bg-gray-500 text-white"}`}>
                {tournament.type}
              </span>
            )}
            {tournament.guaranteed && parseFloat(tournament.guaranteed) > 0 && (
              <span className="text-xs text-gray-400">
                GTD ${parseFloat(tournament.guaranteed).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>

        {/* Trash button — aparece apos LIBRARY_CARD_DELETE_REVEAL_MS de hover */}
        {onTrash && showDelete && (
          <button
            data-testid="library-card-delete"
            onClick={(e) => {
              e.stopPropagation();
              onTrash(tournament.id);
            }}
            className="p-1 rounded hover:bg-red-900/50 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 animate-in fade-in"
            title="Mover para lixeira"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Sprint day-detail-zoom-1 §RF-04(c) — botao "+" inline mobile. */}
        {showAddInlineButton && (
          <button
            type="button"
            data-testid={`library-card-add-inline-${tournament.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (onAddInline) onAddInline();
            }}
            className="p-1 rounded hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0"
            title="Adicionar ao primeiro slot livre"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
