// =============================================================================
// coachPlanning routes — EST-6 (ADR-224)
//
// 5 endpoints do Next-Week Planning Flow. Registrados via
// registerCoachPlanningRoutes(app, requireAuth), chamado dentro de
// registerCoachRoutes ANTES de registerCoachAi1bRoutes (ADR-224 #2 — ordem
// explicita, prefixo `planning` disjunto dos demais; guard test cobre colisao).
//
//   POST /api/coach/planning/start
//   GET  /api/coach/planning/:weekStartDate
//   POST /api/coach/planning/:weekStartDate/step/:step/propose
//   POST /api/coach/planning/:weekStartDate/step/:step/confirm
//   POST /api/coach/planning/:weekStartDate/step/:step/skip
//
// Handlers seguem o padrao injectedStorage 3o arg (lesson #34) para serem
// testaveis sem vi.mock('../storage'). Em prod, injectedStorage undefined ->
// o orquestrador usa o storage real (NUNCA vaza `next` do Express — lesson #34).
// =============================================================================

import {
  YMD_REGEX,
  startPlanningBodySchema,
  stepParamSchema,
} from "../../shared/coach-planning";

function isTierError(err: any): boolean {
  return err?.code === "tier_not_eligible" || /tier_not_eligible/i.test(String(err?.message ?? ""));
}

// ZodError (tool `.parse()` falhou por body incompleto) -> 400, nao 500.
function isZodError(err: any): boolean {
  return err?.name === "ZodError" || Array.isArray(err?.issues) || Array.isArray(err?.errors);
}

export function registerCoachPlanningRoutes(app: any, requireAuth: any): void {
  // ---------------------------------------------------------------------------
  // POST /api/coach/planning/start — cria/retorna a planning session (idempotente)
  // ---------------------------------------------------------------------------
  app.post(
    "/api/coach/planning/start",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleStartPlanning(req, res);
    },
  );

  // ---------------------------------------------------------------------------
  // GET /api/coach/planning/:weekStartDate — le estado da planning session
  // ---------------------------------------------------------------------------
  app.get(
    "/api/coach/planning/:weekStartDate",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleGetPlanningSession(req, res);
    },
  );

  // ---------------------------------------------------------------------------
  // POST .../step/:step/propose
  // ---------------------------------------------------------------------------
  app.post(
    "/api/coach/planning/:weekStartDate/step/:step/propose",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleProposeStep(req, res);
    },
  );

  // ---------------------------------------------------------------------------
  // POST .../step/:step/confirm
  // ---------------------------------------------------------------------------
  app.post(
    "/api/coach/planning/:weekStartDate/step/:step/confirm",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleConfirmStep(req, res);
    },
  );

  // ---------------------------------------------------------------------------
  // POST .../step/:step/skip
  // ---------------------------------------------------------------------------
  app.post(
    "/api/coach/planning/:weekStartDate/step/:step/skip",
    requireAuth,
    async (req: any, res: any, _next?: any) => {
      await handleSkipStep(req, res);
    },
  );
}

async function loadOrchestrator(): Promise<any> {
  return await import("../coach/planning/weeklyPlanningOrchestrator");
}

function userIdFrom(req: any): string {
  return req?.user?.userPlatformId ?? req?.user?.id;
}

export async function handleStartPlanning(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const parsed = startPlanningBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "invalid_body" });
      return;
    }
    const { weekStartDate, source } = parsed.data;
    const orch = await loadOrchestrator();
    // opts NAO contem injectedStorage em prod (orquestrador usa storage real).
    const { session } = await orch.startPlanning(userId, weekStartDate, { source });
    res.status(200).json({ session });
  } catch (err: any) {
    if (isTierError(err)) {
      res.status(403).json({ message: "tier_not_eligible" });
      return;
    }
    console.error("handleStartPlanning.error", { err });
    res.status(500).json({ message: "planning_start_failed" });
  }
}

export async function handleGetPlanningSession(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const weekStartDate = req.params.weekStartDate;
    if (!YMD_REGEX.test(String(weekStartDate))) {
      res.status(400).json({ message: "invalid_week_start_date" });
      return;
    }
    const orch = await loadOrchestrator();
    const session = await orch.getPlanningSession(userId, weekStartDate);
    if (!session) {
      res.status(404).json({ message: "planning_session_not_found" });
      return;
    }
    res.status(200).json({ session });
  } catch (err: any) {
    console.error("handleGetPlanningSession.error", { err });
    res.status(500).json({ message: "planning_get_failed" });
  }
}

export async function handleProposeStep(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const weekStartDate = req.params.weekStartDate;
    if (!YMD_REGEX.test(String(weekStartDate))) {
      res.status(400).json({ message: "invalid_week_start_date" });
      return;
    }
    const stepParsed = stepParamSchema.safeParse(req.params.step);
    if (!stepParsed.success) {
      res.status(400).json({ message: "invalid_step" });
      return;
    }
    const orch = await loadOrchestrator();
    const result = await orch.proposeStep(
      stepParsed.data,
      weekStartDate,
      req.body ?? {},
      { userId },
    );
    res.status(200).json(result);
  } catch (err: any) {
    if (isTierError(err)) {
      res.status(403).json({ message: "tier_not_eligible" });
      return;
    }
    if (isZodError(err)) {
      res.status(400).json({ message: "invalid_step_input" });
      return;
    }
    console.error("handleProposeStep.error", { err });
    res.status(500).json({ message: "planning_propose_failed" });
  }
}

export async function handleConfirmStep(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const weekStartDate = req.params.weekStartDate;
    if (!YMD_REGEX.test(String(weekStartDate))) {
      res.status(400).json({ message: "invalid_week_start_date" });
      return;
    }
    const stepParsed = stepParamSchema.safeParse(req.params.step);
    if (!stepParsed.success) {
      res.status(400).json({ message: "invalid_step" });
      return;
    }
    const orch = await loadOrchestrator();
    const result = await orch.confirmStep(
      stepParsed.data,
      weekStartDate,
      req.body ?? {},
      { userId },
    );
    res.status(200).json(result);
  } catch (err: any) {
    if (isTierError(err)) {
      res.status(403).json({ message: "tier_not_eligible" });
      return;
    }
    if (isZodError(err)) {
      res.status(400).json({ message: "invalid_step_input" });
      return;
    }
    console.error("handleConfirmStep.error", { err });
    res.status(500).json({ message: "planning_confirm_failed" });
  }
}

export async function handleSkipStep(req: any, res: any): Promise<void> {
  try {
    const userId = userIdFrom(req);
    const weekStartDate = req.params.weekStartDate;
    if (!YMD_REGEX.test(String(weekStartDate))) {
      res.status(400).json({ message: "invalid_week_start_date" });
      return;
    }
    const stepParsed = stepParamSchema.safeParse(req.params.step);
    if (!stepParsed.success) {
      res.status(400).json({ message: "invalid_step" });
      return;
    }
    const orch = await loadOrchestrator();
    const result = await orch.skipStep(stepParsed.data, weekStartDate, { userId });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("handleSkipStep.error", { err });
    res.status(500).json({ message: "planning_skip_failed" });
  }
}
