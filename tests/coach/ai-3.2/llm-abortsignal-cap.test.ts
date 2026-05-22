// =============================================================================
// Sprint AI-3.2 / RF-D6 (ADR-203 + ADR-205)
//
// `callReportLlm` ganha AbortSignal.timeout(cap) global. Default 60s, configurable
// via env COACH_LLM_TIMEOUT_MS. Novo degradedReason='llm_timeout' distingue
// Anthropic outage de retry exhaust.
//
// Worst-case wall-clock per-job ≤ 60s em incidente Anthropic.
//
// Status esperado: TODOS FALHAM (AbortSignal.timeout + llm_timeout reason ainda
// nao implementados em anthropicClient.ts).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_TIMEOUT = process.env.COACH_LLM_TIMEOUT_MS;

beforeEach(() => {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "sk-test-d6";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_TIMEOUT === undefined) delete process.env.COACH_LLM_TIMEOUT_MS;
  else process.env.COACH_LLM_TIMEOUT_MS = ORIGINAL_TIMEOUT;
  vi.restoreAllMocks();
});

describe("RF-D6 — AbortSignal cap: degradedReason='llm_timeout' adicionado", () => {
  it("CallReportLlmResult.degradedReason discriminated union inclui 'llm_timeout'", async () => {
    // Smoke runtime: simula timeout e verifica que degradedReason='llm_timeout'.
    process.env.COACH_LLM_TIMEOUT_MS = "50";
    process.env.ANTHROPIC_API_KEY = "sk-test";

    // SDK mock que sleep 5s (excede cap 50ms).
    // Pos-reviewer CRITICAL-1: `signal` vem no SEGUNDO arg (RequestOptions),
    // nao no body. Padrao paridade com o Anthropic SDK real.
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async (_body: any, options?: any) => {
          // Respeita signal — quando aborted, throw AbortError.
          if (options?.signal) {
            await new Promise((resolve, reject) => {
              options.signal.addEventListener("abort", () => {
                const err: any = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
              setTimeout(resolve, 5000);
            });
          } else {
            await new Promise((r) => setTimeout(r, 5000));
          }
          return { content: [{ type: "text", text: "{}" }], usage: null };
        }),
      };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const { callReportLlm } = await import("../../../server/coach/anthropicClient");
    const start = Date.now();
    const out = await callReportLlm({
      systemPrompt: "sys",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6-20250109",
      bundle: {},
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });
    const elapsed = Date.now() - start;

    expect(out.degradedReason).toBe("llm_timeout");
    // Cap dispara antes de 5s — wall-clock < 1000ms tolerance (cap=50ms + retry overhead).
    expect(elapsed).toBeLessThan(3000);
  });
});

describe("RF-D6 — COACH_LLM_TIMEOUT_MS env configurable", () => {
  it("env=100 + sleep 500ms → llm_timeout disparado dentro de ~200ms", async () => {
    process.env.COACH_LLM_TIMEOUT_MS = "100";

    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async (_body: any, options?: any) => {
          if (options?.signal) {
            await new Promise((resolve, reject) => {
              options.signal.addEventListener("abort", () => {
                const err: any = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
              setTimeout(resolve, 500);
            });
          }
          return { content: [{ type: "text", text: "{}" }], usage: null };
        }),
      };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const { callReportLlm } = await import("../../../server/coach/anthropicClient");
    const start = Date.now();
    const out = await callReportLlm({
      systemPrompt: "sys",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6-20250109",
      bundle: {},
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });
    const elapsed = Date.now() - start;

    expect(out.degradedReason).toBe("llm_timeout");
    expect(elapsed).toBeLessThan(450);
  });

  it("env invalido → fallback default 60000 (60s)", async () => {
    process.env.COACH_LLM_TIMEOUT_MS = "invalid";
    // Smoke: getAnthropicClient null path nao deve quebrar quando env invalido.
    // Aqui validamos que callReportLlm resolve com sucesso quando sem timeout.
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => ({
          content: [{ type: "text", text: '{"ok":true}' }],
          usage: { input_tokens: 5, output_tokens: 5 },
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
      maxTokens: 1000,
    });
    // env invalido → cai pra default 60s → resolve normal (mock retorna rapido).
    expect(out.degradedReason).toBeUndefined();
  });

  it("env=0 → fallback default 60000", async () => {
    process.env.COACH_LLM_TIMEOUT_MS = "0";
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => ({
          content: [{ type: "text", text: "{}" }],
          usage: null,
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
      maxTokens: 1000,
    });
    // env=0 invalido → default → resolve normal.
    expect(out.degradedReason).toBeUndefined();
  });

  it("env negativo → fallback default 60000", async () => {
    process.env.COACH_LLM_TIMEOUT_MS = "-1";
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => ({
          content: [{ type: "text", text: "{}" }],
          usage: null,
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
      maxTokens: 1000,
    });
    expect(out.degradedReason).toBeUndefined();
  });
});

describe("RF-D6 — happy path: cap NAO dispara em call rapida", () => {
  it("call resolve em <100ms + cap=60s default → degradedReason undefined", async () => {
    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => ({
          content: [{ type: "text", text: '{"narrative":"ok"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
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
      maxTokens: 1000,
    });
    expect(out.degradedReason).toBeUndefined();
    expect(out.content).toEqual({ narrative: "ok" });
  });
});

describe("RF-D6 — distincao llm_timeout vs llm_failed_3x", () => {
  it("retry exhaust (3× 500) com cap permissivo → llm_failed_3x (NAO llm_timeout)", async () => {
    process.env.COACH_LLM_TIMEOUT_MS = "60000"; // 60s permissivo.

    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async () => {
          const err: any = new Error("server error");
          err.status = 500;
          throw err;
        }),
      };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const { callReportLlm } = await import("../../../server/coach/anthropicClient");
    const out = await callReportLlm({
      systemPrompt: "sys",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6-20250109",
      bundle: {},
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });
    // Retry esgotou (3x 500) ANTES do cap — reason = llm_failed_3x.
    expect(out.degradedReason).toBe("llm_failed_3x");
  });
});

describe("RF-D6 — lesson #9 log antes do timeout fallback", () => {
  it("loga 'anthropicClient.before_fallback' com reason='timeout' quando cap dispara", async () => {
    process.env.COACH_LLM_TIMEOUT_MS = "50";

    function FakeAnthropic(this: any) {
      this.messages = {
        create: vi.fn(async (_body: any, options?: any) => {
          if (options?.signal) {
            await new Promise((resolve, reject) => {
              options.signal.addEventListener("abort", () => {
                const err: any = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
              setTimeout(resolve, 5000);
            });
          }
          return { content: [{ type: "text", text: "{}" }], usage: null };
        }),
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
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });

    // Lesson #9: ao menos UMA chamada warn com tag 'anthropicClient.before_fallback'
    // mencionando reason='timeout'.
    const timeoutCalls = warnSpy.mock.calls.filter((c) => {
      const tag = String(c[0] ?? "");
      const payload = c[1];
      if (!tag.includes("anthropicClient.before_fallback")) return false;
      const reason = payload && typeof payload === "object" ? (payload as any).reason : null;
      return reason === "timeout";
    });
    expect(timeoutCalls.length).toBeGreaterThan(0);
  });
});
