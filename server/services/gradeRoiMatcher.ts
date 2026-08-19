// =============================================================================
// gradeRoiMatcher — casa cada torneio da GRADE (planned_tournaments) com a
// familia correspondente da BIBLIOTECA DE TORNEIOS e devolve o ROI do jogador
// naquele tipo de torneio.
//
// Motivo: a Calculadora MTT (variancia) usava buckets grosseiros (tier x tipo).
// O jogador quer o EV da grade que ele montou, torneio a torneio, com o rotulo
// e o ROI que ele ja ve na Biblioteca ("Vanilla $50-70 · WPN · ~22h-24h").
//
// Regras de dinheiro:
//   - ROI da biblioteca vem em PERCENT; o engine de variancia consome DECIMAL.
//   - ROI cru pode ser outlier (amostra pequena, um FT que infla 400%). O valor
//     usado na simulacao e CLAMPADO em [-20%, +40%]; o cru + o volume ficam
//     visiveis na UI para o jogador julgar.
//   - Sem familia casada -> roi null + razao nomeada, NUNCA zero inventado.
// =============================================================================

import { bucketBuyIn } from "../scoring/buildScoringInput";
import { canonicalBuyIn } from "../../shared/canonical-buy-in";
import { timeBin2h, timeBinLabel, NO_TIME_BIN } from "../../shared/time-bin";
import { enrichTournamentTypeFields } from "../../shared/tournament-type-detector";
import { canonicalSiteKey, mttRakePctForSite } from "../../shared/poker-sites";
import { nameSignature } from "./libraryGrouping";

export const ROI_FLOOR_PCT = -20;
export const ROI_CEIL_PCT = 40;
export const LOW_SAMPLE_VOLUME = 20;

export type MatchLevel =
  | "site_abi_type_time"
  | "site_abi_type"
  // O tipo escrito na grade e o tipo derivado do historico divergem: o jogador
  // escreve "Vanilla" e o detector le "Add-on" no nome do mesmo torneio. Antes
  // essa divergencia pulava direto para a media cross-site ("sem amostra da
  // CoinPoker") mesmo havendo dezenas de torneios daquele site e faixa.
  | "site_abi_time"
  | "site_abi"
  | "abi_type"
  | "type"
  | "none";

export interface PlannedLike {
  id?: string;
  name?: string;
  site?: string;
  type?: string;
  category?: string;
  speed?: string;
  buyIn?: number | string;
  time?: string;
  dayOfWeek?: number;
}

/** Um torneio especifico dentro da familia (drill-down da Biblioteca). */
export interface SpecificLike {
  /** fineKey = `${familyKey}|${nameSignature}` — a assinatura e o ultimo campo. */
  id?: string;
  volume?: number;
  roi?: number;
  avgFieldSize?: number;
  itmRate?: number;
}

export interface FamilyLike {
  site?: string;
  category?: string;
  speed?: string;
  buyInTier?: string;
  timeBin?: string | null;
  volume?: number;
  roi?: number; // percent
  avgFieldSize?: number;
  itmRate?: number; // percent
  groupName?: string;
  specifics?: SpecificLike[];
}

export interface MatchedFamilyStats {
  level: MatchLevel;
  volume: number;
  roiPct: number | null;
  avgFieldSize: number | null;
  itmPct: number | null;
}

/** Clampa o ROI (percent) na faixa realista usada pela simulacao. */
export function clampRealisticRoiPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(ROI_FLOOR_PCT, Math.min(ROI_CEIL_PCT, pct));
}

/** "19:00" / "19:00:00" / "19h" -> 19. Fora de 0-23 ou invalido -> null. */
export function hourFromTimeString(time: unknown): number | null {
  if (typeof time !== "string") return null;
  const m = time.trim().match(/^(\d{1,2})\s*[:h]?/);
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  return h;
}

/** Bin de 2h do torneio planejado (mesmo vocabulario da biblioteca). */
export function plannedTimeBin(time: unknown): string {
  const h = hourFromTimeString(time);
  return h == null ? NO_TIME_BIN : timeBin2h(h);
}

/** Faixa de ABI do torneio planejado (mesmo vocabulario da biblioteca). */
export function plannedBuyInTier(buyIn: unknown): string {
  const raw = Number(buyIn);
  const safe = Number.isFinite(raw) && raw > 0 ? raw : 0;
  return bucketBuyIn(canonicalBuyIn(safe));
}

/** Tipo canonico (Vanilla/PKO/Mystery/Satellite/...) via SSoT do detector. */
export function plannedType(pt: PlannedLike): string {
  const cat = (pt.type ?? pt.category ?? "").toString().trim();
  return enrichTournamentTypeFields({ name: pt.name ?? "", category: cat }).type;
}

// Grade e historico escrevem o mesmo site com nomes diferentes ("GGPoker" x
// "GGNetwork"). Sem a chave canonica o casamento por site falhava em silencio.
function normSite(v: unknown): string {
  return canonicalSiteKey(v);
}

/** Rotulo no formato da Biblioteca: "Vanilla $50-70 Turbo · WPN · ~18h-20h". */
export function buildGradeLabel(pt: PlannedLike): string {
  const type = plannedType(pt);
  const tier = plannedBuyInTier(pt.buyIn);
  const speed = (pt.speed ?? "").toString().trim();
  const speedSuffix = speed && speed !== "Normal" ? ` ${speed}` : "";
  const site = (pt.site ?? "").toString().trim();
  const siteSuffix = site ? ` · ${site}` : "";
  const bin = plannedTimeBin(pt.time);
  const timeSuffix = bin !== NO_TIME_BIN ? ` · ${timeBinLabel(bin)}` : "";
  return `${type} ${tier}${speedSuffix}${siteSuffix}${timeSuffix}`;
}

/**
 * Agrega N familias num unico stat, ponderado por volume (entradas).
 * ROI ponderado por volume aproxima o ROI agregado dentro da MESMA faixa de ABI
 * (investimento por entrada e comparavel); e a aproximacao aceita aqui.
 */
function aggregate(families: FamilyLike[], level: MatchLevel): MatchedFamilyStats {
  let volume = 0;
  let roiAcc = 0;
  let fieldAcc = 0;
  let fieldVol = 0;
  let itmAcc = 0;
  let itmVol = 0;

  for (const f of families) {
    const v = Number(f.volume);
    if (!Number.isFinite(v) || v <= 0) continue;
    volume += v;
    const roi = Number(f.roi);
    if (Number.isFinite(roi)) roiAcc += roi * v;
    const field = Number(f.avgFieldSize);
    if (Number.isFinite(field) && field > 0) {
      fieldAcc += field * v;
      fieldVol += v;
    }
    const itm = Number(f.itmRate);
    if (Number.isFinite(itm) && itm > 0) {
      itmAcc += itm * v;
      itmVol += v;
    }
  }

  if (volume <= 0) {
    return { level: "none", volume: 0, roiPct: null, avgFieldSize: null, itmPct: null };
  }

  return {
    level,
    volume,
    roiPct: roiAcc / volume,
    avgFieldSize: fieldVol > 0 ? fieldAcc / fieldVol : null,
    itmPct: itmVol > 0 ? itmAcc / itmVol : null,
  };
}

/**
 * Casca de precisao decrescente: quanto mais especifica a familia casada,
 * melhor o ROI. Cai de nivel so quando o nivel acima nao tem NENHUMA amostra.
 */
export function matchFamilyStats(
  pt: PlannedLike,
  families: FamilyLike[],
): MatchedFamilyStats {
  const site = normSite(pt.site);
  const tier = plannedBuyInTier(pt.buyIn);
  const type = plannedType(pt);
  const bin = plannedTimeBin(pt.time);

  const sameType = families.filter(
    (f) => (f.category ?? "").toString().trim() === type,
  );
  const sameTypeTier = sameType.filter((f) => f.buyInTier === tier);
  const sameSite = sameTypeTier.filter((f) => normSite(f.site) === site);
  const sameTime =
    bin === NO_TIME_BIN ? [] : sameSite.filter((f) => f.timeBin === bin);

  // Mesmo site + mesma faixa, ignorando o tipo (cobre a divergencia de
  // classificacao entre grade e historico).
  const siteTier = families.filter(
    (f) => normSite(f.site) === site && f.buyInTier === tier,
  );
  const siteTierTime =
    bin === NO_TIME_BIN ? [] : siteTier.filter((f) => f.timeBin === bin);

  const candidates: Array<[FamilyLike[], MatchLevel]> = [
    [sameTime, "site_abi_type_time"],
    [sameSite, "site_abi_type"],
    [siteTierTime, "site_abi_time"],
    [siteTier, "site_abi"],
    [sameTypeTier, "abi_type"],
    [sameType, "type"],
  ];

  for (const [list, level] of candidates) {
    if (list.length === 0) continue;
    const agg = aggregate(list, level);
    if (agg.volume > 0) return agg;
  }

  return { level: "none", volume: 0, roiPct: null, avgFieldSize: null, itmPct: null };
}

/** Estado de perfil por dia (profile_states): dia -> perfil ativo (ou OFF/null). */
export interface ProfileStateLike {
  dayOfWeek?: number | null;
  activeProfile?: string | null;
}

/**
 * Dias em que a GRADE do perfil pedido esta de fato ativa.
 *
 * A tabela `planned_tournaments` guarda torneios de A, B e C no MESMO dia, mas
 * a grade so mostra o perfil que esta ativo naquele dia (GradePlanner:
 * `getTournamentsForDay`). Dia sem estado, com estado null ou marcado "OFF"
 * nao entra. Sem esse filtro a importacao trazia torneios que o jogador NAO ve
 * na grade — foi exatamente o caso do "$131-250 GGPoker" (domingo esta em A,
 * entao os torneios de B daquele dia sao invisiveis).
 */
export function activeDaysForProfile(
  states: ProfileStateLike[] | null | undefined,
  profileLetter: string,
): Set<number> {
  const days = new Set<number>();
  for (const st of states ?? []) {
    const day = Number(st?.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const active = (st?.activeProfile ?? "").toString().trim().toUpperCase();
    if (!active || active === "OFF") continue;
    if (active === profileLetter.toUpperCase()) days.add(day);
  }
  return days;
}

/**
 * Aplica o filtro de dias ativos sobre a lista de torneios planejados.
 * Sem NENHUM estado salvo (usuario que nunca tocou nos perfis), nao filtra —
 * filtrar ali esvaziaria a importacao sem o jogador entender por que.
 */
export function filterPlannedByActiveDays<T extends { dayOfWeek?: number | null }>(
  planned: T[],
  states: ProfileStateLike[] | null | undefined,
  profileLetter: string,
): { rows: T[]; activeDays: number[]; applied: boolean } {
  const hasStates = Array.isArray(states) && states.length > 0;
  if (!hasStates) {
    return { rows: planned, activeDays: [], applied: false };
  }
  const days = activeDaysForProfile(states, profileLetter);
  const rows = planned.filter((pt) => days.has(Number(pt?.dayOfWeek)));
  return { rows, activeDays: [...days].sort((a, b) => a - b), applied: true };
}

/**
 * Rake — duas grandezas diferentes, nao confundir:
 *
 *   feeShare  = fatia do buy-in TOTAL que e taxa ($55 com $5 de fee -> 9,1%).
 *               E como os sites publicam, e como a tabela por site guarda.
 *   markup    = taxa sobre a parte que vai ao prize pool ($50 + $5 -> 10%).
 *               E o que o varianceEngine consome: custo = buyIn x (1 + rakePct).
 *
 * O buy-in que o jogador escreve na grade e o TOTAL pago. Entao a linha da
 * simulacao leva `buyIn` = parte do prize pool e `rakePct` = markup.
 */
export function siteFeeShare(site: unknown): number {
  return mttRakePctForSite(site) / 100;
}

export function rakeMarkupFromFeeShare(feeShare: number): number {
  if (!Number.isFinite(feeShare) || feeShare <= 0) return 0;
  const safe = Math.min(0.4, Math.max(0, feeShare));
  return safe / (1 - safe);
}

/** Parte do buy-in total que vai ao prize pool (o resto e taxa do site). */
export function prizePoolPartOfBuyIn(totalBuyIn: number, feeShare: number): number {
  const total = Number(totalBuyIn);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeFee = Number.isFinite(feeShare) ? Math.min(0.4, Math.max(0, feeShare)) : 0;
  return total * (1 - safeFee);
}

/** Markup de rake (decimal) do site do torneio planejado — pronto pro engine. */
export function plannedRakeDecimal(pt: PlannedLike): number {
  return rakeMarkupFromFeeShare(siteFeeShare(pt.site));
}

// ---------------------------------------------------------------------------
// Escopo da amostra + agrupamento das linhas
// ---------------------------------------------------------------------------

/**
 * Descreve, em PT-BR, DE ONDE veio o ROI daquela linha. Existe porque o nivel
 * de fallback e invisivel no numero: "Bodog $20-29" casando em `abi_type`
 * mostrava o volume de TODOS os sites (milhares de torneios) como se fosse da
 * Bodog. O jogador precisa ver que a amostra nao e daquele site.
 */
export interface MatchScope {
  /** Rotulo curto do conjunto que gerou o ROI. */
  label: string;
  /** true quando NAO ha amostra do site do torneio (media cross-site). */
  siteSampleMissing: boolean;
}

export function describeMatchScope(
  pt: PlannedLike,
  level: MatchLevel,
): MatchScope | null {
  const tier = plannedBuyInTier(pt.buyIn);
  const type = plannedType(pt);
  const site = (pt.site ?? "").toString().trim() || "site";
  const bin = plannedTimeBin(pt.time);

  switch (level) {
    case "site_abi_type_time":
      return {
        label: `${site} · ${tier} · ${type} · ${timeBinLabel(bin)}`,
        siteSampleMissing: false,
      };
    case "site_abi_type":
      return { label: `${site} · ${tier} · ${type}`, siteSampleMissing: false };
    case "site_abi_time":
      return {
        label: `${site} · ${tier} · todos os tipos · ${timeBinLabel(bin)}`,
        siteSampleMissing: false,
      };
    case "site_abi":
      return {
        label: `${site} · ${tier} · todos os tipos`,
        siteSampleMissing: false,
      };
    case "abi_type":
      return {
        label: `${type} ${tier} (todos os sites)`,
        siteSampleMissing: true,
      };
    case "type":
      return {
        label: `${type} (todas as faixas de buy-in)`,
        siteSampleMissing: true,
      };
    default:
      return null;
  }
}

/**
 * Um torneio recorrente da grade, ja consolidado (o mesmo torneio em varios
 * dias da semana = UMA unidade).
 */
export interface PlannedUnit {
  /** Ocorrencia representativa: horario/tipo/velocidade MAIS FREQUENTES. */
  representative: PlannedLike;
  occurrencesPerWeek: number;
  days: number[];
  avgBuyIn: number;
  /** Nome proprio quando identico em todas as ocorrencias; null se divergem. */
  tournamentName: string | null;
  /** Janelas de horario distintas encontradas (>1 = horario varia no dia). */
  timeBins: string[];
}

function modeOf<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Chave de IDENTIDADE do torneio recorrente.
 *
 * Agrupar pelo rotulo (que inclui a janela de 2h) partia o mesmo torneio em
 * duas linhas quando o horario cruzava a fronteira do bin — "Mini Kickoff"
 * as 13:30 na segunda e 14:30 de terca a sexta virava "1x seg" + "4x ter-sex".
 * A identidade real e site + nome + faixa de buy-in; o horario e uma
 * propriedade da ocorrencia, nao da identidade.
 */
function identityKey(pt: PlannedLike): string {
  const site = canonicalSiteKey(pt.site);
  const tier = plannedBuyInTier(pt.buyIn);
  const sig = nameSignature((pt.name ?? "").toString());
  if (sig) return `n:${site}|${sig}|${tier}`;
  // Sem nome utilizavel, cai para as dimensoes do rotulo (comportamento antigo).
  return `d:${site}|${plannedType(pt)}|${tier}|${plannedTimeBin(pt.time)}|${(pt.speed ?? "").toString().trim()}`;
}

/**
 * Consolida os torneios planejados em unidades recorrentes. O casamento com a
 * biblioteca e o rotulo sao calculados DEPOIS, sobre o representante — assim a
 * linha usa o horario predominante, nao o horario do primeiro dia da semana.
 */
export function groupPlannedTournaments(planned: PlannedLike[]): PlannedUnit[] {
  const buckets = new Map<string, PlannedLike[]>();
  for (const pt of planned) {
    const key = identityKey(pt);
    const list = buckets.get(key);
    if (list) list.push(pt);
    else buckets.set(key, [pt]);
  }

  const units: PlannedUnit[] = [];

  for (const list of buckets.values()) {
    const times = list.map((pt) => (pt.time ?? "").toString());
    const modalTime = modeOf(times) ?? times[0] ?? "";
    const modalType = modeOf(list.map((pt) => (pt.type ?? "").toString()));
    const modalSpeed = modeOf(list.map((pt) => (pt.speed ?? "").toString()));
    const buyIns = list.map((pt) => Number(pt.buyIn)).filter((v) => Number.isFinite(v) && v > 0);
    const avgBuyIn = buyIns.length > 0 ? buyIns.reduce((a, b) => a + b, 0) / buyIns.length : 0;

    // Representante herda o horario/tipo/velocidade predominantes; o buy-in
    // medio mantem a linha na mesma faixa de ABI das ocorrencias.
    const base = list.find((pt) => (pt.time ?? "") === modalTime) ?? list[0];
    const representative: PlannedLike = {
      ...base,
      time: modalTime,
      type: modalType ?? base.type,
      speed: modalSpeed ?? base.speed,
      buyIn: avgBuyIn > 0 ? avgBuyIn : base.buyIn,
    };

    const names = [...new Set(list.map((pt) => (pt.name ?? "").toString().trim()))];
    const days = [
      ...new Set(
        list
          .map((pt) => Number(pt.dayOfWeek))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ].sort((a, b) => a - b);

    units.push({
      representative,
      occurrencesPerWeek: list.length,
      days,
      avgBuyIn: Math.round((avgBuyIn || 0) * 100) / 100,
      tournamentName: names.length === 1 && names[0] ? names[0] : null,
      timeBins: [...new Set(list.map((pt) => plannedTimeBin(pt.time)))],
    });
  }

  return units;
}
