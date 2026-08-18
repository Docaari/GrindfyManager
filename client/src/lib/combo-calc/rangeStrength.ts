// "Top X%" com peso fracionado na ultima mao (F2, RF-02.4, emenda A6, D-F2-3).
//
// Le `./data/handRanking.json` — 169 maos com equity vs mao aleatoria — e
// ORDENA por forca. E leitura + ordenacao, nao calculo: o dado e medido
// offline (Monte Carlo, semente fixa) e commitado, nunca recalculado no
// cliente (a razao esta no indice do Range Lab — ruido estatistico virando
// decisao visivel no slider).
//
// `data/handRanking.json` e gerado por `scripts/generate-hand-ranking.ts`
// (60.000 amostras/mao, semente fixa DEFAULT_SEED, 169 maos) e committed —
// regenerar e acao manual (`npx tsx scripts/generate-hand-ranking.ts`) se o
// avaliador mudar a logica de showdown.
import handRanking from "./data/handRanking.json";
import { parseNotation } from "./combos";
import type { RangeKind } from "./types";

export interface HandRankingEntry {
  notation: string;
  equity: number;
}

export interface StrengthEntry {
  notation: string;
  kind: RangeKind;
  /** 1 para classe cheia; fracionario SO na ultima mao (corte do alvo). */
  frequency: number;
}

/** Combos concretos de uma classe, sem card removal (equity preflop pura). */
export function combosCountForKind(kind: RangeKind): number {
  if (kind === "pair") return 6;
  if (kind === "suited") return 4;
  if (kind === "offsuit") return 12;
  return 4; // fallback defensivo — nao deveria ocorrer nas 169 maos canonicas
}

/** 13*6 (pares) + 78*4 (suited) + 78*12 (offsuit) = 1326 = C(52,2). */
const TOTAL_COMBOS = 13 * 6 + 78 * 4 + 78 * 12;

/**
 * Preenche as maos em ordem de forca (equity desc) ate cobrir `pctPercent`%
 * do range total (1326 combos). A ULTIMA mao entra com peso fracionado para
 * bater a porcentagem exata (emenda A6) — sem isso "top 23%" nunca fecha em
 * 23%.
 */
export function topPercentEntries(pctPercent: number): StrengthEntry[] {
  const target = TOTAL_COMBOS * (pctPercent / 100);
  const sorted = [...(handRanking as HandRankingEntry[])].sort(
    (a, b) => b.equity - a.equity,
  );

  const out: StrengthEntry[] = [];
  let accumulated = 0;

  for (const hand of sorted) {
    if (accumulated >= target) break;
    const parsed = parseNotation(hand.notation);
    const kind: RangeKind = parsed ? parsed.kind : "anytwo";
    const count = combosCountForKind(kind);
    const remaining = target - accumulated;

    if (remaining >= count) {
      out.push({ notation: hand.notation, kind, frequency: 1 });
      accumulated += count;
    } else {
      const frequency = remaining / count;
      if (frequency > 0) {
        out.push({ notation: hand.notation, kind, frequency });
      }
      break;
    }
  }

  return out;
}
