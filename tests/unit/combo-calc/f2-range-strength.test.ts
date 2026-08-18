// F2 — RF-02.4, "top X%" com peso fracionado na ultima mao (emenda A6, D-F2-3).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.4)
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-3)
//
// Contrato assumido (o implementer cria exatamente isto em
// client/src/lib/combo-calc/rangeStrength.ts):
//
//   export interface HandRankingEntry { notation: string; equity: number }
//   export interface StrengthEntry {
//     notation: string;
//     kind: RangeKind; // derivado via parseNotation, igual ao resto do codebase
//     frequency: number; // 1 para classe cheia; fracionario SO na ultima (corte)
//   }
//   export function topPercentEntries(pctPercent: number): StrengthEntry[];
//     // pctPercent em 0..100 (mesma convencao de tela que RangeEntryList/UI ja usam)
//
// `rangeStrength.ts` LE `./data/handRanking.json` (169 maos, MC 60k/mao,
// semente fixa, gerado por scripts/generate-hand-ranking.ts, commitado — NAO
// recalculado no cliente) e ORDENA por equity descendente. E leitura +
// ordenacao, nao calculo (D-F2-3).
//
// ESTE TESTE NAO DEPENDE DO GERADOR DE PRODUCAO RODAR: mocka o import do JSON
// com uma fixture PROPRIA de teste — 169 notacoes canonicas cobrindo o baralho
// inteiro (78 pares+suited+offsuit = 1326 combos, a mesma aritmetica que o
// resto do combo-calc usa), com equity SINTETICA (nao precisa refletir poker
// real) mas DETERMINISTICA o bastante para calcular o corte exato a mao.
//
// Fixture desenhada para o teste central: os 13 pares, do mais forte ao mais
// fraco (AA..22), tem 6 combos cada — cumulativo 6,12,18,24,30,36,42,...
// "Top 3%" de 1326 = 39,78 combos EXATOS (1326*0.03). Isso cai DENTRO do
// oitavo par (88): 6 pares cheios (AA,KK,QQ,JJ,TT,99 = 36 combos) + fracao de
// 88 (3,78/6 = 0,63). Numero redondo por construcao, nao por sorte.
import { describe, it, expect, vi, beforeEach } from "vitest";

const PAIR_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUIT_LETTERS = ["s", "d", "h", "c"]; // so usado p/ notacoes suited/offsuit sinteticas

/** 169 notacoes canonicas: 13 pares + 78 suited + 78 offsuit. */
function allCanonicalNotations(): { pairs: string[]; suited: string[]; offsuit: string[] } {
  const pairs = PAIR_RANKS.map((r) => r + r);
  const suited: string[] = [];
  const offsuit: string[] = [];
  for (let hi = 0; hi < PAIR_RANKS.length; hi++) {
    for (let lo = hi + 1; lo < PAIR_RANKS.length; lo++) {
      suited.push(PAIR_RANKS[hi] + PAIR_RANKS[lo] + "s");
      offsuit.push(PAIR_RANKS[hi] + PAIR_RANKS[lo] + "o");
    }
  }
  return { pairs, suited, offsuit };
}

/**
 * Fixture completa: os 13 pares em ordem AA..22 (equity estritamente
 * decrescente, alta o bastante para ficarem TODOS acima de qualquer suited ou
 * offsuit), seguidos por 78 suited e 78 offsuit em equity decrescente mas
 * SEMPRE abaixo do ultimo par. O corte de "top 3%" so precisa acontecer
 * dentro dos pares — o resto existe so para completar os 169/1326.
 */
function buildFixtureRanking(): { notation: string; equity: number }[] {
  const { pairs, suited, offsuit } = allCanonicalNotations();
  const out: { notation: string; equity: number }[] = [];
  pairs.forEach((n, i) => out.push({ notation: n, equity: 0.9 - i * 0.01 })); // 0.90 .. 0.78
  suited.forEach((n, i) => out.push({ notation: n, equity: 0.5 - i * 0.001 }));
  offsuit.forEach((n, i) => out.push({ notation: n, equity: 0.3 - i * 0.001 }));
  return out;
}

const FIXTURE_RANKING = buildFixtureRanking();

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/lib/combo-calc/data/handRanking.json", () => ({
    default: FIXTURE_RANKING,
  }));
});

async function loadRangeStrength() {
  return await import(/* @vite-ignore */ "@/lib/combo-calc/rangeStrength");
}

describe("F2 RF-02.4 — a fixture de teste cobre o baralho inteiro (oraculo da matematica, nao dos numeros reais)", () => {
  it("169 notacoes, 1326 combos (13*6 + 78*4 + 78*12)", () => {
    expect(FIXTURE_RANKING).toHaveLength(169);
  });
});

describe("F2 emenda A6 — topPercentEntries preenche em ordem de forca com peso fracionado no corte", () => {
  it("top 3% para exatamente em 88, com peso fracionado 0,63 (39,78 / 1326 combos)", async () => {
    const { topPercentEntries } = await loadRangeStrength();
    const entries = topPercentEntries(3);

    const fullPairs = ["AA", "KK", "QQ", "JJ", "TT", "99"];
    for (const notation of fullPairs) {
      const e = entries.find((x: any) => x.notation === notation);
      expect(e, `${notation} deveria estar no top 3% em peso cheio`).toBeDefined();
      expect(e.frequency).toBeCloseTo(1, 9);
    }

    const cut = entries.find((x: any) => x.notation === "88");
    expect(cut, "88 e a mao de corte — precisa aparecer com peso fracionado").toBeDefined();
    expect(cut.frequency).toBeCloseTo(0.63, 9);

    expect(
      entries.find((x: any) => x.notation === "77"),
      "77 vem DEPOIS do corte — nao pode aparecer",
    ).toBeUndefined();
  });

  it("a soma ponderada em combos bate EXATO com o alvo (1326 * pct/100)", async () => {
    const { topPercentEntries } = await loadRangeStrength();
    const entries = topPercentEntries(3);
    // Peso da fixture: pares tem 6 combos cada.
    const totalCombos = entries.reduce((sum: number, e: any) => sum + e.frequency * 6, 0);
    expect(totalCombos).toBeCloseTo(1326 * 0.03, 9);
  });

  it("top 100% devolve as 169 maos, todas em peso cheio, somando os 1326 combos", async () => {
    const { topPercentEntries } = await loadRangeStrength();
    const entries = topPercentEntries(100);
    expect(entries).toHaveLength(169);
    expect(entries.every((e: any) => e.frequency === 1)).toBe(true);
  });

  it("top 0% nao preenche nenhuma mao", async () => {
    const { topPercentEntries } = await loadRangeStrength();
    const entries = topPercentEntries(0);
    expect(entries).toHaveLength(0);
  });

  it("cada entry devolvida tem o `kind` derivado da propria notacao (pair/suited/offsuit)", async () => {
    const { topPercentEntries } = await loadRangeStrength();
    const entries = topPercentEntries(3);
    const aa = entries.find((x: any) => x.notation === "AA");
    expect(aa.kind).toBe("pair");
  });

  it("um alvo maior sempre inclui pelo menos as mesmas maos cheias de um alvo menor (monotonico)", async () => {
    const { topPercentEntries } = await loadRangeStrength();
    const small = topPercentEntries(1).filter((e: any) => e.frequency === 1).map((e: any) => e.notation);
    const big = topPercentEntries(5).filter((e: any) => e.frequency === 1).map((e: any) => e.notation);
    for (const notation of small) {
      expect(big, `${notation} sumiu ao aumentar o alvo`).toContain(notation);
    }
  });
});
