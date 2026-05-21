// =============================================================================
// Sprint AI-3 / RF-05.1 (ADR-174 §2.5) — shared/brTimezones.ts (regex BR canônico)
//
// Cobre:
//   - BR_TIMEZONE_REGEX bate exatamente os 16 América/* BR.
//   - isBrUser({country:'BR'}) true.
//   - isBrUser({timezone:'America/Sao_Paulo'}) true.
//   - isBrUser({timezone:'America/New_York'}) false.
//   - isBrUser(null|undefined) false.
//   - case-insensitive country (BR vs br).
//
// Status esperado: TODOS FALHAM (módulo não existe).
// =============================================================================

import { describe, it, expect } from "vitest";

const BR_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Maceio",
  "America/Araguaina",
  "America/Eirunepe",
  "America/Noronha",
  "America/Santarem",
];

describe("BR_TIMEZONE_REGEX (RF-05.1)", () => {
  it("bate todos os 16 timezones BR", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.BR_TIMEZONE_REGEX).toBeInstanceOf(RegExp);
    for (const tz of BR_TIMEZONES) {
      expect(mod.BR_TIMEZONE_REGEX.test(tz)).toBe(true);
    }
  });

  it("NÃO bate timezones não-BR (New_York, London, Tokyo)", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.BR_TIMEZONE_REGEX.test("America/New_York")).toBe(false);
    expect(mod.BR_TIMEZONE_REGEX.test("Europe/London")).toBe(false);
    expect(mod.BR_TIMEZONE_REGEX.test("Asia/Tokyo")).toBe(false);
    expect(mod.BR_TIMEZONE_REGEX.test("America/Buenos_Aires")).toBe(false);
    expect(mod.BR_TIMEZONE_REGEX.test("America/Argentina/Buenos_Aires")).toBe(false);
  });

  it("NÃO bate string vazia ou null", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.BR_TIMEZONE_REGEX.test("")).toBe(false);
  });
});

describe("isBrUser (RF-05.1)", () => {
  it("country='BR' → true", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser({ country: "BR" })).toBe(true);
  });

  it("country='br' (lowercase) → true (case-insensitive)", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser({ country: "br" })).toBe(true);
  });

  it("timezone='America/Sao_Paulo' sem country → true", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser({ timezone: "America/Sao_Paulo" })).toBe(true);
  });

  it("timezone='America/Recife' → true", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser({ timezone: "America/Recife" })).toBe(true);
  });

  it("country='US' + timezone='America/New_York' → false", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser({ country: "US", timezone: "America/New_York" })).toBe(false);
  });

  it("country='US' mas timezone='America/Sao_Paulo' → true (TZ é evidência suficiente)", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    // Brasileiro morando nos US declarando localização do servidor: BR
    expect(mod.isBrUser({ country: "US", timezone: "America/Sao_Paulo" })).toBe(true);
  });

  it("null → false (não throw)", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser(null)).toBe(false);
  });

  it("undefined → false (não throw)", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser(undefined)).toBe(false);
  });

  it("objeto sem country nem timezone → false", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser({} as any)).toBe(false);
  });

  it("country=null + timezone=null → false", async () => {
    const mod: any = await import("../../../shared/brTimezones");
    expect(mod.isBrUser({ country: null, timezone: null } as any)).toBe(false);
  });
});

describe("quarterlyReportGenerator usa isBrUser do shared (RF-05.1)", () => {
  it("smoke: importar quarterlyReportGenerator não quebra após extração", async () => {
    // Apenas garante que após o refactor, o gerador ainda carrega.
    const mod: any = await import("../../../server/services/quarterlyReportGenerator");
    expect(typeof mod.generateQuarterlyReport).toBe("function");
  });
});
