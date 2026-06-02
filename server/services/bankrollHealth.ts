/**
 * Painel BRM/RoR ao vivo — orquestracao read-only (Fase D #8, ADR-236).
 *
 * Alimenta o motor de variancia (varianceEngine.runMonteCarloSimulation) com a
 * banca REAL (storage.getCurrentBankroll) e o perfil de jogo REAL (tiers do
 * historico all-time, storage.getHistoricalStatsByUser), classifica o Risk of
 * Ruin e devolve um payload estavel para o card BRM no /bankroll.
 *
 * 100% read-only: zero escrita em DB, zero migration. Reusa a matematica
 * calibrada (ADR-211/215) — uma unica fonte da verdade.
 *
 * Helpers PUROS (classifyRiskOfRuin, resolveDataSufficiency) testaveis isolados.
 * Orquestracao testavel por injecao de deps (lesson #3/#34).
 */

import { runMonteCarloSimulation } from "./varianceEngine";

// ---------------------------------------------------------------------------
// D-3 — classifyRiskOfRuin (helper PURO, thresholds nomeados)
// ---------------------------------------------------------------------------

export const ROR_THRESHOLD_HEALTHY = 5; // < 5%  = saudavel
export const ROR_THRESHOLD_WARNING = 15; // 5–15% = atencao; > 15% = arriscado

export type RorClassification = "healthy" | "warning" | "risky";

export function classifyRiskOfRuin(
  pct: number | null,
): { classification: RorClassification; label: string; suggestion: string } | null {
  if (pct == null) return null;
  if (pct < ROR_THRESHOLD_HEALTHY) {
    return {
      classification: "healthy",
      label: "Saudável",
      suggestion: "Sua banca suporta bem seu volume atual.",
    };
  }
  if (pct <= ROR_THRESHOLD_WARNING) {
    return {
      classification: "warning",
      label: "Atenção",
      suggestion: "Considere subir a banca ou reduzir o ABI.",
    };
  }
  return {
    classification: "risky",
    label: "Arriscado",
    suggestion:
      "Risco de ruína alto — reduza buy-ins ou reforce a banca antes de continuar.",
  };
}

// ---------------------------------------------------------------------------
// D-4 — resolveDataSufficiency (helper PURO)
// ---------------------------------------------------------------------------

export const SAMPLE_THRESHOLD_OK = 200; // >= 200 torneios = amostra confiavel

export type DataSufficiency = "ok" | "low" | "none" | "no_bankroll";

export function resolveDataSufficiency(
  sampleSize: number,
  bankrollUsd: number,
): DataSufficiency {
  if (bankrollUsd == null || bankrollUsd <= 0) return "no_bankroll"; // precede tudo
  if (sampleSize <= 0) return "none";
  if (sampleSize < SAMPLE_THRESHOLD_OK) return "low"; // 1..199 → mostra com aviso
  return "ok"; // >= 200
}

// ---------------------------------------------------------------------------
// D-1 — buildBankrollHealth (orquestracao)
// ---------------------------------------------------------------------------

export interface BankrollHealthResult {
  bankrollUsd: number;
  roiMean: number | null;
  stdDev: number | null;
  riskOfRuinPct: number | null;
  classification: RorClassification | null;
  dataSufficiency: DataSufficiency;
  sampleSize: number;
  bisOfMargin: number | null;
  groupsUsed: number;
}

interface BankrollHealthDeps {
  getCurrentBankroll?: (uid: string) => Promise<any>;
  getHistoricalStatsByUser?: (input: { userId: string }) => Promise<any>;
  runSimulation?: typeof runMonteCarloSimulation;
}

const WEEKS = 52; // D-2 / D4 da spec — horizonte fixo

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export async function buildBankrollHealth(
  userId: string,
  deps?: BankrollHealthDeps,
): Promise<BankrollHealthResult> {
  // Lazy import do storage em producao (evita dep circular, padrao do projeto).
  let getCurrentBankroll = deps?.getCurrentBankroll;
  let getHistoricalStatsByUser = deps?.getHistoricalStatsByUser;
  const runSimulation = deps?.runSimulation ?? runMonteCarloSimulation;

  if (!getCurrentBankroll || !getHistoricalStatsByUser) {
    const { storage } = await import("../storage");
    getCurrentBankroll =
      getCurrentBankroll ?? ((uid: string) => storage.getCurrentBankroll(uid));
    getHistoricalStatsByUser =
      getHistoricalStatsByUser ??
      ((input: { userId: string }) => storage.getHistoricalStatsByUser(input));
  }

  try {
    // --- Banca real (USD consolidado) ---
    const bankroll = await getCurrentBankroll(userId);
    const bankrollUsd = isFiniteNumber(bankroll?.totalUsd)
      ? bankroll.totalUsd
      : 0;

    // Sem banca: estado no_bankroll, engine NAO roda (RF-03).
    if (bankrollUsd <= 0) {
      return {
        bankrollUsd: 0,
        roiMean: null,
        stdDev: null,
        riskOfRuinPct: null,
        classification: null,
        dataSufficiency: "no_bankroll",
        sampleSize: 0,
        bisOfMargin: null,
        groupsUsed: 0,
      };
    }

    // --- Historico real (tiers all-time, snake_case interno — lesson #3) ---
    const history = await getHistoricalStatsByUser({ userId });
    const tiers: any[] = Array.isArray(history?.tiers) ? history.tiers : [];

    // sampleSize honesto = soma de count de TODOS os tiers (ate descartados).
    let sampleSize = 0;
    for (const t of tiers) {
      const c = Number(t?.count);
      if (Number.isFinite(c)) sampleSize += c;
    }

    // Monta groups validos: descarta count <= 0 ou avg_buy_in invalido.
    const groups: Array<{
      name: string;
      buyIn: number;
      field: number;
      roi: number;
      count: number;
      isPKO: boolean;
    }> = [];

    for (const t of tiers) {
      const count = Number(t?.count);
      const buyIn = Number(t?.avg_buy_in);
      const field = Number(t?.avg_field);
      const roi = Number(t?.roi_adjusted);
      if (!Number.isFinite(count) || count <= 0) continue;
      if (!Number.isFinite(buyIn) || buyIn <= 0) continue;

      const type = String(t?.type ?? "");
      const tierLabel = String(t?.tier ?? "");
      groups.push({
        name: `${tierLabel} ${type}`.trim(),
        buyIn,
        field: Number.isFinite(field) ? field : 0,
        roi: Number.isFinite(roi) ? roi : 0,
        count,
        isPKO: type === "PKO",
      });
    }

    // dataSufficiency considera amostra (sampleSize) + banca; mas o engine so
    // roda se houver >= 1 group valido. Sem groups validos → none.
    let dataSufficiency = resolveDataSufficiency(sampleSize, bankrollUsd);
    if (groups.length === 0) {
      dataSufficiency = "none";
    }

    if (dataSufficiency === "none" || dataSufficiency === "no_bankroll") {
      return {
        bankrollUsd,
        roiMean: null,
        stdDev: null,
        riskOfRuinPct: null,
        classification: null,
        dataSufficiency,
        sampleSize,
        bisOfMargin: null,
        groupsUsed: groups.length,
      };
    }

    // BIs de margem = banca / ABI ponderado dos groups validos.
    let weightedBuyInSum = 0;
    let weightedCountSum = 0;
    for (const g of groups) {
      weightedBuyInSum += g.buyIn * g.count;
      weightedCountSum += g.count;
    }
    const weightedAvgBuyIn =
      weightedCountSum > 0 ? weightedBuyInSum / weightedCountSum : 0;
    const bisOfMargin =
      weightedAvgBuyIn > 0 ? bankrollUsd / weightedAvgBuyIn : null;

    // --- Engine (Monte Carlo) ---
    let riskOfRuinPct: number | null = null;
    let stdDev: number | null = null;
    let roiMean: number | null = null;
    let classification: RorClassification | null = null;

    try {
      const sim = runSimulation({
        groups,
        weeks: WEEKS,
        bankrollUsd,
      });
      riskOfRuinPct = isFiniteNumber(sim?.riskOfRuin?.pct)
        ? sim.riskOfRuin!.pct
        : null;
      stdDev = isFiniteNumber(sim?.stdDev) ? sim.stdDev : null;
      roiMean = isFiniteNumber(sim?.roi?.mean) ? sim.roi.mean : null;
      const cls = classifyRiskOfRuin(riskOfRuinPct);
      classification = cls ? cls.classification : null;
    } catch (engineErr) {
      // lesson #9 — log ANTES do fallback.
      console.error("[bankrollHealth] engine simulation failed", engineErr);
      riskOfRuinPct = null;
      stdDev = null;
      roiMean = null;
      classification = null;
    }

    return {
      bankrollUsd,
      roiMean,
      stdDev,
      riskOfRuinPct,
      classification,
      dataSufficiency,
      sampleSize,
      bisOfMargin,
      groupsUsed: groups.length,
    };
  } catch (err) {
    // lesson #9 — log ANTES do fallback. Degrada gracioso (storage throw etc).
    console.error("[bankrollHealth] buildBankrollHealth failed", err);
    return {
      bankrollUsd: 0,
      roiMean: null,
      stdDev: null,
      riskOfRuinPct: null,
      classification: null,
      dataSufficiency: "none",
      sampleSize: 0,
      bisOfMargin: null,
      groupsUsed: 0,
    };
  }
}
