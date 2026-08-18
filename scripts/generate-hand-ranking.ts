// F2 — RF-02.4, gerador de client/src/lib/combo-calc/data/handRanking.json
// (ADR-247 D-F2-3). Equity de cada uma das 169 maos canonicas contra mao
// ALEATORIA (nao forca posicional), por Monte Carlo, semente fixa. O JSON e
// COMMITADO e nunca recalculado no cliente — o motivo esta no indice do Range
// Lab (00-INDICE.md): com poucas amostras o "top X%" pegava mao fora do padrao
// ao arrastar o slider, ruido estatistico virando decisao visivel.
//
// Rodar: npx tsx scripts/generate-hand-ranking.ts
//
// Metodologia: para cada mao (169 classes canonicas, uma combinacao concreta
// representativa por classe — card removal simetrico entre combos da mesma
// classe torna a equity idêntica dentro dela), sorteia 60.000 vezes um
// oponente aleatorio + um bordo de 5 cartas do baralho restante (rejeicao para
// nao repetir carta), avalia os dois de 7 cartas com o avaliador rapido
// (`evalWithBoard`, o MESMO motor que a F1 usa) e acumula vitoria/meia-vitoria.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mulberry32, DEFAULT_SEED } from "../client/src/lib/combo-calc/engine/random";
import { evalWithBoard, loadBoard } from "../client/src/lib/combo-calc/fastEvaluator";

const SAMPLES_PER_HAND = 60_000;
const RANK_STR = "23456789TJQKA"; // idx 0 (rank 2) .. 12 (rank A)

/** code = idx*4 + naipe (0..3), mesma convencao de encodeCard em fastEvaluator.ts. */
function code(rankIdx: number, suit: number): number {
  return rankIdx * 4 + suit;
}

interface CanonicalHand {
  notation: string;
  a: number;
  b: number;
}

function canonicalHands(): CanonicalHand[] {
  const out: CanonicalHand[] = [];
  for (let i = 0; i < 13; i++) {
    out.push({ notation: RANK_STR[i] + RANK_STR[i], a: code(i, 0), b: code(i, 1) });
  }
  for (let hi = 1; hi < 13; hi++) {
    for (let lo = 0; lo < hi; lo++) {
      out.push({ notation: RANK_STR[hi] + RANK_STR[lo] + "s", a: code(hi, 0), b: code(lo, 0) });
      out.push({ notation: RANK_STR[hi] + RANK_STR[lo] + "o", a: code(hi, 0), b: code(lo, 1) });
    }
  }
  return out;
}

/** Sorteia 7 codigos distintos de `pool` (rejeicao — colisao rara em 50 cartas). */
function draw7(pool: number[], rng: () => number): number[] {
  const drawn: number[] = [];
  const used = new Set<number>();
  while (drawn.length < 7) {
    const c = pool[Math.floor(rng() * pool.length)];
    if (used.has(c)) continue;
    used.add(c);
    drawn.push(c);
  }
  return drawn;
}

function equityVsRandom(hand: CanonicalHand, rng: () => number): number {
  const pool: number[] = [];
  for (let c = 0; c < 52; c++) if (c !== hand.a && c !== hand.b) pool.push(c);

  let wins = 0;
  for (let trial = 0; trial < SAMPLES_PER_HAND; trial++) {
    const [b0, b1, b2, b3, b4, oppA, oppB] = draw7(pool, rng);
    loadBoard(b0, b1, b2, b3, b4);
    const heroScore = evalWithBoard(hand.a, hand.b);
    const oppScore = evalWithBoard(oppA, oppB);
    if (heroScore > oppScore) wins += 1;
    else if (heroScore === oppScore) wins += 0.5;
  }
  return wins / SAMPLES_PER_HAND;
}

function main(): void {
  const rng = mulberry32(DEFAULT_SEED);
  const hands = canonicalHands();
  if (hands.length !== 169) {
    throw new Error(`esperava 169 maos canonicas, gerei ${hands.length}`);
  }

  const out = hands.map((hand) => ({
    notation: hand.notation,
    equity: Math.round(equityVsRandom(hand, rng) * 1e6) / 1e6,
  }));

  const here = dirname(fileURLToPath(import.meta.url));
  const target = join(here, "../client/src/lib/combo-calc/data/handRanking.json");
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`gravado ${out.length} maos em ${target} (${SAMPLES_PER_HAND} amostras/mao, semente ${DEFAULT_SEED})`);
}

main();
