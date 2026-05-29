/**
 * Overview analysis — Sprint library-evolution Fase 5.
 *
 * Recebe um conjunto de torneios de POOL (multi-jogador, efemero — vindo de um
 * CSV grande que NAO sera persistido) e devolve os melhores torneios (familias)
 * de cada plataforma, com os MOTIVOS do destaque (ROI medio do field, baixa
 * variancia, $/hora-mesa). Puro: reusa groupTournaments (Fase 1). Sem DB.
 *
 * IMPORTANTE: o ROI aqui e o ROI MEDIO DO POOL (todos os jogadores do arquivo),
 * NAO o ROI do usuario. Os labels deixam isso explicito.
 */
import { groupTournaments } from "./libraryGrouping";

export interface OverviewReason {
  kind: "roi" | "low_variance" | "profit_per_hour";
  label: string;
}

export interface OverviewRecentResult {
  name: string;
  playerNick: string | null;
  datePlayed: string | null;
  position: number | null;
  fieldSize: number | null;
  prize: number;
}

export interface OverviewFamily {
  familyKey: string;
  site: string;
  groupName: string;
  buyInTier: string;
  type: string;
  volume: number;
  roi: number; // % — ROI medio do pool
  avgBuyin: number;
  totalProfit: number;
  avgFieldSize: number;
  profitPerTableHour: number | null;
  durationCoverage: number;
  deepStackRate: number;
  uniquePlayers: number;
  reasons: OverviewReason[];
  recentResults: OverviewRecentResult[];
}

export interface OverviewResult {
  byPlatform: Array<{ site: string; families: OverviewFamily[] }>;
  totalParsed: number;
  uniquePlayers: number;
}

export interface OverviewOptions {
  minVolumePerFamily?: number; // default 20 (significancia do pool)
  topPerPlatform?: number; // default 5
  recentLimit?: number; // default 10
}

const num = (v: any) => {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

function buildReasons(f: {
  roi: number;
  avgFieldSize: number;
  profitPerTableHour: number | null;
  durationCoverage: number;
}): OverviewReason[] {
  const reasons: OverviewReason[] = [];
  if (f.roi > 0) {
    reasons.push({ kind: "roi", label: `ROI médio do field ${f.roi >= 0 ? "+" : ""}${f.roi.toFixed(1)}%` });
  }
  // Field menor = menos variancia (dica de grade). pequeno<100, medio<500.
  if (f.avgFieldSize > 0 && f.avgFieldSize < 500) {
    const faixa = f.avgFieldSize < 100 ? "field pequeno (<100)" : "field médio (<500)";
    reasons.push({ kind: "low_variance", label: `Baixa variância — ${faixa}` });
  }
  if (f.profitPerTableHour != null && f.durationCoverage >= 0.6 && f.profitPerTableHour > 0) {
    reasons.push({ kind: "profit_per_hour", label: `Lucro/hora-mesa $${f.profitPerTableHour.toFixed(0)}/h` });
  }
  return reasons;
}

export function analyzeOverview(tournaments: any[], opts: OverviewOptions = {}): OverviewResult {
  const minVolume = opts.minVolumePerFamily ?? 20;
  const topPerPlatform = opts.topPerPlatform ?? 5;
  const recentLimit = opts.recentLimit ?? 10;

  const families = groupTournaments(tournaments);
  const allPlayers = new Set<string>();

  const enriched: OverviewFamily[] = families
    .map((fam) => {
      const list = fam.tournaments;
      const volume = list.length;
      const totalBuyins = list.reduce((s, t) => s + num(t.buyIn), 0);
      const totalReentriesCost = list.reduce((s, t) => s + (Number(t.reentries) || 0) * num(t.buyIn), 0);
      const totalInvested = totalBuyins + totalReentriesCost;
      const totalProfit = list.reduce((s, t) => s + num(t.prize), 0);
      const roi = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
      const avgBuyin = volume > 0 ? totalBuyins / volume : 0;

      const withField = list.filter((t) => t.fieldSize && t.fieldSize > 0);
      const avgFieldSize = withField.length > 0 ? withField.reduce((s, t) => s + Number(t.fieldSize), 0) / withField.length : 0;

      const withDur = list.filter((t) => t.durationSeconds != null && Number(t.durationSeconds) > 0);
      const totalDur = withDur.reduce((s, t) => s + Number(t.durationSeconds), 0);
      const profitWithDur = withDur.reduce((s, t) => s + num(t.prize), 0);
      const durationCoverage = volume > 0 ? withDur.length / volume : 0;
      const profitPerTableHour = totalDur > 0 ? profitWithDur / (totalDur / 3600) : null;

      const deepStackCount = list.filter((t) => t.deepStack === true).length;
      const players = new Set<string>();
      for (const t of list) {
        const nick = (t.playerNick ?? "").toString().trim();
        if (nick) {
          players.add(nick);
          allPlayers.add(nick);
        }
      }

      const recentResults: OverviewRecentResult[] = [...list]
        .sort((a, b) => new Date(b.datePlayed ?? 0).getTime() - new Date(a.datePlayed ?? 0).getTime())
        .slice(0, recentLimit)
        .map((t) => ({
          name: (t.name ?? "").toString(),
          playerNick: (t.playerNick ?? null) || null,
          datePlayed: t.datePlayed ? new Date(t.datePlayed).toISOString() : null,
          position: t.position ?? null,
          fieldSize: t.fieldSize ?? null,
          prize: num(t.prize),
        }));

      const round2 = (n: number) => parseFloat(n.toFixed(2));
      return {
        familyKey: fam.familyKey,
        site: fam.site,
        groupName: `${fam.type} ${fam.buyInTier} · ${fam.site}`,
        buyInTier: fam.buyInTier,
        type: fam.type,
        volume,
        roi: round2(roi),
        avgBuyin: round2(avgBuyin),
        totalProfit: round2(totalProfit),
        avgFieldSize: Math.round(avgFieldSize),
        profitPerTableHour: profitPerTableHour != null ? round2(profitPerTableHour) : null,
        durationCoverage: round2(durationCoverage),
        deepStackRate: volume > 0 ? round2((deepStackCount / volume) * 100) : 0,
        uniquePlayers: players.size,
        reasons: buildReasons({ roi, avgFieldSize, profitPerTableHour, durationCoverage }),
        recentResults,
      };
    })
    .filter((f) => f.volume >= minVolume);

  // Agrupa por plataforma, rankeia por ROI desc, top N.
  const bySite = new Map<string, OverviewFamily[]>();
  for (const f of enriched) {
    if (!bySite.has(f.site)) bySite.set(f.site, []);
    bySite.get(f.site)!.push(f);
  }
  const byPlatform = Array.from(bySite.entries())
    .map(([site, fams]) => ({
      site,
      families: fams.sort((a, b) => b.roi - a.roi).slice(0, topPerPlatform),
    }))
    .sort((a, b) => (a.site < b.site ? -1 : 1));

  return {
    byPlatform,
    totalParsed: tournaments.length,
    uniquePlayers: allPlayers.size,
  };
}
