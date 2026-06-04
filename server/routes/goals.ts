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
  upsertGoalDailyLogSchema,
  isDailyLogFilled,
} from "../../shared/goals";
import {
  GOALS_SOURCE_METRIC_MAP,
  parseMetricSource,
  RESULT_ONLY_METRICS,
  GRIND_CAPABLE_METRICS,
} from "../coach/goals/sourceMetricMap";
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
const DAY_MS = 24 * 60 * 60 * 1000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// ADR-241 — duracao do horizon para derivar deadline quando a meta nao tem
// `deadline` explicito (legado). Sem isso, span<=0 e a pace satura em target.
const HORIZON_MS: Record<string, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  quarter: 90 * 24 * 60 * 60 * 1000,
  season: 365 * 24 * 60 * 60 * 1000,
};

function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

// Resolve [inicio, prazo] de uma medida: startDate ?? createdAt e deadline
// explicito OU derivado do horizon a partir do inicio (ADR-241).
function resolveGoalWindow(g: any, now: Date): { start: Date; deadline: Date } {
  const start = g.startDate
    ? ymdToUtc(g.startDate)
    : g.createdAt
      ? new Date(g.createdAt)
      : now;
  const deadline = g.deadline
    ? ymdToUtc(g.deadline)
    : new Date(start.getTime() + (HORIZON_MS[g.horizon] ?? HORIZON_MS.quarter));
  return { start, deadline };
}

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
    // MEDIUM (reviewer): falha de infra (DB/timeout) NAO e "sem permissao". 503
    // distingue "indisponivel" de "free" — nao bloqueia Pro legitimo como 403.
    console.error("goals.tierGate.error", { err });
    res.status(503).json({ message: "tier_check_unavailable", code: "tier_check_unavailable" });
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

  // 3b. GET /api/goals/:id/series (sub-path — serie planejado×executado p/ grafico)
  app.get("/api/goals/:id/series", requireAuth, async (req: any, res: any) => {
    await handleGetGoalSeries(req, res);
  });

  // 3d. ADR-241 — consistencia (streak + dias preenchidos) p/ o hero do placar.
  app.get("/api/goals/consistency", requireAuth, async (req: any, res: any) => {
    await handleGetConsistency(req, res);
  });

  // 3c. ADR-241 — relatorio diario do calendario de metas. Paths literais
  // "daily-logs" registrados ANTES de /:id (DEC-A8) senao Express casa como :id.
  app.get("/api/goals/daily-logs", requireAuth, async (req: any, res: any) => {
    await handleListDailyLogs(req, res);
  });
  app.get("/api/goals/daily-logs/:date", requireAuth, async (req: any, res: any) => {
    await handleGetDailyLog(req, res);
  });
  app.put("/api/goals/daily-logs/:date", requireAuth, async (req: any, res: any) => {
    await handleUpsertDailyLog(req, res);
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
  // Memoiza UM unico fetch de grind sessions por request (superset limit:1000).
  // Antes 2-3 scans identicos por scoreboard (weekly + 2 grind deps). Mesmo
  // padrao do fxRatesPromise. Cada dep filtra a janela que precisa em codigo.
  let grindSessionsPromise: Promise<any[]> | null = null;
  const allGrindSessions = (): Promise<any[]> => {
    if (!grindSessionsPromise) {
      grindSessionsPromise = Promise.resolve(storage.getGrindSessions?.(userId, { limit: 1000 })).then(
        (r: any) => (Array.isArray(r) ? r : []),
      );
    }
    return grindSessionsPromise;
  };
  // Filtra sessoes por janela de datas [fromYmd, toYmd] inclusivo. keepUndated:
  // sem `date` -> mantem (weekly, defensivo) ou descarta (range de meta).
  const sessionsInWindow = (rows: any[], fromYmd: string, toYmd: string, keepUndated: boolean): any[] => {
    const start = new Date(`${fromYmd}T00:00:00.000Z`).getTime();
    const end = new Date(`${toYmd}T00:00:00.000Z`).getTime() + DAY_MS; // +1 dia inclusivo
    return rows.filter((s: any) => {
      if (!s?.date) return keepUndated;
      const t = (s.date instanceof Date ? s.date : new Date(s.date)).getTime();
      if (Number.isNaN(t)) return keepUndated;
      return t >= start && t < end;
    });
  };

  return {
    // Sessoes da semana corrente [weekStart, weekStart+7d). Reusa o fetch unico.
    getGrindSessions: async (_uid, window) => {
      const all = await allGrindSessions();
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
    // ADR-241 — fonte 'grind' das metricas de resultado (profit/volume): sessoes
    // de grind na janela COMPLETA da meta (inicio->agora). Reusa o fetch unico.
    getGrindSessionsInRange: async (_uid, fromYmd, toYmd) => {
      return sessionsInWindow(await allGrindSessions(), fromYmd, toYmd, false);
    },
    // volume 'grind' = count de session_tournaments das sessoes da janela.
    getSessionTournamentCountInRange: async (uid, fromYmd, toYmd) => {
      const ids = sessionsInWindow(await allGrindSessions(), fromYmd, toYmd, false)
        .map((s: any) => s.id)
        .filter(Boolean);
      if (ids.length === 0) return 0;
      const tourneys = (await storage.getSessionTournamentsBySessionIds?.(uid, ids)) ?? [];
      return Array.isArray(tourneys) ? tourneys.length : 0;
    },
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
    // ADR-241 — metricas de resultado (profit/volume) usam a janela COMPLETA da
    // meta (inicio->agora); as demais ignoram range e usam a semana.
    const agg = await aggregateCurrentValue(
      userId,
      g.sourceMetric,
      { weekStartDate, rangeStartYmd: ymdUtc(g.createdAt), rangeEndYmd: ymdUtc(now) },
      deps,
    );
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
    // HIGH (reviewer ADR-241): propaga a janela COMPLETA da meta (igual a via
    // direta), senao uma futura medida grind-capable agregaria a semana no
    // fallback e o `current` divergiria entre re-reads conforme o motor degrada.
    const agg = await aggregateCurrentValue(
      userId,
      g.sourceMetric,
      { weekStartDate, rangeStartYmd: ymdUtc(g.createdAt), rangeEndYmd: ymdUtc(new Date()) },
      deps,
    );
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
      // ADR-241 — pace usa start_date/deadline explicitos (fallback createdAt +
      // horizon). Antes deadline=now -> span<=0 -> expectedNow saturava em target.
      const { start, deadline } = resolveGoalWindow(g, now);
      normalized.push({
        refId: g.id,
        kind: "measure",
        title: g.title,
        sourceMetric: g.sourceMetric,
        baseline: num(g.baselineValue),
        target: num(g.targetValue),
        createdAt: start,
        deadline,
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
  // Campos obrigatorios da WIG (RF-01): title nao-vazio + targetValue e
  // baselineValue numeros finitos. Sem isso, createWig escreveria career_goals
  // com title NULL (CHECK) ou baseline_value NULL (NOT NULL em goal_wig_meta) ->
  // 500 em prod. Recusa explicita ANTES do storage.
  if (typeof body.title !== "string" || body.title.trim() === "") {
    res.status(400).json({ message: "wig_title_required", code: "wig_title_required" });
    return;
  }
  if (typeof body.targetValue !== "number" || !Number.isFinite(body.targetValue)) {
    res.status(400).json({ message: "wig_target_value_required", code: "wig_target_value_required" });
    return;
  }
  if (typeof body.baselineValue !== "number" || !Number.isFinite(body.baselineValue)) {
    res.status(400).json({ message: "wig_baseline_value_required", code: "wig_baseline_value_required" });
    return;
  }
  // ADR-241 — fonte 'grind' so vale p/ profit/volume (roi/abi/itm sem currency
  // em session_tournaments). Aditivo: so dispara para sufixo @grind invalido.
  if (typeof body.sourceMetric === "string" && !isLeakFocusMetric(body.sourceMetric)) {
    const { base, source } = parseMetricSource(body.sourceMetric);
    if (source === "grind" && !GRIND_CAPABLE_METRICS.has(base)) {
      res.status(422).json({ message: "wig_no_data_source", code: "wig_no_data_source" });
      return;
    }
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
  } else {
    // ADR-241 — separa base@fonte. Metricas de RESULTADO (profit/roi/itm/abi) sao
    // nao-controlaveis -> recusadas como MEDIDA (so WIG). Fonte 'grind' so vale
    // para profit/volume (session_tournaments nao tem currency p/ roi/abi/itm).
    const { base, source } = parseMetricSource(body.sourceMetric ?? "");
    if (RESULT_ONLY_METRICS.has(base)) {
      res.status(422).json({
        message: "lead_not_controllable (A2: resultado nao e medida de direcao)",
        code: "lead_not_controllable",
      });
      return;
    }
    if (source === "grind" && !GRIND_CAPABLE_METRICS.has(base)) {
      res.status(422).json({ message: "lead_no_data_source", code: "lead_no_data_source" });
      return;
    }
    mapKey = base;
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
    const goalId = req.params.id;

    // Discrimina medida (tabela `goals`) vs WIG (career_goals + goal_wig_meta).
    // Medida-PRIMEIRO (getGoal): se for medida, segue o caminho updateGoal. Caso
    // contrario, tenta WIG (getWig). Ownership por userId em ambos os getters.
    let isMeasure = true;
    if (typeof storage.getGoal === "function") {
      const measure = await storage.getGoal(userId, goalId);
      isMeasure = !!measure;
    }

    if (!isMeasure && typeof storage.getWig === "function") {
      const wig = await storage.getWig(userId, goalId);
      if (!wig) {
        res.status(404).json({ message: "goal_not_found", code: "goal_not_found" });
        return;
      }
      // WIG: targetDeadline VALE (coluna career_goals.target_deadline existe).
      // Passa o patch inteiro (title/targetValue/targetDeadline/status). O storage
      // ja barra baselineValue (BaselineImmutableError) — mas o handler ja rejeitou
      // baselineValue acima, entao o patch aqui nunca o contem.
      const updatedWig = await storage.updateWig?.(userId, goalId, parsed.data);
      res.status(200).json(updatedWig ?? { ok: true });
      return;
    }

    // MEDIUM-2: targetDeadline so vale para WIG (career_goals). A coluna NAO
    // existe em `goals` (medida) -> nunca repassar ao updateGoal de medida.
    const { targetDeadline, ...measurePatch } = parsed.data;
    const updated = await storage.updateGoal?.(userId, goalId, measurePatch);
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
    const goalId = req.params.id;

    // Discrimina medida (tabela `goals`) vs WIG (career_goals). Medida-PRIMEIRO
    // (getGoal): se for medida, archiveGoal. Caso contrario, tenta WIG (getWig) e
    // soft-deleta via archiveWig. Ownership por userId em ambos os getters.
    let isMeasure = true;
    if (typeof storage.getGoal === "function") {
      const measure = await storage.getGoal(userId, goalId);
      isMeasure = !!measure;
    }

    if (!isMeasure && typeof storage.getWig === "function") {
      const wig = await storage.getWig(userId, goalId);
      if (!wig) {
        res.status(404).json({ message: "goal_not_found", code: "goal_not_found" });
        return;
      }
      await storage.archiveWig?.(userId, goalId);
      res.status(200).json({ ok: true });
      return;
    }

    await storage.archiveGoal?.(userId, goalId);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("handleDeleteGoal.error", { err });
    res.status(500).json({ message: "delete_goal_failed" });
  }
}

// ===========================================================================
// ADR-241 — serie temporal planejado×executado (grafico do placar)
// ===========================================================================
// GET /api/goals/:id/series — le goal_progress_snapshots e projeta
// [{weekStartDate, expected, executed}] ordenado por semana. Read-only.
export async function handleGetGoalSeries(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const goalRefId = req.params.id;
    const snapshots = (await storage.getSnapshotsForGoal?.(userId, goalRefId)) ?? [];
    const series = (Array.isArray(snapshots) ? snapshots : [])
      .map((s: any) => ({
        weekStartDate: s.weekStartDate,
        expected: s.expectedValue === null || s.expectedValue === undefined ? null : num(s.expectedValue),
        executed: s.currentValue === null || s.currentValue === undefined ? null : num(s.currentValue),
        compliancePct: s.compliancePct === null || s.compliancePct === undefined ? null : num(s.compliancePct),
        status: s.status ?? null,
      }))
      .sort((a: any, b: any) => String(a.weekStartDate).localeCompare(String(b.weekStartDate)));
    res.status(200).json({ series });
  } catch (err) {
    console.error("handleGetGoalSeries.error", { err });
    res.status(500).json({ message: "goal_series_failed" });
  }
}

// ===========================================================================
// ADR-241 — relatorio diario (calendario de metas)
// ===========================================================================

// Metas ativas num dia: [start, deadline] contem `date` E status active.
// Reusa listGoals(active) + listActiveWigs (sem query nova). Projeta shape
// enxuto p/ a UI (sem P&L — RF-06).
async function activeGoalsForDate(storage: any, userId: string, date: string): Promise<any[]> {
  const now = new Date();
  const dayMs = ymdToUtc(date).getTime();
  const [rawGoals, rawWigs] = await Promise.all([
    Promise.resolve(storage.listGoals?.(userId, { status: "active" })).catch(() => []),
    Promise.resolve(storage.listActiveWigs?.(userId)).catch(() => []),
  ]);
  const out: any[] = [];
  for (const g of (rawGoals as any[]) ?? []) {
    const { start, deadline } = resolveGoalWindow(g, now);
    if (dayMs >= start.getTime() && dayMs <= deadline.getTime()) {
      out.push({
        id: g.id,
        kind: "measure",
        title: g.title,
        sourceMetric: g.sourceMetric,
        cadence: g.cadence ?? null,
        unit: g.unit ?? null,
        target: g.targetValue === null || g.targetValue === undefined ? null : num(g.targetValue),
      });
    }
  }
  for (const w of (rawWigs as any[]) ?? []) {
    out.push({
      id: w.careerGoalId ?? w.id,
      kind: "wig",
      title: w.title,
      sourceMetric: w.sourceMetric ?? null,
      cadence: null,
      unit: w.unit ?? null,
      target: w.targetValue === null || w.targetValue === undefined ? null : num(w.targetValue),
    });
  }
  return out;
}

// GET /api/goals/consistency — streak atual + dias preenchidos (semana/mes).
// Gamificacao de PROCESSO (4DX) — nunca P&L. Read-only (todos os tiers).
export async function handleGetConsistency(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const now = new Date();
    const todayMs = ymdToUtc(ymdUtc(now)).getTime();
    // Janela de 180 dias (reviewer MEDIUM: 70d truncava "melhor serie" de quem e
    // muito consistente — penalizava justo quem a feature quer celebrar).
    const CONSISTENCY_WINDOW_DAYS = 180;
    const from = ymdUtc(new Date(todayMs - CONSISTENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000));
    const to = ymdUtc(now);
    const logs = (await storage.listGoalDailyLogsInRange?.(userId, from, to)) ?? [];

    // Set de dias UTC preenchidos.
    const filled = new Set<string>();
    for (const l of Array.isArray(logs) ? logs : []) {
      const d = String(l.logDate ?? l.log_date ?? "").slice(0, 10);
      if (d && isDailyLogFilled(l)) filled.add(d);
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const ymdAt = (ms: number) => ymdUtc(new Date(ms));

    // Streak atual: conta dias consecutivos preenchidos terminando hoje OU ontem
    // (graca de 1 dia — ainda nao registrou hoje nao zera a serie).
    let currentStreak = 0;
    let cursor = filled.has(ymdAt(todayMs)) ? todayMs : todayMs - dayMs;
    while (filled.has(ymdAt(cursor))) {
      currentStreak += 1;
      cursor -= dayMs;
    }

    // Maior streak na janela.
    let longestStreak = 0;
    let run = 0;
    for (let ms = todayMs - CONSISTENCY_WINDOW_DAYS * dayMs; ms <= todayMs; ms += dayMs) {
      if (filled.has(ymdAt(ms))) {
        run += 1;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 0;
      }
    }

    // Dias preenchidos na semana corrente (segunda->hoje, UTC).
    const dow = now.getUTCDay(); // 0=dom..6=sab
    const daysSinceMonday = (dow + 6) % 7;
    const mondayMs = todayMs - daysSinceMonday * dayMs;
    let daysFilledThisWeek = 0;
    for (let ms = mondayMs; ms <= todayMs; ms += dayMs) {
      if (filled.has(ymdAt(ms))) daysFilledThisWeek += 1;
    }
    const daysElapsedThisWeek = daysSinceMonday + 1;

    // Dias preenchidos no mes corrente.
    const firstOfMonthMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    let daysFilledThisMonth = 0;
    for (let ms = firstOfMonthMs; ms <= todayMs; ms += dayMs) {
      if (filled.has(ymdAt(ms))) daysFilledThisMonth += 1;
    }
    const daysElapsedThisMonth = now.getUTCDate();

    res.status(200).json({
      currentStreak,
      longestStreak,
      daysFilledThisWeek,
      daysElapsedThisWeek,
      daysFilledThisMonth,
      daysElapsedThisMonth,
    });
  } catch (err) {
    console.error("handleGetConsistency.error", { err });
    res.status(500).json({ message: "consistency_failed" });
  }
}

// GET /api/goals/daily-logs?from=&to= — logs do range (mes do calendario).
export async function handleListDailyLogs(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const from = String(req.query?.from ?? "");
    const to = String(req.query?.to ?? "");
    if (!YMD_RE.test(from) || !YMD_RE.test(to)) {
      res.status(400).json({ message: "invalid_range", code: "invalid_range" });
      return;
    }
    const logs = (await storage.listGoalDailyLogsInRange?.(userId, from, to)) ?? [];
    res.status(200).json({ logs });
  } catch (err) {
    console.error("handleListDailyLogs.error", { err });
    res.status(500).json({ message: "daily_logs_failed" });
  }
}

// GET /api/goals/daily-logs/:date — log do dia + metas ativas naquele dia.
export async function handleGetDailyLog(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    const userId = userIdFrom(req);
    const date = String(req.params?.date ?? "");
    if (!YMD_RE.test(date)) {
      res.status(400).json({ message: "invalid_date", code: "invalid_date" });
      return;
    }
    const [log, activeGoals] = await Promise.all([
      Promise.resolve(storage.getGoalDailyLog?.(userId, date)).catch(() => null),
      activeGoalsForDate(storage, userId, date).catch(() => []),
    ]);
    res.status(200).json({ date, log: log ?? null, activeGoals });
  } catch (err) {
    console.error("handleGetDailyLog.error", { err });
    res.status(500).json({ message: "daily_log_failed" });
  }
}

// PUT /api/goals/daily-logs/:date — upsert relatorio do dia (tier-gated).
export async function handleUpsertDailyLog(req: any, res: any, injectedStorage?: any): Promise<void> {
  try {
    const storage = await resolveStorage(injectedStorage);
    if (await denyIfFreeTier(req, res, storage)) return;
    const userId = userIdFrom(req);
    const date = String(req.params?.date ?? "");
    if (!YMD_RE.test(date)) {
      res.status(400).json({ message: "invalid_date", code: "invalid_date" });
      return;
    }
    const parsed = upsertGoalDailyLogSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "invalid_daily_log", code: "invalid_daily_log", issues: parsed.error.issues });
      return;
    }
    const saved = await storage.upsertGoalDailyLog?.(userId, date, parsed.data);
    res.status(200).json(saved ?? { ok: true });
  } catch (err) {
    console.error("handleUpsertDailyLog.error", { err });
    res.status(500).json({ message: "upsert_daily_log_failed" });
  }
}
