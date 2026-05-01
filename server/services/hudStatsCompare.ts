// =============================================================================
// Sprint F3 — Stats Analyzer: pure compare helpers
//
// Spec: Docs/specs/sprint-f3-stats-analyzer.md (RF-06)
// =============================================================================

import type { HudLayout, HudStatSnapshot, HudSection } from "@shared/schema";

export interface SnapshotDiffEntry {
  key: string;
  a: number | null;
  b: number | null;
  delta: number | null;
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

export function buildSnapshotDiff(
  layout: Pick<HudLayout, "id" | "name" | "sections">,
  a: HudStatSnapshot,
  b: HudStatSnapshot,
): SnapshotComparePayload {
  const allKeys = new Set<string>();
  for (const k of collectLayoutKeys(layout.sections)) allKeys.add(k);
  for (const k of Object.keys(a.values ?? {})) allKeys.add(k);
  for (const k of Object.keys(b.values ?? {})) allKeys.add(k);

  const diffs: SnapshotDiffEntry[] = [];
  for (const key of allKeys) {
    const va = a.values?.[key] ?? null;
    const vb = b.values?.[key] ?? null;
    const delta =
      typeof va === "number" && typeof vb === "number"
        ? +(vb - va).toFixed(4)
        : null;
    diffs.push({ key, a: va, b: vb, delta });
  }

  return {
    layoutId: layout.id,
    layoutName: layout.name,
    a: { id: a.id, capturedAt: a.capturedAt, sampleSize: a.sampleSize ?? null },
    b: { id: b.id, capturedAt: b.capturedAt, sampleSize: b.sampleSize ?? null },
    diffs,
  };
}
