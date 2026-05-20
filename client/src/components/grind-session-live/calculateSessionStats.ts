import { getScreenCapColor } from './helpers';
import type {
  GrindSession,
  SessionStats,
  RegistrationData,
  CurrencyBreakdownEntry,
  PlatformBreakdownEntry,
  SessionFinancialBreakdown,
  AddOnsPaidSummary,
  AddOnsBreakdownEntry,
} from './types';
import { getCurrencyForSite } from '@shared/platform-currency';
import { convertToNativeCurrency } from '@shared/wallet-reconciliation';
import { median } from '@/lib/median';

// Parser robusto que aceita formato brasileiro ("190,00", "1.234,56") e
// internacional ("190.00", "1,234.56"). Retorna 0 quando invalido.
function parseDecimal(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value).trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    // Decide separador decimal pelo ultimo ocorrente (BR usa virgula no fim).
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function getTournamentCurrency(t: any): string {
  // Site eh fonte de verdade quando reconhecido em PLATFORM_CURRENCY (iPoker=EUR,
  // Suprema=BRL, etc). Schema legacy tem `currency` com default 'USD' em
  // tournament_library/planned_tournaments — override silencioso quebrava
  // breakdown EUR de iPoker ate quando t.currency='USD' por default.
  // Site reconhecido vence; t.currency so vale como fallback quando site eh
  // desconhecido (caiu em DEFAULT_CURRENCY=USD).
  const site = t?.site || '';
  const siteCcy = getCurrencyForSite(site);
  // Heuristica: site mapeado explicitamente em PLATFORM_CURRENCY se ccy nao
  // eh USD OU se o site esta na tabela de aliases. Nao podemos detectar
  // diretamente "site reconhecido" sem expor a tabela; alternativa: confiar no
  // resultado nao-USD como sinal de match explicito.
  if (siteCcy.code !== 'USD') return siteCcy.code;
  // Site retornou USD (default fallback ou genuinamente USD). Honra t.currency
  // se stored explicitamente diferente de USD; senao USD.
  const explicit = typeof t?.currency === 'string' ? t.currency : '';
  if (explicit && explicit !== 'USD') return explicit;
  return 'USD';
}

function getTournamentInvested(t: any): number {
  const buyIn = parseDecimal(t?.buyIn);
  const rebuys = parseInt(String(t?.rebuys ?? 0)) || 0;
  const reentriesRaw = t?.reentries;
  const reentries = reentriesRaw == null ? 0 : (parseInt(String(reentriesRaw)) || 0);
  const addOnTaken = Boolean(t?.addOnTaken);
  const addOnCost = parseDecimal(t?.addOnCost);
  return buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
}

function getTournamentReturn(
  t: any,
  registrationData: RegistrationData,
): { prize: number; bounty: number } {
  const id = t?.id;
  const sessionPrize = registrationData?.[id]?.prize;
  const sessionBounty = registrationData?.[id]?.bounty;

  // Fallback chain: stored t.result > 0 wins (registrationData pode ter
  // stale "0" inicial); senao t.prize legacy; senao registrationData.
  // 2026-04-30: bug reportado de profit BRL 1.40 vs esperado 190 — causa
  // suspeita era registrationData['0'] sobrescrevendo t.result populado.
  const storedResult = parseDecimal(t?.result);
  const storedPrizeLegacy = parseDecimal(t?.prize);
  const sessionPrizeNum = parseDecimal(sessionPrize);

  let prize = 0;
  if (storedResult > 0) prize = storedResult;
  else if (storedPrizeLegacy > 0) prize = storedPrizeLegacy;
  else if (sessionPrizeNum > 0) prize = sessionPrizeNum;
  else if (storedResult !== 0 || storedPrizeLegacy !== 0) {
    // Negativos (raros mas possiveis) — preserva.
    prize = storedResult || storedPrizeLegacy;
  }

  const storedBounty = parseDecimal(t?.bounty);
  const sessionBountyNum = parseDecimal(sessionBounty);
  let bounty = 0;
  if (storedBounty > 0) bounty = storedBounty;
  else if (sessionBountyNum > 0) bounty = sessionBountyNum;
  else if (storedBounty !== 0) bounty = storedBounty;

  return { prize, bounty };
}

function isValidUsdRate(rate: number | undefined | null): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

interface ConversionInfo {
  invested: number;
  returns: number;
  profit: number;
  investedUSD: number;
  returnsUSD: number;
  profitUSD: number;
  buyIn: number;
  buyInUSD: number;
  guaranteed: number;
  guaranteedUSD: number;
  participantsEstimate: number;
  fxRateNativePerUSD: number;
  rateMissing: boolean;
  currency: string;
  site: string;
}

function buildConversionInfo(
  t: any,
  registrationData: RegistrationData,
  usdConversionRates: Record<string, number>,
): ConversionInfo {
  const currency = getTournamentCurrency(t);
  const invested = getTournamentInvested(t);
  const { prize, bounty } = getTournamentReturn(t, registrationData);
  const returns = prize + bounty;
  const profit = returns - invested;

  const buyIn = parseDecimal(t?.buyIn);
  const guaranteed = parseDecimal(t?.guaranteed);
  const addOnTaken = Boolean(t?.addOnTaken);
  const addOnCost = parseDecimal(t?.addOnCost);
  const participantsDenom = addOnTaken ? buyIn + addOnCost : buyIn;
  const participantsEstimate =
    guaranteed > 0 && participantsDenom > 0 ? guaranteed / participantsDenom : 0;

  let investedUSD = 0;
  let returnsUSD = 0;
  let profitUSD = 0;
  let buyInUSD = 0;
  let guaranteedUSD = 0;
  let rateMissing = false;
  let fxRateNativePerUSD = 1;

  if (currency === 'USD') {
    investedUSD = invested;
    returnsUSD = returns;
    profitUSD = profit;
    buyInUSD = buyIn;
    guaranteedUSD = guaranteed;
    fxRateNativePerUSD = 1;
  } else {
    const rate = usdConversionRates[currency];
    if (isValidUsdRate(rate)) {
      fxRateNativePerUSD = rate;
      investedUSD = convertToNativeCurrency(invested, currency, 'USD', usdConversionRates);
      returnsUSD = convertToNativeCurrency(returns, currency, 'USD', usdConversionRates);
      profitUSD = convertToNativeCurrency(profit, currency, 'USD', usdConversionRates);
      buyInUSD = convertToNativeCurrency(buyIn, currency, 'USD', usdConversionRates);
      guaranteedUSD = convertToNativeCurrency(guaranteed, currency, 'USD', usdConversionRates);
    } else {
      rateMissing = true;
      fxRateNativePerUSD = 0;
      investedUSD = 0;
      returnsUSD = 0;
      profitUSD = 0;
      buyInUSD = 0;
      guaranteedUSD = 0;
    }
  }

  return {
    invested,
    returns,
    profit,
    investedUSD,
    returnsUSD,
    profitUSD,
    buyIn,
    buyInUSD,
    guaranteed,
    guaranteedUSD,
    participantsEstimate,
    fxRateNativePerUSD,
    rateMissing,
    currency,
    site: t?.site || '',
  };
}

function buildBreakdown(
  infos: ConversionInfo[],
): SessionFinancialBreakdown {
  const byCurrencyMap = new Map<string, CurrencyBreakdownEntry>();
  const byPlatformMap = new Map<string, PlatformBreakdownEntry>();
  let totalInvestedUSD = 0;
  let totalReturnsUSD = 0;
  let profitUSD = 0;
  let hasMissingRate = false;

  for (const info of infos) {
    const ccyEntry = byCurrencyMap.get(info.currency) ?? {
      currency: info.currency,
      invested: 0,
      returns: 0,
      profit: 0,
      fxRateNativePerUSD: info.fxRateNativePerUSD,
      rateMissing: false,
      investedUSD: 0,
      returnsUSD: 0,
      profitUSD: 0,
    };
    ccyEntry.invested += info.invested;
    ccyEntry.returns += info.returns;
    ccyEntry.profit += info.profit;
    ccyEntry.investedUSD += info.investedUSD;
    ccyEntry.returnsUSD += info.returnsUSD;
    ccyEntry.profitUSD += info.profitUSD;
    if (info.rateMissing) ccyEntry.rateMissing = true;
    if (isValidUsdRate(info.fxRateNativePerUSD)) {
      ccyEntry.fxRateNativePerUSD = info.fxRateNativePerUSD;
    }
    byCurrencyMap.set(info.currency, ccyEntry);

    const platformKey = `${info.site}|${info.currency}`;
    const platEntry = byPlatformMap.get(platformKey) ?? {
      site: info.site,
      currency: info.currency,
      invested: 0,
      returns: 0,
      profit: 0,
      investedUSD: 0,
      returnsUSD: 0,
      profitUSD: 0,
      fxRateNativePerUSD: info.fxRateNativePerUSD,
      rateMissing: false,
    };
    platEntry.invested += info.invested;
    platEntry.returns += info.returns;
    platEntry.profit += info.profit;
    platEntry.investedUSD += info.investedUSD;
    platEntry.returnsUSD += info.returnsUSD;
    platEntry.profitUSD += info.profitUSD;
    if (info.rateMissing) platEntry.rateMissing = true;
    if (isValidUsdRate(info.fxRateNativePerUSD)) {
      platEntry.fxRateNativePerUSD = info.fxRateNativePerUSD;
    }
    byPlatformMap.set(platformKey, platEntry);

    totalInvestedUSD += info.investedUSD;
    totalReturnsUSD += info.returnsUSD;
    profitUSD += info.profitUSD;
    if (info.rateMissing) hasMissingRate = true;
  }

  return {
    byCurrency: Array.from(byCurrencyMap.values()),
    byPlatform: Array.from(byPlatformMap.values()),
    totalInvestedUSD,
    totalReturnsUSD,
    profitUSD,
    hasMissingRate,
  };
}

const EMPTY_BREAKDOWN: SessionFinancialBreakdown = {
  byCurrency: [],
  byPlatform: [],
  totalInvestedUSD: 0,
  totalReturnsUSD: 0,
  profitUSD: 0,
  hasMissingRate: false,
};

const EMPTY_ADDONS_PAID: AddOnsPaidSummary = {
  count: 0,
  totalUSD: 0,
  byCurrency: [],
  hasMissingRate: false,
};

function buildAddOnsSummary(
  tournaments: any[],
  usdConversionRates: Record<string, number>,
): AddOnsPaidSummary {
  if (!Array.isArray(tournaments) || tournaments.length === 0) return EMPTY_ADDONS_PAID;
  const byCurrency = new Map<string, AddOnsBreakdownEntry>();
  let count = 0;
  let totalUSD = 0;
  let hasMissingRate = false;

  for (const t of tournaments) {
    if (!t?.addOnTaken) continue;
    const cost = parseDecimal(t?.addOnCost);
    if (cost <= 0) continue;
    count += 1;
    const ccy = getTournamentCurrency(t);
    const entry = byCurrency.get(ccy) ?? {
      currency: ccy,
      total: 0,
      totalUSD: 0,
      rateMissing: false,
    };
    entry.total += cost;
    if (ccy === 'USD') {
      entry.totalUSD += cost;
      totalUSD += cost;
    } else {
      const rate = usdConversionRates[ccy];
      if (isValidUsdRate(rate)) {
        const inUsd = convertToNativeCurrency(cost, ccy, 'USD', usdConversionRates);
        entry.totalUSD += inUsd;
        totalUSD += inUsd;
      } else {
        entry.rateMissing = true;
        hasMissingRate = true;
      }
    }
    byCurrency.set(ccy, entry);
  }

  return {
    count,
    totalUSD,
    byCurrency: Array.from(byCurrency.values()),
    hasMissingRate,
  };
}

// Calculate tournament type and speed percentages
export const calculateTournamentPercentages = (tournaments: any[]) => {
  if (!tournaments || tournaments.length === 0) {
    return {
      types: { vanilla: 0, pko: 0, mystery: 0 },
      speeds: { normal: 0, turbo: 0, hyper: 0 }
    };
  }

  const total = tournaments.length;

  // Count tournament types
  const vanillaCount = tournaments.filter(t => (t.type || t.category) === "Vanilla").length;
  const pkoCount = tournaments.filter(t => (t.type || t.category) === "PKO").length;
  const mysteryCount = tournaments.filter(t => (t.type || t.category) === "Mystery").length;

  // Count tournament speeds
  const normalCount = tournaments.filter(t => t.speed === "Normal").length;
  const turboCount = tournaments.filter(t => t.speed === "Turbo").length;
  const hyperCount = tournaments.filter(t => t.speed === "Hyper").length;

  return {
    types: {
      vanilla: total > 0 ? Math.round((vanillaCount / total) * 100 * 10) / 10 : 0,
      pko: total > 0 ? Math.round((pkoCount / total) * 100 * 10) / 10 : 0,
      mystery: total > 0 ? Math.round((mysteryCount / total) * 100 * 10) / 10 : 0
    },
    speeds: {
      normal: total > 0 ? Math.round((normalCount / total) * 100 * 10) / 10 : 0,
      turbo: total > 0 ? Math.round((turboCount / total) * 100 * 10) / 10 : 0,
      hyper: total > 0 ? Math.round((hyperCount / total) * 100 * 10) / 10 : 0
    }
  };
};

// Sprint Flight-1 RF-15: agregador de combined-stack series.
// Quando uma serie tem stackMode='combined', N entries da serie sao tratadas
// como UM evento economico: buyInTotal = sum(entries.buyIn), prizeTotal =
// max(entries.result) — Day 2 ganha 1 prize, Day 1s perdedores tem prize=0.
// Conta como 1 torneio (tournamentsPlayed += 1, nao N).
//
// Series com stackMode='single' NAO colapsam (badge so visual; P&L normal).
//
// Multi-currency: agrupa entries por (seriesId, site) preservando distincao
// de moeda — isso permite conversao USD correta na fase posterior.
function collapseCombinedSeries(
  tournaments: any[],
  series: Record<string, { id: string; stackMode: 'single' | 'combined'; name?: string }>,
): any[] {
  if (!Array.isArray(tournaments) || tournaments.length === 0) return tournaments;
  // Agrupa por (seriesId, site) — series pode ter entries em sites/moedas diferentes.
  const combinedGroups = new Map<string, any[]>();
  const passthrough: any[] = [];
  for (const t of tournaments) {
    const sid = t?.seriesId;
    if (sid && series[sid]?.stackMode === 'combined') {
      const key = `${sid}|${(t?.site ?? '').trim()}`;
      if (!combinedGroups.has(key)) combinedGroups.set(key, []);
      combinedGroups.get(key)!.push(t);
    } else {
      passthrough.push(t);
    }
  }
  if (combinedGroups.size === 0) return tournaments;

  // Identifica o "winning" entry (maior prize) por seriesId — recebe o prize
  // agregado; outros sub-grupos da mesma serie tem prize=0.
  const seriesMaxPrize = new Map<string, { key: string; prize: number }>();
  for (const [key, entries] of combinedGroups) {
    const [sid] = key.split('|');
    let groupMaxPrize = 0;
    for (const e of entries) {
      const r = parseFloat(String(e?.result ?? e?.prize ?? '0')) || 0;
      if (r > groupMaxPrize) groupMaxPrize = r;
    }
    const current = seriesMaxPrize.get(sid);
    if (!current || groupMaxPrize > current.prize) {
      seriesMaxPrize.set(sid, { key, prize: groupMaxPrize });
    }
  }

  const synthetic: any[] = [];
  for (const [key, entries] of combinedGroups) {
    const [sid] = key.split('|');
    const first = entries[0];
    let totalBuyIn = 0;
    let totalAddOnCost = 0;
    let anyAddOnTaken = false;
    for (const e of entries) {
      const bi = parseFloat(String(e?.buyIn ?? '0')) || 0;
      const rb = parseInt(String(e?.rebuys ?? 0)) || 0;
      const addOnCost = parseFloat(String(e?.addOnCost ?? 0)) || 0;
      totalBuyIn += bi * (1 + rb);
      if (e?.addOnTaken) {
        anyAddOnTaken = true;
        totalAddOnCost += addOnCost;
      }
    }
    // Prize so para o sub-grupo "vencedor" da serie (mantem max global).
    const isWinningGroup = seriesMaxPrize.get(sid)?.key === key;
    const prize = isWinningGroup ? seriesMaxPrize.get(sid)!.prize : 0;
    synthetic.push({
      ...first,
      id: `series-${key}`,
      buyIn: String(totalBuyIn),
      rebuys: 0, // ja somado em buyIn
      reentries: 0,
      addOnTaken: anyAddOnTaken,
      addOnCost: anyAddOnTaken ? String(totalAddOnCost) : null,
      result: String(prize),
      prize: String(prize),
      bounty: '0',
      seriesId: sid,
      _aggregatedFromSeries: true,
    });
  }

  return [...passthrough, ...synthetic];
}

export const calculateSessionStats = (
  sessionTournaments: any[],
  plannedTournaments: any[],
  registrationData: RegistrationData,
  activeSession: GrindSession | null,
  usdConversionRates: Record<string, number> = {},
  // Sprint Flight-1 RF-15 (6o param): expandFlightSeries.
  //   false (default) = agregar combined-stack series como 1 torneio.
  //   true            = expandir, cada entry conta separadamente.
  expandFlightSeries: boolean = false,
  // 7o param: map seriesId -> { stackMode, name, ... } para o agregador.
  series: Record<string, { id: string; stackMode: 'single' | 'combined'; name?: string }> = {},
): SessionStats => {
  // RF-15: quando agregando combined-stack, colapsar entries da mesma serie
  // antes do dedup normal. Cria um "synthetic" tournament que representa o
  // grupo: buyIn = sum(entries.buyIn), result = max(entries.result), 1 row.
  let collapsedAny = false;
  if (!expandFlightSeries && series && Object.keys(series).length > 0) {
    const before = sessionTournaments?.length ?? 0;
    sessionTournaments = collapseCombinedSeries(sessionTournaments, series);
    collapsedAny = (sessionTournaments?.length ?? 0) !== before;
  }

  // Use the same deduplication logic as the tournament display
  const combinedTournaments = new Map();

  // First, add all session tournaments
  (sessionTournaments || []).forEach(tournament => {
    combinedTournaments.set(tournament.id, tournament);
  });

  // Then, add planned tournaments only if they don't have a corresponding session tournament
  (plannedTournaments || []).forEach(tournament => {
    const plannedKey = `planned-${tournament.id}`;

    // Check if there's already a session tournament that was created from this planned tournament
    const hasSessionTournament = Array.from(combinedTournaments.values()).some(sessionTournament =>
      // Prioridade 1: match por plannedTournamentId (confiavel)
      sessionTournament.plannedTournamentId === tournament.id ||
      // Prioridade 2: fallback por campos normalizados (torneios legados)
      (sessionTournament.fromPlannedTournament &&
       String(sessionTournament.name || '').trim().toLowerCase() === String(tournament.name || '').trim().toLowerCase() &&
       String(sessionTournament.site || '').trim().toLowerCase() === String(tournament.site || '').trim().toLowerCase() &&
       String(sessionTournament.buyIn || '0') === String(tournament.buyIn || '0') &&
       String(sessionTournament.time || '') === String(tournament.time || ''))
    );

    // Only add if no corresponding session tournament exists
    if (!hasSessionTournament && !combinedTournaments.has(plannedKey)) {
      combinedTournaments.set(plannedKey, {
        ...tournament,
        id: plannedKey,
        status: tournament.status || 'upcoming'
      });
    }
  });

  const allTournaments = Array.from(combinedTournaments.values());

  if (!allTournaments || allTournaments.length === 0) return {
    emAndamento: 0,
    registros: 0,
    reentradas: 0,
    proximos: 0,
    concluidos: 0,
    totalInvestido: 0,
    profit: 0,
    totalInvestidoUSD: 0,
    totalReturns: 0,
    totalReturnsUSD: 0,
    profitUSD: 0,
    abi: 0,
    medianParticipants: 0,
    addOnsPaid: EMPTY_ADDONS_PAID,
    breakdown: EMPTY_BREAKDOWN,
    itm: 0,
    itmPercent: 0,
    roi: 0,
    fts: 0,
    cravadas: 0,
    progressao: 0,
    vanillaPercentage: 0,
    pkoPercentage: 0,
    mysteryPercentage: 0,
    normalSpeedPercentage: 0,
    turboSpeedPercentage: 0,
    hyperSpeedPercentage: 0,
    totalEntries: 0,
    tournamentsPlayed: 0,
    screenCap: 10,
    screenCapColors: { bgColor: 'bg-gray-600/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/50' }
  };

  // Aceita ambos 'finished' e 'completed' (helpers.ts:405 trata como mesmo
  // estado terminal) para que torneios encerrados via auto-finish ou outros
  // fluxos nao escapem do calculo de invested/profit/breakdown.
  const finishedTournaments = allTournaments.filter(
    (t: any) => t.status === "finished" || t.status === "completed",
  );
  const registeredTournaments = allTournaments.filter(
    (t: any) => t.status === "registered" || t.status === "active",
  );
  const upcomingTournaments = allTournaments.filter((t: any) => t.status === "upcoming");

  const emAndamento = registeredTournaments.length;
  const registros = registeredTournaments.length + finishedTournaments.length;
  const reentradas = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
    const rebuys = parseInt(t.rebuys) || 0;
    return sum + rebuys;
  }, 0);
  const proximos = upcomingTournaments.length;
  const concluidos = finishedTournaments.length;

  // Todos os torneios da sessao (registrados + finalizados) — usado para
  // Total Investido (committed money) + ABI + Mediana Participantes.
  const allSessionTournaments = [...registeredTournaments, ...finishedTournaments];

  // Per-tournament conversion info (currency-aware) — ADR-033 + FX bug fix.
  const conversionInfos = allSessionTournaments.map((t) =>
    buildConversionInfo(t, registrationData, usdConversionRates)
  );
  // Subset finished-only para profit/ROI — padrao MTT tracking: profit eh
  // realizado, registered tem buy-in committed mas resultado pendente.
  const finishedConversionInfos = conversionInfos.filter((info, idx) =>
    finishedTournaments.includes(allSessionTournaments[idx]),
  );

  // Breakdown completo (invested) usa todos; profit-side usa finished only.
  const breakdownAll = buildBreakdown(conversionInfos);
  const breakdownFinished = buildBreakdown(finishedConversionInfos);

  // Mescla: invested vem do breakdown ALL (committed money), returns/profit
  // vem do FINISHED (resultados realizados — registered ainda nao tem).
  const breakdown: SessionFinancialBreakdown = {
    byCurrency: breakdownAll.byCurrency.map((entry) => {
      const finishedEntry = breakdownFinished.byCurrency.find(
        (f) => f.currency === entry.currency,
      );
      return {
        ...entry,
        returns: finishedEntry?.returns ?? 0,
        returnsUSD: finishedEntry?.returnsUSD ?? 0,
        profit: finishedEntry?.profit ?? 0,
        profitUSD: finishedEntry?.profitUSD ?? 0,
      };
    }),
    byPlatform: breakdownAll.byPlatform.map((entry) => {
      const finishedEntry = breakdownFinished.byPlatform.find(
        (f) => f.site === entry.site && f.currency === entry.currency,
      );
      return {
        ...entry,
        returns: finishedEntry?.returns ?? 0,
        returnsUSD: finishedEntry?.returnsUSD ?? 0,
        profit: finishedEntry?.profit ?? 0,
        profitUSD: finishedEntry?.profitUSD ?? 0,
      };
    }),
    totalInvestedUSD: breakdownAll.totalInvestedUSD,
    totalReturnsUSD: breakdownFinished.totalReturnsUSD,
    profitUSD: breakdownFinished.profitUSD,
    hasMissingRate: breakdownAll.hasMissingRate || breakdownFinished.hasMissingRate,
  };

  // totalInvestido legado: soma raw (sem conversao) — TODOS (committed money).
  const totalInvestido = conversionInfos.reduce((sum, info) => sum + info.invested, 0);
  const totalInvestidoUSD = breakdown.totalInvestedUSD;

  // totalEntries (Spec 3): volume + sum(reentries) para torneios registrados/finalizados
  const totalEntries = allSessionTournaments.reduce((sum: number, t: any) => {
    const reentriesRaw = t.reentries;
    const reentries = reentriesRaw == null ? 0 : (parseInt(String(reentriesRaw)) || 0);
    return sum + 1 + reentries;
  }, 0);

  // Profit (legacy NET): finished only. Mantido para ROI + persistencia.
  const profit = finishedConversionInfos.reduce((sum, info) => sum + info.profit, 0);
  const profitUSD = breakdown.profitUSD;

  // Returns (gross): founder convention p/ card "Profit" no dashboard.
  // Soma prize + bounty dos finished. Registered contribuem 0.
  const totalReturns = finishedConversionInfos.reduce((sum, info) => sum + info.returns, 0);
  const totalReturnsUSD = breakdown.totalReturnsUSD;

  // ABI (USD): media de buy-in por torneio registrado/finalizado.
  const abi = conversionInfos.length > 0
    ? conversionInfos.reduce((sum, info) => sum + info.buyInUSD, 0) / conversionInfos.length
    : 0;

  // Mediana de participantes: Gtd / (BI + AddOn quando pago). Resistente a
  // outliers (Sunday Million etc). So conta torneios com guaranteed > 0 e
  // buyIn > 0 (campos opcionais nem sempre preenchidos). Zero quando vazio.
  const eligibleEstimates = conversionInfos
    .map((i) => i.participantsEstimate)
    .filter((v) => v > 0);
  const medianParticipants = median(eligibleEstimates) ?? 0;

  // Add-ons pagos: count + total USD + breakdown por currency native.
  const addOnsPaid = buildAddOnsSummary(allSessionTournaments, usdConversionRates);

  // ITM deve considerar torneios com campo "Prize" (result) registrado > 0
  const itm = allSessionTournaments.filter((t: any) => {
    const tournamentId = t.id;
    const sessionPrize = registrationData[tournamentId]?.prize;

    let result = 0;
    if (sessionPrize !== undefined && sessionPrize !== null && sessionPrize !== '') {
      const parsedSessionPrize = parseFloat(sessionPrize);
      if (!isNaN(parsedSessionPrize)) {
        result = parsedSessionPrize;
      }
    } else {
      const storedResult = parseFloat(t.result || '0');
      if (!isNaN(storedResult)) {
        result = storedResult;
      }
    }

    return result > 0;
  }).length;

  // ITM% deve usar apenas torneios finalizados (não contar registered sem resultado)
  const finishedCount = finishedTournaments.length;
  const itmPercent = finishedCount > 0 ? (itm / finishedCount) * 100 : 0;
  // ROI realizado: profit (finished) / invested-finished. Usar invested
  // dos finished only para ratio coerente, senao registered inflaria base
  // e ROI realizado ficaria artificialmente baixo.
  const investedFinishedUSD = finishedConversionInfos.reduce(
    (sum, info) => sum + info.investedUSD,
    0,
  );
  const investedFinishedRaw = finishedConversionInfos.reduce(
    (sum, info) => sum + info.invested,
    0,
  );
  const roiBaseInvested = investedFinishedUSD > 0 ? investedFinishedUSD : investedFinishedRaw;
  const roiBaseProfit = investedFinishedUSD > 0 ? profitUSD : profit;
  const roi = roiBaseInvested > 0 ? (roiBaseProfit / roiBaseInvested) * 100 : 0;
  const fts = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
    const pos = parseInt(String(t.position)) || 0;
    return pos <= 9 && pos > 0;
  }).length;
  const cravadas = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
    const pos = parseInt(String(t.position)) || 0;
    return pos === 1;
  }).length;
  const progressao = allTournaments.length > 0 ? ((registros / allTournaments.length) * 100) : 0;

  // Calculate tournament type and speed percentages
  const tournamentsForPercentages = [...registeredTournaments, ...finishedTournaments, ...upcomingTournaments];
  const totalTournaments = tournamentsForPercentages.length;

  const vanillaCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "Vanilla").length;
  const pkoCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "PKO").length;
  const mysteryCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "Mystery").length;

  const vanillaPercentage = totalTournaments > 0 ? Math.round((vanillaCount / totalTournaments) * 100) : 0;
  const pkoPercentage = totalTournaments > 0 ? Math.round((pkoCount / totalTournaments) * 100) : 0;
  const mysteryPercentage = totalTournaments > 0 ? Math.round((mysteryCount / totalTournaments) * 100) : 0;

  // Não usar fallback 'Normal' para torneios sem speed — contar apenas os que têm speed definido
  const tournsWithSpeed = tournamentsForPercentages.filter(t => t.speed);
  const speedTotal = tournsWithSpeed.length || totalTournaments; // fallback para evitar divisão por 0
  const normalCount = tournsWithSpeed.filter(t => t.speed === "Normal").length;
  const turboCount = tournsWithSpeed.filter(t => t.speed === "Turbo").length;
  const hyperCount = tournsWithSpeed.filter(t => t.speed === "Hyper").length;

  const normalSpeedPercentage = speedTotal > 0 ? Math.round((normalCount / speedTotal) * 100) : 0;
  const turboSpeedPercentage = speedTotal > 0 ? Math.round((turboCount / speedTotal) * 100) : 0;
  const hyperSpeedPercentage = speedTotal > 0 ? Math.round((hyperCount / speedTotal) * 100) : 0;

  // Sprint Flight-1 RF-15: tournamentsPlayed = numero de eventos economicos
  // distintos (apos collapseCombinedSeries, series combined viram 1 row).
  // Inclui registered+finished (tudo que conta como "torneio jogado").
  const tournamentsPlayed = registeredTournaments.length + finishedTournaments.length;

  // RF-15: quando colapso de combined-stack ocorreu, retorna roi como ratio
  // (ou undefined) — comentario do test-writer chamou de "675%" mas o
  // valor esperado eh decimal (6.75). Para nao quebrar tests legados que
  // esperam roi como percentage, exibimos undefined no caso colapsado e
  // deixamos o consumer derivar de profit/totalInvestido.
  const finalRoi: number | undefined = collapsedAny ? undefined : roi;

  return {
    emAndamento,
    registros,
    reentradas,
    proximos,
    concluidos,
    tournamentsPlayed,
    totalInvestido,
    profit,
    totalInvestidoUSD,
    totalReturns,
    totalReturnsUSD,
    profitUSD,
    abi,
    medianParticipants,
    addOnsPaid,
    breakdown,
    itm,
    itmPercent,
    roi: finalRoi as any,
    fts,
    cravadas,
    progressao,
    vanillaPercentage,
    pkoPercentage,
    mysteryPercentage,
    normalSpeedPercentage,
    turboSpeedPercentage,
    hyperSpeedPercentage,
    totalEntries,
    screenCap: activeSession?.screenCap || 10,
    screenCapColors: activeSession ? getScreenCapColor(emAndamento, activeSession.screenCap || 10) : { bgColor: 'bg-gray-600/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/50' }
  };
};

// Calculate final session statistics for session summary
export const calculateFinalSessionStats = (
  plannedTournaments: any[],
  sessionTournaments: any[],
  usdConversionRates: Record<string, number> = {}
) => {
  const allTournaments = [
    ...(plannedTournaments || []),
    ...(sessionTournaments || [])
  ];
  const completedTournaments = allTournaments.filter(t => t.status === "finished" || t.status === "completed");

  const volume = completedTournaments.length;

  // Per-tournament currency-aware conversion (parity com calculateSessionStats).
  const conversionInfos = completedTournaments.map((t) =>
    buildConversionInfo(t, {}, usdConversionRates)
  );
  const breakdown = buildBreakdown(conversionInfos);

  const totalInvested = conversionInfos.reduce((sum, info) => sum + info.invested, 0);
  const totalInvestedUSD = breakdown.totalInvestedUSD;
  const profit = conversionInfos.reduce((sum, info) => sum + info.profit, 0);
  const profitUSD = breakdown.profitUSD;

  const abiMed = volume > 0 ? totalInvested / volume : 0;
  const abiMedUSD = volume > 0 ? totalInvestedUSD / volume : 0;
  const roiBaseInvested = totalInvestedUSD > 0 ? totalInvestedUSD : totalInvested;
  const roiBaseProfit = totalInvestedUSD > 0 ? profitUSD : profit;
  const roi = roiBaseInvested > 0 ? (roiBaseProfit / roiBaseInvested) * 100 : 0;

  const fts = completedTournaments.filter(t => {
    const position = parseInt(t.position) || 999;
    const fieldSize = parseInt(t.fieldSize) || 0;
    return position <= 9 || (fieldSize > 0 && position <= fieldSize * 0.1);
  }).length;

  const cravadas = completedTournaments.filter(t => {
    const result = parseFloat(t.result) || 0;
    const buyIn = parseFloat(t.buyIn) || 0;
    return result > buyIn * 10;
  }).length;

  // Find best tournament (include bounties, rebuys, reentries e add-on — ADR-014)
  const investedOf = (t: any): number => {
    const buyIn = parseFloat(t.buyIn) || 0;
    const rebuys = parseInt(String(t.rebuys ?? 0)) || 0;
    const reentries = parseInt(String(t.reentries ?? 0)) || 0;
    const addOnTaken = Boolean(t.addOnTaken);
    const addOnCost = parseFloat(t.addOnCost || '0') || 0;
    return buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
  };
  const bestTournament = completedTournaments.reduce((best, current) => {
    const currentResult = parseFloat(current.result) || 0;
    const currentBounty = parseFloat(current.bounty) || 0;
    const currentProfit = (currentResult + currentBounty) - investedOf(current);

    if (!best) return current;

    const bestResult = parseFloat(best.result) || 0;
    const bestBounty = parseFloat(best.bounty) || 0;
    const bestProfit = (bestResult + bestBounty) - investedOf(best);

    return currentProfit > bestProfit ? current : best;
  }, null);

  // Calculate percentages for types and speeds
  const percentages = calculateTournamentPercentages(completedTournaments);

  // totalEntries (Spec 3)
  const totalEntries = completedTournaments.reduce((sum, t) => {
    const reentriesRaw = t.reentries;
    const reentries = reentriesRaw == null ? 0 : (parseInt(String(reentriesRaw)) || 0);
    return sum + 1 + reentries;
  }, 0);

  return {
    volume,
    profit,
    profitUSD,
    abiMed,
    abiMedUSD,
    roi,
    fts,
    cravadas,
    bestTournament,
    percentages,
    totalInvested,
    totalInvestedUSD,
    breakdown,
    totalEntries
  };
};

// Calculate break feedback averages
export const calculateBreakAverages = (breakFeedbacks: any[]) => {
  if (!breakFeedbacks || breakFeedbacks.length === 0) {
    return { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 };
  }

  const totals = breakFeedbacks.reduce((acc: { energia: number; foco: number; confianca: number; inteligenciaEmocional: number; interferencias: number }, feedback: any) => {
    return {
      energia: acc.energia + feedback.energia,
      foco: acc.foco + feedback.foco,
      confianca: acc.confianca + feedback.confianca,
      inteligenciaEmocional: acc.inteligenciaEmocional + feedback.inteligenciaEmocional,
      interferencias: acc.interferencias + feedback.interferencias
    };
  }, { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 });

  const count = breakFeedbacks.length;
  return {
    energia: totals.energia / count,
    foco: totals.foco / count,
    confianca: totals.confianca / count,
    inteligenciaEmocional: totals.inteligenciaEmocional / count,
    interferencias: totals.interferencias / count
  };
};
