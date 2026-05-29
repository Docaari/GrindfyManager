// =============================================================================
// Sprint F4 W1 — dayDetailService.ts (drill-down agregados de um dia da grade)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-01)
// Diagrama: Docs/architecture/flow-day-detail-drawer.mermaid
// =============================================================================

import { storage } from "../storage";
import { walletService } from "./walletService";
import { FX_FALLBACK_CONSTANTS } from "../../shared/primedopeDefaults";

export interface GetDayDetailInput {
  userId: string;
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
}

export interface DayDetailListItem {
  id?: string;
  plannedId?: string;
  templateId?: string;
  name?: string;
  site: string;
  type?: string;
  speed?: string;
  buyinUsd: number;
  count: number;
  time?: string;
  prioridade?: number;
  // Sprint manage-4: max late (horario final de registro, HH:MM). Reusa
  // coluna legada registration_time. Quando preenchido, bucketing usa este
  // valor; senao usa time.
  maxLate?: string | null;
  guaranteedUsd?: number;
  estimatedField?: number;
}

export interface DayDetailVolumeItem {
  site: string;
  count: number;
}

export interface DayDetailBankrollItem {
  site: string;
  balanceUsd: number;
  dayInvestmentUsd: number;
  coveragePct: number;
}

export interface DayDetailResult {
  cards: {
    totalTournaments: number;
    abiUsd: number;
    investmentUsd: number;
    bankrollNeeded: number;
    medianFieldSize: number;
  };
  format: {
    pctPKO: number;
    pctTurbo: number;
    pctVanilla: number;
    pctMystery?: number;
    pctSatellite?: number;
  };
  volume: DayDetailVolumeItem[];
  bankroll: DayDetailBankrollItem[];
  list: DayDetailListItem[];
}

function nativeToUsd(
  amount: number,
  currency: string | null | undefined,
  rates: Record<string, number>,
): number {
  if (!currency || currency === "USD") return amount;
  const rate = rates[currency];
  if (typeof rate === "number" && rate > 0) {
    return amount / rate;
  }
  return 0;
}

async function resolveExchangeRates(
  userId: string,
): Promise<Record<string, number>> {
  let userSettings: any = null;
  try {
    userSettings = await (storage as any).getUserSettings(userId);
  } catch {
    userSettings = null;
  }
  const userRates = userSettings?.exchangeRates;
  if (userRates && typeof userRates === "object" && Object.keys(userRates).length > 0) {
    return { ...FX_FALLBACK_CONSTANTS, ...userRates };
  }
  let wallets: any[] = [];
  try {
    wallets = (await (storage as any).listWalletsByUser(userId)) ?? [];
  } catch {
    wallets = [];
  }
  for (const w of wallets) {
    if (!w) continue;
    const wRates = w.exchangeRates;
    if (wRates && typeof wRates === "object" && Object.keys(wRates).length > 0) {
      return { ...FX_FALLBACK_CONSTANTS, ...wRates };
    }
  }
  return { ...FX_FALLBACK_CONSTANTS };
}

function isTurbo(speed: string | null | undefined): boolean {
  if (!speed) return false;
  const s = speed.toLowerCase();
  return s === "turbo" || s === "hyper";
}

export async function getDayDetail(
  input: GetDayDetailInput,
): Promise<DayDetailResult> {
  const planned = (await (storage as any).listPlannedTournamentsForDayDetail({
    userId: input.userId,
    profileLetter: input.profileLetter,
    dayOfWeek: input.dayOfWeek,
  })) as any[];

  if (!planned || planned.length === 0) {
    return {
      cards: {
        totalTournaments: 0,
        abiUsd: 0,
        investmentUsd: 0,
        bankrollNeeded: 0,
        medianFieldSize: 0,
      },
      format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
      volume: [],
      bankroll: [],
      list: [],
    };
  }

  const rates = await resolveExchangeRates(input.userId);

  let totalTournaments = 0;
  let weightedBuyinUsdSum = 0;
  let investmentUsd = 0;
  let maxBuyinUsd = 0;

  let countPKO = 0;
  let countTurbo = 0;
  let countVanilla = 0;
  let countMystery = 0;
  let countSatellite = 0;

  const volumeMap = new Map<string, number>();
  const investmentBySite = new Map<string, number>();

  const list: DayDetailListItem[] = [];

  for (const pt of planned) {
    const cnt = Number(pt.count ?? 0) || 0;
    if (cnt <= 0) continue;
    const buyinNative = Number(pt.buyIn ?? pt.buyin ?? 0) || 0;
    const usd = nativeToUsd(buyinNative, pt.currency ?? "USD", rates);

    totalTournaments += cnt;
    weightedBuyinUsdSum += usd * cnt;
    investmentUsd += usd * cnt;
    if (usd > maxBuyinUsd) maxBuyinUsd = usd;

    const type = (pt.type ?? "").toString();
    if (type === "PKO") countPKO += cnt;
    else if (type === "Vanilla") countVanilla += cnt;
    else if (type === "Mystery") countMystery += cnt;
    else if (type === "Satellite") countSatellite += cnt;

    if (isTurbo(pt.speed)) countTurbo += cnt;

    const site = pt.site ?? "Unknown";
    volumeMap.set(site, (volumeMap.get(site) ?? 0) + cnt);
    investmentBySite.set(
      site,
      (investmentBySite.get(site) ?? 0) + usd * cnt,
    );

    const guaranteedNative = Number(pt.guaranteed ?? 0) || 0;
    const guaranteedUsd = nativeToUsd(
      guaranteedNative,
      pt.currency ?? "USD",
      rates,
    );
    const estimatedField =
      usd > 0 && guaranteedUsd > 0
        ? Math.max(1, Math.round(guaranteedUsd / usd))
        : 0;

    list.push({
      id: pt.id ?? pt.plannedId,
      plannedId: pt.plannedId,
      templateId: pt.templateId,
      name: pt.name,
      site,
      type: pt.type,
      speed: pt.speed,
      buyinUsd: Number(usd.toFixed(4)),
      count: cnt,
      time: pt.time,
      prioridade:
        typeof pt.prioridade === "number" && pt.prioridade >= 1 && pt.prioridade <= 3
          ? pt.prioridade
          : 2,
      maxLate:
        typeof pt.registrationTime === "string" && pt.registrationTime.length > 0
          ? pt.registrationTime
          : null,
      guaranteedUsd: Number(guaranteedUsd.toFixed(2)),
      estimatedField,
    });
  }

  const abiUsd =
    totalTournaments > 0 ? weightedBuyinUsdSum / totalTournaments : 0;
  const bankrollNeeded = maxBuyinUsd * 100;

  // Format pcts
  const pct = (n: number) =>
    totalTournaments > 0 ? (n / totalTournaments) * 100 : 0;
  const formatBlock = {
    pctPKO: Number(pct(countPKO).toFixed(2)),
    pctTurbo: Number(pct(countTurbo).toFixed(2)),
    pctVanilla: Number(pct(countVanilla).toFixed(2)),
    pctMystery: Number(pct(countMystery).toFixed(2)),
    pctSatellite: Number(pct(countSatellite).toFixed(2)),
  };

  // Volume
  const volume: DayDetailVolumeItem[] = Array.from(volumeMap.entries())
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => b.count - a.count);

  // Bankroll por plataforma — junta com getConsolidatedBalance
  let consolidated: any = null;
  try {
    consolidated = await walletService.getConsolidatedBalance(input.userId);
  } catch {
    consolidated = null;
  }
  const balanceBySite = new Map<string, number>();
  if (consolidated && Array.isArray(consolidated.wallets)) {
    for (const w of consolidated.wallets) {
      if (!w) continue;
      const platform = w.platform ?? w.site;
      if (!platform) continue;
      const bal = Number(w.balanceUsd ?? w.balance ?? 0) || 0;
      balanceBySite.set(platform, (balanceBySite.get(platform) ?? 0) + bal);
    }
  }

  const bankrollList: DayDetailBankrollItem[] = [];
  // Para todo site na grade, calcular coverage; tambem incluir wallets sem
  // torneios? Deixa em torneios apenas (foco do drilldown).
  for (const [site, dayInvUsd] of investmentBySite.entries()) {
    // Tenta match exato; senao, tenta substring
    let bal = balanceBySite.get(site) ?? 0;
    if (bal === 0) {
      // tentativa case-insensitive substring
      for (const [k, v] of balanceBySite.entries()) {
        if (k && site && k.toLowerCase().includes(site.toLowerCase())) {
          bal = v;
          break;
        }
        if (k && site && site.toLowerCase().includes(k.toLowerCase())) {
          bal = v;
          break;
        }
      }
    }
    const coveragePct = dayInvUsd > 0 ? (bal / dayInvUsd) * 100 : 0;
    bankrollList.push({
      site,
      balanceUsd: Number(bal.toFixed(2)),
      dayInvestmentUsd: Number(dayInvUsd.toFixed(2)),
      coveragePct: Number(coveragePct.toFixed(2)),
    });
  }

  // List ordenada por time ASC
  list.sort((a, b) => {
    const ta = a.time ?? "";
    const tb = b.time ?? "";
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

  // Mediana de field size — usa estimatedField (>0) de cada torneio.
  const fields = list
    .map((x) => x.estimatedField ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  let medianFieldSize = 0;
  if (fields.length > 0) {
    const mid = Math.floor(fields.length / 2);
    medianFieldSize =
      fields.length % 2 === 0
        ? Math.round((fields[mid - 1] + fields[mid]) / 2)
        : fields[mid];
  }

  return {
    cards: {
      totalTournaments,
      abiUsd: Number(abiUsd.toFixed(4)),
      investmentUsd: Number(investmentUsd.toFixed(4)),
      bankrollNeeded: Number(bankrollNeeded.toFixed(2)),
      medianFieldSize,
    },
    format: formatBlock,
    volume,
    bankroll: bankrollList,
    list,
  };
}
