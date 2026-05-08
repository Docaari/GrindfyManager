/**
 * Sprint Spot-Anki-Reentry-3 — RF-1.5
 *
 * Route handlers (exported standalone for unit testing) plus an Express
 * registration helper. The original starred-hands routes live in
 * server/routes/starred-hands.ts; this module adds the insight extension
 * endpoints without colliding with the existing PATCH /:id/review.
 *
 *   PATCH /api/starred-hands/:id          — handlePatchStarredHandInsight
 *   GET   /api/starred-hands              — handleGetStarredHands (filters)
 */

import type { Express, Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { updateStarredHandInsightSchema } from "../../shared/schema";

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

export async function handlePatchStarredHandInsight(
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

  const parsed = updateStarredHandInsightSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const updated = await (storage as any).updateStarredHandInsight(
      id,
      userId,
      parsed.data,
    );
    if (!updated) {
      res.status(404).json({ message: "Spot nao encontrado" });
      return;
    }
    res.status(200).json(updated);
  } catch (err: any) {
    console.error("PATCH /api/starred-hands/:id failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao atualizar spot" });
  }
}

export async function handleGetStarredHands(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const q = req.query ?? {};
  const filters: Record<string, any> = {};

  if (q.withInsight === "true" || q.withInsight === true) {
    filters.withInsight = true;
  }
  if (typeof q.tag === "string" && q.tag.length > 0) {
    filters.tag = q.tag;
  }
  if (q.decisionCorrect === "true" || q.decisionCorrect === true) {
    filters.decisionCorrect = true;
  } else if (q.decisionCorrect === "false" || q.decisionCorrect === false) {
    filters.decisionCorrect = false;
  }
  if (q.minConfidence != null && q.minConfidence !== "") {
    const n = parseInt(String(q.minConfidence), 10);
    if (!Number.isNaN(n)) filters.minConfidence = n;
  }
  if (q.limit != null && q.limit !== "") {
    const n = parseInt(String(q.limit), 10);
    if (!Number.isNaN(n) && n > 0) filters.limit = n;
  }
  if (q.offset != null && q.offset !== "") {
    const n = parseInt(String(q.offset), 10);
    if (!Number.isNaN(n) && n >= 0) filters.offset = n;
  }

  try {
    const result = await (storage as any).getStarredHandsWithInsight(
      userId,
      filters,
    );
    res.status(200).json(result);
  } catch (err: any) {
    console.error("GET /api/starred-hands failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao listar spots" });
  }
}

export function registerStarredHandsExtendedRoutes(app: Express): void {
  app.patch("/api/starred-hands/:id", requireAuth, (req: any, res: Response) =>
    handlePatchStarredHandInsight(req, res),
  );
  app.get("/api/starred-hands", requireAuth, (req: any, res: Response) =>
    handleGetStarredHands(req, res),
  );
}
