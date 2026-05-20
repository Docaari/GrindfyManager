// =============================================================================
// Sprint AI-2B / RF-09 (ADR-173) — disclaimer regulatório no STATIC do prompt + ReportView footer + getMentalHandHistoryRecent context block
//
// Cobre:
//   - GRINDFY_AI_BASE contém REPORT_DISCLAIMER no STATIC.
//   - REPORT_DISCLAIMER constante exportada de server/coach/disclaimers.ts.
//   - Texto canônico contém keywords: "informativo", "contador", "consulte profissional".
//   - Frontend ReportView renderiza disclaimer (smoke).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";

beforeEach(async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
});

describe("REPORT_DISCLAIMER — texto canônico", () => {
  it("constante exportada de server/coach/disclaimers", async () => {
    const mod: any = await import("../../../../server/coach/disclaimers");
    expect(mod.REPORT_DISCLAIMER).toBeTruthy();
    expect(typeof mod.REPORT_DISCLAIMER).toBe("string");
    expect(mod.REPORT_DISCLAIMER.length).toBeGreaterThan(100);
  });

  it("contém keywords obrigatórias (informativo + contador + profissional)", async () => {
    const { REPORT_DISCLAIMER } = await import(
      "../../../../server/coach/disclaimers"
    );
    expect(REPORT_DISCLAIMER).toMatch(/informativo/i);
    expect(REPORT_DISCLAIMER).toMatch(/contador|profissional/i);
    expect(REPORT_DISCLAIMER).toMatch(/n[aã]o.*aconselhamento|n[aã]o.*advisor|n[aã]o.*substitui/i);
  });

  it("menciona 'resultados passados' / 'jogue com responsabilidade'", async () => {
    const { REPORT_DISCLAIMER } = await import(
      "../../../../server/coach/disclaimers"
    );
    expect(REPORT_DISCLAIMER).toMatch(/resultados passados|garantia|garante|jogue com responsabilidade/i);
  });
});

describe("GRINDFY_AI_BASE — disclaimer presente no STATIC", () => {
  it("snapshot inclui keywords do disclaimer", async () => {
    const mod: any = await import("../../../../server/coachSystemBuilder");
    const base = mod.GRINDFY_AI_BASE ?? mod.buildSystemPromptStatic?.();
    expect(base).toBeTruthy();
    const baseText = typeof base === "string" ? base : JSON.stringify(base);
    expect(baseText).toMatch(/informativo|contador|disclaimer|consulte profissional/i);
  });
});
