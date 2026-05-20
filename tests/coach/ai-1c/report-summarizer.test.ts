// =============================================================================
// Sprint AI-1C / RF-07 — smoke tests para reportSummarizer.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_THRESHOLD = process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS;
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_THRESHOLD === undefined) delete process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS;
  else process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = ORIGINAL_THRESHOLD;
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("maybeSummarizeBundle — threshold", () => {
  it("bundle pequeno (abaixo do threshold) -> no-op, summarizerModelUsed=null", async () => {
    process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = "20000";
    const { maybeSummarizeBundle } = await import("../../../server/services/reportSummarizer");
    const bundle = { foo: "bar", n: 42 };
    const out = await maybeSummarizeBundle(bundle);
    expect(out.summarizerModelUsed).toBeNull();
    expect(out.summarizedChars).toBeNull();
    expect(out.bundle).toBe(bundle);
    expect(out.originalChars).toBe(JSON.stringify(bundle).length);
  });

  it("bundle grande sem ANTHROPIC_API_KEY -> safe-deny (retorna original)", async () => {
    process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = "10";
    delete process.env.ANTHROPIC_API_KEY;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Mock SDK pra forcar client unavailable.
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const { maybeSummarizeBundle } = await import("../../../server/services/reportSummarizer");
    const bundle = { data: "x".repeat(100), more: { nested: true } };
    const out = await maybeSummarizeBundle(bundle);
    expect(out.summarizerModelUsed).toBeNull();
    expect(out.bundle).toBe(bundle); // original retornado
    errSpy.mockRestore();
  });

  it("bundle grande + LLM disponivel -> sumariza, summarizerModelUsed nao-null", async () => {
    process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = "10";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const createMock = vi.fn(async () => ({
      content: [{ type: "text", text: '{"summarized":true,"keepNumbers":1}' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    }));
    function FakeAnthropic(this: any) {
      this.messages = { create: createMock };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));
    const { maybeSummarizeBundle } = await import("../../../server/services/reportSummarizer");
    const bundle = { tournaments: Array.from({ length: 50 }, (_, i) => ({ id: i })) };
    const out = await maybeSummarizeBundle(bundle);
    expect(out.summarizerModelUsed).toBeTruthy();
    expect(out.bundle).toEqual({ summarized: true, keepNumbers: 1 });
    expect(createMock).toHaveBeenCalledOnce();
  });

  it("LLM lanca erro -> safe-deny, bundle original retornado", async () => {
    process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = "10";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    function FakeAnthropic(this: any) {
      this.messages = { create: vi.fn(async () => { throw new Error("LLM down"); }) };
    }
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic as any }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { maybeSummarizeBundle } = await import("../../../server/services/reportSummarizer");
    const bundle = { lots: "of data".repeat(20) };
    const out = await maybeSummarizeBundle(bundle);
    expect(out.summarizerModelUsed).toBeNull();
    expect(out.bundle).toBe(bundle);
    errSpy.mockRestore();
  });
});
