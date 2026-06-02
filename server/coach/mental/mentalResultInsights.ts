// =============================================================================
// Sprint Fase C #10 — Helper PURO: buildMentalResultInsights (RF-05)
//
// Spec: Docs/specs/sprint-fase-c-10-mental-resultado-2026-06-02.md (RF-05)
// ADR : Docs/architecture/decisions/233-fase-c-10-mental-result-insights.md (D-4/D-7)
//
// PUREZA (ADR D-4): este modulo NAO importa drizzle/schema/storage/db e NAO usa
// new Date(). Recebe SessionPnlRow[] ja normalizado (P&L em USD, sinais como
// buckets/null pre-computados pelo storage) e devolve MentalResultInsights.
// Importa SO o tipo TiltTypeId de shared/tilt-types (type-only, erased em runtime).
//
// Paridade com server/coach/leaks/detectLeaks.ts (helper puro testavel).
// =============================================================================

import type { TiltTypeId } from "../../../shared/tilt-types";

export type Period = "7d" | "30d" | "90d";

export const MIN_SESSIONS_PER_BUCKET = 4;
export const MIN_SESSIONS_OVERALL = 8;

// Faixas de foco (0-10) — literais travados (RF-02 / ADR contrato).
export const FOCUS_BUCKETS = [
  { key: "alto", min: 7.5 },
  { key: "medio", min: 5 },
  { key: "baixo", min: 0 },
] as const;

export type FocusBucketKey = (typeof FOCUS_BUCKETS)[number]["key"];
export type AbGameBucketKey = "a_dominant" | "bc_present";

export interface BucketStat {
  n: number;
  avgPnlUsd: number | null;
  medianPnlUsd: number | null;
  dataSufficiency: "ok" | "low";
}

export interface MentalResultBuckets<K extends string> {
  period: Period;
  baseline: BucketStat;
  buckets: Array<BucketStat & { key: K; deltaVsBaseline: number | null }>;
  dataSufficiency: "ok" | "low";
}

export interface MentalResultInsights {
  tilt: MentalResultBuckets<TiltTypeId>;
  focus: MentalResultBuckets<FocusBucketKey>;
  abgame: MentalResultBuckets<AbGameBucketKey>;
}

export interface SessionPnlRow {
  sessionId: string;
  pnlUsd: number;
  tiltType: TiltTypeId | null;
  focusValue: number | null;
  abGameBucket: AbGameBucketKey | null;
}

// -----------------------------------------------------------------------------
// Helpers estatisticos puros
// -----------------------------------------------------------------------------

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  let sum = 0;
  for (const v of nums) sum += v;
  return sum / nums.length;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function bucketStats(pnlList: number[]): BucketStat {
  const n = pnlList.length;
  return {
    n,
    avgPnlUsd: mean(pnlList),
    medianPnlUsd: median(pnlList),
    dataSufficiency: n < MIN_SESSIONS_PER_BUCKET ? "low" : "ok",
  };
}

function deltaVs(
  bucketAvg: number | null,
  baselineAvg: number | null,
): number | null {
  if (bucketAvg === null || baselineAvg === null) return null;
  return bucketAvg - baselineAvg;
}

// -----------------------------------------------------------------------------
// buildMentalResultInsights
// -----------------------------------------------------------------------------

export function buildMentalResultInsights(
  rows: SessionPnlRow[],
  period: Period,
): MentalResultInsights {
  const safeRows = Array.isArray(rows) ? rows : [];

  // Baseline = TODAS as sessoes do conjunto base (mesmo sem sinal mental).
  const baselinePnl = safeRows.map((r) => r.pnlUsd);
  const baseline = bucketStats(baselinePnl);
  const setSufficiency: "ok" | "low" =
    baseline.n < MIN_SESSIONS_OVERALL ? "low" : "ok";

  // ---------------------------------------------------------------------------
  // TILT — bucket por tiltType; ordenacao por deltaVsBaseline ASC, desempate key ASC.
  // ---------------------------------------------------------------------------
  const tiltGroups = new Map<TiltTypeId, number[]>();
  for (const r of safeRows) {
    if (r.tiltType == null) continue;
    const list = tiltGroups.get(r.tiltType) ?? [];
    list.push(r.pnlUsd);
    tiltGroups.set(r.tiltType, list);
  }
  const tiltBuckets = Array.from(tiltGroups.entries()).map(([key, pnl]) => {
    const stat = bucketStats(pnl);
    return {
      key,
      ...stat,
      deltaVsBaseline: deltaVs(stat.avgPnlUsd, baseline.avgPnlUsd),
    };
  });
  tiltBuckets.sort((a, b) => {
    const da = a.deltaVsBaseline;
    const db = b.deltaVsBaseline;
    if (da == null && db == null) {
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    }
    if (da == null) return 1;
    if (db == null) return -1;
    if (da !== db) return da - db;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  // ---------------------------------------------------------------------------
  // FOCUS — 3 buckets fixos na ordem alto/medio/baixo (sempre presentes).
  // ---------------------------------------------------------------------------
  const focusGroups: Record<FocusBucketKey, number[]> = {
    alto: [],
    medio: [],
    baixo: [],
  };
  for (const r of safeRows) {
    if (r.focusValue == null || !Number.isFinite(r.focusValue)) continue;
    const v = r.focusValue;
    let key: FocusBucketKey;
    if (v >= 7.5) key = "alto";
    else if (v >= 5) key = "medio";
    else key = "baixo";
    focusGroups[key].push(r.pnlUsd);
  }
  const focusBuckets = (FOCUS_BUCKETS.map((b) => b.key) as FocusBucketKey[]).map(
    (key) => {
      const stat = bucketStats(focusGroups[key]);
      return {
        key,
        ...stat,
        deltaVsBaseline: deltaVs(stat.avgPnlUsd, baseline.avgPnlUsd),
      };
    },
  );

  // ---------------------------------------------------------------------------
  // ABGAME — 2 buckets fixos na ordem a_dominant/bc_present (sempre presentes).
  // ---------------------------------------------------------------------------
  const abGroups: Record<AbGameBucketKey, number[]> = {
    a_dominant: [],
    bc_present: [],
  };
  for (const r of safeRows) {
    if (r.abGameBucket == null) continue;
    abGroups[r.abGameBucket].push(r.pnlUsd);
  }
  const abgameBuckets = (["a_dominant", "bc_present"] as AbGameBucketKey[]).map(
    (key) => {
      const stat = bucketStats(abGroups[key]);
      return {
        key,
        ...stat,
        deltaVsBaseline: deltaVs(stat.avgPnlUsd, baseline.avgPnlUsd),
      };
    },
  );

  return {
    tilt: {
      period,
      baseline,
      buckets: tiltBuckets,
      dataSufficiency: setSufficiency,
    },
    focus: {
      period,
      baseline,
      buckets: focusBuckets,
      dataSufficiency: setSufficiency,
    },
    abgame: {
      period,
      baseline,
      buckets: abgameBuckets,
      dataSufficiency: setSufficiency,
    },
  };
}
