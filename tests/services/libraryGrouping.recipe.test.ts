/**
 * Tests for recipe-aware grouping (Sprint torneios-custom-families — Fase 1).
 *
 * Adiciona:
 *   - dayOfWeekOf(t)
 *   - groupTournaments(tournaments, recipe = DEFAULT_RECIPE) — recipe-aware
 *   - parseFamilyKey(familyKey) -> { recipe, site }
 *
 * PRIORIDADE MAXIMA: byte-compat com a familyKey legada. groupTournaments(x)
 * (sem 2o arg) DEVE produzir EXATAMENTE as mesmas familyKeys legadas
 * (site|tier|type|speed|fieldBucket|timeBin) — qualquer drift orfana todas as
 * linhas salvas em saved_tournament_highlights / premium_library_highlights.
 *
 * RED PHASE: dayOfWeekOf, o 2o parametro `recipe` e parseFamilyKey ainda nao
 * existem em server/services/libraryGrouping.ts. groupTournaments hoje so aceita
 * 1 argumento.
 *
 * .test.ts roda no projeto "server" (node).
 */
import { describe, it, expect } from "vitest";
import {
  groupTournaments,
  // @ts-expect-error - novos exports ainda nao existem (red phase)
  dayOfWeekOf,
  // @ts-expect-error - novo export (red phase)
  parseFamilyKey,
} from "../../server/services/libraryGrouping";
// @ts-expect-error - modulo novo (red phase)
import { DEFAULT_RECIPE } from "../../shared/library-grouping-dims";

// Fabrica minima — shape consumido pelo grouping.
function t(over: Partial<any> = {}): any {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    site: "PokerStars",
    buyIn: "22",
    type: "PKO",
    category: "PKO",
    speed: "Normal",
    format: "MTT",
    name: "Daily Grind",
    ...over,
  };
}

// Datas conhecidas (UTC): 2026-06-02 = terca, 2026-06-04 = quinta.
const TUE = new Date("2026-06-02T13:00:00Z"); // 12-14 bin, terca
const THU = new Date("2026-06-04T13:00:00Z"); // 12-14 bin, quinta

// Amostra representativa para os testes de byte-compat.
function sample(): any[] {
  return [
    t({ id: "a", buyIn: "22", name: "Bounty Builder", fieldSize: 300, datePlayed: TUE }),
    t({ id: "b", buyIn: "55", name: "Sunday Warmup", fieldSize: 1500, datePlayed: THU, type: "Vanilla", category: "Vanilla" }),
    t({ id: "c", buyIn: "22", name: "Bounty Builder Turbo", fieldSize: 300, datePlayed: TUE, speed: "Turbo" }),
    t({ id: "d", buyIn: "5", type: "Vanilla", category: "Vanilla", name: "Daily Five", fieldSize: 80, datePlayed: THU }),
    t({ id: "e", buyIn: "109", name: "Sunday Million", fieldSize: 5000, datePlayed: TUE }),
  ];
}

describe("dayOfWeekOf — deriva o dia de datePlayed (fallback startTime)", () => {
  it("usa datePlayed (terca -> 'ter')", () => {
    expect(dayOfWeekOf(t({ datePlayed: TUE }))).toBe("ter");
  });
  it("fallback para startTime quando datePlayed ausente", () => {
    expect(dayOfWeekOf({ startTime: THU.toISOString() })).toBe("qui");
  });
  it("sem data nenhuma -> 'sem-dia'", () => {
    expect(dayOfWeekOf({})).toBe("sem-dia");
  });
});

describe("groupTournaments — byte-compat default (PRIORIDADE MAXIMA)", () => {
  it("sem 2o arg === passar DEFAULT_RECIPE (mesmas familyKeys, ordenadas)", () => {
    const keysNoArg = groupTournaments(sample())
      .map((f: any) => f.familyKey)
      .sort();
    const keysDefault = groupTournaments(sample(), DEFAULT_RECIPE)
      .map((f: any) => f.familyKey)
      .sort();
    expect(keysNoArg).toEqual(keysDefault);
  });

  it("familyKey default NAO tem prefixo 'g1:' e tem 6 segmentos legados", () => {
    const fams = groupTournaments(sample());
    for (const f of fams) {
      expect(f.familyKey.startsWith("g1:")).toBe(false);
      expect(f.familyKey.split("|")).toHaveLength(6);
    }
  });

  it("GOLDEN: familyKey legada exata congelada (guarda contra drift de formato)", () => {
    // site=PokerStars, buyIn 22 -> $20-29, category PKO -> PKO, speed Normal,
    // fieldSize 300 -> medio, datePlayed 12-14. enrichTournamentTypeFields
    // preserva PKO; speed-detector nao acha keyword em "Daily Grind" => Normal.
    const golden = t({
      site: "PokerStars",
      buyIn: "22",
      category: "PKO",
      type: "PKO",
      speed: "Normal",
      name: "Daily Grind",
      fieldSize: 300,
      datePlayed: new Date("2026-01-15T12:30:00Z"),
    });
    const fams = groupTournaments([golden]);
    expect(fams[0].familyKey).toBe("PokerStars|$20-29|PKO|Normal|medio|12-14");
  });
});

describe("groupTournaments — receita customizada", () => {
  it("recipe ['timeBin','abi','site'] -> prefixo g1: + valores nessa ordem", () => {
    const golden = t({
      site: "PokerStars",
      buyIn: "22",
      datePlayed: new Date("2026-01-15T12:30:00Z"), // 12-14
    });
    const [fam] = groupTournaments([golden], ["timeBin", "abi", "site"]);
    // A receita e um CONJUNTO reordenado por CANONICAL_DIM_ORDER. A ordem
    // canonica de {timeBin,abi,site} = site, abi, timeBin (independe do input).
    const PREFIX = "g1:site,abi,timeBin|";
    expect(fam.familyKey.startsWith(PREFIX)).toBe(true);
    // Os 3 valores seguem a ordem canonica: site|abi|timeBin.
    const valuesPart = fam.familyKey.slice(PREFIX.length);
    expect(valuesPart).toBe("PokerStars|$20-29|12-14");
  });

  it("a MESMA receita em ordem diferente produz a MESMA familyKey (conjunto canonico)", () => {
    const golden = t({
      site: "PokerStars",
      buyIn: "22",
      datePlayed: new Date("2026-01-15T12:30:00Z"),
    });
    const keyA = groupTournaments([golden], ["timeBin", "abi", "site"])[0].familyKey;
    const keyB = groupTournaments([golden], ["site", "abi", "timeBin"])[0].familyKey;
    expect(keyA).toBe(keyB);
    // Ambas reordenadas canonicamente para site,abi,timeBin.
    expect(keyA.startsWith("g1:site,abi,timeBin|")).toBe(true);
  });

  it("recipe com dayOfWeek SEPARA familias: terca vs quinta -> 2 familias", () => {
    const tue = t({ site: "PokerStars", buyIn: "22", name: "Bounty Builder", datePlayed: TUE });
    const thu = t({ site: "PokerStars", buyIn: "22", name: "Bounty Builder", datePlayed: THU });
    const fams = groupTournaments([tue, thu], ["site", "abi", "dayOfWeek"]);
    expect(fams).toHaveLength(2);
    // As duas chaves comecam com o prefixo da receita.
    for (const f of fams) {
      expect(f.familyKey.startsWith("g1:site,abi,dayOfWeek|")).toBe(true);
    }
    // E os ultimos segmentos (dia) sao distintos.
    const days = fams.map((f: any) => f.familyKey.split("|").pop()).sort();
    expect(days).toEqual(["qui", "ter"]);
  });

  it("recipe com dayOfWeek: mesmo dia -> 1 familia", () => {
    const a = t({ site: "PokerStars", buyIn: "22", name: "Bounty Builder", datePlayed: TUE });
    const b = t({ site: "PokerStars", buyIn: "22", name: "Bounty Builder", datePlayed: new Date("2026-06-02T20:00:00Z") }); // tambem terca
    const fams = groupTournaments([a, b], ["site", "abi", "dayOfWeek"]);
    expect(fams).toHaveLength(1);
    expect(fams[0].tournaments).toHaveLength(2);
  });

  it("determinismo sob receita customizada: shuffle das linhas = mesma saida ordenada", () => {
    const rows = sample();
    const recipe = ["timeBin", "type", "site"];
    const keysOf = (arr: any[]) =>
      groupTournaments(arr, recipe)
        .map((f: any) => `${f.familyKey}:${f.tournaments.length}`)
        .sort();
    expect(keysOf(rows)).toEqual(keysOf([...rows].reverse()));
  });
});

describe("parseFamilyKey — re-deriva receita embutida + site", () => {
  it("chave legada (sem prefixo) -> DEFAULT_RECIPE + site do 1o segmento", () => {
    const r = parseFamilyKey("PokerStars|$20-29|PKO|Normal|medio|12-14");
    expect(r.recipe).toEqual(DEFAULT_RECIPE);
    expect(r.site).toBe("PokerStars");
  });

  it("chave g1: com site -> receita exata + site extraido", () => {
    const r = parseFamilyKey("g1:timeBin,abi,site|12-14|$20-29|PokerStars");
    expect(r.recipe).toEqual(["timeBin", "abi", "site"]);
    expect(r.site).toBe("PokerStars");
  });

  it("chave g1: SEM a dim site -> site null (nao prefiltra por site)", () => {
    const r = parseFamilyKey("g1:timeBin,abi|12-14|$20-29");
    expect(r.recipe).toEqual(["timeBin", "abi"]);
    expect(r.site).toBeNull();
  });
});
