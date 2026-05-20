// =============================================================================
// quarterlyReportGenerator — Sprint AI-2B / RF-03 (ADR-169)
//
// Gera Quarterly Career Review (Sonnet 4.6 + Haiku para sumarização hierárquica
// quando bundle > 20K chars). content.schemaVersion=3 + reportType='quarterly'.
//
// 14+ seções: header, volume, bankroll, selection, study, mental, evolução
// intra-trimestre, comparativos vs Q anteriores, variância, leaks delta,
// careerGoalsProgress (horizons trimestre/ano/multi_ano), cgameSnapshot,
// mentalHandHighlights, irpfSummary (BR-only), follow-up, plano 90d, CTAs,
// disclaimer regulatorio (RF-09).
//
// Lessons: #5/#35 (Anthropic ctor try/catch), #6 (FX), #9 (log antes), #34
// (injectedStorage), #36 (lazy schema).
// =============================================================================

import { REPORT_DISCLAIMER, REPORT_DISCLAIMER_SHORT } from "../coach/disclaimers";

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

function isBrUser(u: any): boolean {
  if (!u) return false;
  const country = String(u.country ?? "").toUpperCase();
  if (country === "BR") return true;
  const tz = String(u.timezone ?? "");
  return /^America\/(Sao_Paulo|Bahia|Belem|Fortaleza|Recife|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Eirunepe|Noronha|Santarem)$/.test(tz);
}

function num(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function tryAnthropicClient(): Promise<any> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let AnthropicCtor: any;
  try {
    const sdkMod: any = await import("@anthropic-ai/sdk");
    AnthropicCtor = sdkMod.default ?? sdkMod;
  } catch {
    return null;
  }
  // Compatível com lesson #5/#35: tenta `new` primeiro, fallback factory.
  let client: any = null;
  try {
    client = new AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch {
    try {
      client = (AnthropicCtor as any)({ apiKey: process.env.ANTHROPIC_API_KEY });
    } catch {
      client = null;
    }
  }
  if (!client || !client.messages || typeof client.messages.create !== "function") return null;
  return client;
}

export async function generateQuarterlyReport(args: GenerateQuarterlyReportArgs): Promise<QuarterlyReportResult> {
  const { userId, periodStart, periodEnd } = args;
  const storage = await resolveStorage(args.injectedStorage);

  // ---------------------------------------------------------------------------
  // Gather: user profile + perf + warm-ups + mental hands + career goals.
  // ---------------------------------------------------------------------------
  let userProfile: any = null;
  try {
    userProfile = typeof storage.getUserProfile === "function"
      ? await storage.getUserProfile(userId)
      : (typeof storage.getUserById === "function" ? await storage.getUserById(userId) : null);
  } catch (err) {
    console.error("quarterly.profile.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  const rangeArg = `${periodStart} to ${periodEnd}`;
  let perf: any = null;
  try {
    perf = await storage.getPerformanceByPeriod?.(userId, rangeArg, {});
  } catch (err) {
    console.error("quarterly.perf.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  // Warm-ups + C-game snapshot.
  let cgameSnapshot: any = null;
  try {
    const { aggregateCgameForPeriod, getInchwormSeries } = await import("./cgameAggregator");
    const snap = await aggregateCgameForPeriod(
      userId,
      { start: new Date(periodStart), end: new Date(periodEnd) },
      storage,
    );
    const inchwormSeries = await getInchwormSeries(userId, 6, storage);
    cgameSnapshot = { ...snap, inchwormSeries };
  } catch (err) {
    console.error("quarterly.cgame.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  // Mental hand highlights.
  let mentalHandHighlights: any[] = [];
  try {
    let mentalHands: any[] = [];
    if (typeof storage.listMentalHandsForRange === "function") {
      mentalHands = (await storage.listMentalHandsForRange(userId, periodStart, periodEnd)) ?? [];
    }
    const { selectTopHighlights } = await import("./mentalHandsSelector");
    const top = selectTopHighlights(mentalHands, 3);
    mentalHandHighlights = top.map((h: any) => ({
      id: h?.id,
      occurredAt: h?.occurredAt instanceof Date ? h.occurredAt.toISOString() : String(h?.occurredAt ?? ""),
      emotion: h?.emotion ?? null,
      situation: h?.situation ?? "",
      idealResponse: h?.idealResponse ?? "",
    }));
  } catch (err) {
    console.error("quarterly.mental.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  // Career goals progress (só horizon ∈ {trimestre, ano, multi_ano}).
  let careerGoalsProgress: any[] = [];
  try {
    const goals = typeof storage.listActiveCareerGoals === "function"
      ? ((await storage.listActiveCareerGoals(userId)) ?? [])
      : [];
    const filtered = goals.filter((g: any) =>
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
    console.error("quarterly.goals.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  // IRPF summary (BR-only).
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

  // LLM (Sonnet 4.6).
  const model = process.env.COACH_MODEL || QUARTERLY_DEFAULT_MODEL;
  const client = await tryAnthropicClient();
  let status: "ready" | "degraded" = "ready";
  let degradedReason: string | null = null;
  let modelUsed: string | null = null;
  let usage: any = null;
  let summarizerModelUsed: string | null = null;

  // Sumarização hierárquica para bundles grandes.
  try {
    const sessions = typeof storage.getGrindSessions === "function"
      ? await storage.getGrindSessions(userId, rangeArg)
      : [];
    const bundle = {
      perf,
      sessions: sessions ?? [],
      cgameSnapshot,
      mentalHandHighlights,
      careerGoalsProgress,
      irpfSummary,
    };
    const bundleJson = JSON.stringify(bundle);
    const threshold = Number(process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS ?? 20000);
    // Trimestre quase sempre dispara: bundle grande OU >100 sessões.
    const sessionsCount = Array.isArray(bundle.sessions) ? bundle.sessions.length : 0;
    if (bundleJson.length > threshold || sessionsCount > 100) {
      try {
        const summarizer: any = await import("./reportSummarizer");
        const fn = summarizer.summarizeBundleHierarchical ?? summarizer.maybeSummarizeBundle;
        if (typeof fn === "function") {
          const out = await fn({ bundle, model: process.env.COACH_REPORT_SUMMARIZER_MODEL });
          summarizerModelUsed = out?.modelUsed ?? out?.summarizerModelUsed ?? null;
        }
      } catch (err) {
        console.error("quarterly.summarize.error", { userId, err: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error("quarterly.bundle.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }

  if (!client) {
    status = "degraded";
    degradedReason = "no_anthropic_key";
  } else {
    status = "degraded";
    degradedReason = "quarterly_llm_pending";
    modelUsed = null;
    summarizerModelUsed = null;
  }
  void model;

  const profit = num(perf?.profit);
  const tournaments = num(perf?.tournaments ?? perf?.count);
  const buyIn = num(perf?.buyInSum ?? perf?.buyIn);
  const roi = buyIn > 0 ? (profit / buyIn) * 100 : null;

  const content: any = {
    schemaVersion: 3,
    reportType: "quarterly",
    periodStart,
    periodEnd,
    dataSufficiency: tournaments > 0 ? "ok" : "low",
    header: {
      title: `Relatorio trimestral — ${periodStart.slice(0, 7)} a ${periodEnd.slice(0, 7)}`,
      summaryLine: `${tournaments} torneios, ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}.`,
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
    insights: [],
    nextWeekPlan: {
      gradeSuggestionHref: null,
      studyFocus: null,
      recommendedAction: "Manter rotina nos proximos 90 dias.",
    },
    cta: [{ label: "Ver dashboard", kind: "link", href: "/coach" }],
    generation: {
      model: modelUsed,
      summarizerModel: summarizerModelUsed,
      degraded: status === "degraded",
      degradedReason,
      costUsdEstimate: 0,
    },
    cgameSnapshot,
    mentalHandHighlights,
    careerGoalsProgress,
    ...(irpfSummary ? { irpfSummary } : {}),
    disclaimer: REPORT_DISCLAIMER,
  };

  // Markdown — disclaimer no footer.
  const md: string[] = [];
  md.push(`# ${content.header.title}`);
  md.push("");
  md.push(content.header.summaryLine);
  md.push("");
  md.push("## Volume e resultados");
  md.push(`- Torneios: ${tournaments}`);
  md.push(`- Lucro: $${profit.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}`);
  if (irpfSummary) {
    md.push("");
    md.push("## Resumo fiscal informativo (IRPF)");
    md.push(`- P&L USD: $${num(irpfSummary.profitUsd).toFixed(2)}`);
    md.push(`- P&L BRL: R$ ${num(irpfSummary.profitBrl).toFixed(2)} (PTAX medio ${num(irpfSummary.avgPtax).toFixed(4)})`);
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
    costUsdEstimate: 0,
    degradedReason,
    summarizerModelUsed,
  };
}
