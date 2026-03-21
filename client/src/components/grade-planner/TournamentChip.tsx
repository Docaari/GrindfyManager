import { Star } from "lucide-react";
import { prepareTournamentChip } from "@shared/grade-chip-data";
import { getPlannerSiteColor, getPlannerTypeColor, getPlannerSpeedColor } from "@/lib/poker-colors";
import { formatBuyIn } from "@shared/platform-currency";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TournamentChipProps {
  tournament: any;
  onClick?: () => void;
}

const TYPE_BG: Record<string, string> = {
  green: "bg-green-900/40",
  blue: "bg-blue-900/40",
  amber: "bg-amber-900/40",
  gray: "bg-gray-700",
};

const SPEED_BADGE_COLORS: Record<string, string> = {
  Normal: "bg-gray-600 text-gray-300",
  Turbo: "bg-yellow-600/80 text-yellow-100",
  Hyper: "bg-red-600/80 text-red-100",
};

const SITE_ABBREVIATIONS: Record<string, string> = {
  PokerStars: "PS",
  PartyPoker: "PP",
  "888poker": "888",
  GGPoker: "GG",
  WPN: "WPN",
  iPoker: "iP",
  CoinPoker: "CP",
  Chico: "CH",
  Revolution: "Rev",
  Bodog: "BD",
  Suprema: "SUP",
};

export function TournamentChip({ tournament, onClick }: TournamentChipProps) {
  const chip = prepareTournamentChip(tournament);
  const siteColor = getPlannerSiteColor(tournament.site);
  const typeBg = TYPE_BG[chip.typeColor] || TYPE_BG.gray;
  const siteAbbr = SITE_ABBREVIATIONS[tournament.site] || tournament.site?.slice(0, 3) || "?";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`rounded-md px-1.5 py-0.5 text-xs cursor-pointer hover:brightness-125 transition-all ${typeBg} border border-gray-600/50`}
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
          >
            <div className="flex items-center gap-1 min-w-0">
              {chip.priorityIndicator === "star" && (
                <Star className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" fill="currentColor" />
              )}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${siteColor}`} />
              <span className="text-emerald-400 font-bold text-xs flex-shrink-0">
                {chip.buyInDisplay}
              </span>
              <span className="text-gray-300 truncate text-[10px]">
                {chip.nameShort || siteAbbr}
              </span>
              {chip.speedBadge && (
                <span className={`text-[9px] px-1 rounded flex-shrink-0 ${SPEED_BADGE_COLORS[tournament.speed] || ""}`}>
                  {chip.speedBadge}
                </span>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-gray-800 border-gray-600 text-white max-w-[250px]">
          <div className="space-y-1 text-xs">
            <div className="font-semibold">{tournament.name || siteAbbr}</div>
            <div className="flex items-center gap-2 text-gray-300">
              <span>{tournament.site}</span>
              <span>|</span>
              <span className="text-emerald-400 font-bold">{formatBuyIn(tournament.buyIn || "0", tournament.site)}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span>{tournament.type || "Vanilla"}</span>
              <span>|</span>
              <span>{tournament.speed || "Normal"}</span>
              {tournament.time && (
                <>
                  <span>|</span>
                  <span>{tournament.time}</span>
                </>
              )}
            </div>
            {tournament.guaranteed && parseFloat(tournament.guaranteed) > 0 && (
              <div className="text-gray-400">
                GTD: ${parseFloat(tournament.guaranteed).toLocaleString("pt-BR")}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
