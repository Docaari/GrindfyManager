/**
 * ADR-243 — quarentena de redes com export inconsistente na origem.
 *
 * O WPT Global entrou na lista após auditoria com o export oficial do
 * SharkScope: o import é fiel ao arquivo (diff CSV x banco = 0 divergências),
 * mas o painel da própria origem mostra, para os MESMOS 122 torneios, lucro
 * $19,16 contra os $1.456,87 que a planilha dele soma — e participantes 392
 * contra 520 do arquivo. Melhor não importar do que importar número em que o
 * jogador não pode confiar.
 */
import { describe, it, expect } from "vitest";
import {
  QUARANTINED_SITES,
  findQuarantinedSite,
  isQuarantinedSite,
  splitQuarantined,
} from "../../../shared/quarantined-sites";
import { buildImportSummary } from "../../../server/services/importReconciliation";

describe("quarentena de redes", () => {
  it("WPT Global está em quarentena, com motivo explicando o jogador", () => {
    const hit = findQuarantinedSite("WPT Global");
    expect(hit).not.toBeNull();
    expect(hit!.label).toBe("WPT Global");
    expect(hit!.reason.length).toBeGreaterThan(40);
  });

  it("casa variações do nome da rede", () => {
    for (const nome of ["WPT Global", "wpt global", " WPT ", "WPT"]) {
      expect(isQuarantinedSite(nome)).toBe(true);
    }
  });

  it("não pega redes liberadas nem nome que só contém 'wpt' no meio", () => {
    for (const nome of ["GGNetwork", "PokerStars", "CoinPoker", "WPN", "Chico", "888Poker"]) {
      expect(isQuarantinedSite(nome)).toBe(false);
    }
    // `\b` no início evita falso positivo de rede que apenas mencione WPT.
    expect(isQuarantinedSite("Campeonato WPT na GGNetwork")).toBe(false);
  });

  it("entrada vazia/nula não é quarentena", () => {
    expect(isQuarantinedSite(null)).toBe(false);
    expect(isQuarantinedSite(undefined)).toBe(false);
    expect(isQuarantinedSite("")).toBe(false);
    expect(isQuarantinedSite("   ")).toBe(false);
  });

  it("splitQuarantined separa e conta por rede sem perder nada", () => {
    const linhas = [
      { site: "GGNetwork", id: 1 },
      { site: "WPT Global", id: 2 },
      { site: "CoinPoker", id: 3 },
      { site: "WPT Global", id: 4 },
    ];
    const r = splitQuarantined(linhas, (l) => l.site);
    expect(r.allowed.map((l) => l.id)).toEqual([1, 3]);
    expect(r.quarantined.map((l) => l.id)).toEqual([2, 4]);
    expect(r.bySite).toEqual({ "WPT Global": 2 });
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0].site).toBe("WPT Global");
    // nada some
    expect(r.allowed.length + r.quarantined.length).toBe(linhas.length);
  });

  it("lote sem rede em quarentena passa inteiro", () => {
    const linhas = [{ site: "WPN" }, { site: "Chico" }];
    const r = splitQuarantined(linhas, (l) => l.site);
    expect(r.allowed).toHaveLength(2);
    expect(r.quarantined).toHaveLength(0);
    expect(r.bySite).toEqual({});
    expect(r.reasons).toEqual([]);
  });

  it("lista é imutável (evita alguém liberar rede em runtime)", () => {
    expect(Object.isFrozen(QUARANTINED_SITES)).toBe(true);
    expect(Object.isFrozen(QUARANTINED_SITES[0])).toBe(true);
  });
});

describe("relatório do import com quarentena", () => {
  const base = {
    parseReport: { rowsInFile: 130, parsedCount: 130, rejected: [] },
    parsedCount: 8,
    duplicates: 0,
    inserted: 8,
    dbErrors: 0,
    tournaments: [{ position: 5, currency: "USD", convertedToUSD: false, rake: "1" }],
  };

  it("conta as linhas retidas e explica o motivo", () => {
    const r = buildImportSummary({
      ...base,
      quarantine: {
        bySite: { "WPT Global": 122 },
        reasons: [{ site: "WPT Global", reason: "export inconsistente na origem." }],
      },
    });
    expect(r.quarantined).toBe(122);
    expect(r.quarantinedBySite).toEqual({ "WPT Global": 122 });
    expect(r.quarantineReasons[0].site).toBe("WPT Global");
    // aviso citando quantidade + rede
    expect(r.warnings.some((w) => w.includes("122") && w.includes("WPT Global"))).toBe(true);
  });

  it("sem quarentena os campos ficam zerados (não quebra quem já consome)", () => {
    const r = buildImportSummary(base as any);
    expect(r.quarantined).toBe(0);
    expect(r.quarantinedBySite).toEqual({});
    expect(r.quarantineReasons).toEqual([]);
  });
});
