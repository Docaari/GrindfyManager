// =============================================================================
// Sprint AI-3.2 / RF-C10 / Q15 (ADR-203)
//
// `CallReportLlmResult.degradedResult` ganha `rawText?: string` opcional.
// Em parse error, log inclui rawText (truncado a 500 chars) para debug.
// Lesson #9 ampliada — log inclui rawText.
//
// O modulo `anthropicClient.ts` JA retorna `rawText` na shape de
// `CallReportLlmResult`. RF-C10 garante que o LOG inclui rawText em parse error.
//
// Status esperado: FALHA enquanto log de `anthropicClient.before_fallback`
// com reason='llm_parse_error' nao incluir rawText no payload.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "sk-test-q15";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("RF-C10 — rawText preservado em parse error", () => {
  it("CallReportLlmResult retorna rawText quando parse falha (existing AI-3.1)", async () => {
    const RAW = "this is NOT valid JSON — apenas texto livre";
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => ({
          content: [{ type: "text", text: RAW }],
          usage: { input_tokens: 10, output_tokens: 10 },
        })),
      };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const { callReportLlm } = await import("../../../server/coach/anthropicClient");
    const out = await callReportLlm({
      systemPrompt: "sys",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6-20250109",
      bundle: {},
      maxTokens: 100,
      parseOnError: "fallback-degraded",
    });

    expect(out.degradedReason).toBe("llm_parse_error");
    expect(out.rawText).toBe(RAW);
  });
});

describe("RF-C10 — log lesson #9 inclui rawText (truncado) em parse error", () => {
  it("console.warn 'anthropicClient.before_fallback' com reason='llm_parse_error' inclui rawText no payload", async () => {
    const RAW = "garbage output from LLM that is not JSON — debugging hint";
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => ({
          content: [{ type: "text", text: RAW }],
          usage: { input_tokens: 10, output_tokens: 10 },
        })),
      };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { callReportLlm } = await import("../../../server/coach/anthropicClient");
    await callReportLlm({
      systemPrompt: "sys",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6-20250109",
      bundle: {},
      maxTokens: 100,
      parseOnError: "fallback-degraded",
    });

    const parseErrorCalls = warnSpy.mock.calls.filter((c) => {
      const tag = String(c[0] ?? "");
      const payload = c[1];
      if (!tag.includes("anthropicClient.before_fallback")) return false;
      const reason = payload && typeof payload === "object" ? (payload as any).reason : null;
      return reason === "llm_parse_error";
    });
    expect(parseErrorCalls.length).toBeGreaterThan(0);
    // Payload deve incluir rawText (pode estar truncado a 500 chars).
    const payload = parseErrorCalls[0][1] as any;
    expect(typeof payload.rawText).toBe("string");
    expect(payload.rawText.length).toBeGreaterThan(0);
    // Substring do raw (caso truncado).
    expect(RAW).toContain(payload.rawText.slice(0, Math.min(50, payload.rawText.length)));
  });

  it("rawText truncado a max 500 chars no log (defesa contra log gigante)", async () => {
    const RAW = "x".repeat(2000); // 2000 chars.
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => ({
          content: [{ type: "text", text: RAW }],
          usage: null,
        })),
      };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { callReportLlm } = await import("../../../server/coach/anthropicClient");
    await callReportLlm({
      systemPrompt: "sys",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6-20250109",
      bundle: {},
      maxTokens: 100,
      parseOnError: "fallback-degraded",
    });

    const parseErrorCalls = warnSpy.mock.calls.filter((c) => {
      const tag = String(c[0] ?? "");
      const payload = c[1];
      if (!tag.includes("anthropicClient.before_fallback")) return false;
      const reason = payload && typeof payload === "object" ? (payload as any).reason : null;
      return reason === "llm_parse_error";
    });
    expect(parseErrorCalls.length).toBeGreaterThan(0);
    const payload = parseErrorCalls[0][1] as any;
    // Truncado a 500 chars max.
    expect(payload.rawText.length).toBeLessThanOrEqual(500);
  });
});
