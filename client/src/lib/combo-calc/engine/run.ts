// Motor de equity: stepper sincrono puro (ADR-246 D-F1-3, D-F1-4, D-F1-5, D-F1-6).
//
// POR QUE STEPPER E NAO LACO: um laco sincrono DENTRO de um Worker nunca recebe
// `postMessage` — a fila de mensagens do proprio worker so drena entre tarefas.
// Cancelamento por mensagem so funciona se o trabalho for fatiado. O worker
// dirige este stepper e cede a thread entre as fatias; o teste dirige `step()`
// direto, sem fake timer e sem Worker.
//
// POR QUE O LACO EXTERNO E O RUNOUT: com o runout fixo, cada combo (do heroi e do
// vilao) e avaliado UMA vez e o resultado vira um inteiro no placar. Comparar
// dois combos passa a ser comparar dois inteiros. O custo sai de
// `runouts x H x V x 2` avaliacoes para `runouts x (H + V)` avaliacoes mais
// `runouts x H x V` comparacoes — e o gargalo muda de avaliacao para comparacao.
import type { Card, Decision } from "../types";
import { requiredEquity as computeRequiredEquity } from "../ev";
import { evalWithBoard, loadBoard } from "../fastEvaluator";
import { boardDeadSet, collides, expandRangeV2, cardMask, type EngineCombo } from "./expand";
import { monteCarloSamples, runoutsPerPair, EXACT_LIMIT } from "./cost";
import { DEFAULT_SEED, mulberry32 } from "./random";
import type {
  EngineConfidence,
  EngineRequest,
  EngineResult,
  HeroComboResult,
  VillainComboResult,
} from "./types";

/** z de 95% numa normal. O intervalo e `media +- z * erro padrao`. */
const Z_95 = 1.959963984540054;

/**
 * Desvio padrao usado quando a amostra saiu degenerada (todo mundo ganhou, ou
 * todo mundo perdeu). Variancia observada zero NAO significa certeza — significa
 * que a amostra nao viu variacao. 0,5 e o maior desvio possivel para valores em
 * [0, 1], entao e a escolha conservadora: superestima a margem, nunca a esconde.
 */
const DEGENERATE_SD = 0.5;

const EPS = 1e-9;

export interface EngineStep {
  done: boolean;
  processed: number;
}

export interface EngineRun {
  /** Conhecido ANTES de comecar — sem isso nao ha barra de progresso honesta. */
  readonly totalUnits: number;
  step(maxUnits: number): EngineStep;
  progress(): number;
  readonly cancelled: boolean;
  cancel(): void;
  /** null enquanto nao terminou, e null para sempre se foi cancelada. */
  result(): EngineResult | null;
}

function decisionFrom(equity: number, alpha: number): Decision {
  if (Math.abs(equity - alpha) <= 1e-6) return "breakeven";
  return equity > alpha ? "call" : "fold";
}

/** Baralho de runout: as 52 cartas menos as do bordo. */
function runoutPool(boardCodes: number[]): number[] {
  const used = new Set(boardCodes);
  const pool: number[] = [];
  for (let code = 0; code < 52; code++) if (!used.has(code)) pool.push(code);
  return pool;
}

/**
 * Lado do spot em arrays PLANOS. Ler `combos[i].lo` no laco quente custa uma
 * indirecao de objeto por acesso; no caso de aceite isso e mais de um milhao de
 * cargas de propriedade e foi a diferenca medida entre 33 ms e o alvo de 20 ms.
 * Os objetos continuam existindo em `combos` para montar o resultado no fim,
 * onde o custo nao importa.
 */
interface FlatSide {
  combos: EngineCombo[];
  lo: Int32Array;
  hi: Int32Array;
  codeA: Int32Array;
  codeB: Int32Array;
  weight: Float64Array;
  /** 1 quando o combo participa de ao menos um par valido. */
  active: Uint8Array;
}

function flatten(combos: EngineCombo[]): FlatSide {
  const n = combos.length;
  const side: FlatSide = {
    combos,
    lo: new Int32Array(n),
    hi: new Int32Array(n),
    codeA: new Int32Array(n),
    codeB: new Int32Array(n),
    weight: new Float64Array(n),
    active: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const c = combos[i];
    side.lo[i] = c.lo;
    side.hi[i] = c.hi;
    side.codeA[i] = c.codeA;
    side.codeB[i] = c.codeB;
    side.weight[i] = c.weight;
  }
  return side;
}

interface PreparedRun {
  hero: FlatSide;
  villain: FlatSide;
  /** Indices achatados dos pares validos (sem carta compartilhada). */
  pairHero: Int32Array;
  pairVillain: Int32Array;
  /** Massa do range do vilao que cada combo do heroi realmente enfrenta. */
  pairMass: Float64Array;
  /** A metade simetrica: massa do heroi que cada combo do vilao enfrenta (D-F3-11). */
  villainPairMass: Float64Array;
  boardCodes: number[];
  pool: number[];
  /** Cartas de cada runout, ja resolvidas — evita refazer a conta por runout. */
  runoutA: Int32Array;
  runoutB: Int32Array;
  runoutCount: number;
  runoutsPerPair: number;
  emptyHeroEntries: string[];
  emptyVillainEntries: string[];
}

/**
 * Tabela dos runouts a percorrer: 1 no river (vazio), 48 no turn, C(49,2) = 1176
 * no flop. Resolver o indice linear em `(i, j)` dentro do laco custava um `while`
 * de ate 49 passos por runout.
 */
function buildRunouts(pool: number[], boardLength: number): {
  runoutA: Int32Array;
  runoutB: Int32Array;
  runoutCount: number;
} {
  if (boardLength >= 5) {
    return { runoutA: new Int32Array([-1]), runoutB: new Int32Array([-1]), runoutCount: 1 };
  }
  if (boardLength === 4) {
    return {
      runoutA: Int32Array.from(pool),
      runoutB: new Int32Array(pool.length).fill(-1),
      runoutCount: pool.length,
    };
  }
  const count = (pool.length * (pool.length - 1)) / 2;
  const runoutA = new Int32Array(count);
  const runoutB = new Int32Array(count);
  let k = 0;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      runoutA[k] = pool[i];
      runoutB[k] = pool[j];
      k++;
    }
  }
  return { runoutA, runoutB, runoutCount: count };
}

export function createEngineRun(request: EngineRequest): EngineRun {
  const { spot } = request;
  const alpha = computeRequiredEquity(spot.potCurrent, spot.callAmount);
  const finalPot = spot.potCurrent + spot.callAmount;

  const dead = boardDeadSet(spot.board);
  const heroSide = expandRangeV2(spot.heroRange, dead);
  const villainSide = expandRangeV2(spot.villainRange, dead);

  const degraded = (reason: "empty_hero_range" | "empty_villain_range" | "no_valid_pairs"): EngineRun =>
    finishedRun({ status: "degraded", reason, mode: request.mode, requiredEquity: alpha });

  // Massa ponderada zero e "o range nao diz nada sobre o spot", nao "equity 0".
  // E a mesma licao da F0 RF-00.2, agora no vocabulario do motor.
  if (heroSide.combos.length === 0 || heroSide.totalWeight <= 0) return degraded("empty_hero_range");
  if (villainSide.combos.length === 0 || villainSide.totalWeight <= 0) {
    return degraded("empty_villain_range");
  }

  const hero = heroSide.combos;
  const villain = villainSide.combos;

  // ── card removal MUTUO: os pares que de fato se enfrentam ──
  const pairHeroList: number[] = [];
  const pairVillainList: number[] = [];
  const pairMass = new Float64Array(hero.length);
  const villainPairMass = new Float64Array(villain.length);
  for (let h = 0; h < hero.length; h++) {
    const hc = hero[h];
    for (let v = 0; v < villain.length; v++) {
      const vc = villain[v];
      if (collides(hc.lo, hc.hi, vc.lo, vc.hi)) continue;
      pairHeroList.push(h);
      pairVillainList.push(v);
      pairMass[h] += vc.weight;
      // O(H*V) uma vez, fora do laco quente: e a metade simetrica do que a F1 ja
      // faz para o heroi, e o denominador do lado de la sai daqui.
      villainPairMass[v] += hc.weight;
    }
  }
  if (pairHeroList.length === 0) return degraded("no_valid_pairs");

  const boardCodes = spot.board.map((c) => encodeBoardCard(c));
  const pool = runoutPool(boardCodes);
  const flatHero = flatten(hero);
  const flatVillain = flatten(villain);
  // Combo que nao participa de par nenhum nao precisa ser avaliado por runout.
  for (let i = 0; i < pairHeroList.length; i++) {
    flatHero.active[pairHeroList[i]] = 1;
    flatVillain.active[pairVillainList[i]] = 1;
  }

  const prepared: PreparedRun = {
    hero: flatHero,
    villain: flatVillain,
    pairHero: Int32Array.from(pairHeroList),
    pairVillain: Int32Array.from(pairVillainList),
    pairMass,
    villainPairMass,
    boardCodes,
    pool,
    ...buildRunouts(pool, spot.board.length),
    runoutsPerPair: runoutsPerPair(spot.board.length),
    emptyHeroEntries: heroSide.emptyEntries,
    emptyVillainEntries: villainSide.emptyEntries,
  };

  return request.mode === "monte_carlo"
    ? monteCarloRun(request, prepared, alpha, finalPot)
    : exactRun(request, prepared, alpha, finalPot);
}

/** `encodeCard` sem importar o modulo inteiro no caminho quente. */
function encodeBoardCard(c: Card): number {
  return (c.rank - 2) * 4 + ["c", "d", "h", "s"].indexOf(c.suit);
}

/** Corrida que ja nasce pronta (degradada). */
function finishedRun(result: EngineResult): EngineRun {
  let cancelled = false;
  return {
    totalUnits: 0,
    step: () => ({ done: true, processed: 0 }),
    progress: () => 1,
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
    result: () => result,
  };
}

// ── modo exato ───────────────────────────────────────────────

function exactRun(
  request: EngineRequest,
  prep: PreparedRun,
  alpha: number,
  finalPot: number,
): EngineRun {
  const hero = prep.hero;
  const villain = prep.villain;
  const H = hero.combos.length;
  const V = villain.combos.length;
  const P = prep.pairHero.length;

  const boardLen = prep.boardCodes.length;
  const runoutCount = prep.runoutCount;

  const totalUnits = P * prep.runoutsPerPair;

  // Soma crua por combo do heroi: `w_v * resultado`. A divisao pelo denominador
  // (runouts x pairMass) acontece UMA vez no fim — o denominador e constante por
  // par, entao dividir dentro do laco so acrescentaria erro de ponto flutuante.
  const heroNum = new Float64Array(H);
  // Espelho do lado do vilao. O chop conta 0,5 dos dois lados, entao heroi e
  // vilao somam 1 por par avaliado — e dai que a identidade `heroi + vilao = 1`
  // sai por construcao, sem depender de julgamento.
  const villainNum = new Float64Array(V);
  const heroScore = new Int32Array(H);
  const villainScore = new Int32Array(V);

  let runoutIndex = 0;
  let pairIndex = 0;
  let runoutReady = false;
  let processed = 0;
  let finished = false;
  let cancelled = false;
  let out: EngineResult | null = null;

  function prepareRunout(): void {
    const boardCodes = prep.boardCodes;
    const r1 = prep.runoutA[runoutIndex];
    const r2 = prep.runoutB[runoutIndex];

    const b3 = boardLen >= 4 ? boardCodes[3] : r1;
    const b4 = boardLen >= 5 ? boardCodes[4] : boardLen === 4 ? r1 : r2;
    loadBoard(boardCodes[0], boardCodes[1], boardCodes[2], b3, b4);

    let rLo = 0;
    let rHi = 0;
    if (r1 >= 0) {
      if (r1 < 32) rLo |= 1 << r1;
      else rHi |= 1 << (r1 - 32);
    }
    if (r2 >= 0) {
      if (r2 < 32) rLo |= 1 << r2;
      else rHi |= 1 << (r2 - 32);
    }

    // -1 marca "este combo nao existe neste runout" (a carta saiu no bordo).
    // Combo que nao entra em par nenhum nem chega a ser avaliado.
    const hLo = hero.lo;
    const hHi = hero.hi;
    for (let h = 0; h < H; h++) {
      heroScore[h] =
        hero.active[h] === 0 || ((hLo[h] & rLo) | (hHi[h] & rHi)) !== 0
          ? -1
          : evalWithBoard(hero.codeA[h], hero.codeB[h]);
    }
    const vLo = villain.lo;
    const vHi = villain.hi;
    for (let v = 0; v < V; v++) {
      villainScore[v] =
        villain.active[v] === 0 || ((vLo[v] & rLo) | (vHi[v] & rHi)) !== 0
          ? -1
          : evalWithBoard(villain.codeA[v], villain.codeB[v]);
    }
    runoutReady = true;
  }

  function finish(): void {
    finished = true;
    out = assemble({
      request,
      prep,
      alpha,
      finalPot,
      totalShowdowns: processed,
      equityOf: (h) => {
        const denom = prep.runoutsPerPair * prep.pairMass[h];
        return denom > 0 ? heroNum[h] / denom : null;
      },
      halfWidthOf: () => null,
      sampleCountOf: () => null,
      villainEquityOf: (v) => {
        // Denominador simetrico ao do heroi: `runoutsPerPair` (990 no flop) e
        // EXATAMENTE o numero de runouts em que nenhuma das 4 cartas do par foi
        // comida, que sao os unicos que entram no numerador.
        const denom = prep.runoutsPerPair * prep.villainPairMass[v];
        return denom > 0 ? villainNum[v] / denom : null;
      },
      villainHalfWidthOf: () => null,
      villainSampleCountOf: () => null,
      confidence: null,
      seed: null,
      samples: null,
    });
  }

  return {
    totalUnits,
    progress() {
      if (finished) return 1;
      return totalUnits > 0 ? Math.min(1, processed / totalUnits) : 0;
    },
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
      // Cancelar depois do fim nao apaga resultado ja pronto — o jogador nao
      // perde um numero que ja esta na tela porque trocou de aba.
    },
    result: () => out,
    step(maxUnits: number): EngineStep {
      if (finished) return { done: true, processed: 0 };
      if (cancelled) return { done: true, processed: 0 };

      let localProcessed = 0;
      while (localProcessed < maxUnits) {
        if (runoutIndex >= runoutCount) {
          finish();
          return { done: true, processed: localProcessed };
        }
        if (!runoutReady) prepareRunout();

        const sh = heroScore;
        const sv = villainScore;
        const pairH = prep.pairHero;
        const pairV = prep.pairVillain;
        const vWeight = villain.weight;
        const hWeight = hero.weight;
        while (pairIndex < P && localProcessed < maxUnits) {
          const h = pairH[pairIndex];
          const v = pairV[pairIndex];
          pairIndex++;
          const a = sh[h];
          const b = sv[v];
          if (a < 0 || b < 0) continue; // o runout comeu uma das cartas do par
          const outcome = a > b ? 1 : a < b ? 0 : 0.5;
          heroNum[h] += vWeight[v] * outcome;
          villainNum[v] += hWeight[h] * (1 - outcome);
          localProcessed++;
          processed++;
        }
        if (pairIndex >= P) {
          pairIndex = 0;
          runoutIndex++;
          runoutReady = false;
        }
      }

      if (runoutIndex >= runoutCount) {
        finish();
        return { done: true, processed: localProcessed };
      }
      return { done: false, processed: localProcessed };
    },
  };
}

// ── modo Monte Carlo ─────────────────────────────────────────

function monteCarloRun(
  request: EngineRequest,
  prep: PreparedRun,
  alpha: number,
  finalPot: number,
): EngineRun {
  const hero = prep.hero;
  const villain = prep.villain;
  const H = hero.combos.length;
  const V = villain.combos.length;
  const boardLen = prep.boardCodes.length;
  const runoutCards = boardLen >= 5 ? 0 : boardLen === 4 ? 1 : 2;

  const seed = request.seed ?? DEFAULT_SEED;
  const samples =
    request.samples && request.samples > 0
      ? Math.floor(request.samples)
      : monteCarloSamples(EXACT_LIMIT, H);

  const rng = mulberry32(seed);

  // Amostragem do combo do vilao proporcional ao peso: busca binaria na acumulada.
  const cumulative = new Float64Array(V);
  let running = 0;
  for (let v = 0; v < V; v++) {
    running += villain.weight[v];
    cumulative[v] = running;
  }
  const totalVillainWeight = running;

  const sum = new Float64Array(H);
  const sumSq = new Float64Array(H);
  const count = new Float64Array(H);
  // O lado do vilao NAO pode copiar a forma do lado do heroi (D-F3-11 item 3).
  // O combo do vilao ja e sorteado proporcional ao peso, entao a amostra entra no
  // acumulador do heroi com peso 1. Do outro lado a assimetria e total: os combos
  // do HEROI sao percorridos exaustivamente com rejeicao, e o peso deles nunca
  // entrou na amostragem. Por isso o acumulador do vilao carrega
  // `hero.weight[h]` EXPLICITAMENTE — contagem simples estimaria a equity do
  // vilao contra um range de heroi UNIFORME: plausivel, estavel, reproduzivel e
  // errado.
  const villainNum = new Float64Array(V);
  const villainDen = new Float64Array(V);
  const villainSumSq = new Float64Array(V);
  const villainCount = new Float64Array(V);
  const pool = prep.pool;

  let sampleIndex = 0;
  let accepted = 0;
  let finished = false;
  let cancelled = false;
  let out: EngineResult | null = null;

  function pickVillain(): number {
    const target = rng() * totalVillainWeight;
    let lo = 0;
    let hi = V - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function runSample(): void {
    const v = pickVillain();
    const vLo = villain.lo[v];
    const vHi = villain.hi[v];

    // Runout uniforme sobre o baralho menos bordo menos as cartas do vilao. A
    // rejeicao contra o heroi vem depois, por combo — e ela que entrega a
    // distribuicao CONDICIONAL certa e mantem o estimador nao-viesado.
    let rLo = 0;
    let rHi = 0;
    let c1 = -1;
    let c2 = -1;
    for (let picked = 0; picked < runoutCards; picked++) {
      let code = -1;
      // Poucas colisoes: o baralho tem 47+ cartas vivas para 1 ou 2 sorteios.
      for (let attempt = 0; attempt < 64; attempt++) {
        const candidate = pool[Math.floor(rng() * pool.length)];
        const m = cardMask(candidate);
        if (collides(m.lo, m.hi, vLo, vHi)) continue;
        if (collides(m.lo, m.hi, rLo, rHi)) continue;
        code = candidate;
        break;
      }
      if (code < 0) return; // baralho degenerado: amostra descartada, sem inventar
      const m = cardMask(code);
      rLo |= m.lo;
      rHi |= m.hi;
      if (picked === 0) c1 = code;
      else c2 = code;
    }

    const b0 = prep.boardCodes[0];
    const b1 = prep.boardCodes[1];
    const b2 = prep.boardCodes[2];
    const b3 = boardLen >= 4 ? prep.boardCodes[3] : c1;
    const b4 = boardLen >= 5 ? prep.boardCodes[4] : boardLen === 4 ? c1 : c2;
    loadBoard(b0, b1, b2, b3, b4);

    const villainScore = evalWithBoard(villain.codeA[v], villain.codeB[v]);

    for (let h = 0; h < H; h++) {
      const hLo = hero.lo[h];
      const hHi = hero.hi[h];
      // Rejeicao: par que divide carta nao se enfrenta, e runout que come carta do
      // heroi nao existe para ele. Card removal continua EXATO dentro da amostragem.
      if (collides(hLo, hHi, vLo, vHi)) continue;
      if (collides(hLo, hHi, rLo, rHi)) continue;
      const heroScore = evalWithBoard(hero.codeA[h], hero.codeB[h]);
      const outcome = heroScore > villainScore ? 1 : heroScore < villainScore ? 0 : 0.5;
      // O combo do vilao JA foi sorteado proporcional ao peso, entao a amostra
      // entra com peso 1. Ponderar de novo aqui elevaria o peso ao quadrado.
      sum[h] += outcome;
      sumSq[h] += outcome * outcome;
      count[h] += 1;

      const heroWeight = hero.weight[h];
      const villainOutcome = 1 - outcome;
      villainNum[v] += heroWeight * villainOutcome;
      villainDen[v] += heroWeight;
      villainSumSq[v] += heroWeight * villainOutcome * villainOutcome;
      villainCount[v] += 1;
      accepted++;
    }
  }

  function finish(): void {
    finished = true;
    const halfWidths = new Float64Array(H);
    for (let h = 0; h < H; h++) {
      const n = count[h];
      if (n < 2) {
        halfWidths[h] = NaN;
        continue;
      }
      const mean = sum[h] / n;
      const variance = Math.max(0, (sumSq[h] - n * mean * mean) / (n - 1));
      const sd = variance > 0 ? Math.sqrt(variance) : DEGENERATE_SD;
      halfWidths[h] = (Z_95 * sd) / Math.sqrt(n);
    }

    const villainHalfWidths = new Float64Array(V);
    for (let v = 0; v < V; v++) {
      const n = villainCount[v];
      const den = villainDen[v];
      if (n < 2 || den <= 0) {
        villainHalfWidths[v] = NaN;
        continue;
      }
      const mean = villainNum[v] / den;
      const variance = Math.max(0, villainSumSq[v] / den - mean * mean);
      const sd = variance > 0 ? Math.sqrt(variance) : DEGENERATE_SD;
      villainHalfWidths[v] = (Z_95 * sd) / Math.sqrt(n);
    }

    out = assemble({
      request,
      prep,
      alpha,
      finalPot,
      totalShowdowns: accepted,
      equityOf: (h) => (count[h] >= 2 ? sum[h] / count[h] : null),
      halfWidthOf: (h) => (Number.isFinite(halfWidths[h]) ? halfWidths[h] : null),
      sampleCountOf: (h) => count[h],
      villainEquityOf: (v) =>
        villainCount[v] >= 2 && villainDen[v] > 0 ? villainNum[v] / villainDen[v] : null,
      villainHalfWidthOf: (v) =>
        Number.isFinite(villainHalfWidths[v]) ? villainHalfWidths[v] : null,
      villainSampleCountOf: (v) => villainCount[v],
      confidence: (weights) => aggregateConfidence(weights, halfWidths),
      seed,
      samples,
    });
  }

  return {
    totalUnits: samples,
    progress() {
      if (finished) return 1;
      return samples > 0 ? Math.min(1, sampleIndex / samples) : 0;
    },
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
    result: () => out,
    step(maxUnits: number): EngineStep {
      if (finished) return { done: true, processed: 0 };
      if (cancelled) return { done: true, processed: 0 };

      let localProcessed = 0;
      while (localProcessed < maxUnits && sampleIndex < samples) {
        runSample();
        sampleIndex++;
        localProcessed++;
      }
      if (sampleIndex >= samples) {
        finish();
        return { done: true, processed: localProcessed };
      }
      return { done: false, processed: localProcessed };
    },
  };
}

/**
 * Meia-largura do agregado: os combos do heroi sao independentes dado o peso, e
 * a variancia de uma media ponderada e a soma das variancias vezes o quadrado do
 * peso normalizado.
 */
function aggregateConfidence(
  weights: Float64Array,
  halfWidths: Float64Array,
): EngineConfidence | null {
  let total = 0;
  for (let h = 0; h < weights.length; h++) {
    if (Number.isFinite(halfWidths[h])) total += weights[h];
  }
  if (total <= 0) return null;
  let variance = 0;
  for (let h = 0; h < weights.length; h++) {
    if (!Number.isFinite(halfWidths[h])) continue;
    const share = weights[h] / total;
    variance += share * share * halfWidths[h] * halfWidths[h];
  }
  return { level: 0.95, halfWidth: Math.sqrt(variance) };
}

// ── montagem do resultado ────────────────────────────────────

interface AssembleInput {
  request: EngineRequest;
  prep: PreparedRun;
  alpha: number;
  finalPot: number;
  totalShowdowns: number;
  equityOf: (heroIndex: number) => number | null;
  halfWidthOf: (heroIndex: number) => number | null;
  sampleCountOf: (heroIndex: number) => number | null;
  villainEquityOf: (villainIndex: number) => number | null;
  villainHalfWidthOf: (villainIndex: number) => number | null;
  villainSampleCountOf: (villainIndex: number) => number | null;
  confidence: ((weights: Float64Array) => EngineConfidence | null) | null;
  seed: number | null;
  samples: number | null;
}

function assemble(input: AssembleInput): EngineResult {
  const { prep, alpha, finalPot } = input;
  const H = prep.hero.combos.length;

  const perHeroCombo: HeroComboResult[] = [];
  const aggregateWeights = new Float64Array(H);
  let num = 0;
  let den = 0;
  let callThresholdIndex = 0;

  for (let h = 0; h < H; h++) {
    const hc = prep.hero.combos[h];
    const mass = prep.pairMass[h];
    const equity = mass > EPS ? input.equityOf(h) : null;

    if (equity === null || !Number.isFinite(equity)) {
      // Onde nao ha oponente (ou nao ha amostra), NAO ha numero. Zero aqui seria
      // um numero errado com cara de certo — a regra que rege a frente.
      perHeroCombo.push({
        combo: hc.combo,
        weight: hc.weight,
        pairMass: mass,
        equity: null,
        evCall: null,
        decision: null,
        confidenceHalfWidth: null,
        sampleCount: null,
        degradedReason: mass > EPS ? "insufficient_samples" : "no_valid_villain_combo",
      });
      continue;
    }

    const evCall = equity * finalPot - input.request.spot.callAmount;
    const weight = hc.weight * mass;
    aggregateWeights[h] = weight;
    num += weight * equity;
    den += weight;
    if (evCall >= 0) callThresholdIndex++;

    perHeroCombo.push({
      combo: hc.combo,
      weight: hc.weight,
      pairMass: mass,
      equity,
      evCall,
      decision: decisionFrom(equity, alpha),
      confidenceHalfWidth: input.halfWidthOf(h),
      sampleCount: input.sampleCountOf(h),
      degradedReason: null,
    });
  }

  if (den <= 0) {
    return {
      status: "degraded",
      reason: "no_valid_pairs",
      mode: input.request.mode,
      requiredEquity: alpha,
    };
  }

  const heroRangeEquity = num / den;

  // Segunda passada, simetrica a do heroi (D-F3-11 item 4). Roda DEPOIS do
  // `den <= 0`, entao um resultado degradado nunca carrega estes campos.
  const V = prep.villain.combos.length;
  const perVillainCombo: VillainComboResult[] = [];
  let villainNum = 0;
  let villainDen = 0;

  for (let v = 0; v < V; v++) {
    const vc = prep.villain.combos[v];
    const mass = prep.villainPairMass[v];
    const equity = mass > EPS ? input.villainEquityOf(v) : null;

    if (equity === null || !Number.isFinite(equity)) {
      perVillainCombo.push({
        combo: vc.combo,
        weight: vc.weight,
        pairMass: mass,
        equity: null,
        confidenceHalfWidth: null,
        sampleCount: null,
        degradedReason: mass > EPS ? "insufficient_samples" : "no_valid_villain_combo",
      });
      continue;
    }

    const weight = vc.weight * mass;
    villainNum += weight * equity;
    villainDen += weight;

    perVillainCombo.push({
      combo: vc.combo,
      weight: vc.weight,
      pairMass: mass,
      equity,
      confidenceHalfWidth: input.villainHalfWidthOf(v),
      sampleCount: input.villainSampleCountOf(v),
      degradedReason: null,
    });
  }

  return {
    status: "ok",
    mode: input.request.mode,
    seed: input.seed,
    samples: input.samples,
    heroRangeEquity,
    requiredEquity: alpha,
    evCall: heroRangeEquity * finalPot - input.request.spot.callAmount,
    decision: decisionFrom(heroRangeEquity, alpha),
    confidence: input.confidence ? input.confidence(aggregateWeights) : null,
    perHeroCombo,
    perVillainCombo,
    villainRangeEquity: villainDen > 0 ? villainNum / villainDen : 1 - heroRangeEquity,
    callThresholdIndex,
    runoutsPerPair: prep.runoutsPerPair,
    totalShowdowns: input.totalShowdowns,
    emptyHeroEntries: prep.emptyHeroEntries,
    emptyVillainEntries: prep.emptyVillainEntries,
  };
}

/** Conveniencia para teste e para o runner sincrono: roda ate o fim de uma vez. */
export function runEngineToCompletion(request: EngineRequest): EngineResult {
  const run = createEngineRun(request);
  run.step(Infinity);
  const result = run.result();
  if (!result) {
    throw new Error("motor terminou sem resultado — corrida cancelada durante execucao sincrona");
  }
  return result;
}
