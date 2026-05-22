// =============================================================================
// Sprint AI-3.2 / RF-A1 (ADR-203 + ADR-204)
//
// `shared/numCoerce.ts` — `coerceFiniteNumber(value, fallback=0)` finite-coerce
// helper compartilhado (6 callsites convergem). Aceita `unknown`; NAO coerce
// string automaticamente; lesson #11 (default minimo, sem throw).
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

import { describe, it, expect } from "vitest";

describe("RF-A1 — shared/numCoerce: coerceFiniteNumber happy path", () => {
  it("retorna value quando finite (positivo)", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(42)).toBe(42);
  });

  it("retorna 0 quando value=0 (NAO confunde com fallback default)", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(0)).toBe(0);
  });

  it("retorna value quando finite (negativo)", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(-3.14)).toBe(-3.14);
  });

  it("retorna value quando finite (MAX_SAFE_INTEGER)", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("RF-A1 — coerceFiniteNumber: non-finite numbers → fallback default 0", () => {
  it("NaN → 0", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(NaN)).toBe(0);
  });

  it("Infinity → 0", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(Infinity)).toBe(0);
  });

  it("-Infinity → 0", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(-Infinity)).toBe(0);
  });
});

describe("RF-A1 — coerceFiniteNumber: non-numeric → fallback", () => {
  it("string numerica '42' → fallback (sem coerce automatico)", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber("42")).toBe(0);
  });

  it("string vazia → fallback", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber("")).toBe(0);
  });

  it("null → fallback", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(null)).toBe(0);
  });

  it("undefined → fallback", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(undefined)).toBe(0);
  });

  it("object {} → fallback", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber({})).toBe(0);
  });

  it("array [] → fallback", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber([])).toBe(0);
  });

  it("boolean true → fallback (boolean nao eh number finite)", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(true)).toBe(0);
  });
});

describe("RF-A1 — coerceFiniteNumber: custom fallback respeitado", () => {
  it("NaN com fallback=-1 → -1", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(NaN, -1)).toBe(-1);
  });

  it("undefined com fallback=100 → 100", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber(undefined, 100)).toBe(100);
  });

  it("string com fallback positivo → fallback", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    expect(coerceFiniteNumber("not a number", 999)).toBe(999);
  });
});

describe("RF-A1 — coerceFiniteNumber: edge BigInt", () => {
  it("BigInt → fallback (BigInt nao eh finite Number em JS)", async () => {
    const { coerceFiniteNumber } = await import("../../../shared/numCoerce");
    // Number.isFinite(BigInt(42)) === false em JS — documentado no ADR-204.
    expect(coerceFiniteNumber(BigInt(42) as any)).toBe(0);
  });
});
