// =============================================================================
// Sprint AI-3 / RF-01 (ADR-174 §2.1) — Quarterly LLM real-call (paridade monthly)
//
// Cobre o pipeline real Sonnet 4.6 que substitui o stub
// `degradedReason='quarterly_llm_pending'`.
//
// Casos:
//   - Sem ANTHROPIC_API_KEY → degraded='no_anthropic_key' (já passa hoje, mantemos).
//   - Com SDK mock + JSON válido → status='ready', model='claude-sonnet-4-6',
//     content.header.summaryLine vindo do parsed (NÃO fallback), insights[]
//     com {text, citations, confidence}, careerGoalsProgress[*].narrative do LLM,
//     variance.narrative do LLM, cost_usd_estimate > 0.
//   - Bundle > 20K chars → summarizerModelUsed populated + bundle sumarizado
//     entra no payload final do Sonnet (não só "marca").
//   - LLM throw 3x consecutivos + failSoft=true → degraded='llm_failed_3x'.
//   - parsed inválido (string em vez de object) → degraded='llm_parse_error'.
//   - degradedReason='quarterly_llm_pending' NÃO aparece em nenhum caminho.
//
// Lessons aplicadas:
//   - #5/#35 — Anthropic ctor: mock retorna obj direto + ctor try/catch fallback.
//   - #10 — DRY prompt (STATIC GRINDFY_AI_BASE + CITATIONS_RULES + REPORT_DISCLAIMER).
//   - #3 — mock shape REAL do storage (listUsersForCron, etc).
//
// Status esperado: TODOS FALHAM (implementação pendente).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function makeMockStorage(overrides: any = {}): any {
  return {
    getGrindSessions: vi.fn(async () => []),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 8000, tournaments: 150, buyInSum: 6000 })),
    listWarmupRitualsForRange: vi.fn(async () => []),
    listMentalHandsForRange: vi.fn(async () => []),
    listActiveCareerGoals: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
    getUserProfile: vi.fn(async () => ({
      userPlatformId: "USER-1",
      country: "US",
      timezone: "America/New_York",
      firstName: "Test",
    })),
    persistReport: vi.fn(async (payload: any) => ({ ...payload, id: "rep-1" })),
    updateAiStructuredProfile: vi.fn(async () => ({})),
    ...overrides,
  };
}

const OK_PARSED = {
  header: {
    summaryLine: "Trimestre +$8000, ROI 13%. Volume saudável.",
    comparison: "vs Q4/2025: +20% lucro.",
  },
  comparatives: {
    trendNarrative: "Crescimento consistente vs trimestre anterior.",
  },
  variance: {
    narrative: "PrimeDope: confidence high, σ-multiple +1.5 (running hot).",
  },
  insights: [
    {
      text: "Volume hyper subiu 30% sem ganho de ROI.",
      citations: ["fonte: getAnalyticsByModifier"],
      confidence: "high",
    },
    {
      text: "Leak open-fold BB persistente em 90d.",
      citations: ["fonte: detectLeaks"],
      confidence: "medium",
    },
    {
      text: "Aderência grade subiu de 60% para 85%.",
      citations: ["fonte: planned vs grind"],
      confidence: "high",
    },
  ],
  nextWeekPlan: {
    recommendedAction: "Bloquear hypers GG nos próximos 90d.",
    studyFocus: "ICM bubble nos 22-30bb",
  },
  careerGoalsProgress: [
    {
      goalId: "cg-1",
      narrative: "On track. Você bateu 80% da meta tri em 60d.",
      estimate: "on_track",
    },
  ],
  cgameNarrative: "A-game subiu de 50% para 62%.",
  mentalNarrative: "Padrão observado: tilt pós-bad-beat (3 entries).",
  irpfNarrative: "Lucro líquido informativo: R$ 41k (PTAX 5.10).",
};

function mockSdk(parsedJson: any, usage: any = {
  input_tokens: 2000,
  cache_creation_input_tokens: 500,
  cache_read_input_tokens: 200,
  output_tokens: 1200,
}) {
  const messagesCreate = vi.fn(async () => ({
    content: [{ type: "text", text: JSON.stringify(parsedJson) }],
    usage,
  }));
  // lesson #5/#35 — mock retorna obj direto; ctor try/catch fallback (não é constructor real).
  class FakeAnthropic {
    messages = { create: messagesCreate };
    constructor(_c: any) {}
  }
  return { FakeAnthropic, messagesCreate };
}

describe("generateQuarterlyReport — RF-01 LLM real-call (paridade monthly)", () => {
  it("com ANTHROPIC_API_KEY + SDK mock OK → status='ready', model='claude-sonnet-4-6'", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(r.status).toBe("ready");
    expect(r.model).toBe("claude-sonnet-4-6");
    expect(r.degradedReason).toBeFalsy();
    errSpy.mockRestore();
  });

  it("content.header.summaryLine vem do parsed (não fallback heurístico)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(r.content.header.summaryLine).toBe(OK_PARSED.header.summaryLine);
    expect(r.content.header.comparison).toBe(OK_PARSED.header.comparison);
    errSpy.mockRestore();
  });

  it("content.insights[] com {text, citations, confidence} populados do LLM", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(Array.isArray(r.content.insights)).toBe(true);
    expect(r.content.insights.length).toBeGreaterThanOrEqual(1);
    expect(r.content.insights.length).toBeLessThanOrEqual(5);
    for (const ins of r.content.insights) {
      expect(typeof ins.text).toBe("string");
      expect(Array.isArray(ins.citations)).toBe(true);
      expect(["high", "medium", "low"]).toContain(ins.confidence);
    }
    errSpy.mockRestore();
  });

  it("content.careerGoalsProgress[*].narrative populado do LLM (não default 'Avaliacao baseada em dados...')", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage({
      listActiveCareerGoals: vi.fn(async () => [
        { id: "cg-1", title: "Meta tri", horizon: "trimestre", targetMetric: "profit_usd", targetValue: 10000 },
      ]),
    });
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(Array.isArray(r.content.careerGoalsProgress)).toBe(true);
    expect(r.content.careerGoalsProgress.length).toBeGreaterThan(0);
    const cg1 = r.content.careerGoalsProgress.find((g: any) => g.goalId === "cg-1");
    expect(cg1).toBeTruthy();
    expect(cg1.narrative).toBe("On track. Você bateu 80% da meta tri em 60d.");
    // Preserva campos calculados pré-LLM:
    expect(cg1.title).toBe("Meta tri");
    expect(typeof cg1.progressPct === "number" || cg1.progressPct === null).toBe(true);
    errSpy.mockRestore();
  });

  it("variance.narrative populado pelo LLM quando retornado em parsed.variance.narrative", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(r.content.variance?.narrative).toBe(OK_PARSED.variance.narrative);
    errSpy.mockRestore();
  });

  it("content.comparatives.trendNarrative populado pelo LLM", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(r.content.comparatives?.trendNarrative).toBe(OK_PARSED.comparatives.trendNarrative);
    errSpy.mockRestore();
  });

  it("content.nextWeekPlan populado pelo LLM (recommendedAction + studyFocus)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(r.content.nextWeekPlan.recommendedAction).toBe(OK_PARSED.nextWeekPlan.recommendedAction);
    expect(r.content.nextWeekPlan.studyFocus).toBe(OK_PARSED.nextWeekPlan.studyFocus);
    errSpy.mockRestore();
  });

  it("cost_usd_estimate > 0 quando LLM real chamado (Sonnet pricing $3/1M in + $15/1M out)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(typeof r.costUsdEstimate).toBe("number");
    expect(r.costUsdEstimate).toBeGreaterThan(0);
    // Sanity: $0.25/Q alvo, tolera bem mais até $1.
    expect(r.costUsdEstimate).toBeLessThan(1);
    // generation.costUsdEstimate idem.
    expect(r.content.generation?.costUsdEstimate).toBeGreaterThan(0);
    errSpy.mockRestore();
  });

  it("model usado é persistido em content.generation.model + result.model", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(r.model).toBe("claude-sonnet-4-6");
    expect(r.content.generation?.model).toBe("claude-sonnet-4-6");
    errSpy.mockRestore();
  });
});

describe("generateQuarterlyReport — RF-01 fail modes", () => {
  it("Sem ANTHROPIC_API_KEY → degraded='no_anthropic_key' (não throw)", async () => {
    // ANTHROPIC_API_KEY deletado em beforeEach
    const storage = makeMockStorage();
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(r.status).toBe("degraded");
    expect(r.degradedReason).toBe("no_anthropic_key");
    errSpy.mockRestore();
  });

  it("LLM throw 3x consecutivos + failSoft=true → degraded='llm_failed_3x'", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const messagesCreate = vi.fn(async () => {
      throw new Error("llm timeout");
    });
    class FakeAnthropic {
      messages = { create: messagesCreate };
      constructor(_c: any) {}
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      failSoft: true,
      injectedStorage: storage,
    });

    expect(r.status).toBe("degraded");
    expect(r.degradedReason).toBe("llm_failed_3x");
    errSpy.mockRestore();
  });

  it("LLM retorna parsed inválido (texto sem JSON) → degraded='llm_parse_error'", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const messagesCreate = vi.fn(async () => ({
      content: [{ type: "text", text: "esse não é json válido nem chega perto" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }));
    class FakeAnthropic {
      messages = { create: messagesCreate };
      constructor(_c: any) {}
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      failSoft: true,
      injectedStorage: storage,
    });

    expect(r.status).toBe("degraded");
    expect(r.degradedReason).toBe("llm_parse_error");
    errSpy.mockRestore();
  });

  it("degradedReason 'quarterly_llm_pending' NÃO aparece em nenhum caminho", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = makeMockStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(r.degradedReason).not.toBe("quarterly_llm_pending");
    expect(r.content.generation?.degradedReason).not.toBe("quarterly_llm_pending");
    errSpy.mockRestore();
  });
});

describe("generateQuarterlyReport — RF-01 sumarização hierárquica usa bundle reduzido", () => {
  it("bundle > 20K chars → summarizer chamado + bundle sumarizado vai pro Sonnet (não só 'marca')", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    // 200 sessions garantem trigger por sessionsCount > 100 + bundle > 20K.
    const sessions = Array.from({ length: 200 }, (_, i) => ({
      id: `s${i}`,
      date: `2026-${String((i % 3) + 1).padStart(2, "0")}-15`,
      status: "completed",
      // string longa pra inflar bundle JSON:
      filler: "x".repeat(120),
    }));
    const storage = makeMockStorage({
      getGrindSessions: vi.fn(async () => sessions),
    });

    // Summarizer retorna sentinel claro pra rastrear se vai pro Sonnet.
    const summarizedSentinel = {
      compact: true,
      __summarized__: "yes-from-haiku",
    };
    const summarizeSpy = vi.fn(async (_args: any) => ({
      bundle: summarizedSentinel,
      summarizerModelUsed: "claude-haiku-4-5-20251001",
      modelUsed: "claude-haiku-4-5-20251001",
    }));
    vi.doMock("../../../server/services/reportSummarizer", () => ({
      maybeSummarizeBundle: summarizeSpy,
      summarizeBundleHierarchical: summarizeSpy,
    }));

    const { FakeAnthropic, messagesCreate } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(summarizeSpy).toHaveBeenCalled();
    expect(r.summarizerModelUsed).toBe("claude-haiku-4-5-20251001");
    expect(r.content.generation?.summarizerModel).toBe("claude-haiku-4-5-20251001");

    // Crítico: o bundle sumarizado tem que aparecer no payload final do Sonnet.
    expect(messagesCreate).toHaveBeenCalled();
    const sonnetCall = messagesCreate.mock.calls[0][0];
    const payloadString = JSON.stringify(sonnetCall);
    expect(payloadString).toContain("yes-from-haiku");
    errSpy.mockRestore();
  });
});
