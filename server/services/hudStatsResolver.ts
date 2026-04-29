// =============================================================================
// Sprint F4 — Stats Analyzer pure helpers (target resolution + sample size)
//
// Spec : Docs/specs/sprint-f4-stats-targets-sample-size.md
// ADRs : 057 (knowledge base), 058 (sample size per stat)
// =============================================================================

import type { HudStatField, HudStatTarget } from "@shared/schema";

// -----------------------------------------------------------------------------
// Sample size thresholds (founder pode ajustar; expostos como const)
// -----------------------------------------------------------------------------

export const HUD_SAMPLE_SIZE_THRESHOLDS = {
  highMin: 100,
  mediumMin: 30,
} as const;

export type HudConfidence = "high" | "medium" | "low";

export function assignConfidence(
  sampleSize: number | null | undefined,
): HudConfidence {
  if (typeof sampleSize !== "number" || sampleSize < HUD_SAMPLE_SIZE_THRESHOLDS.mediumMin) {
    return "low";
  }
  if (sampleSize >= HUD_SAMPLE_SIZE_THRESHOLDS.highMin) return "high";
  return "medium";
}

// -----------------------------------------------------------------------------
// Snapshot values normalizer (ADR-058)
//
// Aceita Record<key, number | null | { value, sampleSize }> e retorna shape
// canonico Record<key, { value, sampleSize }>.
// -----------------------------------------------------------------------------

export interface NormalizedValue {
  value: number | null;
  sampleSize: number | null;
}

export function normalizeSnapshotValues(
  raw: Record<string, any> | null | undefined,
): Record<string, NormalizedValue> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, NormalizedValue> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (entry === null || entry === undefined) {
      out[key] = { value: null, sampleSize: null };
      continue;
    }
    if (typeof entry === "number") {
      out[key] = { value: entry, sampleSize: null };
      continue;
    }
    if (typeof entry === "object") {
      const value =
        typeof (entry as any).value === "number" ? (entry as any).value : null;
      const sampleSize =
        typeof (entry as any).sampleSize === "number" &&
        (entry as any).sampleSize >= 0
          ? (entry as any).sampleSize
          : null;
      out[key] = { value, sampleSize };
      continue;
    }
    out[key] = { value: null, sampleSize: null };
  }
  return out;
}

// -----------------------------------------------------------------------------
// Target resolver (ADR-057)
//
// Precedencia:
//   1. inline `targetMin/targetMax` em StatField
//   2. `targetRef` lookup em knowledge base
//   3. nenhum (retorna null)
// -----------------------------------------------------------------------------

export interface ResolvedTarget {
  min: number;
  max: number;
  source: "inline" | "knowledge-base";
  knowledgeBaseRef?: string;
}

export interface KnowledgeBaseLookup {
  /**
   * Retorna target do knowledge base por (statKey, format, stakeBucket) ou null.
   * Implementacao tipica: cache em memoria server-side.
   */
  getTarget(
    statKey: string,
    format: string,
    stakeBucket: string,
  ): { targetMin: number; targetMax: number } | null;
}

export function resolveTarget(
  field: Pick<HudStatField, "key" | "targetMin" | "targetMax" | "targetRef">,
  knowledgeBase?: KnowledgeBaseLookup,
): ResolvedTarget | null {
  // Precedencia 1: inline override
  if (typeof field.targetMin === "number" && typeof field.targetMax === "number") {
    return {
      min: field.targetMin,
      max: field.targetMax,
      source: "inline",
    };
  }

  // Precedencia 2: knowledge base via targetRef
  if (field.targetRef && knowledgeBase) {
    const parts = field.targetRef.split("/");
    if (parts.length === 2) {
      const [format, stakeBucket] = parts;
      const found = knowledgeBase.getTarget(field.key, format, stakeBucket);
      if (found) {
        return {
          min: found.targetMin,
          max: found.targetMax,
          source: "knowledge-base",
          knowledgeBaseRef: field.targetRef,
        };
      }
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// Classifier vs target
// -----------------------------------------------------------------------------

export type VsTargetStatus = "below_range" | "in_range" | "above_range";

export function classifyVsTarget(
  value: number | null | undefined,
  targetMin: number | null | undefined,
  targetMax: number | null | undefined,
): VsTargetStatus | null {
  if (
    typeof value !== "number" ||
    typeof targetMin !== "number" ||
    typeof targetMax !== "number"
  ) {
    return null;
  }
  if (value < targetMin) return "below_range";
  if (value > targetMax) return "above_range";
  return "in_range";
}

// -----------------------------------------------------------------------------
// Weighted average por sample size
// -----------------------------------------------------------------------------

export function computeWeightedAverage(
  entries: Array<{ value: number | null; sampleSize: number | null }>,
): number | null {
  const valid = entries.filter(
    (e): e is { value: number; sampleSize: number | null } =>
      typeof e.value === "number",
  );
  if (valid.length === 0) return null;

  const allWeighted = valid.every(
    (e) => typeof e.sampleSize === "number" && e.sampleSize > 0,
  );

  if (allWeighted) {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const e of valid) {
      const w = e.sampleSize as number;
      totalWeight += w;
      weightedSum += e.value * w;
    }
    return weightedSum / totalWeight;
  }

  // Fallback: media simples
  const sum = valid.reduce((acc, e) => acc + e.value, 0);
  return sum / valid.length;
}
