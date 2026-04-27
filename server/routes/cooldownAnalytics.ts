/**
 * Cool-down Analytics Routes — Sprint Cooldown-2
 *
 * Spec: Docs/specs/cooldown-refactor-plan.md (RF-06)
 * ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
 *
 * Endpoints (auth + ownership rigoroso, cache 5min):
 *   GET /api/analytics/cooldown-compliance         -> handleCooldownCompliance
 *   GET /api/analytics/starred-hands-distribution  -> handleStarredHandsDistribution
 *   GET /api/analytics/cooldown-impact             -> handleCooldownImpact
 *   GET /api/analytics/top-lessons                 -> handleTopLessons
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
}
