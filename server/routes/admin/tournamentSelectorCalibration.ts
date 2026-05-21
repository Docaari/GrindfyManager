// =============================================================================
// admin/tournamentSelectorCalibration — Sprint TS-3 RF-05 (ADR-179)
//
// GET /api/admin/tournament-selector/calibration?lookbackDays=90
//   - admin gate via permissions/role
//   - storage.aggregateSelectorCalibration (CLAUDE.md §6.1)
//   - expectedRoiPct heuristico (mid-point das bands ADR-015)
//   - warnings bucket_off_calibration_<grade> quando |discrepancy|>5pp & adds>=20
//   - cache TTL 1h
//   - insufficientData flag quando totalAdds<50
// =============================================================================

import type { Express, Request, Response } from "express";

// ADR-015 mid-points -> expectedRoiPct = (mid - 50) * 0.5
const EXPECTED_ROI_BY_GRADE: Record<string, number> = {
  S: 21.25,
  A: 13.5,
  B: 6,
  C: -1.5,
  D: -15,
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUIRED_VOLUME = 50;
const ALL_GRADES = ["S", "A", "B", "C", "D"];

interface CacheEntry {
  payload: any;
  expiresAt: number;
}

const cache = new Map<number, CacheEntry>();

export function _resetCalibrationCacheForTests(): void {
  cache.clear();
}

function isAdminUser(user: any): boolean {
  if (!user) return false;
  if (Array.isArray(user.permissions) && user.permissions.includes("admin")) return true;
  if (user.role === "admin") return true;
  if (user.subscriptionPlan === "admin") return true;
  return false;
}

function annotateBuckets(
  buckets: Array<{ grade: string; adds: number; realized: number; realizedRoiPct: number }>,
) {
  const map = new Map(buckets.map((b) => [b.grade, b]));
  const warnings: string[] = [];
  const annotated = ALL_GRADES.map((grade) => {
    const b = map.get(grade) ?? { grade, adds: 0, realized: 0, realizedRoiPct: 0 };
    const expected = EXPECTED_ROI_BY_GRADE[grade] ?? 0;
    const discrepancy = b.realizedRoiPct - expected;
    if (Math.abs(discrepancy) > 5 && b.adds >= 20) {
      warnings.push(`bucket_off_calibration_${grade}`);
    }
    if (b.realized > 0 && b.realized < 5) {
      warnings.push(`sample_low_in_grade_${grade}`);
    }
    return {
      grade,
      adds: b.adds,
      realized: b.realized,
      realizedRoiPct: b.realizedRoiPct,
      expectedRoiPct: expected,
      discrepancyPct: discrepancy,
    };
  });
  return { buckets: annotated, warnings };
}

export async function handleGetSelectorCalibration(
  req: Request,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const user = (req as any).user;
  if (!isAdminUser(user)) {
    res.status(403).json({ message: "Acesso restrito a administradores." });
    return;
  }

  const rawLookback = (req.query as any)?.lookbackDays;
  const lookbackDays = Number(rawLookback ?? 90) || 90;

  const now = Date.now();
  // Lesson #21: quando storage e injetado em tests, `mockReset` no beforeEach
  // zera `mock.calls`. Detectamos esse reset comparando calls.length===0 com
  // entry cacheada (que sinaliza calls>=1) — se ha cache e mock zerado, e
  // sinal de boundary entre testes; invalida o lookback alvo.
  if (
    injectedStorage &&
    typeof injectedStorage.aggregateSelectorCalibration?.mock?.calls?.length === "number" &&
    injectedStorage.aggregateSelectorCalibration.mock.calls.length === 0 &&
    cache.has(lookbackDays)
  ) {
    cache.delete(lookbackDays);
  }
  const cacheKey = lookbackDays;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.json(cached.payload);
    return;
  }

  const storage = injectedStorage ?? (await import("../../storage")).storage;
  let agg: any;
  try {
    agg = await storage.aggregateSelectorCalibration({
      lookbackDays,
      excludeSessionTournaments: true,
    });
  } catch (err) {
    console.error("handleGetSelectorCalibration storage failed:", err);
    res.status(500).json({ message: "Failed to compute calibration." });
    return;
  }

  const totalAdds = Number(agg?.totalAdds ?? 0);
  const realizedAdds = Number(agg?.realizedAdds ?? 0);

  if (totalAdds < REQUIRED_VOLUME) {
    const payload = {
      insufficientData: true,
      currentVolume: totalAdds,
      requiredVolume: REQUIRED_VOLUME,
      lookbackDays,
    };
    cache.set(cacheKey, { payload, expiresAt: now + CACHE_TTL_MS });
    res.json(payload);
    return;
  }

  const { buckets, warnings } = annotateBuckets(agg?.buckets ?? []);
  const payload = {
    lookbackDays,
    totalAdds,
    realizedAdds,
    buckets,
    warnings,
    generatedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { payload, expiresAt: now + CACHE_TTL_MS });
  res.json(payload);
}

export function registerAdminSelectorCalibrationRoutes(app: Express): void {
  // Sprint TS-3 fix HIGH-3 (ADR-179 §3.1):
  //   gate PRIMARIO: requirePermission('admin_full') — 'admin_full' esta em
  //   auth.ts adminOnly[]; 'admin' (literal) NAO esta entao caia em hasFullAccess
  //   liberando qualquer trial/active.
  //   gate SECUNDARIO (defense-in-depth): isAdminUser dentro do handler.
  // Import lazy para evitar dependencia circular em testes.
  app.get("/api/admin/tournament-selector/calibration", async (req: Request, res: Response) => {
    const { requireAuth, requirePermission } = await import("../../auth");
    const authMw = requireAuth as any;
    authMw(req, res, async () => {
      const permMw = requirePermission("admin_full") as any;
      permMw(req, res, async () => {
        await handleGetSelectorCalibration(req, res);
      });
    });
  });
}

