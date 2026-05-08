/**
 * Sprint Spot-Anki-Reentry-3 — RF-2.4: POST/DELETE /api/spots/:id/reentry
 *
 *   POST   /api/spots/:id/reentry   — handlePostSpotReentry
 *   DELETE /api/spots/:id/reentry   — handleDeleteSpotReentry
 *
 * Use the SRS algorithm initial state computer when creating new cards
 * (ADR-139). Idempotent: returns 409 + existing card when one is already
 * active for (user, spot).
 */

import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { computeInitialState } from "../services/spotReentry/srsAlgorithm";

// =============================================================================
// Rate limiter (HIGH-1 audit fix)
// 30/min/user — POST/DELETE manual de reentry por spot.
// =============================================================================
const spotReentryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas operacoes de reentry. Aguarde 1 minuto.",
  },
});

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

const postBodySchema = z
  .object({
    source: z
      .enum(["manual_add", "drill_gto_difficult_spot", "coach_session_insight"])
      .optional(),
  })
  .strict()
  .partial();

export async function handlePostSpotReentry(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const id = req.params?.id;
  if (!id) {
    res.status(400).json({ message: "id obrigatorio" });
    return;
  }

  const parsed = postBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
    });
    return;
  }
  const source = parsed.data.source ?? "manual_add";

  try {
    const spot = await (storage as any).getStarredHandById(id);
    if (!spot) {
      res.status(404).json({ message: "Spot nao encontrado" });
      return;
    }
    if (spot.userId !== userId) {
      res.status(403).json({ message: "Sem permissao" });
      return;
    }

    const existing = await (storage as any).getActiveReentryCardForSpot(
      userId,
      id,
    );
    if (existing) {
      res.status(409).json({ card: existing, isNew: false });
      return;
    }

    const initial = computeInitialState({
      source,
      decisionCorrect: spot.decisionCorrect ?? null,
      confidenceLevel: spot.confidenceLevel ?? null,
    });

    const created = await (storage as any).createSpotReentryCard({
      userId,
      spotId: id,
      source,
      intervalDays: initial.intervalDays,
      easeFactor: initial.easeFactor,
      nextReviewAt: initial.nextReviewAt,
    });
    if (!created) {
      // Race-condition: a parallel request created the card. Fetch it.
      const after = await (storage as any).getActiveReentryCardForSpot(
        userId,
        id,
      );
      if (after) {
        res.status(409).json({ card: after, isNew: false });
        return;
      }
      res.status(500).json({ message: "Erro ao criar card de reentry" });
      return;
    }
    res.status(201).json({ card: created, isNew: true });
  } catch (err: any) {
    console.error("POST /api/spots/:id/reentry failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao criar reentry" });
  }
}

export async function handleDeleteSpotReentry(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const id = req.params?.id;
  if (!id) {
    res.status(400).json({ message: "id obrigatorio" });
    return;
  }

  try {
    const result = await (storage as any).archiveReentryCard(userId, id);
    res.status(200).json(result);
  } catch (err: any) {
    console.error("DELETE /api/spots/:id/reentry failed:", err);
    res
      .status(500)
      .json({ message: err?.message ?? "Erro ao arquivar reentry" });
  }
}

export function registerSpotReentryRoutes(app: Express): void {
  app.post(
    "/api/spots/:id/reentry",
    requireAuth,
    spotReentryLimiter,
    (req: any, res: Response) => handlePostSpotReentry(req, res),
  );
  app.delete(
    "/api/spots/:id/reentry",
    requireAuth,
    spotReentryLimiter,
    (req: any, res: Response) => handleDeleteSpotReentry(req, res),
  );
}
