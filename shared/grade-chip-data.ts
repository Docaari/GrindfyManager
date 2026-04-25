import { formatBuyIn } from './platform-currency';

interface Tournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string;
  type: string;
  speed: string;
  priority?: number;
  prioridade?: number;
  lateRegMinutes: number | null;
  [key: string]: any;
}

interface ChipData {
  siteAbbr: string;
  buyInDisplay: string;
  typeColor: string;
  speedBadge: string | null;
  priorityIndicator: string | null;
  nameShort: string;
  hasLateReg: boolean;
  // TS-G polish (UX-2 2026-04-25): identifica torneios adicionados via
  // Tournament Selector. Quando true, o chip ganha icone dourado para
  // feedback visual do feedback loop "Selector recomendou -> usuario aceitou".
  viaSelector: boolean;
  viaSelectorScore: number | null;
  viaSelectorGrade: string | null;
}

const siteAbbreviations: Record<string, string> = {
  PokerStars: 'PS',
  GGNetwork: 'GG',
  Suprema: 'SUP',
  WPN: 'WPN',
  PartyPoker: 'PP',
  '888poker': '888',
  Bodog: 'BOD',
  CoinPoker: 'CP',
};

const typeColors: Record<string, string> = {
  PKO: 'green',
  Vanilla: 'blue',
  Mystery: 'amber',
};

const speedBadges: Record<string, string | null> = {
  Normal: null,
  Turbo: 'T',
  Hyper: 'H',
};

export function prepareTournamentChip(tournament: Tournament): ChipData {
  const buyInDisplay = formatBuyIn(tournament.buyIn, tournament.site);

  const priority = tournament.priority ?? tournament.prioridade ?? 2;
  let priorityIndicator: string | null = null;
  if (priority === 1) priorityIndicator = 'star';
  else if (priority === 3) priorityIndicator = 'low';

  const name = tournament.name;
  const nameShort = name.length > 20 ? name.substring(0, 20) + '...' : name;

  // TS-G polish (UX-2 2026-04-25): le metadata.fromSelector definida no
  // SelectorCard.tsx quando o usuario adiciona o torneio via widget. Score
  // e grade ficam em metadata.selectorScore / selectorGrade.
  const metadata = tournament.metadata;
  const viaSelector = !!(metadata && metadata.fromSelector === true);
  const viaSelectorScore =
    viaSelector && typeof metadata.selectorScore === 'number'
      ? metadata.selectorScore
      : null;
  const viaSelectorGrade =
    viaSelector && typeof metadata.selectorGrade === 'string'
      ? metadata.selectorGrade
      : null;

  return {
    siteAbbr: siteAbbreviations[tournament.site] || tournament.site,
    buyInDisplay,
    typeColor: typeColors[tournament.type] || 'gray',
    speedBadge: speedBadges[tournament.speed] ?? null,
    priorityIndicator,
    nameShort,
    hasLateReg: tournament.lateRegMinutes != null && tournament.lateRegMinutes > 0,
    viaSelector,
    viaSelectorScore,
    viaSelectorGrade,
  };
}
