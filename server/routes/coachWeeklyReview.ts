// =============================================================================
// coachWeeklyReview routes — EST-5 (ADR-226)
//
// 3 endpoints do Interactive Monday Ritual. Registrados via
// registerCoachWeeklyReviewRoutes(app, requireAuth), chamado dentro de
// registerCoachRoutes ANTES de registerCoachAi1bRoutes (prefixo `weekly-review`
// disjunto; guard test cobre colisao).
//
//   POST /api/coach/weekly-review/start
//   GET  /api/coach/weekly-review/:weekStartDate
//   POST /api/coach/weekly-review/:weekStartDate/confirm-upload
//
// Handlers seguem o padrao injectedStorage 3o arg (lesson #34) — nunca vazam
// `next` do Express ao orquestrador. Em prod, injectedStorage undefined ->
// o orquestrador usa o storage real.
//
// Mapeamento de erro: tier_not_eligible->403, invalid_weekly_review_transition
// ->409, weekly_review_not_found->404, ZodError->400, resto->500.
// =============================================================================

import {
  YMD_REGEX,
  startWeeklyReviewBodySchema,
} from "../../shared/coach-weekly-review";

function isTierError(err: any): boolean {
  return (
    err?.code === "tier_not_eligible" ||
    /tier_not_eligible/i.test(String(err?.message ?? ""))
  );
}

function isNotFoundError(err: any): boolean {
  return (
    err?.code === "weekly_review_not_found" ||
    /weekly_review_not_found/i.test(String(err?.message ?? ""))
  );
}

function isTransitionError(err: any): boolean {
  return (
    err?.code === "invalid_weekly_review_transition" ||
    /invalid_weekly_review_transition/i.test(String(err?.message ?? ""))
  );
}

function isZodError(err: any): boolean {
  return err?.name === "ZodError" || Array.isArray(err?.issues) || Array.isArray(err?.errors);
}

export function registerCoachWeeklyReviewRoutes(app: any, requireAuth: any): void {
  app.post(
    "/api/coach/weekly-review/start",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleStartWeeklyReview(req, res);
    },
  );

  app.get(
    "/api/coach/weekly-review/:weekStartDate",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleGetWeeklyReview(req, res);
    },
  );

  app.post(
    "/api/coach/weekly-review/:weekStartDate/confirm-upload",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleConfirmUpload(req, res);
    },
  );
}

async function loadOrchestrator(): Promise<any> {
  return await import("../coach/weeklyReview/weeklyReviewOrchestrator");
}

function userIdFrom(req: any): string {
  return req?.user?.userPlatformId ?? req?.user?.id;
}

export async function handleStartWeeklyReview(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const parsed = startWeeklyReviewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "invalid_body" });
      return;
    }
    const { weekStartDate } = parsed.data;
    const orch = await loadOrchestrator();
    // opts NAO contem injectedStorage em prod (orquestrador usa storage real).
    const { review } = await orch.createWeeklyReview(userId, weekStartDate, {});
    res.status(200).json({ review });
  } catch (err: any) {
    if (isTierError(err)) {
      res.status(403).json({ message: "tier_not_eligible" });
      return;
    }
    console.error("handleStartWeeklyReview.error", { err });
    res.status(500).json({ message: "weekly_review_start_failed" });
  }
}

export async function handleGetWeeklyReview(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const weekStartDate = req.params.weekStartDate;
    if (!YMD_REGEX.test(String(weekStartDate))) {
      res.status(400).json({ message: "invalid_week_start_date" });
      return;
    }
    const orch = await loadOrchestrator();
    const review = await orch.getWeeklyReview(userId, weekStartDate);
    if (!review) {
      res.status(404).json({ message: "weekly_review_not_found" });
      return;
    }
    res.status(200).json({ review });
  } catch (err: any) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: "weekly_review_not_found" });
      return;
    }
    console.error("handleGetWeeklyReview.error", { err });
    res.status(500).json({ message: "weekly_review_get_failed" });
  }
}

export async function handleConfirmUpload(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const weekStartDate = req.params.weekStartDate;
    if (!YMD_REGEX.test(String(weekStartDate))) {
      res.status(400).json({ message: "invalid_week_start_date" });
      return;
    }
    const orch = await loadOrchestrator();
    const result = await orch.confirmUpload(userId, weekStartDate, {});
    res.status(200).json(result);
  } catch (err: any) {
    if (isTierError(err)) {
      res.status(403).json({ message: "tier_not_eligible" });
      return;
    }
    if (isTransitionError(err)) {
      res.status(409).json({ message: "invalid_weekly_review_transition" });
      return;
    }
    if (isNotFoundError(err)) {
      res.status(404).json({ message: "weekly_review_not_found" });
      return;
    }
    if (isZodError(err)) {
      res.status(400).json({ message: "invalid_body" });
      return;
    }
    console.error("handleConfirmUpload.error", { err });
    res.status(500).json({ message: "weekly_review_confirm_failed" });
  }
}
