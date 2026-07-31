/**
 * ADR-243 — bandeiras do SharkScope (`Bandeiras` / `Flags`).
 *
 * Guarda a correcao medida no export real do founder (1.183 torneios):
 *   - `Satellite` aparecia em 104 linhas e a deteccao por NOME pegava 6
 *   - `Rebuy` (256) e `Multi-Entry` (815) nao viravam allowsAddOn/allowsReentry
 */
import { describe, it, expect } from "vitest";
import { parseSharkscopeFlags } from "../../../shared/sharkscope-flags";

describe("parseSharkscopeFlags", () => {
  it("entrada vazia/nula devolve sinais neutros", () => {
    for (const input of [null, undefined, "", "   "]) {
      const r = parseSharkscopeFlags(input as any);
      expect(r.flags).toEqual([]);
      expect(r.primaryType).toBeNull();
      expect(r.allowsAddOn).toBe(false);
      expect(r.allowsReentry).toBe(false);
      expect(r.maxPlayersPerTable).toBeNull();
    }
  });

  it("Satellite vira tipo primario Satellite", () => {
    const r = parseSharkscopeFlags("Satellite");
    expect(r.primaryType).toBe("Satellite");
  });

  it("Mystery-Bounty vira Mystery e marca bounty", () => {
    const r = parseSharkscopeFlags("Bounty Deep-Stack Mystery-Bounty");
    expect(r.primaryType).toBe("Mystery");
    expect(r.isBounty).toBe(true);
    expect(r.deepStack).toBe(true);
  });

  it("Bounty puro vira PKO", () => {
    expect(parseSharkscopeFlags("Bounty").primaryType).toBe("PKO");
  });

  it("Progressive-Bounty vira PKO e marca progressivo", () => {
    const r = parseSharkscopeFlags("Progressive-Bounty");
    expect(r.primaryType).toBe("PKO");
    expect(r.isProgressive).toBe(true);
  });

  it("Rebuy marca allowsAddOn e (sem sinal mais forte) tipo Add-on", () => {
    const r = parseSharkscopeFlags("Rebuy");
    expect(r.allowsAddOn).toBe(true);
    expect(r.primaryType).toBe("Add-on");
  });

  it("Multi-Entry marca allowsReentry", () => {
    expect(parseSharkscopeFlags("Multi-Entry").allowsReentry).toBe(true);
  });

  it("6-Max informa jogadores por mesa; Heads-Up = 2", () => {
    expect(parseSharkscopeFlags("6-Max Bounty").maxPlayersPerTable).toBe(6);
    expect(parseSharkscopeFlags("Heads-Up").maxPlayersPerTable).toBe(2);
  });

  it("precedencia Satellite > Mystery > PKO > Add-on", () => {
    expect(parseSharkscopeFlags("Satellite Mystery-Bounty Rebuy").primaryType).toBe("Satellite");
    expect(parseSharkscopeFlags("Mystery-Bounty Rebuy").primaryType).toBe("Mystery");
    expect(parseSharkscopeFlags("Bounty Rebuy").primaryType).toBe("PKO");
  });

  it("Freezeout anula re-entry mesmo com Multi-Entry no mesmo campo", () => {
    const r = parseSharkscopeFlags("Multi-Entry Freezeout");
    expect(r.isFreezeout).toBe(true);
    expect(r.allowsReentry).toBe(false);
  });

  it("token desconhecido e PRESERVADO em flags (nao vira perda silenciosa)", () => {
    const r = parseSharkscopeFlags("Tiered Bandeira-Nova-2027");
    expect(r.flags).toContain("Tiered");
    expect(r.flags).toContain("Bandeira-Nova-2027");
  });

  it("comparacao ignora caixa e o separador DENTRO do token", () => {
    // O SharkScope separa bandeiras por espaco e usa hifen dentro do token,
    // logo "Multi Entry" (com espaco) sao dois tokens distintos — de proposito.
    expect(parseSharkscopeFlags("MULTI-ENTRY").allowsReentry).toBe(true);
    expect(parseSharkscopeFlags("multi_entry").allowsReentry).toBe(true);
    expect(parseSharkscopeFlags("DEEP-STACK").deepStack).toBe(true);
    expect(parseSharkscopeFlags("multi entry").flags).toEqual(["multi", "entry"]);
  });
});
