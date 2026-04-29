// =============================================================================
// Sprint F3 — Stats Analyzer: pure compare helpers
//
// Spec: Docs/specs/sprint-f3-stats-analyzer.md (RF-06)
// =============================================================================

import type { HudLayout, HudStatSnapshot, HudSection } from "@shared/schema";
import {
  normalizeSnapshotValues,
  classifyVsTarget,
  type VsTargetStatus,
} from "./hudStatsResolver";

export interface SnapshotDiffEntry {
  key: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  // F4 NOVO
  aSampleSize: number | null;
  bSampleSize: number | null;
  target: { min: number; max: number } | null;
  vsTarget: VsTargetStatus | null;
}

export interface SnapshotComparePayload {
  layoutId: string;
  layoutName: string;
  a: { id: string; capturedAt: Date; sampleSize: number | null };
  b: { id: string; capturedAt: Date; sampleSize: number | null };
  diffs: SnapshotDiffEntry[];
}

export function collectLayoutKeys(sections: HudSection[] | null | undefined): string[] {
  const keys: string[] = [];
  for (const sec of sections ?? []) {
    for (const s of sec.stats ?? []) keys.push(s.key);
  }
  return keys;
}

function findField(
  sections: HudSection[] | null | undefined,
  key: string,
): { targetMin?: number; targetMax?: number } | null {
  for (const sec of sections ?? []) {
    for (const s of sec.stats ?? []) {
      if (s.key === key) {
        return {
          targetMin: typeof s.targetMin === "number" ? s.targetMin : undefined,
          targetMax: typeof s.targetMax === "number" ? s.targetMax : undefined,
        };
      }
    }
  }
  return null;
}

export function buildSnapshotDiff(
  layout: Pick<HudLayout, "id" | "name" | "sections">,
  a: HudStatSnapshot,
  b: HudStatSnapshot,
): SnapshotComparePayload {
  const allKeys = new Set<string>();
  for (const k of collectLayoutKeys(layout.sections)) allKeys.add(k);
  // F4: normaliza values pra extrair value + sampleSize
  const aNorm = normalizeSnapshotValues(a.values as any);
  const bNorm = normalizeSnapshotValues(b.values as any);
  for (const k of Object.keys(aNorm)) allKeys.add(k);
  for (const k of Object.keys(bNorm)) allKeys.add(k);

  const diffs: SnapshotDiffEntry[] = [];
  for (const key of allKeys) {
    const va = aNorm[key]?.value ?? null;
    const vb = bNorm[key]?.value ?? null;
    const delta =
      typeof va === "number" && typeof vb === "number"
        ? +(vb - va).toFixed(4)
        : null;
    const field = findField(layout.sections as any, key);
    const target =
      field && typeof field.targetMin === "number" && typeof field.targetMax === "number"
        ? { min: field.targetMin, max: field.targetMax }
        : null;
    const vsTarget = target ? classifyVsTarget(vb, target.min, target.max) : null;
    diffs.push({
      key,
      a: va,
      b: vb,
      delta,
      aSampleSize: aNorm[key]?.sampleSize ?? null,
      bSampleSize: bNorm[key]?.sampleSize ?? null,
      target,
      vsTarget,
    });
  }

  return {
    layoutId: layout.id,
    layoutName: layout.name,
    a: { id: a.id, capturedAt: a.capturedAt, sampleSize: a.sampleSize ?? null },
    b: { id: b.id, capturedAt: b.capturedAt, sampleSize: b.sampleSize ?? null },
    diffs,
  };
}
