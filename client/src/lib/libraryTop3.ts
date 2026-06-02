/**
 * Top 3 da Biblioteca de Torneios (Sprint torneios-library-grouping).
 *
 * Founder: destacar no topo os 3 torneios (nivel nome+buy-in) "que mais aparecem
 * com melhor ROI". Ranking = SCORE BLEND (freq x ROI x lucro) normalizado entre
 * os candidatos, com guard de amostra minima.
 *
 * Puro/deterministico (sem Date/random) — alimentado pelas familias ja vindas do
 * backend; achata os `specifics` (nivel nome) e ranqueia.
 */

export interface Top3Input {
  id: string;
  groupName: string;
  site: string;
  buyInTier?: string | null;
  avgBuyin?: number;
  timeBin?: string | null;
  volume: number;
  roi: number;
  avgProfit: number;
  totalProfit: number;
  profitPerTableHour?: number | null;
  durationCoverage?: number;
  lowConfidence?: boolean;
  specifics?: Top3Input[];
}

export interface Top3Candidate extends Top3Input {
  blendScore: number;
}

// Pesos do blend (soma 1.0). Soma ponderada (NAO produto puro: produto zeraria
// qualquer candidato com lucro<=0). FREQUENCIA dominante: o founder pediu "que
// MAIS APARECEM com melhor ROI" — sem isso um outlier de 24 jogos com ROI 1477%
// vence um grind de 2350 jogos (verificado em dado real coin@coin). Ajustaveis aqui.
const W_FREQ = 0.5;
const W_ROI = 0.3;
const W_PROFIT = 0.2;

// Amostra minima p/ entrar no Top 3 sem virar ruido de poucos jogos.
const MIN_VOLUME = 5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Achata as familias em candidatos nivel-nome (specifics). Familia sem
 * specifics entra como ela mesma (fallback).
 */
export function flattenSpecifics(groups: Top3Input[]): Top3Input[] {
  const out: Top3Input[] = [];
  for (const g of groups ?? []) {
    if (g.specifics && g.specifics.length > 0) {
      for (const s of g.specifics) {
        // specific herda buyInTier/timeBin da familia quando ausente
        out.push({
          ...s,
          buyInTier: s.buyInTier ?? g.buyInTier ?? null,
          timeBin: s.timeBin ?? g.timeBin ?? null,
          site: s.site ?? g.site,
        });
      }
    } else {
      out.push(g);
    }
  }
  return out;
}

/**
 * Top N (default 3) candidatos por blendScore. Guard de amostra: usa apenas
 * volume>=MIN_VOLUME; se menos de N qualificarem, relaxa incluindo o resto
 * (ainda ranqueado) para nunca devolver vazio quando ha dados.
 */
export function computeTop3(groups: Top3Input[], n = 3): Top3Candidate[] {
  const all = flattenSpecifics(groups);
  if (all.length === 0) return [];

  // Guard em camadas: prefere familias CONFIANTES (amostra suficiente, nao
  // lowConfidence) p/ nao deixar outlier de poucos jogos liderar. Relaxa para
  // volume>=MIN_VOLUME e, em ultimo caso, todas — nunca devolve vazio com dados.
  const confident = all.filter((c) => !c.lowConfidence && (c.volume ?? 0) >= MIN_VOLUME);
  const someVol = all.filter((c) => (c.volume ?? 0) >= MIN_VOLUME);
  const pool =
    confident.length >= n ? confident : someVol.length >= n ? someVol : all;

  const maxVol = Math.max(...pool.map((c) => c.volume ?? 0), 1);
  const maxProfit = Math.max(...pool.map((c) => Math.max(0, c.totalProfit ?? 0)), 1);

  const scored: Top3Candidate[] = pool.map((c) => {
    const freqN = (c.volume ?? 0) / maxVol;
    const roiN = clamp(((c.roi ?? 0) + 50) / 150, 0, 1); // -50%..+100% -> 0..1
    const profitN = Math.max(0, c.totalProfit ?? 0) / maxProfit;
    const blendScore = W_FREQ * freqN + W_ROI * roiN + W_PROFIT * profitN;
    return { ...c, blendScore };
  });

  scored.sort((a, b) => {
    if (b.blendScore !== a.blendScore) return b.blendScore - a.blendScore;
    return (b.volume ?? 0) - (a.volume ?? 0);
  });

  return scored.slice(0, n);
}
