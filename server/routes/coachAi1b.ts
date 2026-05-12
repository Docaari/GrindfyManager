// =============================================================================
// coachAi1b — Sprint AI-1B / RF-04 + RF-08 + RF-12 — endpoints HTTP novos
//
//   GET  /api/coach/timeline            -> handleGetCoachTimeline
//   GET  /api/coach/reports/:id         -> handleGetCoachReport
//   POST /api/coach/reports/:id/dismiss -> handlePostCoachReportDismiss
//   GET  /api/coach/suggestions         -> handleGetCoachSuggestions
//
// Handlers com `injectedStorage?` como 3o arg (lesson #34); em producao fazem
// lazy import de ../storage. requireAuth registrado em registerCoachAi1bRoutes.
//
// Lessons: #3 (mock shape real), #9 (safe-degrade), #21 (cache server-side 30s
//   + _resetSuggestionsCacheForTests), #34 (storage injetavel).
// =============================================================================

import { computeSuggestions, staticSuggestionsForRoute } from "../coach/quickSuggestions";

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../storage");
  return (mod as any).storage;
}

function clampLimit(raw: any, def = 30, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function reportSummaryLine(content: any): string {
  return content?.header?.summaryLine ?? "";
}

function tsOf(v: any): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

// =============================================================================
// GET /api/coach/timeline — merge de reports + coach_nudge_log, paginado
// =============================================================================
export async function handleGetCoachTimeline(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const storage = await resolveStorage(injectedStorage);
    const limit = clampLimit(req.query?.limit);
    const before = typeof req.query?.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;

    const [reports, nudges] = await Promise.all([
      Promise.resolve(storage.listReportsForUser?.({ userId, limit, before })).catch(() => []),
      Promise.resolve(storage.listNudgeLogForUser?.({ userId, limit, before })).catch(() => []),
    ]);

    const items: any[] = [];
    for (const r of (Array.isArray(reports) ? reports : [])) {
      items.push({
        kind: "report",
        id: r.id,
        reportType: r.reportType,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        summaryLine: r.summaryLine ?? reportSummaryLine(r.content),
        generatedAt: r.generatedAt,
        readAt: r.readAt ?? null,
        dismissedAt: r.dismissedAt ?? null,
        _ts: tsOf(r.generatedAt),
      });
    }
    for (const nlog of (Array.isArray(nudges) ? nudges : [])) {
      items.push({
        kind: "nudge",
        id: nlog.id,
        category: nlog.category,
        status: nlog.status,
        title: nlog.title ?? nlog.titleI18n ?? null,
        bodyPreview: nlog.bodyPreview ?? null,
        sentAt: nlog.sentAt,
        engagedAt: nlog.engagedAt ?? null,
        dismissedAt: nlog.dismissedAt ?? null,
        snoozeUntil: nlog.snoozeUntil ?? null,
        chatSessionId: nlog.chatSessionId ?? null,
        triggeredByEvent: nlog.triggeredByEvent ?? null,
        _ts: tsOf(nlog.sentAt),
      });
    }
    items.sort((a, b) => b._ts - a._ts);
    const trimmed = items.slice(0, limit).map(({ _ts, ...rest }) => rest);
    const out: any = { items: trimmed };
    if (items.length > limit) {
      const last = items[limit - 1];
      out.nextCursor = last ? String(last._ts) : undefined;
    }
    res.status(200).json(out);
  } catch (err: any) {
    console.error("coach.timeline.get.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// GET /api/coach/reports/:id — le um relatorio + marca read_at (idempotente)
// =============================================================================
export async function handleGetCoachReport(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const id = req.params?.id;
    if (!id) {
      res.status(400).json({ message: "invalid_id" });
      return;
    }
    const storage = await resolveStorage(injectedStorage);
    const report = await storage.getReportById?.(id);
    if (!report) {
      res.status(404).json({ message: "Relatorio nao encontrado" });
      return;
    }
    if (report.userId !== userId) {
      res.status(403).json({ message: "Acesso negado" });
      return;
    }
    if (!report.readAt) {
      try {
        await storage.markReportRead?.(id, new Date());
      } catch (err) {
        console.error("coach.report.mark_read.error", { id, err });
      }
    }
    res.status(200).json({
      id: report.id,
      reportType: report.reportType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status: report.status,
      content: report.content ?? {},
      markdown: report.markdown ?? null,
      generatedAt: report.generatedAt,
      costUsdEstimate: report.costUsdEstimate ?? null,
    });
  } catch (err: any) {
    console.error("coach.report.get.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// POST /api/coach/reports/:id/dismiss — arquiva o card na timeline
// =============================================================================
export async function handlePostCoachReportDismiss(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const id = req.params?.id;
    if (!id) {
      res.status(400).json({ message: "invalid_id" });
      return;
    }
    const storage = await resolveStorage(injectedStorage);
    const report = await storage.getReportById?.(id);
    if (!report) {
      res.status(404).json({ message: "Relatorio nao encontrado" });
      return;
    }
    if (report.userId !== userId) {
      res.status(403).json({ message: "Acesso negado" });
      return;
    }
    await storage.markReportDismissed?.(id, new Date());
    res.status(200).json({ id, dismissed: true });
  } catch (err: any) {
    console.error("coach.report.dismiss.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// GET /api/coach/suggestions — quick suggestions contextuais
// =============================================================================
export async function handleGetCoachSuggestions(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    const route = typeof req.query?.route === "string" ? req.query.route : "";
    let suggestions: Array<{ id: string; text: string; sendOnClick: true }>;
    try {
      suggestions = await computeSuggestions(userId, route, req.query ?? {}, injectedStorage);
    } catch (err) {
      console.error("coach.suggestions.compute.error", { route, err });
      suggestions = staticSuggestionsForRoute(route);
    }
    res.status(200).json({ suggestions });
  } catch (err: any) {
    console.error("coach.suggestions.get.error", { err });
    res.status(200).json({ suggestions: staticSuggestionsForRoute("") });
  }
}

// =============================================================================
// Registro das rotas
// =============================================================================
export function registerCoachAi1bRoutes(app: any, requireAuth: any): void {
  app.get("/api/coach/timeline", requireAuth, async (req: any, res: any) => {
    await handleGetCoachTimeline(req, res);
  });
  app.get("/api/coach/reports/:id", requireAuth, async (req: any, res: any) => {
    await handleGetCoachReport(req, res);
  });
  app.post("/api/coach/reports/:id/dismiss", requireAuth, async (req: any, res: any) => {
    await handlePostCoachReportDismiss(req, res);
  });
  app.get("/api/coach/suggestions", requireAuth, async (req: any, res: any) => {
    await handleGetCoachSuggestions(req, res);
  });
}
