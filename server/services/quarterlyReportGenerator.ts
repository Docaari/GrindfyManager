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
import { updateCgameRecent, getAiStructuredProfile } from "../storage/aiStructuredProfile";

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
// Pricing Sonnet 4.6 (paridade monthly).
const QUARTERLY_PRICE_PER_M = { input: 3, output: 15, cacheCreate: 3.75, cacheRead: 0.3 };

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../storage");
  return (mod as any).storage;
}

function num(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeQuarterlyCost(usage: any): number {
  const i = Number(usage?.input_tokens ?? usage?.inputTokens ?? 0);
  const o = Number(usage?.output_tokens ?? usage?.outputTokens ?? 0);
  const cc = Number(usage?.cache_creation_input_tokens ?? usage?.cacheCreationInputTokens ?? 0);
  const cr = Number(usage?.cache_read_input_tokens ?? usage?.cacheReadInputTokens ?? 0);
  const p = QUARTERLY_PRICE_PER_M;
  return (i * p.input + o * p.output + cc * p.cacheCreate + cr * p.cacheRead) / 1_000_000;
}

/**
 * Chama LLM (Sonnet 4.6) com bundle sumarizado/cru.
 * Lessons #5/#35: tenta `new` primeiro, fallback factory.
 * Retorna discriminated union: parsed JSON OK ou clientUnavailable.
 */
async function callQuarterlyLlm(args: {
  model: string;
  bundle: any;
  tone: string;
  level: string | null;
}): Promise<{ parsed: any; usage: any } | { clientUnavailable: true }> {
  const { QUARTERLY_REPORT_SYSTEM, buildQuarterlyReportPrompt } = await import("../coach/prompts/quarterlyReport");
  let AnthropicCtor: any;
  try {
    const sdkMod = await import("@anthropic-ai/sdk");
    AnthropicCtor = (sdkMod as any).default ?? sdkMod;
  } catch {
    return { clientUnavailable: true };
  }
  let client: any;
  try {
    client = new AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch {
    try { client = AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY }); } catch { client = null; }
  }
  if (!client || !client.messages || typeof client.messages.create !== "function") {
    return { clientUnavailable: true };
  }
  const userMsg = buildQuarterlyReportPrompt({ tone: args.tone, level: args.level, bundle: args.bundle });
  const response = await client.messages.create({
    model: args.model,
    max_tokens: 4000,
    system: [
      { type: "text", text: QUARTERLY_REPORT_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMsg }],
  });
  const text = Array.isArray(response?.content)
    ? response.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
    : (typeof response?.content === "string" ? response.content : "");
  let parsed: any = null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
  } catch {
    parsed = null; // sinaliza parse error
  }
  return { parsed, usage: response?.usage ?? null };
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
    sessionsSettled,
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
    (async () => {
      if (typeof storage.getGrindSessions === "function") {
        return (await storage.getGrindSessions(userId, rangeArg)) ?? [];
      }
      return [];
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
  const sessions: any[] = sessionsSettled.status === "fulfilled" && Array.isArray(sessionsSettled.value) ? sessionsSettled.value : [];
  if (sessionsSettled.status === "rejected") {
    console.error("quarterly.sessions.error", { userId, err: String(sessionsSettled.reason) });
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

  // RF-03 — trigger updateCgameRecent (best-effort). Importa o módulo aqui (await)
  // para que a chamada à spy seja registrada antes do `return`. Lança a chamada e
  // captura a promise em `cgamePersistPromise` (aguardada no final, mas todos os
  // erros são logados localmente). O DB write roda concorrente com inchworm.
  let cgamePersistPromise: Promise<void> = Promise.resolve();
  if (cgameSnapshotPlain && typeof cgameSnapshotPlain === "object") {
    try {
      const snap = {
        aPct: num(cgameSnapshotPlain.aPct),
        bPct: num(cgameSnapshotPlain.bPct),
        cPct: num(cgameSnapshotPlain.cPct),
        sampleSize: num(cgameSnapshotPlain.sampleSize),
        confidence: cgameSnapshotPlain.confidence === "high" || cgameSnapshotPlain.confidence === "medium" || cgameSnapshotPlain.confidence === "low"
          ? cgameSnapshotPlain.confidence
          : "low",
        period: { start: periodStart, end: periodEnd },
        updatedAt: new Date().toISOString(),
      };
      // Invoca já (registra mock.calls) — captura a promise resultante:
      cgamePersistPromise = (updateCgameRecent(userId, snap) as Promise<void>).catch((err) => {
        console.error("quarterly.cgame.persist.error", { userId, err: err instanceof Error ? err.message : String(err) });
      });
    } catch (err) {
      console.error("quarterly.cgame.persist.import.error", { userId, err: err instanceof Error ? err.message : String(err) });
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
            profit: native,
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
  // Só busca o nível quando vamos chamar o LLM (sem ANTHROPIC_API_KEY não precisa
  // — evita DB roundtrip desnecessário).
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const profile = await getAiStructuredProfile(userId);
      if ((profile as any)?.nivel) level = (profile as any).nivel;
    } catch { /* default */ }
  }

  const rawBundle = {
    tone,
    level,
    period: { start: periodStart, end: periodEnd },
    perf,
    sessionsCount: Array.isArray(sessions) ? sessions.length : 0,
    cgameSnapshot,
    mentalHandHighlights,
    careerGoalsProgress,
    irpfSummary,
  };

  // Sumarização — quase sempre dispara em trimestre.
  let llmBundle: any = rawBundle;
  let summarizerModelUsed: string | null = null;
  const bundleJson = JSON.stringify(rawBundle);
  const threshold = Number(process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS ?? 20000);
  const sessionsCount = rawBundle.sessionsCount;
  if (bundleJson.length > threshold || sessionsCount > 100) {
    try {
      const summarizer: any = await import("./reportSummarizer");
      const fn = summarizer.summarizeBundleHierarchical ?? summarizer.maybeSummarizeBundle;
      if (typeof fn === "function") {
        const out = await fn({ bundle: rawBundle, model: process.env.COACH_REPORT_SUMMARIZER_MODEL });
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

  const llmAttempt = async (): Promise<{ ok: true; parsed: any; usage: any } | { ok: false; reason: string }> => {
    const MAX_ATTEMPTS = 3;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const out = await callQuarterlyLlm({ model, bundle: llmBundle, tone, level });
        if ("clientUnavailable" in out) {
          return { ok: false, reason: "no_anthropic_key" };
        }
        if (out.parsed == null || typeof out.parsed !== "object") {
          // parse error é fatal (não retry — same response viria de novo).
          return { ok: false, reason: "llm_parse_error" };
        }
        return { ok: true, parsed: out.parsed, usage: out.usage };
      } catch (err) {
        lastErr = err;
        console.error("quarterly.llm.attempt.error", { userId, attempt, err: err instanceof Error ? err.message : String(err) });
        if (attempt < MAX_ATTEMPTS) {
          const backoffMs = 100 * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }
    void lastErr;
    return { ok: false, reason: "llm_failed_3x" };
  };

  // Early-skip: sem ANTHROPIC_API_KEY -> não tenta SDK.
  if (!process.env.ANTHROPIC_API_KEY) {
    status = "degraded";
    degradedReason = "no_anthropic_key";
  } else {
    const result = await llmAttempt();
    if (result.ok) {
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
      costUsd = computeQuarterlyCost(usage);
      modelUsed = model;
      status = "ready";
      degradedReason = null;
    } else {
      // failSoft default = true: relatório degrada em vez de throw.
      if (failSoft === false) {
        // re-throw com a razão (uso pelo runner em modos não-fail-soft).
        throw new Error(result.reason);
      }
      status = "degraded";
      degradedReason = result.reason;
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
  // AI-3 reviewer MEDIUM-5: array.narrative perdia em JSON.stringify (persist
  // JSONB). Movido para campo top-level content.mentalNarrative (string).
  let llmMentalNarrativeFinal: string | null = llmMentalNarrative ?? null;
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
    sections: {
      volumeResults: {
        sessionsCompleted: 0,
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
    ...(llmMentalNarrativeFinal ? { mentalNarrative: llmMentalNarrativeFinal } : {}),
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

  // RF-03: persist do cgame é fire-and-forget — não bloqueia o return do
  // gerador. A spy do test já foi invocada sincronamente (linha onde criamos
  // cgamePersistPromise); a Promise resolve em background com .catch() logado.
  void cgamePersistPromise;

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
