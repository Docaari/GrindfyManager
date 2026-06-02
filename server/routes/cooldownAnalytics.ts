/**
 * Mental Analytics Routes — cool-down + warm-up + A/B/C-game (Sprint Cooldown-2 + Fase B)
 *
 * Spec: Docs/specs/cooldown-refactor-plan.md (RF-06)
 *     + Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md (RF-01/RF-02)
 * ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
 *     + Docs/architecture/decisions/228-fase-b-lead-measures-warmup-compliance-abgame-distribution.md
 *
 * Endpoints (auth + ownership rigoroso, cache 5min):
 *   GET /api/analytics/cooldown-compliance         -> handleCooldownCompliance
 *   GET /api/analytics/starred-hands-distribution  -> handleStarredHandsDistribution
 *   GET /api/analytics/cooldown-impact             -> handleCooldownImpact
 *   GET /api/analytics/top-lessons                 -> handleTopLessons
 *   GET /api/analytics/warmup-compliance           -> handleWarmupCompliance   (Fase B)
 *   GET /api/analytics/abgame-distribution         -> handleAbGameDistribution (Fase B)
 */

import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";

const VALID_PERIODS = new Set(["7d", "30d", "90d"]);
const DEFAULT_PERIOD = "30d";
const CACHE_HEADER = "private, max-age=300";

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function unauthorized(res: Response) {
  return res.status(401).json({ message: "Unauthorized" });
}

function resolvePeriod(req: any): "7d" | "30d" | "90d" | null {
  const raw = req?.query?.period;
  if (raw == null || raw === "") return DEFAULT_PERIOD;
  const v = String(raw);
  if (!VALID_PERIODS.has(v)) return null;
  return v as "7d" | "30d" | "90d";
}

function setCacheHeader(res: Response) {
  if (typeof (res as any).setHeader === "function") {
    (res as any).setHeader("Cache-Control", CACHE_HEADER);
  } else if (typeof (res as any).set === "function") {
    (res as any).set("Cache-Control", CACHE_HEADER);
  }
}

// =============================================================================
// GET /api/analytics/cooldown-compliance
// =============================================================================

export async function handleCooldownCompliance(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const data = await storage.getCooldownComplianceMetrics(userId, period);
    res.status(200).json(data);
  } catch (err: any) {
    console.error("GET /api/analytics/cooldown-compliance failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

// =============================================================================
// GET /api/analytics/starred-hands-distribution
// =============================================================================

export async function handleStarredHandsDistribution(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const data = await storage.getStarredHandsDistribution(userId, period);
    res.status(200).json(data);
  } catch (err: any) {
    console.error("GET /api/analytics/starred-hands-distribution failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

// =============================================================================
// GET /api/analytics/cooldown-impact
// =============================================================================

export async function handleCooldownImpact(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const data = await storage.getCooldownImpactMetrics(userId, period);
    res.status(200).json(data);
  } catch (err: any) {
    console.error("GET /api/analytics/cooldown-impact failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

// =============================================================================
// GET /api/analytics/top-lessons
// =============================================================================

export async function handleTopLessons(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const data = await storage.getTopLessons(userId, period);
    res.status(200).json(data);
  } catch (err: any) {
    console.error("GET /api/analytics/top-lessons failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

// =============================================================================
// GET /api/analytics/warmup-compliance (Fase B — RF-01)
// =============================================================================

export async function handleWarmupCompliance(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const data = await storage.getWarmupComplianceMetrics(userId, period);
    res.status(200).json(data);
  } catch (err: any) {
    console.error("GET /api/analytics/warmup-compliance failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

// =============================================================================
// GET /api/analytics/abgame-distribution (Fase B — RF-02)
// =============================================================================

export async function handleAbGameDistribution(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const data = await storage.getAbGameDistribution(userId, period);
    res.status(200).json(data);
  } catch (err: any) {
    console.error("GET /api/analytics/abgame-distribution failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

// =============================================================================
// GET /api/analytics/tilt-type-distribution (Fase C #4 — RF-04, ADR-232)
// =============================================================================

export async function handleTiltTypeDistribution(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const data = await storage.getTiltTypeDistribution(userId, period);
    res.status(200).json(data);
  } catch (err: any) {
    console.error("GET /api/analytics/tilt-type-distribution failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

// =============================================================================
// GET /api/analytics/mental-result/{tilt|focus|abgame} (Fase C #10 — RF-01/02/03, ADR-233)
//
// D-1: 1 metodo storage.getMentalResultInsights -> 3 handlers fatiam o sub-bloco
// (result.tilt / result.focus / result.abgame). PII (D5): a resposta nunca carrega
// texto livre — o storage ja agrega so enums/numeros/buckets.
// =============================================================================

async function handleMentalResult(
  req: any,
  res: Response,
  key: "tilt" | "focus" | "abgame",
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const period = resolvePeriod(req);
  if (!period) {
    res.status(400).json({ message: "period invalido. Aceitos: 7d, 30d, 90d" });
    return;
  }

  try {
    setCacheHeader(res);
    const result = await storage.getMentalResultInsights(userId, period);
    res.status(200).json(result[key]);
  } catch (err: any) {
    console.error(`GET /api/analytics/mental-result/${key} failed:`, err);
    res.status(500).json({ message: err?.message ?? "Erro" });
  }
}

export async function handleMentalResultTilt(req: any, res: Response): Promise<void> {
  return handleMentalResult(req, res, "tilt");
}

export async function handleMentalResultFocus(req: any, res: Response): Promise<void> {
  return handleMentalResult(req, res, "focus");
}

export async function handleMentalResultAbgame(req: any, res: Response): Promise<void> {
  return handleMentalResult(req, res, "abgame");
}

// =============================================================================
// Express registration
// =============================================================================

export function registerCooldownAnalyticsRoutes(app: Express): void {
  app.get("/api/analytics/cooldown-compliance", requireAuth, (req: Request, res: Response) =>
    handleCooldownCompliance(req, res),
  );
  app.get(
    "/api/analytics/starred-hands-distribution",
    requireAuth,
    (req: Request, res: Response) => handleStarredHandsDistribution(req, res),
  );
  app.get("/api/analytics/cooldown-impact", requireAuth, (req: Request, res: Response) =>
    handleCooldownImpact(req, res),
  );
  app.get("/api/analytics/top-lessons", requireAuth, (req: Request, res: Response) =>
    handleTopLessons(req, res),
  );
  app.get(
    "/api/analytics/warmup-compliance",
    requireAuth,
    (req: Request, res: Response) => handleWarmupCompliance(req, res),
  );
  app.get(
    "/api/analytics/abgame-distribution",
    requireAuth,
    (req: Request, res: Response) => handleAbGameDistribution(req, res),
  );
  app.get(
    "/api/analytics/tilt-type-distribution",
    requireAuth,
    (req: Request, res: Response) => handleTiltTypeDistribution(req, res),
  );
  // Fase C #10 (ADR-233) — rotas estaticas (sem path param) -> sem colisao.
  app.get(
    "/api/analytics/mental-result/tilt",
    requireAuth,
    (req: Request, res: Response) => handleMentalResultTilt(req, res),
  );
  app.get(
    "/api/analytics/mental-result/focus",
    requireAuth,
    (req: Request, res: Response) => handleMentalResultFocus(req, res),
  );
  app.get(
    "/api/analytics/mental-result/abgame",
    requireAuth,
    (req: Request, res: Response) => handleMentalResultAbgame(req, res),
  );
}
