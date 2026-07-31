/**
 * Tests for shared/library-grouping-dims.ts (Sprint torneios-custom-families — Fase 1).
 *
 * Define o vocabulario de dimensoes de agrupamento (GroupDim), a ordem canonica
 * (CANONICAL_DIM_ORDER) e a receita default (DEFAULT_RECIPE = as 6 dims atuais,
 * SEM dayOfWeek — preserva byte-compat com a familyKey legada).
 *
 * RED PHASE: shared/library-grouping-dims.ts ainda nao existe.
 *
 * .test.ts roda no projeto "server" (node).
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error - modulo ainda nao existe (red phase)
import {
  CANONICAL_DIM_ORDER,
  DEFAULT_RECIPE,
} from "../../../shared/library-grouping-dims";

const ALL_DIMS = [
  "site",
  "abi",
  "type",
  "speed",
  "fieldBucket",
  "timeBin",
  "dayOfWeek",
] as const;

describe("CANONICAL_DIM_ORDER — vocabulario completo + ordem", () => {
  it("contem cada dimensao individualmente (membership, lesson #8)", () => {
    for (const dim of ALL_DIMS) {
      expect(CANONICAL_DIM_ORDER).toContain(dim);
    }
  });

  it("ordem canonica = site, abi, type, speed, fieldBucket, timeBin, dayOfWeek", () => {
    expect(CANONICAL_DIM_ORDER).toEqual([
      "site",
      "abi",
      "type",
      "speed",
      "fieldBucket",
      "timeBin",
      "dayOfWeek",
    ]);
  });

  it("dayOfWeek e a ULTIMA dimensao na ordem canonica", () => {
    expect(CANONICAL_DIM_ORDER[CANONICAL_DIM_ORDER.length - 1]).toBe("dayOfWeek");
  });

  it("nao tem dimensoes duplicadas", () => {
    expect(new Set(CANONICAL_DIM_ORDER).size).toBe(CANONICAL_DIM_ORDER.length);
  });
});

describe("DEFAULT_RECIPE — as 6 dims atuais, SEM dayOfWeek", () => {
  it("contem exatamente as 6 dims legadas individualmente (membership)", () => {
    for (const dim of ["site", "abi", "type", "speed", "fieldBucket", "timeBin"]) {
      expect(DEFAULT_RECIPE).toContain(dim);
    }
  });

  it("NAO inclui dayOfWeek (preserva byte-compat com familyKey legada)", () => {
    expect(DEFAULT_RECIPE).not.toContain("dayOfWeek");
  });

  it("e os primeiros 6 de CANONICAL_DIM_ORDER, na mesma ordem", () => {
    expect(DEFAULT_RECIPE).toEqual(CANONICAL_DIM_ORDER.slice(0, 6));
  });
});
