import { describe, it, expect } from "vitest";
import {
  canonicalBuyIn,
  buyInTier,
  nameSignature,
  groupTournaments,
  normalizeSpeed,
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
  it("$21.60 e $22 caem no mesmo tier ($22-54.99) via canonicalBuyIn", () => {
    expect(buyInTier(21.6)).toBe(buyInTier(22));
    expect(buyInTier(22)).toBe("$22-54.99");
  });
  it("$5 e $500 caem em tiers diferentes", () => {
    expect(buyInTier(5)).not.toBe(buyInTier(500));
  });
  it("fronteira: snap colapsa ruido de fee cruzando boundary (54.99 ~ 55)", () => {
    // O snap para inteiro proximo cruza a fronteira do bucket DE PROPOSITO:
    // 54.99 e efetivamente um $55 (ruido de fee/cambio) -> tier $55-109.99.
    expect(buyInTier(22)).toBe("$22-54.99");
    expect(buyInTier(54)).toBe("$22-54.99"); // $54 genuino fica no tier baixo
    expect(buyInTier(54.99)).toBe("$55-109.99"); // snapa pra 55
    expect(buyInTier(55)).toBe("$55-109.99");
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

  it("familyKey inclui speed como 4o segmento", () => {
    const [fam] = groupTournaments([t({ speed: "Turbo", name: "Bounty Builder" })]);
    expect(fam.familyKey.split("|")).toHaveLength(4);
    expect(fam.familyKey.endsWith("|Turbo")).toBe(true);
    expect(fam.speed).toBe("Turbo");
  });

  it("mesma familia+nome, mesma speed -> 1 especifico (speed fora do fineKey)", () => {
    const fams = groupTournaments([
      t({ speed: "Turbo", name: "Bounty Builder $50K Gtd" }),
      t({ speed: "Turbo", name: "Bounty Builder $100K Gtd" }),
    ]);
    expect(fams).toHaveLength(1);
    expect(fams[0].specifics).toHaveLength(1);
    expect(fams[0].specifics[0].fineKey.split("|")).toHaveLength(5); // site|tier|type|speed|sig
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
});
