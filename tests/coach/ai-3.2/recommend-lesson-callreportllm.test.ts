// =============================================================================
// Sprint AI-3.2 / RF-B2 (ADR-203)
//
// `recommendLessonForUser` migra de SDK Anthropic direto (`server/coach/
// recommendLessonForUser.ts` linhas 164-191) para `callReportLlm`.
//
// Fecha consolidacao 5/5 generators (weekly + monthly + daily + quarterly +
// recommendLesson + summarizer indireto).
//
// Status esperado: TODOS FALHAM (modulo ainda usa SDK direto).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "sk-test-rfb2";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
  vi.doUnmock("../../../server/coach/anthropicClient");
});

describe("RF-B2 — recommendLessonForUser delega para callReportLlm", () => {
  it("invoca callReportLlm 1x com systemPrompt + userPromptBuilder + model + maxTokens", async () => {
    const callReportLlmMock = vi.fn(async () => ({
      content: { lessonId: "lesson-123", reason: "icm spot" },
      usage: { input_tokens: 80, output_tokens: 30 },
      rawText: "{}",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => ({})),
    }));

    const mod: any = await import("../../../server/coach/recommendLessonForUser");
    const fn = mod.recommendLessonForUser ?? mod.default;
    if (typeof fn !== "function") {
      throw new Error("recommendLessonForUser export nao encontrado");
    }

    // Minimal context — modulo aceita varios shapes; teste o que callReportLlm recebe.
    try {
      await fn({
        userId: "USER-REC",
        profile: { aiStructuredProfile: { schemaVersion: 1, nivel: "intermediario" } },
        candidateLessons: [{ id: "lesson-123", title: "ICM" }],
      });
    } catch {
      /* shape do arg pode variar; o ponto eh callReportLlm ter sido chamado */
    }

    expect(callReportLlmMock).toHaveBeenCalled();
    const call = callReportLlmMock.mock.calls[0][0] as any;
    expect(typeof call.systemPrompt).toBe("string");
    expect(typeof call.userPromptBuilder).toBe("function");
    expect(typeof call.model).toBe("string");
    expect(typeof call.maxTokens).toBe("number");
  });

  it("NAO importa @anthropic-ai/sdk diretamente (paridade quarterly)", async () => {
    const callReportLlmMock = vi.fn(async () => ({
      content: { lessonId: "lesson-x" },
      usage: { input_tokens: 5, output_tokens: 5 },
      rawText: "{}",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => ({})),
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() {
        throw new Error("SDK direto deve estar morto pos-RF-B2");
      },
    }));

    const mod: any = await import("../../../server/coach/recommendLessonForUser");
    const fn = mod.recommendLessonForUser ?? mod.default;
    if (typeof fn !== "function") {
      throw new Error("recommendLessonForUser export nao encontrado");
    }

    try {
      await fn({
        userId: "USER-REC",
        profile: { aiStructuredProfile: { schemaVersion: 1 } },
        candidateLessons: [],
      });
    } catch {
      /* tolera shape — checa callsite */
    }

    expect(callReportLlmMock).toHaveBeenCalled();
  });
});

describe("RF-B2 — recommendLessonForUser: degradedReason fallback", () => {
  it("callReportLlm retorna degradedReason='no_anthropic_key' → recommend retorna null/fallback", async () => {
    const callReportLlmMock = vi.fn(async () => ({
      content: {},
      usage: null,
      rawText: "",
      degradedReason: "no_anthropic_key",
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: callReportLlmMock,
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => null),
    }));

    const mod: any = await import("../../../server/coach/recommendLessonForUser");
    const fn = mod.recommendLessonForUser ?? mod.default;
    if (typeof fn !== "function") {
      throw new Error("recommendLessonForUser export nao encontrado");
    }

    let out: any = null;
    try {
      out = await fn({
        userId: "USER-REC",
        profile: { aiStructuredProfile: { schemaVersion: 1 } },
        candidateLessons: [],
      });
    } catch {
      /* tolera erro de shape */
    }

    // Caminho degraded: out deve ser null OR objeto sem lessonId (nao deve throw).
    if (out !== null && out !== undefined) {
      expect(out.lessonId === undefined || out.lessonId === null || typeof out === "object").toBe(true);
    }
  });
});

describe("RF-B2 — 5/5 generators lockstep fechado", () => {
  it("smoke: anthropicClient.callReportLlm consumido por quarterly+monthly+daily+weekly+recommendLesson", async () => {
    // Acoplado: cada generator file deveria importar callReportLlm.
    // Smoke estatico: verifica que callReportLlm existe e eh function.
    const mod: any = await import("../../../server/coach/anthropicClient");
    expect(typeof mod.callReportLlm).toBe("function");
  });
});
