// =============================================================================
// quarterlyReportGenerator — Sprint AI-2B / RF-03 (ADR-169)
// Sprint AI-3 / RF-01 + RF-03 + RF-05.1 + RF-06 (ADR-174)
//
// Gera Quarterly Career Review (Sonnet 4.6 + Haiku para sumarização hierárquica
// quando bundle > 20K chars). content.schemaVersion=3 + reportType='quarterly'.
//
// AI-3 mudanças:
//   - RF-01: chama LLM real (Sonnet 4.6) com paridade `callMonthlyLlm`. Substitui
//     stub `degradedReason='quarterly_llm_pending'`.
//   - RF-03: best-effort `updateCgameRecent(userId, snapshot)` após gather.
//   - RF-05.1: usa `isBrUser` do shared/brTimezones.
//   - RF-06: Wave 1 paralelo (Promise.allSettled) — profile/perf/sessions/
//     mentalHands/careerGoals/cgame; Wave 2 (irpfSummary) só se isBrUser.
//
// Lessons: #5/#35 (Anthropic ctor try/catch), #6 (FX → USD), #9 (log antes),
// #34 (injectedStorage), #36 (lazy schema), #10 (DRY prompt cache).
// =============================================================================

import { REPORT_DISCLAIMER, REPORT_DISCLAIMER_SHORT } from "../coach/disclaimers";
import { isBrUser } from "../../shared/brTimezones";
import { aggregateCgameForPeriod, getInchwormSeries } from "./cgameAggregator";
import { selectTopHighlights } from "./mentalHandsSelector";
import { updateCgameRecent } from "../storage/aiStructuredProfile";
import { callReportLlm } from "../coach/anthropicClient";
import { computeReportCost } from "../coach/reportCost";

export interface GenerateQuarterlyReportArgs {
  userId: string;
  periodStart: string;
  periodEnd: string;
  failSoft?: boolean;
  injectedStorage?: any;
}

export interface QuarterlyReportResult {
  content: any;
  markdown: string;
  status: "ready" | "degraded";
  model: string | null;
  usage?: any;
  costUsdEstimate?: number | null;
  degradedReason?: string | null;
  summarizerModelUsed?: string | null;
  reportId?: string | null;
}

const QUARTERLY_DEFAULT_MODEL = "claude-sonnet-4-6";

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../storage");
  return (mod as any).storage;
}

function num(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Type guard local — paridade com `cgameAggregator.isValidConfidence`. Mantido
// inline (NAO migrado) porque os testes AI-3.1 mockam `cgameAggregator` parcial
// (apenas `aggregateCgameForPeriod`/`getInchwormSeries`) e quebram com import
// novo do helper. Ver lesson #3.
// TODO AI-3.3 — migrate to shared isValidConfidence apos test-writer ajustar
// mock cgameAggregator (re-export `isValidConfidence` no mock para evitar
// undefined symbol). Reviewer AI-3.2 MEDIUM-2 deferred.
function isValidConfidence(v: any): v is "high" | "medium" | "low" {
  return v === "high" || v === "medium" || v === "low";
}

export async function generateQuarterlyReport(args: GenerateQuarterlyReportArgs): Promise<QuarterlyReportResult> {
  const { userId, periodStart, periodEnd, failSoft } = args;
  const storage = await resolveStorage(args.injectedStorage);
  const rangeArg = `${periodStart} to ${periodEnd}`;

  // ---------------------------------------------------------------------------
  // Wave 1 (paralelo): profile + perf + sessions + mentalHands + careerGoals +
  // cgameSnapshot — independentes. Promise.allSettled isola falhas (lesson #9).
  // ---------------------------------------------------------------------------
  const [
    profileSettled,
    perfSettled,
    sessionsCountSettled,
    mentalHandsRawSettled,
    careerGoalsRawSettled,
    cgameSnapshotPlainSettled,
  ] = await Promise.allSettled([
    (async () => {
      if (typeof storage.getUserProfile === "function") return await storage.getUserProfile(userId);
      if (typeof storage.getUserById === "function") return await storage.getUserById(userId);
      return null;
    })(),
    (async () => storage.getPerformanceByPeriod?.(userId, rangeArg, {}) ?? null)(),
    // RF-08 — usa storage.countGrindSessions quando disponivel (preferencial);
    // fallback para getGrindSessions(...).length (back-compat). Quando cai no
    // fallback, retorna a tupla [count, sessions] para o bundle aproveitar.
    (async () => {
      if (typeof storage.countGrindSessions === "function") {
        const n = await storage.countGrindSessions(userId, { from: periodStart, to: periodEnd });
        return { count: Number.isFinite(Number(n)) ? Number(n) : 0, sessions: [] as any[] };
      }
      if (typeof storage.getGrindSessions === "function") {
        const sessions = (await storage.getGrindSessions(userId, rangeArg)) ?? [];
        const arr = Array.isArray(sessions) ? sessions : [];
        return { count: arr.length, sessions: arr };
      }
      return { count: 0, sessions: [] as any[] };
    })(),
    (async () => {
      if (typeof storage.listMentalHandsForRange === "function") {
        return (await storage.listMentalHandsForRange(userId, periodStart, periodEnd)) ?? [];
      }
      return [];
    })(),
    (async () => {
      if (typeof storage.listActiveCareerGoals === "function") {
        return (await storage.listActiveCareerGoals(userId)) ?? [];
      }
      return [];
    })(),
    (async () => {
      return await aggregateCgameForPeriod(
        userId,
        { start: new Date(periodStart), end: new Date(periodEnd) },
        storage,
      );
    })(),
  ]);

  const userProfile: any = profileSettled.status === "fulfilled" ? profileSettled.value : null;
  if (profileSettled.status === "rejected") {
    console.error("quarterly.profile.error", { userId, err: String(profileSettled.reason) });
  }
  const perf: any = perfSettled.status === "fulfilled" ? perfSettled.value : null;
  if (perfSettled.status === "rejected") {
    console.error("quarterly.perf.error", { userId, err: String(perfSettled.reason) });
  }
  const sessionsCountResult = sessionsCountSettled.status === "fulfilled" && sessionsCountSettled.value && typeof sessionsCountSettled.value === "object"
    ? sessionsCountSettled.value as { count: number; sessions: any[] }
    : { count: 0, sessions: [] as any[] };
  const sessionsCount: number = sessionsCountResult.count;
  const sessionsDetail: any[] = sessionsCountResult.sessions;
  if (sessionsCountSettled.status === "rejected") {
    console.error("quarterly.sessions.error", { userId, err: String(sessionsCountSettled.reason) });
  }
  const mentalHandsRaw: any[] = mentalHandsRawSettled.status === "fulfilled" && Array.isArray(mentalHandsRawSettled.value) ? mentalHandsRawSettled.value : [];
  if (mentalHandsRawSettled.status === "rejected") {
    console.error("quarterly.mental.error", { userId, err: String(mentalHandsRawSettled.reason) });
  }
  const careerGoalsRaw: any[] = careerGoalsRawSettled.status === "fulfilled" && Array.isArray(careerGoalsRawSettled.value) ? careerGoalsRawSettled.value : [];
  if (careerGoalsRawSettled.status === "rejected") {
    console.error("quarterly.goals.error", { userId, err: String(careerGoalsRawSettled.reason) });
  }
  const cgameSnapshotPlain: any = cgameSnapshotPlainSettled.status === "fulfilled" ? cgameSnapshotPlainSettled.value : null;
  if (cgameSnapshotPlainSettled.status === "rejected") {
    console.error("quarterly.cgame.error", { userId, err: String(cgameSnapshotPlainSettled.reason) });
  }

  // RF-01 (AI-3.1) — confidence passthrough. Se aggregator retorna confidence
  // valido ∈ {'high','medium','low'} → persiste. Se invalido/undefined → NO-OP
  // (log warn) e nao escreve shape ruim em ai_structured_profile.cgameRecent.
  // Sprint AI-3.2 / RF-C5 — fire-and-forget inline (sem variavel intermediaria).
  if (cgameSnapshotPlain && typeof cgameSnapshotPlain === "object") {
    if (!isValidConfidence(cgameSnapshotPlain.confidence)) {
      console.warn("cgame.persist.confidence_invalid", {
        userId,
        confidence: cgameSnapshotPlain.confidence,
      });
    } else {
      const snap = {
        aPct: num(cgameSnapshotPlain.aPct),
        bPct: num(cgameSnapshotPlain.bPct),
        cPct: num(cgameSnapshotPlain.cPct),
        sampleSize: num(cgameSnapshotPlain.sampleSize),
        confidence: cgameSnapshotPlain.confidence,
        period: { start: periodStart, end: periodEnd },
        updatedAt: new Date().toISOString(),
      };
      // Fire-and-forget: NAO bloqueia o return do gerador.
      void updateCgameRecent(userId, snap).catch((err: any) => {
        console.error("quarterly.cgame.persist.error", { userId, err: err instanceof Error ? err.message : String(err) });
      });
    }
  }

  // Inchworm series (paralelo internamente). Independente — roda em paralelo
  // com o persist do cgame.
  let inchwormSeries: any[] = [];
  try {
    inchwormSeries = (await getInchwormSeries(userId, 6, storage)) ?? [];
  } catch (err) {
    console.error("quarterly.inchworm.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  const cgameSnapshot: any = cgameSnapshotPlain ? { ...cgameSnapshotPlain, inchwormSeries } : null;

  // Mental hand highlights — derivado de raw.
  let mentalHandHighlights: any[] = [];
  try {
    const top = selectTopHighlights(mentalHandsRaw, 3);
    mentalHandHighlights = top.map((h: any) => ({
      id: h?.id,
      occurredAt: h?.occurredAt instanceof Date ? h.occurredAt.toISOString() : String(h?.occurredAt ?? ""),
      emotion: h?.emotion ?? null,
      situation: h?.situation ?? "",
      idealResponse: h?.idealResponse ?? "",
    }));
  } catch (err) {
    console.error("quarterly.mental.select.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  // Career goals progress (só horizon ∈ {trimestre, ano, multi_ano}).
  let careerGoalsProgress: any[] = [];
  try {
    const filtered = careerGoalsRaw.filter((g: any) =>
      g?.horizon === "trimestre" || g?.horizon === "ano" || g?.horizon === "multi_ano",
    );
    careerGoalsProgress = filtered.map((g: any) => {
      const targetValue = num(g?.targetValue);
      const currentProfit = num(perf?.profit);
      let progressPct: number | null = null;
      if (targetValue > 0 && g?.targetMetric === "profit_usd") {
        progressPct = (currentProfit / targetValue) * 100;
      }
      return {
        goalId: g?.id,
        title: g?.title ?? "",
        horizon: g?.horizon,
        progressPct,
        estimate: "unknown",
        narrative: "Avaliacao baseada em dados do trimestre.",
      };
    });
  } catch (err) {
    console.error("quarterly.goals.shape.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  // -------------------------------------------------------------------------
  // Wave 2: irpfSummary (BR-only) — depende de profile.
  // -------------------------------------------------------------------------
  let irpfSummary: any = undefined;
  if (isBrUser(userProfile)) {
    try {
      const profitUsd = num(perf?.profit);
      let avgPtax: number | null = null;
      let irpfDegraded = false;
      try {
        const fx: any = await import("../../shared/fxCascade");
        const fn = fx.getAveragePtaxForRange ?? fx.fxCascade?.getAveragePtaxForRange ?? fx.default?.getAveragePtaxForRange;
        if (typeof fn === "function") {
          avgPtax = Number(await fn(periodStart, periodEnd));
        }
      } catch (err) {
        console.error("quarterly.irpf.fx.error", { userId, err: err instanceof Error ? err.message : String(err) });
        irpfDegraded = true;
      }
      if (avgPtax == null || !Number.isFinite(avgPtax) || avgPtax <= 0) {
        irpfDegraded = true;
      }
      const profitBrl = irpfDegraded ? null : profitUsd * (avgPtax as number);
      const byCurrency: any[] = [];
      if (!irpfDegraded && Array.isArray(perf?.byCurrency)) {
        for (const c of perf.byCurrency) {
          const cur = String(c?.currency ?? "USD").toUpperCase();
          const native = num(c?.profit);
          const ptax = avgPtax as number;
          const convertedUsd = cur === "BRL" ? native / ptax : native;
          byCurrency.push({
            currency: cur,
            profitNative: native,
            profit: native, // @deprecated alias — paridade com computeIrpfSummary tool (tests AI-3.1 ainda dependem do alias; remove em sprint futuro apos drop coordenado).
            convertedUsd,
            convertedBrl: convertedUsd * ptax,
          });
        }
      }
      irpfSummary = {
        profitUsd,
        profitBrl,
        avgPtax,
        period: { start: periodStart, end: periodEnd },
        byCurrency,
        degraded: irpfDegraded || undefined,
        degradedReason: irpfDegraded ? "fx_unavailable" : undefined,
        disclaimer: REPORT_DISCLAIMER_SHORT,
      };
    } catch (err) {
      console.error("quarterly.irpf.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }

  // -------------------------------------------------------------------------
  // Bundle + sumarizacao hierarquica (Haiku) + LLM call (Sonnet 4.6).
  // -------------------------------------------------------------------------
  const tone: "gentle" | "balanced" | "direct" = "balanced";
  let level: string | null = null;
  // RF-05 (AI-3.1) — usa profile.aiStructuredProfile carregado na Wave 1 ao
  // inves de chamar getAiStructuredProfile separado (dedup DB hit). Normaliza
  // shape se nao-nulo. Fallback: undefined level.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const aiProfile = (userProfile as any)?.aiStructuredProfile;
      if (aiProfile && typeof aiProfile === "object" && typeof aiProfile.nivel === "string") {
        level = aiProfile.nivel;
      }
    } catch { /* default */ }
  }

  const rawBundle: any = {
    tone,
    level,
    period: { start: periodStart, end: periodEnd },
    perf,
    sessionsCount,
    cgameSnapshot,
    mentalHandHighlights,
    careerGoalsProgress,
    irpfSummary,
  };
  // Quando o fallback `getGrindSessions(...)` foi acionado (storage sem
  // countGrindSessions), incluimos um detalhe leve das sessoes no bundle
  // para o summarizer ter o que condensar quando o trimestre eh denso.
  if (sessionsDetail.length > 0) {
    rawBundle.sessionsDetail = sessionsDetail;
  }

  // RF-03 (AI-3.1) — chars-only threshold (removido OR `sessionsCount > 100`).
  // Justificativa: tokens ~= chars/4; sessoes leves inflavam count sem
  // contribuir para tokens. maybeSummarizeBundle ja eh chars-only puro.
  let llmBundle: any = rawBundle;
  let summarizerModelUsed: string | null = null;
  const bundleJson = JSON.stringify(rawBundle);
  const threshold = Number(process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS ?? 20000);
  if (bundleJson.length > threshold) {
    try {
      const summarizer: any = await import("./reportSummarizer");
      // RF-03 (AI-3.1) — usa maybeSummarizeBundle (chars-only puro). Helper
      // `summarizeBundleHierarchical` foi removido do API publico — Vitest 4
      // mock strict mode lanca em acesso a export inexistente.
      const fn = typeof summarizer?.maybeSummarizeBundle === "function"
        ? summarizer.maybeSummarizeBundle
        : null;
      if (typeof fn === "function") {
        const out = await fn(rawBundle);
        // Suporta tanto shape {bundle, summarizerModelUsed, modelUsed} (helper Haiku)
        // quanto fallback no-op.
        if (out && typeof out === "object") {
          if (out.bundle != null) llmBundle = out.bundle;
          summarizerModelUsed = out.summarizerModelUsed ?? out.modelUsed ?? null;
        }
      }
    } catch (err) {
      console.error("quarterly.summarize.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }

  // LLM Sonnet 4.6.
  const model = process.env.COACH_MODEL || QUARTERLY_DEFAULT_MODEL;
  let llmSummaryLine: string | null = null;
  let llmComparison: string | null = null;
  let llmTrendNarrative: string | null = null;
  let llmVarianceNarrative: string | null = null;
  let llmInsights: Array<{ text: string; citations: string[]; confidence: "high" | "medium" | "low" }> = [];
  let llmRecommendedAction: string | null = null;
  let llmStudyFocus: string | null = null;
  let llmCareerGoalsNarrative: Map<string, { narrative: string; estimate: string }> = new Map();
  let llmCgameNarrative: string | null = null;
  let llmMentalNarrative: string | null = null;
  let llmIrpfNarrative: string | null = null;

  let status: "ready" | "degraded" = "ready";
  let degradedReason: string | null = null;
  let modelUsed: string | null = null;
  let usage: any = null;
  let costUsd = 0;

  // RF-06 (AI-3.1) — delega para callReportLlm (consolidado).
  // Early-skip: sem ANTHROPIC_API_KEY -> nao tenta SDK.
  if (!process.env.ANTHROPIC_API_KEY) {
    status = "degraded";
    degradedReason = "no_anthropic_key";
  } else {
    const { QUARTERLY_REPORT_SYSTEM, buildQuarterlyReportPrompt } = await import("../coach/prompts/quarterlyReport");
    let llmOut: any;
    try {
      llmOut = await callReportLlm({
        systemPrompt: QUARTERLY_REPORT_SYSTEM,
        userPromptBuilder: (bundle, opts) => buildQuarterlyReportPrompt({ tone: opts.tone ?? tone, level: opts.level ?? level, bundle }),
        model,
        bundle: llmBundle,
        tone,
        level,
        maxTokens: 4000,
        parseOnError: "fallback-degraded",
      });
    } catch (err) {
      console.error("quarterly.llm.error", { userId, err: err instanceof Error ? err.message : String(err) });
      llmOut = { content: {}, usage: null, rawText: "", degradedReason: "llm_failed_3x" };
    }
    if (llmOut?.degradedReason) {
      if (failSoft === false) {
        throw new Error(llmOut.degradedReason);
      }
      status = "degraded";
      degradedReason = llmOut.degradedReason;
    } else {
      const result = { ok: true as const, parsed: llmOut.content, usage: llmOut.usage };
      const p = result.parsed ?? {};
      if (typeof p?.header?.summaryLine === "string") llmSummaryLine = p.header.summaryLine;
      if (typeof p?.header?.comparison === "string") llmComparison = p.header.comparison;
      if (typeof p?.comparatives?.trendNarrative === "string") llmTrendNarrative = p.comparatives.trendNarrative;
      if (typeof p?.variance?.narrative === "string") llmVarianceNarrative = p.variance.narrative;
      if (Array.isArray(p?.insights)) {
        llmInsights = p.insights
          .filter((i: any) => i && typeof i.text === "string")
          .slice(0, 5)
          .map((i: any) => ({
            text: i.text,
            citations: Array.isArray(i?.citations) ? i.citations.map(String) : [],
            confidence: i?.confidence === "high" || i?.confidence === "medium" || i?.confidence === "low"
              ? i.confidence
              : "low",
          }));
      }
      if (typeof p?.nextWeekPlan?.recommendedAction === "string") llmRecommendedAction = p.nextWeekPlan.recommendedAction;
      if (typeof p?.nextWeekPlan?.studyFocus === "string") llmStudyFocus = p.nextWeekPlan.studyFocus;
      if (Array.isArray(p?.careerGoalsProgress)) {
        for (const g of p.careerGoalsProgress) {
          if (g && typeof g.goalId === "string" && typeof g.narrative === "string") {
            llmCareerGoalsNarrative.set(g.goalId, {
              narrative: g.narrative,
              estimate: typeof g.estimate === "string" ? g.estimate : "unknown",
            });
          }
        }
      }
      if (typeof p?.cgameNarrative === "string") llmCgameNarrative = p.cgameNarrative;
      if (typeof p?.mentalNarrative === "string") llmMentalNarrative = p.mentalNarrative;
      if (typeof p?.irpfNarrative === "string") llmIrpfNarrative = p.irpfNarrative;

      usage = result.usage;
      costUsd = computeReportCost(usage, "sonnet46");
      modelUsed = model;
      status = "ready";
      degradedReason = null;
    }
  }

  // Aplica narrativas LLM em careerGoalsProgress preservando campos calculados.
  if (llmCareerGoalsNarrative.size > 0) {
    careerGoalsProgress = careerGoalsProgress.map((g: any) => {
      const llm = llmCareerGoalsNarrative.get(g.goalId);
      if (llm) {
        return { ...g, narrative: llm.narrative, estimate: llm.estimate };
      }
      return g;
    });
  }
  if (llmCgameNarrative && cgameSnapshot) {
    (cgameSnapshot as any).narrative = llmCgameNarrative;
  }
  // mentalNarrative perdia em JSON.stringify dentro de array — persiste como
  // campo top-level content.mentalNarrative (string).
  if (llmIrpfNarrative && irpfSummary) {
    irpfSummary.narrative = llmIrpfNarrative;
  }

  const profit = num(perf?.profit);
  const tournaments = num(perf?.tournaments ?? perf?.count);
  const buyIn = num(perf?.buyInSum ?? perf?.buyIn);
  const roi = buyIn > 0 ? (profit / buyIn) * 100 : null;

  const fallbackSummary = `${tournaments} torneios, ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}.`;

  const content: any = {
    schemaVersion: 3,
    reportType: "quarterly",
    periodStart,
    periodEnd,
    dataSufficiency: tournaments > 0 ? "ok" : "low",
    header: {
      title: `Relatorio trimestral — ${periodStart.slice(0, 7)} a ${periodEnd.slice(0, 7)}`,
      summaryLine: llmSummaryLine ?? fallbackSummary,
      ...(llmComparison ? { comparison: llmComparison } : {}),
    },
    totalSessions: sessionsCount,
    sections: {
      volumeResults: {
        sessionsCompleted: sessionsCount,
        sessionsPlanned: 0,
        tournaments,
        itmPct: perf?.itmPct != null ? num(perf.itmPct) : null,
        finalTables: num(perf?.finalTables),
        wins: num(perf?.wins),
        roiWeek: null,
        roi30d: null,
      },
      bankroll: {
        profitByCurrency: [{ currency: "USD", native: profit, usd: profit }],
        bankrollStart: null,
        bankrollNow: null,
        transfers: 0,
        withdrawals: 0,
      },
      selection: { ranThisWeek: null, adherencePct: null, topCategories: [], bottomCategories: [] },
      study: { minutesLogged: 0, topicsCovered: [], focusOfMonth: null, focusCoveragePct: null },
    },
    comparatives: {
      ...(llmTrendNarrative ? { trendNarrative: llmTrendNarrative } : {}),
    },
    variance: {
      ...(llmVarianceNarrative ? { narrative: llmVarianceNarrative } : {}),
    },
    insights: llmInsights,
    nextWeekPlan: {
      gradeSuggestionHref: null,
      studyFocus: llmStudyFocus,
      recommendedAction: llmRecommendedAction ?? "Manter rotina nos proximos 90 dias.",
    },
    cta: [{ label: "Ver dashboard", kind: "link", href: "/coach" }],
    generation: {
      model: modelUsed,
      summarizerModel: summarizerModelUsed,
      degraded: status === "degraded",
      degradedReason,
      costUsdEstimate: costUsd,
    },
    cgameSnapshot,
    mentalHandHighlights,
    ...(llmMentalNarrative ? { mentalNarrative: llmMentalNarrative } : {}),
    careerGoalsProgress,
    ...(irpfSummary ? { irpfSummary } : {}),
    disclaimer: REPORT_DISCLAIMER,
  };

  // Markdown — disclaimer no footer.
  const md: string[] = [];
  md.push(`# ${content.header.title}`);
  md.push("");
  md.push(content.header.summaryLine);
  if (content.header.comparison) md.push(`*${content.header.comparison}*`);
  md.push("");
  md.push("## Volume e resultados");
  md.push(`- Torneios: ${tournaments}`);
  md.push(`- Lucro: $${profit.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}`);
  if (irpfSummary) {
    md.push("");
    md.push("## Resumo fiscal informativo (IRPF)");
    md.push(`- P&L USD: $${num(irpfSummary.profitUsd).toFixed(2)}`);
    if (irpfSummary.profitBrl != null) {
      md.push(`- P&L BRL: R$ ${num(irpfSummary.profitBrl).toFixed(2)} (PTAX medio ${num(irpfSummary.avgPtax).toFixed(4)})`);
    }
    md.push(`- ${irpfSummary.disclaimer}`);
  }
  md.push("");
  md.push("---");
  md.push("");
  md.push(REPORT_DISCLAIMER);
  const markdown = md.join("\n");

  return {
    content,
    markdown,
    status,
    model: modelUsed,
    usage,
    costUsdEstimate: costUsd,
    degradedReason,
    summarizerModelUsed,
  };
}
