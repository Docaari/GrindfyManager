import { Star, Clock } from "lucide-react";
import { getPlannerSiteColor } from "@/lib/poker-colors";
import { calculateLateRegDeadline, getLateRegColor } from "@/lib/lateRegUtils";

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
};

interface TournamentPillProps {
  tournament: any;
  compact: boolean;
  onClick: () => void;
}

export function TournamentPill({ tournament, compact, onClick }: TournamentPillProps) {
  const siteColor = getPlannerSiteColor(tournament.site);
  const siteAbbr = SITE_ABBREVIATIONS[tournament.site] || tournament.site?.slice(0, 3) || "?";
  const buyIn = parseFloat(tournament.buyIn || "0");
  const priority = Number(tournament.prioridade) || 2;

  const priorityClasses =
    priority === 1
      ? "border-l-2 border-l-emerald-400 opacity-100"
      : priority === 3
        ? "border-l-2 border-l-dashed border-l-gray-500 opacity-60"
        : "";

  return (
    <div
      className={`rounded-md px-2 py-1 text-xs cursor-pointer hover:brightness-125 transition-all ${priorityClasses} bg-gray-700`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="flex items-center gap-1 min-w-0">
        {priority === 1 && <Star className="w-3 h-3 text-amber-400 flex-shrink-0" fill="currentColor" />}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${siteColor}`} />
        {compact ? (
          <span className="text-white truncate">${buyIn.toFixed(0)} {siteAbbr}</span>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="text-white truncate">
              ${buyIn.toFixed(0)} {tournament.name || siteAbbr}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-gray-400 text-[10px]">{tournament.type}</span>
              <span className="text-gray-500 text-[10px]">|</span>
              <span className="text-gray-400 text-[10px]">{tournament.speed}</span>
              <span className="text-gray-500 text-[10px]">|</span>
              <span className="text-gray-400 text-[10px]">{siteAbbr}</span>
              {tournament.gameType && (
                <>
                  <span className="text-gray-500 text-[10px]">|</span>
                  <span className={`text-[10px] font-medium ${tournament.gameType === 'PLO' ? 'text-purple-400' : 'text-blue-400'}`}>
                    {tournament.gameType}
                  </span>
                </>
              )}
            </div>
            {tournament.lateRegMinutes != null && tournament.lateRegMinutes > 0 && tournament.time && (() => {
              const [h, m] = tournament.time.split(':').map(Number);
              const startTime = new Date(2000, 0, 1, h, m, 0, 0);
              const deadline = calculateLateRegDeadline(startTime, tournament.lateRegMinutes);
              const hh = String(deadline.getHours()).padStart(2, '0');
              const mm = String(deadline.getMinutes()).padStart(2, '0');

              return (
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400">
                  <Clock className="w-2.5 h-2.5" />
                  <span>Late ate {hh}:{mm}</span>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
