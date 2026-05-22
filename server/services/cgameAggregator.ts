// =============================================================================
// cgameAggregator — Sprint AI-2B / RF-05 (ADR-170 — Q-D locked)
//
// Heurística determinística sem LLM. Classifica warm-ups em A/B/C-game e
// agrega séries temporais para Inchworm chart.
//
// Q-D defaults:
//   A = score >= 8 && !overrideUsed && decisionToPlay
//   C = score <= 4 && overrideUsed && decisionToPlay
//   B = resto (incluindo decisionToPlay=false)
//
// Thresholds via env CGAME_A_THRESHOLD / CGAME_C_THRESHOLD (alias para
// COACH_CGAME_A_THRESHOLD / COACH_CGAME_C_THRESHOLD).
//
// Lessons: #9 (safe-deny + log em storage error), #6 (não FX aqui — read warm-up
// só), #34 (storage injetável).
// =============================================================================

export type CgameLevel = "A" | "B" | "C";

// =============================================================================
// Sprint AI-3.2 / RF-A2 (ADR-203) — confidence narrowing canonico shared.
// Consolida 4 generators (quarterly cgame persist + insight-mapping).
// =============================================================================
export const CGAME_CONFIDENCE_VALUES = ["high", "medium", "low"] as const;
export type CgameConfidence = typeof CGAME_CONFIDENCE_VALUES[number];

export function isValidConfidence(value: unknown): value is CgameConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function getThresholds(): { a: number; c: number } {
  const aRaw = process.env.CGAME_A_THRESHOLD ?? process.env.COACH_CGAME_A_THRESHOLD;
  const cRaw = process.env.CGAME_C_THRESHOLD ?? process.env.COACH_CGAME_C_THRESHOLD;
  const a = aRaw ? Number(aRaw) : 8;
  const c = cRaw ? Number(cRaw) : 4;
  return { a, c };
}

export function classifyWarmupGame(ritual: {
  emotionalCheckScore?: number | null;
  overrideUsed?: boolean | null;
  decisionToPlay?: boolean | null;
}): CgameLevel {
  const { a, c } = getThresholds();
  const score = Number(ritual?.emotionalCheckScore ?? 0);
  const override = Boolean(ritual?.overrideUsed);
  const decision = ritual?.decisionToPlay !== false;
  if (score >= a && !override && decision) return "A";
  if (score <= c && override && decision) return "C";
  return "B";
}

function classifyConfidence(sampleSize: number): "high" | "medium" | "low" {
  if (sampleSize >= 20) return "high";
  if (sampleSize >= 8) return "medium";
  return "low";
}

export interface CgameSnapshot {
  aPct: number;
  bPct: number;
  cPct: number;
  sampleSize: number;
  confidence: "high" | "medium" | "low";
}

function roundPct(n: number): number {
  return Math.round(n);
}

function emptySnapshot(): CgameSnapshot {
  return { aPct: 0, bPct: 0, cPct: 0, sampleSize: 0, confidence: "low" };
}

function aggregate(rituals: any[]): CgameSnapshot {
  if (!Array.isArray(rituals) || rituals.length === 0) return emptySnapshot();
  let aCount = 0;
  let bCount = 0;
  let cCount = 0;
  for (const r of rituals) {
    const lvl = classifyWarmupGame(r);
    if (lvl === "A") aCount += 1;
    else if (lvl === "C") cCount += 1;
    else bCount += 1;
  }
  const total = rituals.length;
  let aPct = roundPct((aCount / total) * 100);
  let bPct = roundPct((bCount / total) * 100);
  let cPct = roundPct((cCount / total) * 100);
  // Garantir soma=100 mesmo com arredondamento.
  const sum = aPct + bPct + cPct;
  if (sum !== 100 && total > 0) {
    const diff = 100 - sum;
    // Ajusta o maior bucket (estabilidade visual).
    if (aPct >= bPct && aPct >= cPct) aPct += diff;
    else if (bPct >= cPct) bPct += diff;
    else cPct += diff;
  }
  return {
    aPct,
    bPct,
    cPct,
    sampleSize: total,
    confidence: classifyConfidence(total),
  };
}

export async function aggregateCgameForPeriod(
  userId: string,
  range: { start: Date | string; end: Date | string },
  injectedStorage?: any,
): Promise<CgameSnapshot> {
  try {
    const storage = injectedStorage ?? (await import("../storage")).storage;
    const rituals = await storage.listWarmupRitualsForRange?.(userId, range.start, range.end);
    return aggregate(Array.isArray(rituals) ? rituals : []);
  } catch (err) {
    console.error("cgame.aggregate.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return emptySnapshot();
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getInchwormSeries(
  userId: string,
  months: number,
  injectedStorage?: any,
): Promise<Array<{ month: string; aPct: number; bPct: number; cPct: number }>> {
  const now = new Date();
  // AI-3 / RF-06 — paralelo (Promise.all) em vez de loop serial.
  const ranges: Array<{ start: Date; end: Date }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59));
    ranges.push({ start, end });
  }
  const snaps = await Promise.all(
    ranges.map((r) => aggregateCgameForPeriod(userId, r, injectedStorage)),
  );
  return ranges.map((r, idx) => ({
    month: monthKey(r.start),
    aPct: snaps[idx].aPct,
    bPct: snaps[idx].bPct,
    cPct: snaps[idx].cPct,
  }));
}

export interface CgameMovement {
  aPctDelta: number;
  cPctDelta: number;
  narrative: string;
}

export async function getCgameMovement(
  userId: string,
  current: { start: Date | string; end: Date | string },
  previous: { start: Date | string; end: Date | string },
  injectedStorage?: any,
): Promise<CgameMovement> {
  const [cur, prev] = await Promise.all([
    aggregateCgameForPeriod(userId, current, injectedStorage),
    aggregateCgameForPeriod(userId, previous, injectedStorage),
  ]);
  const aPctDelta = cur.aPct - prev.aPct;
  const cPctDelta = cur.cPct - prev.cPct;
  let narrative = "C-game e A-game estavel vs periodo anterior.";
  if (aPctDelta >= 5) {
    narrative = `A-game subiu ${aPctDelta}pp vs periodo anterior.`;
  } else if (cPctDelta >= 5) {
    narrative = `C-game subiu ${cPctDelta}pp vs periodo anterior — atencao ao tilt.`;
  } else if (aPctDelta <= -5) {
    narrative = `A-game caiu ${Math.abs(aPctDelta)}pp vs periodo anterior.`;
  } else if (cPctDelta <= -5) {
    narrative = `C-game caiu ${Math.abs(cPctDelta)}pp vs periodo anterior — bom progresso.`;
  } else {
    narrative = "C-game e A-game estavel vs periodo anterior.";
  }
  return { aPctDelta, cPctDelta, narrative };
}
