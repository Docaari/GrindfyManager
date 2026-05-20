// =============================================================================
// Sprint AI-2B / RF-08 (ADR-173 §Q-H) — DEFLECTION_RULE_REGULATORY + FINANCIAL_CAVEAT_RULE
//
// Cobre:
//   - Regra "Quando user perguntar sobre IRPF/tax/regulamentação/staking/contrato/lei
//     → defletir: 'Não opino sobre isso — consulte profissional especializado'".
//   - Regra "outputs com $/profit/banca → adicionar 'Conteúdo informativo — não garante retorno futuro'".
//   - Constantes exportadas de server/coachSystemBuilder ou server/coach/disclaimers.
//   - GRINDFY_AI_BASE STATIC inclui as 2 regras.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";

beforeEach(async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
});

describe("DEFLECTION_RULE_REGULATORY — regra de deflexão IRPF/tax", () => {
  it("constante exportada", async () => {
    const mod: any = await import("../../../../server/coach/disclaimers");
    expect(mod.DEFLECTION_RULE_REGULATORY).toBeTruthy();
    expect(typeof mod.DEFLECTION_RULE_REGULATORY).toBe("string");
  });

  it("menciona IRPF/tax/regulamentação/staking/contrato/lei", async () => {
    const mod: any = await import("../../../../server/coach/disclaimers");
    const rule = mod.DEFLECTION_RULE_REGULATORY;
    expect(rule).toMatch(/IRPF/i);
    expect(rule).toMatch(/tax|fisco|imposto/i);
    expect(rule).toMatch(/staking|contrato/i);
  });

  it("instrui defletir + sugerir profissional", async () => {
    const mod: any = await import("../../../../server/coach/disclaimers");
    const rule = mod.DEFLECTION_RULE_REGULATORY;
    expect(rule).toMatch(/defletir|deflete|n[aã]o opino|n[aã]o opin/i);
    expect(rule).toMatch(/contador|advogado|profissional/i);
  });
});

describe("FINANCIAL_CAVEAT_RULE — regra de disclaimer financeiro", () => {
  it("constante exportada", async () => {
    const mod: any = await import("../../../../server/coach/disclaimers");
    expect(mod.FINANCIAL_CAVEAT_RULE).toBeTruthy();
  });

  it("menciona 'informativo' + 'não garante retorno'", async () => {
    const mod: any = await import("../../../../server/coach/disclaimers");
    expect(mod.FINANCIAL_CAVEAT_RULE).toMatch(/informativo/i);
    expect(mod.FINANCIAL_CAVEAT_RULE).toMatch(/garante|garantia|retorno/i);
  });
});

describe("GRINDFY_AI_BASE — inclui as 2 regras", () => {
  it("STATIC contém DEFLECTION_RULE_REGULATORY content", async () => {
    const mod: any = await import("../../../../server/coachSystemBuilder");
    const base = mod.GRINDFY_AI_BASE ?? mod.buildSystemPromptStatic?.();
    const baseText = typeof base === "string" ? base : JSON.stringify(base);
    expect(baseText).toMatch(/IRPF/i);
    expect(baseText).toMatch(/staking|contrato|regulament/i);
  });
});
