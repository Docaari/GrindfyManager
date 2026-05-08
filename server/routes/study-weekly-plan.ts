/**
 * Sprint Estudos-Coach-Biblio-2 — RF-3 routes study-weekly-plan.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.7
 *
 * Endpoints:
 *   GET   /api/study-weekly-plan?week=YYYY-MM-DD
 *   POST  /api/study-weekly-plan/regenerate
 *   PATCH /api/study-weekly-plan/items/:itemId/toggle
 *
 * Auth: requireAuth.
 * Regenerate rate limit: 1/dia per user.
 */

import type { Express, Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  generateWeeklyStudyPlan,
  hasCoachAccess,
  isRegenerateRateLimited,
  recordRegenerate,
} from "../services/studyWeeklyPlanService";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function utcMondayOfWeek(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dow = d.getUTCDay();
  const delta = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - delta);
  return d;
}

export async function handleGetStudyWeeklyPlan(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const weekRaw = req?.query?.week;
    let weekStartDate: Date | undefined;
    if (typeof weekRaw === "string") {
      if (!YMD_RE.test(weekRaw)) {
        res
          .status(400)
          .json({ message: "Formato deve ser YYYY-MM-DD", code: "INVALID_WEEK" });
        return;
      }
      const parsed = new Date(weekRaw + "T00:00:00.000Z");
      if (isNaN(parsed.getTime())) {
        res
          .status(400)
          .json({ message: "Data invalida", code: "INVALID_WEEK" });
        return;
      }
      weekStartDate = parsed;
    } else {
      weekStartDate = utcMondayOfWeek(new Date());
    }
    const plan = await (storage as any).getStudyWeeklyPlan(
      userId,
      weekStartDate,
    );
    if (!plan) {
      res.status(404).json({ message: "Plano nao encontrado", code: "NOT_FOUND" });
      return;
    }
    res.status(200).json(plan);
  } catch (err) {
    console.error("[handleGetStudyWeeklyPlan] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handlePostStudyWeeklyPlanRegenerate(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    if (!(await hasCoachAccess(userId))) {
      res.status(403).json({
        message: "Coach indisponivel — upgrade Pro+",
        code: "NO_COACH_ACCESS",
      });
      return;
    }
    if (await isRegenerateRateLimited(userId)) {
      res
        .status(429)
        .json({ message: "Limite de regenerate (1/dia) atingido.", code: "RATE_LIMITED" });
      return;
    }
    const body = req?.body ?? {};
    if (
      body.resetCompleted !== undefined &&
      typeof body.resetCompleted !== "boolean"
    ) {
      res.status(400).json({
        message: "resetCompleted deve ser boolean",
        code: "INVALID_BODY",
      });
      return;
    }
    // MEDIUM-2 fix (review): recordRegenerate movido para DEPOIS do
    // generateWeeklyStudyPlan resolver com sucesso. Antes incrementavamos
    // ANTES do Coach call, entao falhas (rede, Zod, quota) gastavam a
    // tentativa diaria injustamente (ate user voltar amanha pra retry).
    const weekStartDate = utcMondayOfWeek(new Date());
    const plan = await generateWeeklyStudyPlan({
      userId,
      source: "coach_manual",
      weekStartDate,
      resetCompleted: body.resetCompleted === true,
    });
    await recordRegenerate(userId);
    res.status(200).json(plan);
  } catch (err) {
    console.error("[handlePostStudyWeeklyPlanRegenerate] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handlePatchStudyWeeklyPlanItemToggle(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const itemId = req?.params?.itemId;
    if (!itemId || typeof itemId !== "string") {
      res.status(400).json({ message: "itemId obrigatorio", code: "INVALID_PARAM" });
      return;
    }
    const body = req?.body ?? {};
    if (typeof body.completed !== "boolean") {
      res.status(400).json({
        message: "completed deve ser boolean",
        code: "INVALID_BODY",
      });
      return;
    }
    const weekStartDate = utcMondayOfWeek(new Date());
    try {
      const updated = await (storage as any).markPlanItemCompleted(
        userId,
        weekStartDate,
        itemId,
        body.completed,
      );
      res.status(200).json(updated);
    } catch (err: any) {
      if (
        err?.code === "PLAN_NOT_FOUND" ||
        err?.code === "ITEM_NOT_FOUND"
      ) {
        res.status(404).json({ message: "Plano/item nao encontrado", code: err.code });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error("[handlePatchStudyWeeklyPlanItemToggle] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export function registerStudyWeeklyPlanRoutes(app: Express): void {
  app.get("/api/study-weekly-plan", requireAuth, handleGetStudyWeeklyPlan);
  app.post(
    "/api/study-weekly-plan/regenerate",
    requireAuth,
    handlePostStudyWeeklyPlanRegenerate,
  );
  app.patch(
    "/api/study-weekly-plan/items/:itemId/toggle",
    requireAuth,
    handlePatchStudyWeeklyPlanItemToggle,
  );
}
