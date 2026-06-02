import { describe, it, expect } from "vitest";
import {
  canonicalBuyIn,
  buyInTier,
  nameSignature,
  groupTournaments,
  normalizeSpeed,
  isExcludedFromLibrary,
} from "../../server/services/libraryGrouping";

// Minimal tournament factory matching the DB shape consumed by grouping.
function t(over: Partial<any> = {}): any {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    site: "PokerStars",
    buyIn: "22",
    type: "PKO",
    category: "PKO",
    speed: "Regular",
    format: "MTT",
    name: "$22 Bounty Builder",
    ...over,
  };
}

describe("canonicalBuyIn — snap de ruido de fee/arredondamento", () => {
  it("snapa $21.60 -> 22 (fee rounding)", () => {
    expect(canonicalBuyIn(21.6)).toBe(22);
  });
  it("snapa $10.90 -> 11", () => {
    expect(canonicalBuyIn(10.9)).toBe(11);
  });
  it("mantem $55 e $109 distintos (nao cruza tier)", () => {
    expect(canonicalBuyIn(55)).toBe(55);
    expect(canonicalBuyIn(109)).toBe(109);
  });
  it("nao snapa buy-in baixo legitimo ($5.50 fica $5.50)", () => {
    // 5.50 -> round 6, dist 0.5 > max(3%*5.5=0.165, 0.15)=0.165 -> NAO snapa
    expect(canonicalBuyIn(5.5)).toBe(5.5);
  });
  it("retorna 0 para invalido/<=0", () => {
    expect(canonicalBuyIn(0)).toBe(0);
    expect(canonicalBuyIn(NaN)).toBe(0);
    expect(canonicalBuyIn(-5)).toBe(0);
  });
});

describe("buyInTier — reutiliza BUYIN_BUCKETS", () => {
  it("$21.60 e $22 caem no mesmo tier ($20-29) via canonicalBuyIn", () => {
    expect(buyInTier(21.6)).toBe(buyInTier(22));
    expect(buyInTier(22)).toBe("$20-29");
  });
  it("split $16-19 vs $20-29: $18 e $22 em tiers diferentes", () => {
    expect(buyInTier(18)).toBe("$16-19");
    expect(buyInTier(22)).toBe("$20-29");
  });
  it("$5 e $500 caem em tiers diferentes", () => {
    expect(buyInTier(5)).not.toBe(buyInTier(500));
  });
  it("fronteira: snap colapsa ruido de fee cruzando boundary (70.5 ~ 71)", () => {
    // O snap para inteiro proximo cruza a fronteira do bucket DE PROPOSITO:
    // 70.5 e efetivamente um $71 (ruido de fee/cambio) -> tier $71-130.
    expect(buyInTier(70)).toBe("$50-70"); // $70 genuino fica no tier baixo
    expect(buyInTier(70.5)).toBe("$71-130"); // snapa pra 71
    expect(buyInTier(71)).toBe("$71-130");
  });
});

describe("nameSignature — assinatura canonica", () => {
  it("remove $amount, gtd, turbo, bounty, pko", () => {
    const a = nameSignature("$22 Bounty Builder Turbo, $50K Gtd");
    const b = nameSignature("$22 Bounty Builder, $100K Gtd");
    expect(a).toBe(b);
  });
  it("remove stack depth [10BB] e deep", () => {
    expect(nameSignature("Speed Racer [10 BB]")).toBe(
      nameSignature("Speed Racer Deep"),
    );
  });
  it("colapsa episodios Day 1A/1B/2 na mesma assinatura", () => {
    const sigs = [
      nameSignature("Sunday Million Day 1A"),
      nameSignature("Sunday Million Day 1B"),
      nameSignature("Sunday Million Day 2"),
    ];
    expect(new Set(sigs).size).toBe(1);
  });
  it("e deterministica e ordenada (independe da ordem dos tokens)", () => {
    expect(nameSignature("Copacabana Anniversary")).toBe(
      nameSignature("Anniversary Copacabana"),
    );
  });
});

describe("groupTournaments — 2 niveis familia -> especifico", () => {
  it("$21.60 PKO + $22 PKO mesma serie/site -> 1 familia", () => {
    const fams = groupTournaments([
      t({ buyIn: "21.6", name: "Bounty Builder $50K Gtd" }),
      t({ buyIn: "22", name: "Bounty Builder $100K Gtd" }),
    ]);
    expect(fams).toHaveLength(1);
    expect(fams[0].tournaments).toHaveLength(2);
  });

  it("$5 Vanilla + $500 Vanilla -> 2 familias", () => {
    const fams = groupTournaments([
      t({ buyIn: "5", type: "Vanilla", name: "Daily $5" }),
      t({ buyIn: "500", type: "Vanilla", name: "Daily $500" }),
    ]);
    expect(fams).toHaveLength(2);
  });

  it("velocidade SEPARA familias: Normal vs Hyper (mesmo nome) -> 2 familias", () => {
    // Decisao do sprint: speed entra na familyKey (site|tier|type|speed).
    const fams = groupTournaments([
      t({ speed: "Normal", name: "Bounty Builder" }),
      t({ speed: "Hyper", name: "Bounty Builder" }),
    ]);
    expect(fams).toHaveLength(2);
    expect(new Set(fams.map((f) => f.speed))).toEqual(new Set(["Normal", "Hyper"]));
    // Cada familia tem 1 especifico (speed nao esta mais no fineKey).
    expect(fams[0].specifics).toHaveLength(1);
    expect(fams[1].specifics).toHaveLength(1);
  });

  it("familyKey = 6 dims (site|tier|type|speed|field|time), speed no 4o segmento", () => {
    const [fam] = groupTournaments([t({ speed: "Turbo", name: "Bounty Builder" })]);
    const segs = fam.familyKey.split("|");
    expect(segs).toHaveLength(6);
    expect(segs[3]).toBe("Turbo");
    expect(fam.speed).toBe("Turbo");
    // sem datePlayed/fieldSize -> sem-field / sem-horario
    expect(fam.fieldBucket).toBe("sem-field");
    expect(segs[5]).toBe("sem-horario");
  });

  it("mesma familia+nome, mesma speed -> 1 especifico (speed fora do fineKey)", () => {
    const fams = groupTournaments([
      t({ speed: "Turbo", name: "Bounty Builder $50K Gtd" }),
      t({ speed: "Turbo", name: "Bounty Builder $100K Gtd" }),
    ]);
    expect(fams).toHaveLength(1);
    expect(fams[0].specifics).toHaveLength(1);
    expect(fams[0].specifics[0].fineKey.split("|")).toHaveLength(7); // site|tier|type|speed|field|time|sig
  });

  it("order-independence: shuffle das linhas = mesmas familias", () => {
    const rows = [
      t({ id: "a", buyIn: "22", name: "Bounty Builder" }),
      t({ id: "b", buyIn: "55", name: "Sunday Warmup" }),
      t({ id: "c", buyIn: "22", name: "Bounty Builder Turbo" }),
      t({ id: "d", buyIn: "5", type: "Vanilla", name: "Daily Five" }),
    ];
    const keysOf = (arr: any[]) =>
      groupTournaments(arr)
        .map((f) => `${f.familyKey}:${f.tournaments.length}`)
        .sort();
    const forward = keysOf(rows);
    const reversed = keysOf([...rows].reverse());
    expect(forward).toEqual(reversed);
  });

  it("usa coluna type (colapsa category legado divergente)", () => {
    const fams = groupTournaments([
      t({ type: "PKO", category: "Bounty Hunter", name: "KO Series" }),
      t({ type: "PKO", category: "Knockout", name: "KO Series" }),
    ]);
    expect(fams).toHaveLength(1);
  });

  it("fallback para category quando type ausente", () => {
    const fams = groupTournaments([
      t({ type: null, category: "PKO", name: "KO Series" }),
      t({ type: undefined, category: "PKO", name: "KO Series" }),
    ]);
    expect(fams).toHaveLength(1);
    expect(fams[0].type).toBe("PKO");
  });

  // === Sprint torneios-library-grouping: novas dimensoes + read-side derive ===

  it("field-size SEPARA familias (founder: tamanho do field importa)", () => {
    const fams = groupTournaments([
      t({ fieldSize: 50, name: "Bounty Builder" }),
      t({ fieldSize: 1500, name: "Bounty Builder" }),
    ]);
    expect(fams).toHaveLength(2);
    expect(new Set(fams.map((f) => f.fieldBucket))).toEqual(
      new Set(["pequeno", "grande"]),
    );
  });

  it("horario SEPARA familias: $X meio-dia vs $X noite -> 2 familias", () => {
    const noon = new Date(Date.UTC(2026, 0, 15, 12, 30));
    const night = new Date(Date.UTC(2026, 0, 15, 21, 15));
    const fams = groupTournaments([
      t({ datePlayed: noon, name: "Bounty Builder" }),
      t({ datePlayed: night, name: "Bounty Builder" }),
    ]);
    expect(fams).toHaveLength(2);
    expect(new Set(fams.map((f) => f.timeBin))).toEqual(new Set(["12-14", "20-22"]));
  });

  it("read-side: satellite caido em Vanilla e elevado p/ Satellite", () => {
    const [fam] = groupTournaments([
      t({ type: "Vanilla", category: "Vanilla", name: "Mega Sat to Main Event" }),
    ]);
    expect(fam.type).toBe("Satellite");
  });

  it("read-side: nome Hyper com speed gravado Normal vira Hyper", () => {
    const [fam] = groupTournaments([
      t({ speed: "Normal", name: "Sunday Hyper Bounty" }),
    ]);
    expect(fam.speed).toBe("Hyper");
  });
});

describe("isExcludedFromLibrary — PLO / Freeroll / buy-in 0", () => {
  it("exclui PLO no nome (variantes)", () => {
    expect(isExcludedFromLibrary({ name: "$22 PLO", buyIn: "22" })).toBe(true);
    expect(isExcludedFromLibrary({ name: "Daily PLO8 Hi/Lo", buyIn: "11" })).toBe(true);
    expect(isExcludedFromLibrary({ name: "PLO5 Bounty", buyIn: "55" })).toBe(true);
  });
  it("exclui Freeroll e buy-in 0", () => {
    expect(isExcludedFromLibrary({ name: "Sunday Freeroll", buyIn: "0" })).toBe(true);
    expect(isExcludedFromLibrary({ name: "Free Roll Daily", buyIn: "0" })).toBe(true);
    expect(isExcludedFromLibrary({ name: "Bounty Builder", buyIn: "0" })).toBe(true);
    expect(isExcludedFromLibrary({ name: "Bounty Builder", buyIn: "0.00" })).toBe(true);
  });
  it("NAO exclui Holdem normal nem nomes parecidos", () => {
    expect(isExcludedFromLibrary({ name: "Bounty Builder", buyIn: "22" })).toBe(false);
    expect(isExcludedFromLibrary({ name: "Diplomat Special", buyIn: "11" })).toBe(false); // 'plo' nao em boundary
    expect(isExcludedFromLibrary({ name: "Sunday Million", buyIn: "109" })).toBe(false);
  });
});

describe("normalizeSpeed — default Normal (NAO Regular)", () => {
  it("preserva Normal/Turbo/Hyper", () => {
    expect(normalizeSpeed({ speed: "Turbo" })).toBe("Turbo");
    expect(normalizeSpeed({ speed: "Hyper" })).toBe("Hyper");
    expect(normalizeSpeed({ speed: "Normal" })).toBe("Normal");
  });
  it("default Normal quando ausente/vazio (bucket fantasma Regular eliminado)", () => {
    expect(normalizeSpeed({ speed: null })).toBe("Normal");
    expect(normalizeSpeed({ speed: undefined })).toBe("Normal");
    expect(normalizeSpeed({ speed: "  " })).toBe("Normal");
    expect(normalizeSpeed({})).toBe("Normal");
  });
  it("read-side: deriva do nome quando gravado e mais lento (corrige legado)", () => {
    expect(normalizeSpeed({ speed: "Normal", name: "Hyper Turbo $5" })).toBe("Hyper");
    expect(normalizeSpeed({ speed: "Regular", name: "Turbo Deal" })).toBe("Turbo");
    // nao rebaixa: gravado mais rapido que o nome prevalece
    expect(normalizeSpeed({ speed: "Hyper", name: "Daily Regular" })).toBe("Hyper");
  });
});
