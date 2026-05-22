// =============================================================================
// Sprint AI-3.2 / RF-A2 (ADR-203)
//
// `isValidConfidence` type-guard shared (4 generators convergem).
// Localizacao escolhida pelo ADR-203: ampliar `server/services/cgameAggregator.ts`
// exportando `CGAME_CONFIDENCE_VALUES` const + `isValidConfidence(value)` guard.
//
// Status esperado: TODOS FALHAM (helper ainda nao exportado).
// =============================================================================

import { describe, it, expect } from "vitest";

describe("RF-A2 — cgameAggregator: exporta CGAME_CONFIDENCE_VALUES", () => {
  it("exporta const com ['high','medium','low']", async () => {
    const mod: any = await import("../../../server/services/cgameAggregator");
    expect(Array.isArray(mod.CGAME_CONFIDENCE_VALUES)).toBe(true);
    expect(mod.CGAME_CONFIDENCE_VALUES).toContain("high");
    expect(mod.CGAME_CONFIDENCE_VALUES).toContain("medium");
    expect(mod.CGAME_CONFIDENCE_VALUES).toContain("low");
    expect(mod.CGAME_CONFIDENCE_VALUES.length).toBe(3);
  });
});

describe("RF-A2 — isValidConfidence: valores validos", () => {
  it("'high' → true", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence("high")).toBe(true);
  });

  it("'medium' → true", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence("medium")).toBe(true);
  });

  it("'low' → true", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence("low")).toBe(true);
  });
});

describe("RF-A2 — isValidConfidence: valores invalidos → false", () => {
  it("'unknown' → false", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence("unknown")).toBe(false);
  });

  it("'HIGH' (case-sensitive) → false", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence("HIGH")).toBe(false);
  });

  it("undefined → false", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence(undefined)).toBe(false);
  });

  it("null → false", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence(null)).toBe(false);
  });

  it("number 1 → false (nao coerce)", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence(1)).toBe(false);
  });

  it("string vazia → false", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence("")).toBe(false);
  });

  it("object {} → false", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    expect(isValidConfidence({})).toBe(false);
  });
});

describe("RF-A2 — isValidConfidence: type-guard narrowing", () => {
  it("type-guard narrow para CgameConfidence apos check (smoke compile)", async () => {
    const { isValidConfidence } = await import("../../../server/services/cgameAggregator");
    const v: unknown = "high";
    if (isValidConfidence(v)) {
      // Apos guard: TS narrowing valida CgameConfidence ('high'|'medium'|'low').
      // Smoke runtime: chamada nao quebra + valor preservado.
      expect(["high", "medium", "low"]).toContain(v);
    } else {
      throw new Error("guard falhou em valor valido");
    }
  });
});
