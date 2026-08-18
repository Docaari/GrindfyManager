// F2 — RF-02.5, serializador que colapsa (emenda A12, D-F2-3/RF-02.5).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.5)
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md
//       (D-F2-3, "Positivas": rangeSerializer.ts nao gerou decisao propria —
//        extensao direta de padroes ja fechados)
//
// Contrato assumido (o implementer cria exatamente isto em
// client/src/lib/combo-calc/rangeSerializer.ts):
//
//   export function collapseRangeToNotation(entries: RangeEntry[]): string;
//
// Formato de saida (RF-02.5): classe cheia colapsa em notacao curta ("22+",
// "A2s+"); range parcial (nao alcanca o topo/AA) usa "hi-lo" com a classe MAIS
// FORTE primeiro, mesma convencao do exemplo do proprio RF ("T9s-54s": T9s e
// mais forte que 54s, vem primeiro); classe parcial (frequencia != 1) sai como
// "NOTACAO:PP%" (inteiro, sem casa decimal — mesma convencao de
// RangeEntryList.tsx, que protege o teste do veredito fantasma); combo
// concreto (kind "specific") sai como o proprio combo ("AsKh"). Multiplos
// grupos juntam com ", ".
//
// ASSUNCAO DOCUMENTADA (a spec nao fixa a ordem entre grupos heterogeneos):
// o teste de grupo misto so verifica que os DOIS fragmentos aparecem, sem
// prender a ordem exata em que o implementer decidir emitir os grupos.
import { describe, it, expect } from "vitest";
import type { RangeEntry } from "@/lib/combo-calc/types";
import { collapseRangeToNotation } from "@/lib/combo-calc/rangeSerializer";

function pairEntry(notation: string, frequency = 1): RangeEntry {
  return { notation, kind: "pair", frequency };
}
function suitedEntry(notation: string, frequency = 1): RangeEntry {
  return { notation, kind: "suited", frequency };
}
function offsuitEntry(notation: string, frequency = 1): RangeEntry {
  return { notation, kind: "offsuit", frequency };
}
function specificEntry(notation: string, frequency = 1): RangeEntry {
  return { notation, kind: "specific", frequency };
}

const ALL_PAIRS: RangeEntry[] = [
  "22", "33", "44", "55", "66", "77", "88", "99", "TT", "JJ", "QQ", "KK", "AA",
].map((n) => pairEntry(n));

const ALL_AXs: RangeEntry[] = [
  "A2s", "A3s", "A4s", "A5s", "A6s", "A7s", "A8s", "A9s", "ATs", "AJs", "AQs", "AKs",
].map((n) => suitedEntry(n));

describe("F2 RF-02.5 — classe cheia colapsa em notacao curta", () => {
  it("22..AA (todos os pares) colapsa em '22+'", () => {
    expect(collapseRangeToNotation(ALL_PAIRS)).toBe("22+");
  });

  it("A2s..AKs (todos os suited de A) colapsa em 'A2s+'", () => {
    expect(collapseRangeToNotation(ALL_AXs)).toBe("A2s+");
  });

  it("55..TT (range de pares que NAO alcanca AA) colapsa em 'TT-55' (mais forte primeiro)", () => {
    const entries = ["55", "66", "77", "88", "99", "TT"].map((n) => pairEntry(n));
    expect(collapseRangeToNotation(entries)).toBe("TT-55");
  });
});

describe("F2 RF-02.5 — classe parcial sai com peso, combo solto sai como combo", () => {
  it("uma unica classe em 50% sai como 'AQo:50%'", () => {
    expect(collapseRangeToNotation([offsuitEntry("AQo", 0.5)])).toBe("AQo:50%");
  });

  it("percentual e sempre INTEIRO (protege o teste do veredito fantasma)", () => {
    const out = collapseRangeToNotation([offsuitEntry("AQo", 1 / 3)]);
    expect(out).not.toMatch(/\.\d/);
    expect(out).toMatch(/^AQo:\d+%$/);
  });

  it("um combo concreto solto sai como o proprio combo ('AsKh')", () => {
    expect(collapseRangeToNotation([specificEntry("AsKh")])).toBe("AsKh");
  });
});

describe("F2 RF-02.5 — multiplos grupos juntam sem perder nenhum (sem prender a ordem)", () => {
  it("um range de pares cheio + um combo solto aparecem os DOIS no resultado", () => {
    const out = collapseRangeToNotation([...ALL_PAIRS, specificEntry("AsKh")]);
    const fragments = out.split(",").map((s) => s.trim());
    expect(fragments).toContain("22+");
    expect(fragments).toContain("AsKh");
    expect(fragments).toHaveLength(2);
  });

  it("range de pares cheio + classe parcial aparecem os DOIS, cada um no formato certo", () => {
    const out = collapseRangeToNotation([...ALL_PAIRS, offsuitEntry("AQo", 0.5)]);
    const fragments = out.split(",").map((s) => s.trim());
    expect(fragments).toContain("22+");
    expect(fragments).toContain("AQo:50%");
  });
});

describe("F2 RF-02.5 — range vazio nao produz lixo", () => {
  it("entries vazio devolve string vazia", () => {
    expect(collapseRangeToNotation([])).toBe("");
  });
});
