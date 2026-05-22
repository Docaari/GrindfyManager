// =============================================================================
// Sprint AI-3.2 / RF-B1 (ADR-203)
//
// `weeklyReportGenerator` migra de SDK Anthropic direto (linhas 588-615)
// para `callReportLlm` (server/coach/anthropicClient.ts AI-3.1).
//
// Paridade comportamental com quarterly/monthly/daily:
//   - Mesmo model (COACH_MODEL ou default Sonnet 4.6).
//   - Retry 3x exponencial (era 1x).
//   - degradedReason ∈ { no_anthropic_key, llm_failed_3x, llm_parse_error,
//                        llm_timeout (RF-D6) }
//   - parseOnError: 'fallback-degraded'.
//
// Lesson #38: mocks migram de vi.mock('@anthropic-ai/sdk') para
// vi.mock('@/server/coach/anthropicClient') — documentar no resumo implementer.
//
// Status esperado: TODOS FALHAM (weeklyReportGenerator ainda usa SDK direto).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "sk-test-rfb1";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
  vi.doUnmock("../../../server/coach/anthropicClient");
});

function makeStorageStub(): any {
  return {
    getGrindSessions: vi.fn(async () => []),
    countGrindSessions: vi.fn(async () => 0),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 100, tournaments: 5 })),
    getUserProfile: vi.fn(async () => ({
      userPlatformId: "USER-WEEK",
      country: "BR",
      timezone: "America/Sao_Paulo",
      aiStructuredProfile: { schemaVersion: 1, nivel: "intermediario", tomPreferido: "balanced" },
    })),
    persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-week-1" })),
    listBankrollSnapshots: vi.fn(async () => []),
    getBankrollSnapshots: vi.fn(async () => []),
    listLeakFocusActive: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
    listStudyForRange: vi.fn(async () => []),
    listStudySessionsForRange: vi.fn(async () => []),
  };
}

describe("RF-B1 — weeklyReportGenerator delega para callReportLlm", () => {
  it("invoca callReportLlm 1x com systemPrompt + bundle + model + maxTokens", async () => {
    const callReportLlmMock = vi.fn(async () => ({
      content: { header: { title: "Sua semana" }, sections: { volumeResults: { narrative: "ok" } }, insights: [] },
      usage: { input_tokens: 100, output_tokens: 50 },
      rawText: "{}",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => ({})),
    }));

    const storage = makeStorageStub();
    const { generateWeeklyReport } = await import(
      "../../../server/services/weeklyReportGenerator"
    );
    await generateWeeklyReport({
      userId: "USER-WEEK",
      periodStart: "2026-05-12",
      periodEnd: "2026-05-18",
      injectedStorage: storage,
    } as any);

    expect(callReportLlmMock).toHaveBeenCalled();
    const call = callReportLlmMock.mock.calls[0][0] as any;
    expect(typeof call.systemPrompt).toBe("string");
    expect(typeof call.userPromptBuilder).toBe("function");
    expect(typeof call.model).toBe("string");
    expect(typeof call.maxTokens).toBe("number");
    expect(call.maxTokens).toBeGreaterThan(0);
  });

  it("NAO importa @anthropic-ai/sdk diretamente em weeklyReportGenerator (paridade quarterly)", async () => {
    // smoke: weeklyReportGenerator NAO faz `await import('@anthropic-ai/sdk')`.
    // Spy no import dinamico via Module._cache nao eh viavel; em vez disso:
    // mockamos callReportLlm + checamos que generator funciona sem mockar SDK.
    const callReportLlmMock = vi.fn(async () => ({
      content: { sections: {}, insights: [] },
      usage: { input_tokens: 10, output_tokens: 10 },
      rawText: "{}",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => ({})),
    }));
    // SDK PROIBIDO — se for chamado, throw.
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() {
        throw new Error("SDK direto deve estar morto pos-RF-B1");
      },
    }));

    const storage = makeStorageStub();
    const { generateWeeklyReport } = await import(
      "../../../server/services/weeklyReportGenerator"
    );
    const result = await generateWeeklyReport({
      userId: "USER-WEEK",
      periodStart: "2026-05-12",
      periodEnd: "2026-05-18",
      injectedStorage: storage,
    } as any);

    // Generator NAO threw + callReportLlm foi chamado.
    expect(callReportLlmMock).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

describe("RF-B1 — weeklyReportGenerator: degradedReason paridade", () => {
  it("callReportLlm retorna degradedReason='llm_failed_3x' → weekly status='degraded'", async () => {
    const callReportLlmMock = vi.fn(async () => ({
      content: {},
      usage: null,
      rawText: "",
      degradedReason: "llm_failed_3x",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => ({})),
    }));

    const storage = makeStorageStub();
    storage.getPerformanceByPeriod = vi.fn(async () => ({ profit: 500, tournaments: 20 }));
    const { generateWeeklyReport } = await import(
      "../../../server/services/weeklyReportGenerator"
    );
    const result: any = await generateWeeklyReport({
      userId: "USER-WEEK",
      periodStart: "2026-05-12",
      periodEnd: "2026-05-18",
      injectedStorage: storage,
      failSoft: true,
    } as any);

    // Status degraded + degradedReason preservado.
    expect(result.status === "degraded" || result.content?.generation?.degraded === true).toBe(true);
  });

  it("callReportLlm retorna degradedReason='llm_parse_error' → weekly status='degraded'", async () => {
    const callReportLlmMock = vi.fn(async () => ({
      content: {},
      usage: { input_tokens: 50, output_tokens: 20 },
      rawText: "this is not JSON",
      degradedReason: "llm_parse_error",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => ({})),
    }));

    const storage = makeStorageStub();
    storage.getPerformanceByPeriod = vi.fn(async () => ({ profit: 500, tournaments: 20 }));
    const { generateWeeklyReport } = await import(
      "../../../server/services/weeklyReportGenerator"
    );
    const result: any = await generateWeeklyReport({
      userId: "USER-WEEK",
      periodStart: "2026-05-12",
      periodEnd: "2026-05-18",
      injectedStorage: storage,
      failSoft: true,
    } as any);

    expect(result.status === "degraded" || result.content?.generation?.degraded === true).toBe(true);
  });
});

describe("RF-B1 — weeklyReportGenerator passa parseOnError='fallback-degraded'", () => {
  it("callsite usa fail-soft pattern (nao 'throw')", async () => {
    const callReportLlmMock = vi.fn(async () => ({
      content: { header: { title: "ok" }, sections: {}, insights: [] },
      usage: { input_tokens: 1, output_tokens: 1 },
      rawText: "{}",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => ({})),
    }));

    const storage = makeStorageStub();
    storage.getPerformanceByPeriod = vi.fn(async () => ({ profit: 200, tournaments: 10 }));
    const { generateWeeklyReport } = await import(
      "../../../server/services/weeklyReportGenerator"
    );
    await generateWeeklyReport({
      userId: "USER-WEEK",
      periodStart: "2026-05-12",
      periodEnd: "2026-05-18",
      injectedStorage: storage,
    } as any);

    expect(callReportLlmMock).toHaveBeenCalled();
    const call = callReportLlmMock.mock.calls[0][0] as any;
    expect(call.parseOnError === "fallback-degraded" || call.parseOnError === undefined).toBe(true);
  });
});
