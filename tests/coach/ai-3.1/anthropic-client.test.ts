// =============================================================================
// Sprint AI-3.1 / RF-06 — server/coach/anthropicClient.ts unit tests
//
// A1-H2/H3 do reviewer AI-3: 5 generators duplicam lazy SDK import +
// new AnthropicCtor try/catch + messages.create + JSON parse + log #9.
// Extract para `server/coach/anthropicClient.ts` consolidando o pattern.
//
// API esperada:
//   - WHITELISTED_TONES: ['neutro','incisivo','gentil'] as const
//   - WHITELISTED_LEVELS: ['iniciante','intermediario','avancado'] as const
//   - getAnthropicClient(injected?): Promise<any|null>
//       lazy import + new AnthropicCtor try/catch factory fallback (#5/#35)
//       retorna null se sem ANTHROPIC_API_KEY OR SDK ausente
//   - callReportLlm(input): Promise<CallReportLlmResult>
//       valida tone/level síncrono (throw)
//       retry 3x exponencial (100/400/1600 ms) em 429/500/network
//       parseOnError: 'fallback-degraded' | 'throw'
//       loga 'anthropicClient.before_fallback' antes de cada fallback (#9)
//       discriminated degradedReason: 'no_anthropic_key' | 'llm_failed_3x' | 'llm_parse_error'
//
// Status esperado: TODOS FALHAM (modulo ainda nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("RF-06 — anthropicClient: WHITELISTS exportadas", () => {
  it("exporta WHITELISTED_TONES com ['neutro','incisivo','gentil']", async () => {
    const mod: any = await import("../../../server/coach/anthropicClient");
    expect(Array.isArray(mod.WHITELISTED_TONES)).toBe(true);
    expect(mod.WHITELISTED_TONES).toContain("neutro");
    expect(mod.WHITELISTED_TONES).toContain("incisivo");
    expect(mod.WHITELISTED_TONES).toContain("gentil");
  });

  it("exporta WHITELISTED_LEVELS com ['iniciante','intermediario','avancado']", async () => {
    const mod: any = await import("../../../server/coach/anthropicClient");
    expect(Array.isArray(mod.WHITELISTED_LEVELS)).toBe(true);
    expect(mod.WHITELISTED_LEVELS).toContain("iniciante");
    expect(mod.WHITELISTED_LEVELS).toContain("intermediario");
    expect(mod.WHITELISTED_LEVELS).toContain("avancado");
  });
});

describe("RF-06 — getAnthropicClient: null fallback path", () => {
  it("sem ANTHROPIC_API_KEY → retorna null", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const mod: any = await import("../../../server/coach/anthropicClient");
    const client = await mod.getAnthropicClient();
    expect(client).toBeNull();
  });

  it("injection: getAnthropicClient(injected) retorna injected mesmo sem chave", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const mod: any = await import("../../../server/coach/anthropicClient");
    const injected = { messages: { create: vi.fn() } };
    const client = await mod.getAnthropicClient(injected);
    expect(client).toBe(injected);
  });

  it("`new AnthropicCtor` throw → fallback factory call (lesson #5/#35)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    // SDK que throw em `new` mas funciona como factory call.
    function FakeAnthropic(this: any) {
      if (new.target) throw new Error("strict mode: nao posso ser construtor");
      return { messages: { create: vi.fn() }, _fromFactory: true };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const mod: any = await import("../../../server/coach/anthropicClient");
    const client = await mod.getAnthropicClient();
    expect(client).not.toBeNull();
    expect(client._fromFactory).toBe(true);
  });
});

describe("RF-06 — callReportLlm: tone/level whitelist sync validation", () => {
  it("tone fora da whitelist → throw SINCRONO antes de chamar LLM", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const createMock = vi.fn();
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const mod: any = await import("../../../server/coach/anthropicClient");

    await expect(mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6",
      bundle: {},
      tone: "AGRESSIVO_INVALIDO",
      level: "iniciante",
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    })).rejects.toThrow();

    // LLM NAO foi chamado.
    expect(createMock).not.toHaveBeenCalled();
  });

  it("level fora da whitelist → throw SINCRONO", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const createMock = vi.fn();
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const mod: any = await import("../../../server/coach/anthropicClient");

    await expect(mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6",
      bundle: {},
      tone: "neutro",
      level: "EXPERT_INVALIDO",
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    })).rejects.toThrow();

    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("RF-06 — callReportLlm: degradedReason discriminated", () => {
  it("client null (sem chave) → degradedReason='no_anthropic_key'", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // SDK ausente.
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    const mod: any = await import("../../../server/coach/anthropicClient");
    const out: any = await mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6",
      bundle: {},
      tone: "neutro",
      level: "intermediario",
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });

    expect(out.degradedReason).toBe("no_anthropic_key");
    expect(out.content).toEqual({});
  });

  it("3x falhas 429 → degradedReason='llm_failed_3x' + log lesson #9", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const err429 = Object.assign(new Error("Rate limit"), { status: 429 });
    const createMock = vi.fn(async () => { throw err429; });
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mod: any = await import("../../../server/coach/anthropicClient");
    const out: any = await mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6",
      bundle: {},
      tone: "neutro",
      level: "intermediario",
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });

    expect(out.degradedReason).toBe("llm_failed_3x");
    expect(createMock).toHaveBeenCalledTimes(3);
    // Lesson #9: log antes do fallback.
    const warnStr = JSON.stringify(warnSpy.mock.calls);
    expect(warnStr).toMatch(/anthropicClient\.before_fallback/);
  });

  it("JSON malformado + parseOnError='fallback-degraded' → degradedReason='llm_parse_error'", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const createMock = vi.fn(async () => ({
      content: [{ type: "text", text: "this is NOT JSON at all just plain text" }],
      usage: { input_tokens: 50, output_tokens: 10 },
    }));
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mod: any = await import("../../../server/coach/anthropicClient");
    const out: any = await mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6",
      bundle: {},
      tone: "neutro",
      level: "intermediario",
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });

    expect(out.degradedReason).toBe("llm_parse_error");
    expect(out.content).toEqual({});
  });

  it("JSON malformado + parseOnError='throw' → propaga exception", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const createMock = vi.fn(async () => ({
      content: [{ type: "text", text: "garbage not json" }],
      usage: { input_tokens: 50, output_tokens: 10 },
    }));
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const mod: any = await import("../../../server/coach/anthropicClient");
    await expect(mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6",
      bundle: {},
      tone: "neutro",
      level: "intermediario",
      maxTokens: 1000,
      parseOnError: "throw",
    })).rejects.toThrow();
  });
});

describe("RF-06 — callReportLlm: happy path", () => {
  it("returns parsed content + usage + degradedReason undefined", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const createMock = vi.fn(async () => ({
      content: [{ type: "text", text: '{"summary":"All good","leaks":[]}' }],
      usage: { input_tokens: 1000, output_tokens: 200 },
    }));
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const mod: any = await import("../../../server/coach/anthropicClient");
    const out: any = await mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user prompt",
      model: "claude-sonnet-4-6",
      bundle: { foo: "bar" },
      tone: "neutro",
      level: "intermediario",
      maxTokens: 4000,
      parseOnError: "fallback-degraded",
    });

    expect(out.content).toEqual({ summary: "All good", leaks: [] });
    expect(out.usage.input_tokens).toBe(1000);
    expect(out.usage.output_tokens).toBe(200);
    expect(out.degradedReason).toBeUndefined();
    expect(typeof out.rawText).toBe("string");
  });

  it("userPromptBuilder recebe (bundle, {tone, level}) e produz user message", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const createMock = vi.fn(async (params: any) => ({
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    const builderSpy = vi.fn((bundle: any, opts: any) => {
      return `bundle=${JSON.stringify(bundle)}::tone=${opts.tone}::level=${opts.level}`;
    });

    const mod: any = await import("../../../server/coach/anthropicClient");
    await mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: builderSpy,
      model: "claude-sonnet-4-6",
      bundle: { x: 1 },
      tone: "incisivo",
      level: "avancado",
      maxTokens: 4000,
      parseOnError: "fallback-degraded",
    });

    expect(builderSpy).toHaveBeenCalledTimes(1);
    const [bundleArg, optsArg] = builderSpy.mock.calls[0];
    expect(bundleArg).toEqual({ x: 1 });
    expect(optsArg.tone).toBe("incisivo");
    expect(optsArg.level).toBe("avancado");

    // O message.create recebeu o user prompt construido.
    const createArgs = createMock.mock.calls[0][0] as any;
    const userMsg = createArgs.messages.find((m: any) => m.role === "user");
    expect(userMsg.content).toMatch(/tone=incisivo::level=avancado/);
  });

  it("retry 429 → 200 no 2o attempt → success com content parsed", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const err429 = Object.assign(new Error("Rate limit"), { status: 429 });
    let calls = 0;
    const createMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw err429;
      return {
        content: [{ type: "text", text: '{"recovered":true}' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    });
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const mod: any = await import("../../../server/coach/anthropicClient");
    const out: any = await mod.callReportLlm({
      systemPrompt: "system",
      userPromptBuilder: () => "user",
      model: "claude-sonnet-4-6",
      bundle: {},
      tone: "neutro",
      level: "intermediario",
      maxTokens: 1000,
      parseOnError: "fallback-degraded",
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(out.content.recovered).toBe(true);
    expect(out.degradedReason).toBeUndefined();
  });
});
