import { Star, Sparkles } from "lucide-react";
import { prepareTournamentChip } from "@shared/grade-chip-data";
import { getDisplayRegistrationTime } from "@shared/grade-time";
import { getPlannerSiteColor } from "@/lib/poker-colors";
import { formatBuyIn } from "@shared/platform-currency";
import { abbreviateTournamentName } from "@shared/tournament-name-abbrev";
import { estimatedFieldSize } from "@/lib/median";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import pokerStarsIcon from "@assets/poker-icons/PokerStars.png";
import partyIcon from "@assets/poker-icons/Party.png";
import ggIcon from "@assets/poker-icons/GG.png";
import wpnIcon from "@assets/poker-icons/WPN.png";
import chicoIcon from "@assets/poker-icons/Chico.png";
import betOnlineIcon from "@assets/poker-icons/BetOnline.png";

// Iniciais coloridas como fallback; quando ha PNG da plataforma, usa o icone.
const SITE_ICONS: Record<string, string> = {
  PokerStars: pokerStarsIcon,
  PartyPoker: partyIcon,
  GGPoker: ggIcon,
  WPN: wpnIcon,
  Chico: chicoIcon,
  BetOnline: betOnlineIcon,
};

interface TournamentChipProps {
  tournament: any;
  onClick?: () => void;
  /**
   * Modo compacto (default): nome abreviado, fontes menores e sem o badge de
   * garantido — e o que faz as sete colunas caberem sem scroll horizontal. O
   * conteudo completo fica no tooltip.
   */
  compact?: boolean;
  /** Limite de caracteres do nome no modo compacto. */
  maxNameChars?: number;
}

const TYPE_BG: Record<string, string> = {
  green: "bg-green-900/40",
  blue: "bg-blue-900/40",
  amber: "bg-amber-900/40",
  gray: "bg-gray-700",
};

const SPEED_BADGE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500 text-white",
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

/** Compact guaranteed display: $10k, $1.5k, $750. */
function formatGtdCompact(raw: any): string | null {
  const n = parseFloat(raw || "0");
  if (!isFinite(n) || n <= 0) return null;
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

export function TournamentChip({
  tournament,
  onClick,
  compact = true,
  maxNameChars = 16,
}: TournamentChipProps) {
  const chip = prepareTournamentChip(tournament);
  const siteColor = getPlannerSiteColor(tournament.site);
  const typeBg = TYPE_BG[chip.typeColor] || TYPE_BG.gray;
  const siteAbbr = SITE_ABBREVIATIONS[tournament.site] || tournament.site?.slice(0, 3)?.toUpperCase() || "?";
  const siteIcon = SITE_ICONS[tournament.site];
  const timeLabel = getDisplayRegistrationTime(tournament) || tournament.time || "";
  const gtdLabel = formatGtdCompact(tournament.guaranteed);
  const fullName = tournament.name || tournament.site || siteAbbr;
  const displayName = compact
    ? abbreviateTournamentName(tournament.name, {
        maxChars: maxNameChars,
        site: tournament.site,
      }) || siteAbbr
    : tournament.name || siteAbbr;
  const estField = estimatedFieldSize(tournament);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={
              (compact
                ? "rounded px-1.5 py-1 text-xs "
                : "rounded-md px-2 py-1.5 text-sm ") +
              `cursor-pointer hover:brightness-110 transition-all ${typeBg} border border-gray-600`
            }
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
          >
            <div className={`flex items-center min-w-0 ${compact ? "gap-1" : "gap-1.5"}`}>
              {chip.priorityIndicator === "star" && (
                <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" />
              )}
              {/* TS-G polish (UX-2 2026-04-25): icone Sparkles indica que o
                  torneio foi adicionado via Tournament Selector. Cor diferente
                  do Star de prioridade para nao confundir os dois indicadores. */}
              {chip.viaSelector && (
                <Sparkles
                  className="w-3.5 h-3.5 text-yellow-300 flex-shrink-0"
                  fill="currentColor"
                  data-testid="tournament-chip-via-selector"
                />
              )}
              {/* Plataforma: icone PNG quando disponivel, senao iniciais coloridas. */}
              {siteIcon ? (
                <img
                  src={siteIcon}
                  alt={tournament.site}
                  title={tournament.site}
                  data-testid="tournament-chip-site-badge"
                  className={`rounded-sm object-contain flex-shrink-0 ${compact ? "h-4 w-4" : "h-5 w-5"}`}
                />
              ) : (
                <span
                  className={`flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-bold leading-none text-white ${siteColor}`}
                  title={tournament.site}
                  data-testid="tournament-chip-site-badge"
                >
                  {siteAbbr}
                </span>
              )}
              {timeLabel && (
                <span className={`text-gray-400 font-mono flex-shrink-0 ${compact ? "text-[10px]" : "text-xs"}`}>
                  {timeLabel}
                </span>
              )}
              <span className={`text-emerald-400 font-bold flex-shrink-0 ${compact ? "text-xs" : "text-base"}`}>
                {chip.buyInDisplay}
              </span>
              <span
                className={`text-gray-200 truncate flex-1 min-w-0 ${compact ? "text-[11px]" : "text-sm"}`}
                title={fullName}
              >
                {displayName}
              </span>
              {chip.speedBadge && (
                <span className={`px-1 rounded flex-shrink-0 ${compact ? "text-[10px]" : "text-xs"} ${SPEED_BADGE_COLORS[tournament.speed] || ""}`}>
                  {chip.speedBadge}
                </span>
              )}
              {/* Garantido some no modo compacto — vive no tooltip. */}
              {!compact && gtdLabel && (
                <span className="text-cyan-300 text-xs font-semibold flex-shrink-0" title="Garantido">
                  {gtdLabel}
                </span>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-gray-800 border-gray-600 text-white max-w-[260px]">
          <div className="space-y-1 text-xs" data-testid="tournament-chip-tooltip">
            <div className="font-semibold">{fullName}</div>
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
                  <span>Reg {getDisplayRegistrationTime(tournament) || tournament.time}</span>
                </>
              )}
            </div>
            {tournament.guaranteed && parseFloat(tournament.guaranteed) > 0 && (
              <div className="text-gray-400">
                GTD: ${parseFloat(tournament.guaranteed).toLocaleString("pt-BR")}
              </div>
            )}
            <div className="text-gray-400" data-testid="tournament-chip-tooltip-field">
              Participantes est.:{" "}
              <span className="text-gray-200">
                {estField != null ? estField.toLocaleString("pt-BR") : "sem GTD"}
              </span>
            </div>
            <div className="text-gray-500" data-testid="tournament-chip-tooltip-roi">
              ROI est.: em breve
            </div>
            {/* TS-G polish: linha de feedback do Selector quando aplicavel */}
            {chip.viaSelector && (
              <div className="flex items-center gap-1 text-yellow-300 pt-1 border-t border-gray-700">
                <Sparkles className="w-3 h-3" fill="currentColor" />
                <span>
                  Recomendado por Selector
                  {chip.viaSelectorScore != null && ` (score ${chip.viaSelectorScore}`}
                  {chip.viaSelectorGrade && `, grade ${chip.viaSelectorGrade}`}
                  {chip.viaSelectorScore != null && ')'}
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
