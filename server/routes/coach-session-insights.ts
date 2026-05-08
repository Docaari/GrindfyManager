/**
 * Sprint Estudos-Coach-Biblio-2 — RF-4 routes coach-session-insights.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.5
 *
 * Endpoints:
 *   GET  /api/coach/session-insights/:sessionId
 *   POST /api/coach/session-insights/:sessionId/regenerate (rate limit 3/sessao)
 *
 * Auth: requireAuth + ownership check no service.
 */

import type { Express, Response } from "express";
import { requireAuth } from "../auth";
import {
  getOrGenerateCoachSessionInsights,
  regenerateCoachSessionInsights,
  isCoachInsightsRateLimited,
  recordCoachInsightsRegenerate,
} from "../services/coachSessionInsightsService";

function mapErrorStatus(err: any): number {
  switch (err?.code) {
    case "NOT_OWNER":
      return 403;
    case "SESSION_NOT_FOUND":
      return 404;
    case "SESSION_NOT_FINALIZED":
      return 400;
    case "QUOTA_EXCEEDED":
    case "RATE_LIMITED":
      return 429;
    case "COACH_OUTPUT_INVALID":
      return 502;
    default:
      return 500;
  }
}

export async function handleGetCoachSessionInsights(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const sessionId = req?.params?.sessionId;
    if (!sessionId) {
      res.status(400).json({ message: "sessionId required" });
      return;
    }
    const result = await getOrGenerateCoachSessionInsights({
      userId,
      sessionId,
    });
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorStatus(err);
    if (status === 500) {
      console.error("[handleGetCoachSessionInsights] error", err);
    }
    res
      .status(status)
      .json({ message: err?.message ?? "Error", code: err?.code });
  }
}

export async function handlePostCoachSessionInsightsRegenerate(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const sessionId = req?.params?.sessionId;
    if (!sessionId) {
      res.status(400).json({ message: "sessionId required" });
      return;
    }
    if (await isCoachInsightsRateLimited(sessionId)) {
      res.status(429).json({
        message: "Limite regenerate (3/sessao) atingido.",
        code: "RATE_LIMITED",
      });
      return;
    }
    // MEDIUM-2 fix (review): recordCoachInsightsRegenerate movido para
    // DEPOIS do regenerate completar com sucesso. Antes user perdia 1/3
    // tentativas em qualquer falha (rede, Zod, quota Coach).
    const result = await regenerateCoachSessionInsights({ userId, sessionId });
    await recordCoachInsightsRegenerate(sessionId);
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorStatus(err);
    if (status === 500) {
      console.error(
        "[handlePostCoachSessionInsightsRegenerate] error",
        err,
      );
    }
    res
      .status(status)
      .json({ message: err?.message ?? "Error", code: err?.code });
  }
}

export function registerCoachSessionInsightsRoutes(app: Express): void {
  app.get(
    "/api/coach/session-insights/:sessionId",
    requireAuth,
    handleGetCoachSessionInsights,
  );
  app.post(
    "/api/coach/session-insights/:sessionId/regenerate",
    requireAuth,
    handlePostCoachSessionInsightsRegenerate,
  );
}
