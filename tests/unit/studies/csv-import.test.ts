// =============================================================================
// Sprint Stats-V2 — CSV import parser (RF-05)
//
// Red phase. Modulo `client/src/lib/snapshot-import-parser.ts` ainda nao existe.
//
// Funcao `parseCsvSnapshot(csvText: string)` em mesmo arquivo lib.
// - Header row 'stat,value' opcional.
// - Sem header: assume mesma ordem (stat, value).
// - Suporte a BOM, decimal separator (PT-BR `,` => `.`).
// - Valores fora 0-100 (em stats pct) emitem warning mas matcham.
// =============================================================================

import { describe, it, expect } from "vitest";
import { parseCsvSnapshot } from "../../../client/src/lib/snapshot-import-parser";

describe("parseCsvSnapshot() — basic", () => {
  it("aceita CSV com header 'stat,value'", () => {
    const csv = "stat,value\nvpip,22.5\npfr,18.0";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });

  it("aceita CSV sem header", () => {
    const csv = "vpip,22.5\npfr,18.0";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });

  it("retorna shape { matched, unmatched, invalid }", () => {
    const result = parseCsvSnapshot("vpip,22.5");
    expect(result).toHaveProperty("matched");
    expect(result).toHaveProperty("unmatched");
    expect(result).toHaveProperty("invalid");
  });
});

describe("parseCsvSnapshot() — encoding/format edges", () => {
  it("strip de BOM (UTF-8 BOM \\uFEFF) em primeira linha", () => {
    const csv = "﻿stat,value\nvpip,22.5";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(22.5);
  });

  it("decimal PT-BR (vpip,28,5) eh convertido para 28.5", () => {
    const csv = "vpip,28,5";
    const result = parseCsvSnapshot(csv);
    // Aceita 2 leituras: 28.5 (PT-BR resolved) ou unmatched/invalid se ambiguo;
    // espec exige conversao PT-BR.
    expect(result.matched.vpip).toBe(28.5);
  });

  it("decimal padrao (vpip,28.5) preservado", () => {
    const csv = "vpip,28.5";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(28.5);
  });

  it("matching case-insensitive (igual ao paste parser)", () => {
    const csv = "VPIP,22.5\nPFR,18.0";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });
});

describe("parseCsvSnapshot() — out-of-range warning", () => {
  it("valor fora 0-100 em stat pct vai pra invalid OU emite warning", () => {
    // VPIP eh pct (0-100). 150 eh impossivel.
    const csv = "vpip,150";
    const result = parseCsvSnapshot(csv);
    // Ou invalid OU matched mas com warning explicito.
    const isInvalid = result.invalid.some(
      (i) => i.rawName.toLowerCase() === "vpip",
    );
    const isWarned = (result as any).warnings?.some?.(
      (w: any) => w.id === "vpip" || w.rawName?.toLowerCase() === "vpip",
    );
    expect(isInvalid || isWarned).toBe(true);
  });

  it("valor 0 eh aceito (boundary)", () => {
    const csv = "vpip,0";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(0);
  });

  it("valor 100 eh aceito (boundary)", () => {
    const csv = "vpip,100";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(100);
  });
});

describe("parseCsvSnapshot() — empty/edge", () => {
  it("CSV vazio retorna shape vazio sem erro", () => {
    const result = parseCsvSnapshot("");
    expect(result.matched).toEqual({});
    expect(result.unmatched).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it("ignora linhas com apenas separador", () => {
    const csv = "vpip,22.5\n,\npfr,18.0";
    const result = parseCsvSnapshot(csv);
    expect(result.matched.vpip).toBe(22.5);
    expect(result.matched.pfr).toBe(18.0);
  });
});
