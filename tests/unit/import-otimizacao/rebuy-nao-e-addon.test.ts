/**
 * T1 — Rebuy nao e Add-on (ADR-251).
 *
 * Spec: Docs/specs/tournament-type-rebuy-vs-addon.md
 *
 * A bandeira `Rebuy` do Sharkscope ligava `allowsAddOn` e promovia o torneio ao
 * tipo primario `Add-on`. No historico real isso classificou 4307 torneios
 * errado — todos rebuy, nenhum add-on de verdade.
 */
import { describe, it, expect } from "vitest";
import { parseSharkscopeFlags } from "../../../shared/sharkscope-flags";

describe("RF-01 — rebuy e add-on sao atributos independentes", () => {
  it("Rebuy liga SO allowsRebuy", () => {
    const r = parseSharkscopeFlags("Rebuy");
    expect(r.allowsRebuy).toBe(true);
    expect(r.allowsAddOn).toBe(false);
  });

  it("Add-On liga SO allowsAddOn", () => {
    const r = parseSharkscopeFlags("Add-On");
    expect(r.allowsAddOn).toBe(true);
    expect(r.allowsRebuy).toBe(false);
  });

  it("Rebuy-AddOn liga os dois", () => {
    const r = parseSharkscopeFlags("Rebuy-AddOn");
    expect(r.allowsRebuy).toBe(true);
    expect(r.allowsAddOn).toBe(true);
  });

  it("torneio sem bandeira de rebuy nem add-on deixa os dois falsos", () => {
    const r = parseSharkscopeFlags("Deep-Stack 6-Max");
    expect(r.allowsRebuy).toBe(false);
    expect(r.allowsAddOn).toBe(false);
  });
});

describe("RF-02 — atributo nao define o tipo primario", () => {
  it("so-rebuy nao sugere tipo (caller mantem o do nome)", () => {
    expect(parseSharkscopeFlags("Rebuy").primaryType).toBeNull();
  });

  it("so-rebuy com deep-stack continua sem sugerir tipo", () => {
    expect(parseSharkscopeFlags("Rebuy Deep-Stack").primaryType).toBeNull();
  });

  it("add-on de verdade continua sugerindo Add-on", () => {
    expect(parseSharkscopeFlags("Add-On").primaryType).toBe("Add-on");
  });

  it("precedencia preservada: sinal mais forte ganha do rebuy", () => {
    expect(parseSharkscopeFlags("Satellite Rebuy").primaryType).toBe("Satellite");
    expect(parseSharkscopeFlags("Mystery-Bounty Rebuy").primaryType).toBe("Mystery");
    expect(parseSharkscopeFlags("Bounty Rebuy").primaryType).toBe("PKO");
  });

  it("precedencia preservada: sinal mais forte ganha do add-on", () => {
    expect(parseSharkscopeFlags("Satellite Add-On").primaryType).toBe("Satellite");
    expect(parseSharkscopeFlags("Bounty Add-On").primaryType).toBe("PKO");
  });
});

describe("regressao — o caso real que motivou o ADR", () => {
  it('as flags dos 4307 torneios do historico nao produzem mais "Add-on"', () => {
    // Combinacoes exatas encontradas no banco (USER-0005), com a contagem:
    //   ["Rebuy", "Deep-Stack"]           2997
    //   ["Rebuy"]                         1080
    //   ["6-Max", "Rebuy", "Deep-Stack"]   198
    //   ["6-Max", "Rebuy"]                  32
    const reais = [
      "Rebuy Deep-Stack",
      "Rebuy",
      "6-Max Rebuy Deep-Stack",
      "6-Max Rebuy",
    ];
    for (const flags of reais) {
      const r = parseSharkscopeFlags(flags);
      expect(r.primaryType, `flags: ${flags}`).toBeNull();
      expect(r.allowsAddOn, `flags: ${flags}`).toBe(false);
      expect(r.allowsRebuy, `flags: ${flags}`).toBe(true);
    }
  });

  it("os atributos que nao mudam continuam de pe", () => {
    const r = parseSharkscopeFlags("6-Max Rebuy Deep-Stack");
    expect(r.deepStack).toBe(true);
    expect(r.maxPlayersPerTable).toBe(6);
    expect(r.allowsReentry).toBe(false);
  });
});
