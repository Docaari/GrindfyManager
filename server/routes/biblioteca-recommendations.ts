/**
 * Sprint Estudos-Coach-Biblio-2 — RF-2 routes biblioteca-recommendations.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-2
 *
 * Endpoints:
 *   GET  /api/biblioteca/recommendations         — current cards (cache 60min)
 *   POST /api/biblioteca/recommendations/refresh — invalida cache + re-fetch
 *
 * Auth: requireAuth.
 * Rate limit refresh: 5/dia per user (service handles).
 */

import type { Express, Response } from "express";
import { requireAuth } from "../auth";
import {
  generateBibliotecaRecommendations,
  invalidateBibliotecaRecommendationsCache,
  isRefreshRateLimited,
  recordBibliotecaRefresh,
} from "../services/bibliotecaRecommendationsService";

export async function handleGetBibliotecaRecommendations(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const data = await generateBibliotecaRecommendations(userId);
    res.status(200).json(data);
  } catch (err) {
    console.error("[handleGetBibliotecaRecommendations] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handlePostBibliotecaRecommendationsRefresh(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    if (await isRefreshRateLimited(userId)) {
      res.status(429).json({
        message: "Limite de refresh atingido (5/dia).",
        code: "RATE_LIMITED",
      });
      return;
    }
    invalidateBibliotecaRecommendationsCache(userId);
    await recordBibliotecaRefresh(userId);
    const data = await generateBibliotecaRecommendations(userId);
    res.status(200).json(data);
  } catch (err) {
    console.error(
      "[handlePostBibliotecaRecommendationsRefresh] error",
      err,
    );
    res.status(500).json({ message: "Internal error" });
  }
}

export function registerBibliotecaRecommendationsRoutes(app: Express): void {
  app.get(
    "/api/biblioteca/recommendations",
    requireAuth,
    handleGetBibliotecaRecommendations,
  );
  app.post(
    "/api/biblioteca/recommendations/refresh",
    requireAuth,
    handlePostBibliotecaRecommendationsRefresh,
  );
}
