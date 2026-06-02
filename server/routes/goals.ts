// =============================================================================
// goals routes — Ferramenta de Metas 4DX fatia-1 (ADR-229)
//
// registerGoalsRoutes(app, requireAuth). Ordem EXATA DEC-A8 (estaticas/sub-paths
// ANTES da /:id puro), senao Express casa scoreboard/templates como :id:
//   1. GET    /api/goals/scoreboard
//   2. POST   /api/goals/:id/link-measure
//   3. GET    /api/goals/:id/snapshots
//   4. GET    /api/goals
//   5. POST   /api/goals
//   6. GET    /api/goals/:id
//   7. PATCH  /api/goals/:id
//   8. DELETE /api/goals/:id
// (templates/:profile/apply previsto em DEC-A8 mas NAO construido — METAS-1.1.)
//
// Handlers aceitam injectedStorage como 3o arg (lesson #34) — testaveis sem
// vi.mock global; em prod fazem lazy import('../storage'). Tier gate
// (getReportTier !== 'free') defense-in-depth nos writes (DEC-A2).
// =============================================================================

import {
  CONTROLLABLE_SOURCE_METRICS,
  NON_CONTROLLABLE_SOURCE_METRICS,
  patchGoalSchema,
} from "../../shared/goals";
import { GOALS_SOURCE_METRIC_MAP } from "../coach/goals/sourceMetricMap";
import { computeExpectedNow, deriveStatus } from "../coach/goals/computePace";
import { aggregateCurrentValue, type AggregateDeps } from "../coach/goals/aggregateCurrentValue";
import { num } from "../coach/goals/num";
import { ymdUtc } from "../coach/planning/weekKeys";
import {
  resolvesViaAdherence,
  bridgedSourceMetric,
  isLeakFocusMetric,
  parseLeakFocusStatId,
  normalizeStatIdForLeakMatch,
} from "../coach/goals/adherenceBridge";
import { getPlannedVsActual } from "../coach/adherence";
import { evaluateLeakFocusProgress } from "../coach/goals/leakFocusProgress";
import { isValidStatId } from "../coach/statId";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod: any = await import("../storage");
  return mod.storage;
}

async function loadReportTier(): Promise<any> {
  const mod: any = await import("../coach/reportEligibility");
  return mod.getReportTier;
}

function userIdFrom(req: any): string {
  return req?.user?.userPlatformId ?? req?.user?.id;
}

// Tier gate defense-in-depth. Resolve o user a partir do req + storage. Retorna
// true se respondeu 403 (caller deve abortar).
async function denyIfFreeTier(req: any, res: any, storage: any): Promise<boolean> {
  try {
    const getReportTier = await loadReportTier();
    const userId = userIdFrom(req);
    let user: any = req.user;
    // Re-resolve o user completo (subscription/role) se o storage souber.
    if (storage?.getUserByPlatformId) {
      const resolved = await storage.getUserByPlatformId(userId);
      if (resolved) user = resolved;
    }
    const tier = await getReportTier(user);
    if (tier === "free") {
      res.status(403).json({ message: "tier_not_eligible", code: "tier_not_eligible" });
      return true;
    }
    return false;
  } catch (err) {
    console.error("goals.tierGate.error", { err });
    res.status(403).json({ message: "tier_not_eligible", code: "tier_not_eligible" });
    return true;
  }
}

export function registerGoalsRoutes(app: any, requireAuth: any): void {
  // 1. GET /api/goals/scoreboard (estatica — ANTES de /:id)
  app.get("/api/goals/scoreboard", requireAuth, async (req: any, res: any) => {
    await handleScoreboard(req, res);
  });

  // 2. POST /api/goals/:id/link-measure (sub-path — ANTES de /:id puro)
  app.post("/api/goals/:id/link-measure", requireAuth, async (req: any, res: any) => {
    await handleLinkMeasure(req, res);
  });

  // 3. GET /api/goals/:id/snapshots (sub-path — ANTES de /:id puro)
  app.get("/api/goals/:id/snapshots", requireAuth, async (req: any, res: any) => {
    await handleGetSnapshots(req, res);
  });

  // 4. GET /api/goals (colecao)
  app.get("/api/goals", requireAuth, async (req: any, res: any) => {
    await handleListGoals(req, res);
  });

  // 5. POST /api/goals (colecao)
  app.post("/api/goals", requireAuth, async (req: any, res: any) => {
    await handleCreateGoal(req, res);
  });

  // 6. GET /api/goals/:id (parametrica — por ultimo)
  app.get("/api/goals/:id", requireAuth, async (req: any, res: any) => {
    await handleGetGoal(req, res);
  });

  // 7. PATCH /api/goals/:id
  app.patch("/api/goals/:id", requireAuth, async (req: any, res: any) => {
    await handlePatchGoal(req, res);
  });

  // 8. DELETE /api/goals/:id
  app.delete("/api/goals/:id", requireAuth, async (req: any, res: any) => {
    await handleDeleteGoal(req, res);
  });
}

// ---------------------------------------------------------------------------
// Adaptadores de assinatura (CRITICAL-2): as APIs reais do storage DIVERGEM do
// contrato AggregateDeps (que pensa em "window"). Construimos os deps UMA vez a
// partir do storage + FX, traduzindo as assinaturas. FX->USD lesson #6; FX
// ausente fallback nativo + log #9 (ja tratado dentro de aggregateCurrentValue).
// ---------------------------------------------------------------------------
function buildAggregateDeps(storage: any, userId: string): AggregateDeps {
  let fxRatesPromise: Promise<Record<string, number>> | null = null;

  return {
    // storage.getGrindSessions(uid, {limit}) — SEM janela. Busca com limit
    // razoavel e filtra por `date` em [weekStart, weekStart+7d) UTC EM CODIGO.
    getGrindSessions: async (uid, window) => {
      const all = (await storage.getGrindSessions?.(uid, { limit: 500 })) ?? [];
      const start = new Date(`${window.weekStartDate}T00:00:00.000Z`).getTime();
      if (Number.isNaN(start)) return all;
      const end = start + WEEK_MS;
      return all.filter((s: any) => {
        if (!s?.date) return true; // sem date -> nao descarta (defensivo)
        const t = (s.date instanceof Date ? s.date : new Date(s.date)).getTime();
        if (Number.isNaN(t)) return true;
        return t >= start && t < end;
      });
    },
    // storage.getStudySessionsV2(uid, {from,to}) — traduz weekStartDate -> Datas.
    getStudySessionsV2: async (uid, window) => {
      const from = new Date(`${window.weekStartDate}T00:00:00.000Z`);
      const to = new Date(from.getTime() + WEEK_MS);
      return (await storage.getStudySessionsV2?.(uid, { from, to })) ?? [];
    },
    // storage.listWalletsByUser(uid) — nome real (NAO getWallets).
    getWallets: async (uid) => (await storage.listWalletsByUser?.(uid)) ?? [],
    // FX->USD reusa o resolver existente (lesson #6). FX ausente -> retorna null
    // (aggregateCurrentValue cai pro fallback nativo + log #9).
    fxToUsd: async (amountNative, currency) => {
      try {
        const { convertToUSD, resolveExchangeRates } = await import("../services/fxResolver");
        if (!fxRatesPromise) {
          fxRatesPromise = resolveExchangeRates(userId).then((r: any) => r?.rates ?? {});
        }
        const rates = await fxRatesPromise;
        if (currency !== "USD" && !(rates as any)[currency]) return null; // sem taxa -> fallback nativo
        return convertToUSD(amountNative, currency, rates);
      } catch (err) {
        console.error("goals.scoreboard.fx.error", { currency, err });
        return null;
      }
    },
    // storage.getPerformanceByPeriod(uid, period:string) — period e STRING.
    // TODO(metas-1.1): periodo semanal Mon-Sun exato vs 7d rolling (decisao de produto).
    getPerformanceByPeriod: async (uid) => (await storage.getPerformanceByPeriod?.(uid, "7d")) ?? {},
  };
}

interface NormalizedGoal {
  refId: string;
  kind: "measure" | "wig";
  title: string;
  sourceMetric: string;
  baseline: number;
  target: number;
  createdAt: Date;
  deadline: Date;
  direction: string;
  horizon: any;
}

// Conta study_sessions_v2 mode='stat_analysis' do statId na janela (esforco do
// leak_focus). Reusa deps.getStudySessionsV2 (ja filtra janela UTC). Match do
// statId normaliza prefixo "leak:".
async function countStatAnalysisForStat(
  deps: AggregateDeps,
  userId: string,
  weekStartDate: string,
  targetStatId: string,
): Promise<number> {
  const rows = (await deps.getStudySessionsV2?.(userId, { weekStartDate })) ?? [];
  const wanted = normalizeStatIdForLeakMatch(targetStatId);
  return rows.filter(
    (r: any) =>
      r?.mode === "stat_analysis" &&
      !r?.deletedAt &&
      normalizeStatIdForLeakMatch(String(r?.statId ?? "")) === wanted,
  ).length;
}

// Resolve uma meta leak_focus (DEC-4): getStatsLeaks + coach_leak_focus + esforco
// stat_analysis -> evaluateLeakFocusProgress. Falha de fonte degrada (log antes,
// lesson #9), nunca quebra o scoreboard.
async function resolveLeakFocus(
  g: NormalizedGoal,
  deps: AggregateDeps,
  storage: any,
  weekStartDate: string,
  userId: string,
): Promise<{ status: string; compliancePct: number | null; dataSufficiency: "ok" | "low"; current: number | null }> {
  const targetStatId = parseLeakFocusStatId(g.sourceMetric) ?? "";

  // As 3 fontes sao independentes -> em paralelo (cada uma degrada sozinha +
  // loga antes do fallback, #9). Esforco (stat_analysis) | getStatsLeaks top N |
  // coach_leak_focus (status de resolucao do statId alvo).
  let leaksErrored = false;
  const [statAnalysisCount, leaks, leakFocusStatus] = await Promise.all([
    countStatAnalysisForStat(deps, userId, weekStartDate, targetStatId).catch((err) => {
      console.error("goals.scoreboard.leak.statAnalysis.error", { userId, goalRefId: g.refId, err });
      return 0;
    }),
    Promise.resolve()
      .then(() => storage.getStatsLeaks?.(userId, LEAK_TOP_N))
      .then((r: any[] | undefined) => r ?? [])
      .catch((err: unknown) => {
        console.error("goals.scoreboard.leak.getStatsLeaks.error", { userId, goalRefId: g.refId, err });
        leaksErrored = true;
        return null as any[] | null;
      }),
    Promise.resolve()
      // findLeakFocusList (NÃO findActiveLeakFocusList): status-agnóstico + sem
      // filtro de mês, senão status='resolved' nunca chega ao helper (HIGH-1).
      .then(() => storage.findLeakFocusList?.(userId))
      .then((list: any[] | undefined) => {
        const wanted = normalizeStatIdForLeakMatch(targetStatId);
        const match = ((list ?? []) as any[]).find(
          (clf) => normalizeStatIdForLeakMatch(String(clf?.baselineStatKey ?? "")) === wanted,
        );
        return match ? (match.status ?? null) : null;
      })
      .catch((err: unknown) => {
        console.error("goals.scoreboard.leak.coachLeakFocus.error", { userId, goalRefId: g.refId, err });
        return null as string | null;
      }),
  ]);

  const progress = evaluateLeakFocusProgress({
    targetStatId,
    target: g.target,
    leaks,
    leaksErrored,
    leakFocusStatus,
    statAnalysisCountInWindow: statAnalysisCount,
  });

  return {
    status: progress.status,
    compliancePct: progress.compliancePct,
    dataSufficiency: progress.dataSufficiency,
    // current de leak_focus = esforco (stat_analysis na janela) — D-5.
    current: statAnalysisCount,
  };
}

// Consolida o ciclo aggregate -> pace -> status por meta (medidas + WIGs).
// fatia-2: medidas de processo via MOTOR (compliancePct rigoroso), leak_focus via
// helper, performance/financeira via agregacao direta (fatia-1). Cada entry
// isolada — falha degrada, NUNCA quebra o scoreboard (lesson #9).
async function buildScoreboardEntry(
  g: NormalizedGoal,
  deps: AggregateDeps,
  storage: any,
  weekStartDate: string,
  userId: string,
  now: Date,
): Promise<any> {
  const expectedNow = computeExpectedNow(g.baseline, g.target, g.createdAt, g.deadline, now);
  const dir = g.direction === "down" ? "down" : "up";

  const base = {
    refId: g.refId,
    kind: g.kind,
    title: g.title,
    sourceMetric: g.sourceMetric,
    target: g.target,
    expectedNow,
    horizon: g.horizon,
  };

  // -------------------------------------------------------------------------
  // leak_focus (apenas medidas) — resolucao dedicada (DEC-4).
  // -------------------------------------------------------------------------
  if (g.kind === "measure" && isLeakFocusMetric(g.sourceMetric)) {
    const leak = await resolveLeakFocus(g, deps, storage, weekStartDate, userId);
    return {
      ...base,
      current: leak.current,
      status: leak.status,
      compliancePct: leak.compliancePct,
      dataSufficiency: leak.dataSufficiency,
      adherence: null,
    };
  }

  // -------------------------------------------------------------------------
  // via MOTOR (apenas medidas de volume/estudo) — compliancePct rigoroso.
  // -------------------------------------------------------------------------
  if (g.kind === "measure" && resolvesViaAdherence(g.sourceMetric)) {
    const bridged = bridgedSourceMetric(g.sourceMetric);
    try {
      const pva: any = await getPlannedVsActual(
        userId,
        bridged as any,
        { kind: "week", weekStartDate },
        storage,
      );
      const breakdown = pva?.breakdown ?? {};
      // Degrade do motor: sem plano na janela (planned null). Fallback do current
      // para agregacao direta (DEC-A5), mas compliancePct null + dataSufficiency low.
      if (pva?.planned === null || pva?.planned === undefined) {
        const fallbackCurrent = await aggregateCurrentForFallback(g, deps, userId, weekStartDate);
        const status = deriveStatus(fallbackCurrent ?? 0, expectedNow, g.target, dir);
        return {
          ...base,
          current: fallbackCurrent,
          status,
          compliancePct: null,
          dataSufficiency: "low",
          adherence: {
            planned: pva?.planned ?? null,
            actual: pva?.actual ?? 0,
            skipped: !!breakdown.skipped,
            shortfall: breakdown.shortfall ?? null,
            overachieved: !!breakdown.overachieved,
            note: breakdown.note ?? null,
          },
        };
      }

      const current = pva?.actual ?? 0;
      // DEC-6: skipped (A4) -> estado neutro (on_track), nunca at_risk por isso.
      const status = breakdown.skipped
        ? "on_track"
        : deriveStatus(current, expectedNow, g.target, dir);
      return {
        ...base,
        current,
        status,
        compliancePct: pva?.compliancePct ?? null,
        dataSufficiency: pva?.dataSufficiency ?? "ok",
        adherence: {
          planned: pva?.planned ?? null,
          actual: pva?.actual ?? 0,
          skipped: !!breakdown.skipped,
          shortfall: breakdown.shortfall ?? null,
          overachieved: !!breakdown.overachieved,
          note: breakdown.note ?? null,
        },
      };
    } catch (err) {
      // Motor lancou: log ANTES do fallback (#9); meta degrada, scoreboard 200.
      console.error("goals.scoreboard.adherence.error", { userId, goalRefId: g.refId, err });
      const fallbackCurrent = await aggregateCurrentForFallback(g, deps, userId, weekStartDate);
      const status = deriveStatus(fallbackCurrent ?? 0, expectedNow, g.target, dir);
      return {
        ...base,
        current: fallbackCurrent,
        status,
        compliancePct: null,
        dataSufficiency: "low",
        adherence: null,
      };
    }
  }

  // -------------------------------------------------------------------------
  // DIRETA (performance/financeira + WIGs) — agregacao direta da fatia-1.
  // compliancePct null; dataSufficiency REAL da agregacao (RF-04).
  // -------------------------------------------------------------------------
  let current: number | null = null;
  let dataSufficiency: "ok" | "low" = "ok";
  try {
    const agg = await aggregateCurrentValue(userId, g.sourceMetric, { weekStartDate }, deps);
    current = agg?.value ?? null;
    dataSufficiency = agg?.dataSufficiency ?? "ok";
  } catch (err) {
    console.error("goals.scoreboard.aggregate.error", { userId, goalRefId: g.refId, err });
    current = null;
    dataSufficiency = "low";
  }

  const status = deriveStatus(current ?? 0, expectedNow, g.target, dir);

  return {
    ...base,
    current,
    status,
    compliancePct: null,
    dataSufficiency,
    adherence: null,
  };
}

const LEAK_TOP_N = 10; // DEC-A3 — "saiu do top-N" do getStatsLeaks.

// Fallback de current quando o motor degrada (DEC-A5): agregacao direta da
// fatia-1. Erro aqui -> null (nao quebra).
async function aggregateCurrentForFallback(
  g: NormalizedGoal,
  deps: AggregateDeps,
  userId: string,
  weekStartDate: string,
): Promise<number | null> {
  try {
    const agg = await aggregateCurrentValue(userId, g.sourceMetric, { weekStartDate }, deps);
    return agg?.value ?? null;
  } catch (err) {
    console.error("goals.scoreboard.fallbackAggregate.error", { userId, goalRefId: g.refId, err });
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /api/goals/scoreboard — placar read-only (todos os tiers). UPSERT
// idempotente do snapshot da semana corrente (DEC-A1 on-read).
// ---------------------------------------------------------------------------
export async function handleScoreboard(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const weekStartDate = ymdUtc(new Date()); // chave UTC (CLAUDE.md §10)
    const now = new Date();

    const [rawGoals, rawWigs] = await Promise.all([
      storage.listGoals?.(userId, { status: "active" }) ?? [],
      storage.listActiveWigs?.(userId) ?? [],
    ]);

    // deps reais construidos UMA vez (fora dos loops).
    const deps = buildAggregateDeps(storage, userId);

    // Normaliza medidas + WIGs numa lista unica (helper consolidado).
    const normalized: NormalizedGoal[] = [];
    for (const g of (rawGoals as any[]) ?? []) {
      normalized.push({
        refId: g.id,
        kind: "measure",
        title: g.title,
        sourceMetric: g.sourceMetric,
        baseline: num(g.baselineValue),
        target: num(g.targetValue),
        createdAt: g.createdAt ? new Date(g.createdAt) : now,
        deadline: g.targetDeadline ? new Date(g.targetDeadline) : now,
        direction: g.direction ?? "up",
        horizon: g.horizon,
      });
    }
    for (const w of (rawWigs as any[]) ?? []) {
      // listActiveWigs ja retorna PLANO (HIGH-2); back-compat com aninhado legado.
      const meta = w.goal_wig_meta ?? w.goalWigMeta ?? w;
      const career = w.career_goals ?? w.careerGoals ?? w;
      const careerGoalId = w.careerGoalId ?? meta.careerGoalId ?? career.id ?? w.id;
      normalized.push({
        refId: careerGoalId,
        kind: "wig",
        title: w.title ?? career.title ?? meta.title,
        sourceMetric: w.sourceMetric ?? meta.sourceMetric,
        baseline: num(w.baselineValue ?? meta.baselineValue),
        target: num(w.targetValue ?? meta.targetValue4dx ?? career.targetValue),
        createdAt: (w.createdAt ?? career.createdAt) ? new Date(w.createdAt ?? career.createdAt) : now,
        deadline: (w.targetDeadline ?? career.targetDeadline) ? new Date(w.targetDeadline ?? career.targetDeadline) : now,
        direction: "up",
        horizon: w.horizon ?? meta.horizon4dx ?? meta.horizon ?? career.horizon,
      });
    }

    // aggregate + pace + status em paralelo (independentes; <=5 metas).
    // Cada entry isolada — falha degrada, NUNCA quebra o scoreboard (lesson #9).
    const entries = await Promise.all(
      normalized.map((g) =>
        buildScoreboardEntry(g, deps, storage, weekStartDate, userId, now).catch((err: any) => {
          console.error("goals.scoreboard.entry.error", { userId, goalRefId: g.refId, err });
          // Degrade total da entry — mantem o shape minimo, scoreboard 200.
          return {
            refId: g.refId,
            kind: g.kind,
            title: g.title,
            sourceMetric: g.sourceMetric,
            current: null,
            target: g.target,
            expectedNow: computeExpectedNow(g.baseline, g.target, g.createdAt, g.deadline, now),
            status: "at_risk",
            compliancePct: null,
            dataSufficiency: "low" as const,
            adherence: null,
            horizon: g.horizon,
          };
        }),
      ),
    );

    // UPSERT idempotente dos snapshots da semana corrente (on-read). RF-04:
    // grava compliancePct + dataSufficiency REAIS (nao mais 'ok' hardcoded).
    await Promise.all(
      entries.map((e) =>
        Promise.resolve(
          storage.upsertGoalSnapshot?.({
            userId,
            goalRefId: e.refId,
            goalKind: e.kind,
            weekStartDate,
            currentValue: e.current,
            expectedValue: e.expectedNow,
            status: e.status,
            compliancePct: e.compliancePct ?? null,
            dataSufficiency: e.dataSufficiency ?? "ok",
          }),
        ).catch((err: any) =>
          console.error("goals.scoreboard.snapshot.error", { userId, goalRefId: e.refId, err }),
        ),
      ),
    );

    const measures = entries
      .filter((e) => e.kind === "measure")
      .map((e) => ({
        id: e.refId,
        title: e.title,
        sourceMetric: e.sourceMetric,
        current: e.current,
        target: e.target,
        expectedNow: e.expectedNow,
        status: e.status,
        horizon: e.horizon,
        // ADICOES fatia-2 (aditivas; null/ausente em metas diretas).
        compliancePct: e.compliancePct ?? null,
        dataSufficiency: e.dataSufficiency ?? "ok",
        adherence: e.adherence ?? null,
      }));
    const wigs = entries
      .filter((e) => e.kind === "wig")
      .map((e) => ({
        careerGoalId: e.refId,
        title: e.title,
        horizon: e.horizon,
        current: e.current,
        target: e.target,
        expectedNow: e.expectedNow,
        status: e.status,
      }));

    res.status(200).json({ wigs, measures, snapshotsWeek: weekStartDate });
  } catch (err) {
    console.error("handleScoreboard.error", { err });
    res.status(500).json({ message: "scoreboard_failed" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/goals/:id/link-measure — vincula medida a uma WIG (idempotente).
// ---------------------------------------------------------------------------
export async function handleLinkMeasure(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    if (await denyIfFreeTier(req, res, storage)) return;
    const userId = userIdFrom(req);
    const wigCareerGoalId = req.params.id;
    const measureId = req.body?.measureId;
    if (!measureId) {
      res.status(400).json({ message: "measure_id_required", code: "measure_id_required" });
      return;
    }
    // MEDIUM-1: ownership. A WIG e a medida tem que pertencer a este user; caso
    // contrario 404 (nao vincular recurso de outro dono). So aplica quando o
    // storage expoe os getters (getWig/getGoal filtram por userId).
    if (typeof storage.getWig === "function") {
      const wig = await storage.getWig(userId, wigCareerGoalId);
      if (!wig) {
        res.status(404).json({ message: "wig_not_found", code: "wig_not_found" });
        return;
      }
    }
    if (typeof storage.getGoal === "function") {
      const measure = await storage.getGoal(userId, measureId);
      if (!measure) {
        res.status(404).json({ message: "measure_not_found", code: "measure_not_found" });
        return;
      }
    }
    const link = await storage.linkMeasure?.(userId, wigCareerGoalId, measureId);
    res.status(200).json(link ?? { ok: true });
  } catch (err) {
    console.error("handleLinkMeasure.error", { err });
    res.status(500).json({ message: "link_measure_failed" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/goals/:id/snapshots — historico de snapshots de uma meta.
// ---------------------------------------------------------------------------
export async function handleGetSnapshots(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const goalRefId = req.params.id;
    const snapshots = (await storage.getSnapshotsForGoal?.(userId, goalRefId)) ?? [];
    res.status(200).json({ snapshots });
  } catch (err) {
    console.error("handleGetSnapshots.error", { err });
    res.status(500).json({ message: "snapshots_failed" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/goals — lista metas (read-only todos).
// ---------------------------------------------------------------------------
export async function handleListGoals(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const [goals, wigs] = await Promise.all([
      storage.listGoals?.(userId) ?? [],
      storage.listActiveWigs?.(userId) ?? [],
    ]);
    res.status(200).json({ goals, wigs });
  } catch (err) {
    console.error("handleListGoals.error", { err });
    res.status(500).json({ message: "list_goals_failed" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/goals — cria WIG ou medida (valida doutrina RF-01/03/04).
// ---------------------------------------------------------------------------
export async function handleCreateGoal(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    if (await denyIfFreeTier(req, res, storage)) return;
    const userId = userIdFrom(req);
    const body = req.body ?? {};
    const isWig = body.kind === "wig" || body.goalKind === "wig";

    if (isWig) {
      await createWigHandler(userId, body, storage, res);
    } else {
      await createMeasureHandler(userId, body, storage, res);
    }
  } catch (err) {
    console.error("handleCreateGoal.error", { err });
    res.status(500).json({ message: "create_goal_failed" });
  }
}

async function createWigHandler(userId: string, body: any, storage: any, res: any): Promise<void> {
  // WIG so pode ser lag (performance|result); processo e D2.
  if (body.goalType === "process") {
    res.status(422).json({ message: "wig_must_be_lag", code: "wig_must_be_lag" });
    return;
  }
  // deadline >= +90 dias (D9). MEDIUM-3: normaliza "hoje" para meia-noite UTC
  // antes de subtrair, evitando off-by-1-dia conforme a hora do dia.
  const deadline = body.targetDeadline ? new Date(`${body.targetDeadline}T00:00:00.000Z`) : null;
  const todayMidnightUtc = new Date(`${ymdUtc(new Date())}T00:00:00.000Z`).getTime();
  if (!deadline || Number.isNaN(deadline.getTime()) || deadline.getTime() - todayMidnightUtc < NINETY_DAYS_MS) {
    res.status(422).json({
      message: "wig_deadline_too_short (D9: ROI so converge em escala)",
      code: "wig_deadline_too_short",
    });
    return;
  }
  // cap 2 WIGs ativas.
  const activeWigs = (await storage.countActiveWigs?.(userId)) ?? 0;
  if (activeWigs >= 2) {
    res.status(422).json({ message: "wig_active_limit", code: "wig_active_limit" });
    return;
  }
  const created = await storage.createWig?.(userId, body);
  res.status(201).json(created ?? { ok: true });
}

async function createMeasureHandler(userId: string, body: any, storage: any, res: any): Promise<void> {
  // cap 3 medidas ativas.
  const activeMeasures = (await storage.countActiveMeasures?.(userId)) ?? 0;
  if (activeMeasures >= 3) {
    res.status(422).json({ message: "lead_active_limit", code: "lead_active_limit" });
    return;
  }
  // C7: meta vaga = sem meta (targetValue + unit + cadence obrigatorios).
  if (body.targetValue === undefined || !body.unit || !body.cadence) {
    res.status(422).json({
      message: "lead_underspecified (C7: meta vaga = sem meta)",
      code: "lead_underspecified",
    });
    return;
  }
  // A2/D9: metrica nao-controlavel (outcome bias) recusada.
  if (
    (NON_CONTROLLABLE_SOURCE_METRICS as readonly string[]).includes(body.sourceMetric)
  ) {
    res.status(422).json({
      message: "lead_not_controllable (A2: dicotomia do controle)",
      code: "lead_not_controllable",
    });
    return;
  }
  // METAS-2 fatia-2 (RF-02): leak_focus usa sufixo "leak_focus_progress:<statId>".
  // O statId alvo precisa ser valido (catalog id ou custom_*); statId
  // ausente/invalido -> lead_no_data_source (nao persiste lixo). A allowlist/map
  // compara so a RAIZ (leak_focus_progress).
  let mapKey = body.sourceMetric;
  if (isLeakFocusMetric(body.sourceMetric)) {
    const statId = parseLeakFocusStatId(body.sourceMetric);
    // parseLeakFocusStatId ja valida via isValidStatId; revalidamos aqui como
    // defense-in-depth (statId precisa ser catalog id OU custom_*).
    if (!statId || !isValidStatId(statId)) {
      res.status(422).json({ message: "lead_no_data_source", code: "lead_no_data_source" });
      return;
    }
    mapKey = "leak_focus_progress";
  }
  // RF-05: precisa de fonte de dado mapeada.
  if (!GOALS_SOURCE_METRIC_MAP[mapKey]) {
    res.status(422).json({ message: "lead_no_data_source", code: "lead_no_data_source" });
    return;
  }
  const created = await storage.createGoal?.({ ...body, userId, goalKind: "measure" });
  res.status(201).json(created ?? { ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/goals/:id — detalhe (read-only).
// ---------------------------------------------------------------------------
export async function handleGetGoal(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const goal = await storage.getGoal?.(userId, req.params.id);
    if (!goal) {
      res.status(404).json({ message: "goal_not_found" });
      return;
    }
    res.status(200).json(goal);
  } catch (err) {
    console.error("handleGetGoal.error", { err });
    res.status(500).json({ message: "get_goal_failed" });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/goals/:id — edita; rejeita baselineValue (DEC-menor-1, 400).
// ---------------------------------------------------------------------------
export async function handlePatchGoal(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    if (await denyIfFreeTier(req, res, storage)) return;
    const body = req.body ?? {};
    // baseline imutavel (DEC-menor-1) — checado ANTES do schema (.strict() ja
    // rejeitaria a chave extra, mas o codigo nomeado 400 e o contrato cravado).
    if (body.baselineValue !== undefined || body.baseline_value !== undefined) {
      res.status(400).json({
        message: "baseline_immutable (X de 'de X para Y' e snapshot da criacao)",
        code: "baseline_immutable",
      });
      return;
    }
    // MEDIUM-2: validacao de schema na fronteira HTTP (status enum etc). Nao
    // repassa body cru ao storage.
    const parsed = patchGoalSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        message: "invalid_patch",
        code: "invalid_patch",
        issues: parsed.error.issues,
      });
      return;
    }
    const userId = userIdFrom(req);
    // MEDIUM-2: targetDeadline so vale para WIG (career_goals). A coluna NAO
    // existe em `goals` (medida) -> nunca repassar ao updateGoal de medida.
    const { targetDeadline, ...measurePatch } = parsed.data;
    const updated = await storage.updateGoal?.(userId, req.params.id, measurePatch);
    res.status(200).json(updated ?? { ok: true });
  } catch (err: any) {
    if (err?.code === "baseline_immutable") {
      res.status(400).json({ message: "baseline_immutable", code: "baseline_immutable" });
      return;
    }
    console.error("handlePatchGoal.error", { err });
    res.status(500).json({ message: "patch_goal_failed" });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/goals/:id — soft-delete (archived_at).
// ---------------------------------------------------------------------------
export async function handleDeleteGoal(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    if (await denyIfFreeTier(req, res, storage)) return;
    const userId = userIdFrom(req);
    await storage.archiveGoal?.(userId, req.params.id);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("handleDeleteGoal.error", { err });
    res.status(500).json({ message: "delete_goal_failed" });
  }
}
