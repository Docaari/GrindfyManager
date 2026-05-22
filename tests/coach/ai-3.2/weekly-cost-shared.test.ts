// =============================================================================
// Sprint AI-3.2 / RF-B3 (ADR-203)
//
// `weeklyReportGenerator` cost calc inline → `computeReportCost(usage, 'sonnet46')`.
// Verifica que `weeklyReportGenerator.ts` NAO tem rates hardcoded (`3.00`, `15.00`,
// `* 3`, etc) — todos delegam para `server/coach/reportCost.ts`.
//
// Status esperado: FALHA enquanto cost calc inline existir.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "sk-test-rfb3";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("RF-B3 — weeklyReportGenerator usa computeReportCost (sem hardcoded rates)", () => {
  it("grep: weeklyReportGenerator.ts NAO contem '0.000003' (rate Sonnet input hardcoded)", async () => {
    const filePath = path.resolve(__dirname, "../../../server/services/weeklyReportGenerator.ts");
    const src = await fs.readFile(filePath, "utf-8");
    expect(src).not.toMatch(/0\.000003/);
  });

  it("grep: weeklyReportGenerator.ts NAO contem '0.000015' (rate Sonnet output hardcoded)", async () => {
    const filePath = path.resolve(__dirname, "../../../server/services/weeklyReportGenerator.ts");
    const src = await fs.readFile(filePath, "utf-8");
    expect(src).not.toMatch(/0\.000015/);
  });

  it("grep: weeklyReportGenerator.ts importa computeReportCost de reportCost", async () => {
    const filePath = path.resolve(__dirname, "../../../server/services/weeklyReportGenerator.ts");
    const src = await fs.readFile(filePath, "utf-8");
    expect(src).toMatch(/computeReportCost/);
  });
});

describe("RF-B3 — paridade computeReportCost", () => {
  it("computeReportCost(usage, 'sonnet46') produz valor identico pre vs pos refactor (tolerance 1e-6)", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const usage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 100,
    };
    const cost = computeReportCost(usage, "sonnet46");
    // Sonnet 4.6: 3/15/0.3/3.75 USD per 1M tokens
    // (1000*3 + 500*15 + 200*0.3 + 100*3.75) / 1e6 = 10935/1e6 = 0.010935
    expect(cost).toBeCloseTo(0.010935, 6);
  });

  it("computeReportCost default ratecard eh 'sonnet46'", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const usage = { input_tokens: 1000, output_tokens: 500 };
    const defaultCost = computeReportCost(usage);
    const explicitCost = computeReportCost(usage, "sonnet46");
    expect(defaultCost).toBe(explicitCost);
  });
});
