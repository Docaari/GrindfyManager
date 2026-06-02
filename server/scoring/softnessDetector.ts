/**
 * Fase F #12 — Game Selection Score (softness) — detector PURO (ADR-237 D-1).
 *
 * Eixo SEPARADO do scorer calibrado. Responde "esse field esta MOLE?" — quao
 * exploravel e a populacao, independente do historico do jogador.
 *
 * Helpers PUROS / deterministicos: sem DB, sem FX, sem `new Date()`. Recebe os
 * valores JA derivados/normalizados (buyInUSD/guaranteedUSD ja em USD — lesson #6).
 *
 * 5 dos 6 indicadores sao proxy por nome (regex) ou heuristica de campo
 * existente -> confidence='weak' (lesson #11 — nao inventa certeza). overlay e
 * prime-nobre sao os unicos 'strong'.
 */

import type {
  SoftnessConfidence,
  SoftnessIndicator,
  SoftnessResult,
  SoftnessTier,
  TimeOfDayBucket,
} from "../../shared/scoring";
import {
  SOFTNESS_MULTIDAY_RE,
  SOFTNESS_OVERLAY_RATIO_THRESHOLD,
  SOFTNESS_REGIONAL_RE,
  SOFTNESS_SATELLITE_RE,
  SOFTNESS_SPORTSBOOK_SITES,
  SOFTNESS_TIER_MEDIO_THRESHOLD,
  SOFTNESS_TIER_MOLE_THRESHOLD,
  SOFTNESS_WEIGHTS,
} from "./softnessConstants";

export interface SoftnessInput {
  name: string;
  site: string;
  buyInUSD: number; // ja em USD (lesson #6)
  guaranteedUSD: number; // ja em USD; 0/ausente => overlay nao dispara
  timeOfDayBucket: TimeOfDayBucket | null;
}

/**
 * Normaliza o nome do torneio para o match dos regex: NFD strip de diacriticos
 * + lowercase. Inline (D-3 opcao b) — zero risco de regressao nos outros 2
 * callsites de stripAccents (News/HUD); extracao DRY deferida.
 */
export function normalizeNameForSoftness(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Avalia os 6 indicadores independentemente (presenca individual — lesson #8) e
 * retorna APENAS os que bateram.
 */
export function detectSoftnessIndicators(input: SoftnessInput): SoftnessIndicator[] {
  const indicators: SoftnessIndicator[] = [];
  const normName = normalizeNameForSoftness(input.name);

  // --- overlay (strong) — gtd/buyIn >= threshold, guard div-zero ---
  const buyIn = typeof input.buyInUSD === "number" ? input.buyInUSD : 0;
  const gtd = typeof input.guaranteedUSD === "number" ? input.guaranteedUSD : 0;
  if (buyIn > 0 && gtd > 0) {
    const ratio = gtd / buyIn;
    if (ratio >= SOFTNESS_OVERLAY_RATIO_THRESHOLD) {
      indicators.push({
        key: "overlay",
        label: "Garantido alto vs buy-in",
        confidence: "strong",
        weight: SOFTNESS_WEIGHTS.overlay,
        evidence: `gtd/buy-in = ${Math.round(ratio)}x`,
      });
    }
  }

  // --- prime-time (noite-nobre strong / noite-cedo weak; conta UMA vez) ---
  if (input.timeOfDayBucket === "noite-nobre") {
    indicators.push({
      key: "primetime",
      label: "Horario nobre",
      confidence: "strong",
      weight: SOFTNESS_WEIGHTS.primetimeNobre,
    });
  } else if (input.timeOfDayBucket === "noite-cedo") {
    indicators.push({
      key: "primetime",
      label: "Horario nobre",
      confidence: "weak",
      weight: SOFTNESS_WEIGHTS.primetimeCedo,
    });
  }

  // --- sportsbook (weak) — allowlist por site cru ---
  const site = input.site ?? "";
  if (site && SOFTNESS_SPORTSBOOK_SITES.includes(site)) {
    indicators.push({
      key: "sportsbook",
      label: "Rede com sportsbook",
      confidence: "weak",
      weight: SOFTNESS_WEIGHTS.sportsbook,
      evidence: `site ${site}`,
    });
  }

  // --- satelite (weak) — proxy por nome ---
  if (SOFTNESS_SATELLITE_RE.test(normName)) {
    indicators.push({
      key: "satellite",
      label: "Satelite / qualifier",
      confidence: "weak",
      weight: SOFTNESS_WEIGHTS.satellite,
    });
  }

  // --- multi-day (weak) — proxy por nome ---
  if (SOFTNESS_MULTIDAY_RE.test(normName)) {
    indicators.push({
      key: "multiday",
      label: "Multi-day",
      confidence: "weak",
      weight: SOFTNESS_WEIGHTS.multiday,
    });
  }

  // --- regional (weak) — proxy por nome (mais ruidoso, D-7) ---
  if (SOFTNESS_REGIONAL_RE.test(normName)) {
    indicators.push({
      key: "regional",
      label: "Serie regional",
      confidence: "weak",
      weight: SOFTNESS_WEIGHTS.regional,
    });
  }

  return indicators;
}

function tierFromScore(score: number): SoftnessTier {
  if (score >= SOFTNESS_TIER_MOLE_THRESHOLD) return "mole";
  if (score >= SOFTNESS_TIER_MEDIO_THRESHOLD) return "medio";
  return "duro";
}

/**
 * Orquestra o detector + soma ponderada (clamp 0-100) e devolve o shape final.
 */
export function computeSoftness(input: SoftnessInput): SoftnessResult {
  const indicators = detectSoftnessIndicators(input);

  const rawScore = indicators.reduce((sum, ind) => sum + ind.weight, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  const overallConfidence: SoftnessConfidence = indicators.some(
    (i) => i.confidence === "strong",
  )
    ? "strong"
    : "weak";

  return {
    score,
    tier: tierFromScore(score),
    matchedCount: indicators.length,
    overallConfidence,
    indicators,
  };
}
