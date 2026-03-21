import { Trash2 } from "lucide-react";
import { getPlannerSiteColor, getPlannerSpeedColor, getPlannerTypeColor } from "@/lib/poker-colors";
import { Badge } from "@/components/ui/badge";

interface LibraryCardProps {
  tournament: any;
  compact?: boolean;
  onTrash?: (id: string) => void;
  /** When provided, the card renders as a draggable item */
  dragHandleProps?: any;
  innerRef?: any;
  draggableProps?: any;
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
}: LibraryCardProps) {
  const siteColor = getPlannerSiteColor(tournament.site);
  const buyIn = parseFloat(tournament.buyIn || "0");

  if (compact) {
    return (
      <div
        ref={innerRef}
        {...draggableProps}
        {...dragHandleProps}
        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-700 transition-colors cursor-grab group"
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${siteColor}`} />
        <span className="text-emerald-400 font-bold text-sm flex-shrink-0">
          ${buyIn.toFixed(0)}
        </span>
        <span className="text-white text-xs truncate flex-1 min-w-0">
          {tournament.name || tournament.site}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={innerRef}
      {...draggableProps}
      {...dragHandleProps}
      className="bg-gray-800 border border-gray-700 rounded-lg p-3 hover:border-gray-500 transition-colors cursor-grab group"
    >
      <div className="flex items-start gap-3">
        {/* Site color indicator */}
        <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${siteColor}`} />

        <div className="flex-1 min-w-0">
          {/* Buy-in in green, large */}
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold text-lg">
              ${buyIn.toFixed(0)}
            </span>
            <span className="text-xs text-gray-400 uppercase">
              {SOURCE_ICONS[tournament.source] || ""}
            </span>
          </div>

          {/* Tournament name */}
          <div className="text-white text-sm truncate mt-0.5">
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

        {/* Trash button on hover */}
        {onTrash && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTrash(tournament.id);
            }}
            className="p-1 rounded hover:bg-red-900/50 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
            title="Mover para lixeira"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
