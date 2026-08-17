// Modelo do motor de equity (F1, ADR-246 D-F1-8 e D-F1-9).
//
// O `Verdict` da v1 (`../types`) NAO e tocado: ele serve o popup e e o oraculo de
// regressao do criterio de aceite 3. Este arquivo e o mundo novo.
import type { Card, Decision, RangeEntry } from "../types";

/**
 * Spot v2: o heroi tambem e um range. Mao unica e o caso de UMA entry `specific`
 * com frequencia 1 — sem caminho de codigo separado, para nao divergir (RF-01.2).
 * Um ramo dedicado a mao unica seria o ramo que 90% do uso exercita e por onde
 * 100% dos bugs de range escapariam.
 */
export interface SpotV2 {
  board: Card[]; // 3..5 cartas
  heroRange: RangeEntry[];
  villainRange: RangeEntry[];
  potCurrent: number; // ja inclui a aposta do vilao
  callAmount: number;
}

export type EngineMode = "exact" | "monte_carlo";

export interface EngineRequest {
  spot: SpotV2;
  mode: EngineMode;
  /** So vale no Monte Carlo. Ausente = `DEFAULT_SEED`. */
  seed?: number;
  /** Orcamento de amostras do Monte Carlo. Ausente = derivado do custo. */
  samples?: number;
}

/**
 * Razao pela qual a CORRIDA INTEIRA nao produziu numero. Uniao aberta: o
 * consumidor guarda por `status`, NUNCA pela razao especifica — razao nova entra
 * sem quebrar quem consome (a licao que a F0 deixou em D8).
 */
export type EngineDegradedReason =
  | "empty_hero_range"
  | "empty_villain_range"
  | "no_valid_pairs";

/**
 * Razao pela qual UM combo do heroi saiu do agregado. Nivel diferente do de
 * cima: aqui HA resultado, so aquele combo nao tem numero.
 */
export type HeroComboDegradedReason =
  | "no_valid_villain_combo"
  | "insufficient_samples";

/** Intervalo de confianca. So existe no Monte Carlo (decisao D5). */
export interface EngineConfidence {
  level: 0.95;
  halfWidth: number;
}

export interface HeroComboResult {
  combo: [Card, Card];
  /** Frequencia do combo dentro do range do heroi. */
  weight: number;
  /**
   * Massa do range do vilao que este combo REALMENTE enfrenta (card removal
   * mutuo). E o peso do combo no agregado, junto de `weight` — produto simples de
   * pesos daria numero errado com cara de certo (D-F1-4).
   */
  pairMass: number;
  /** null quando `degradedReason != null`. Nunca 0 para dizer "nao sei". */
  equity: number | null;
  evCall: number | null;
  decision: Decision | null;
  /** Meia-largura do intervalo de 95%; null no modo exato. */
  confidenceHalfWidth: number | null;
  /** Amostras aceitas para este combo; null no modo exato. */
  sampleCount: number | null;
  degradedReason: HeroComboDegradedReason | null;
}

export interface EngineResultOk {
  status: "ok";
  mode: EngineMode;
  /** Semente efetiva do Monte Carlo; null no exato. */
  seed: number | null;
  /** Amostras pedidas ao Monte Carlo; null no exato. */
  samples: number | null;
  /** Equity agregada do range do heroi, ponderada por `weight * pairMass`. */
  heroRangeEquity: number;
  requiredEquity: number;
  evCall: number;
  decision: Decision;
  /** null no exato; NUNCA null no Monte Carlo (criterio de aceite 4). */
  confidence: EngineConfidence | null;
  perHeroCombo: HeroComboResult[];
  /**
   * Quantos combos do heroi tem EV de call `>= 0`. E a resposta direta de
   * "quantas das minhas maos pagam" — a razao de existir da frente.
   */
  callThresholdIndex: number;
  runoutsPerPair: number;
  totalShowdowns: number;
  /** Classes que zeraram por card removal ou notacao invalida (aviso da UI). */
  emptyHeroEntries: string[];
  emptyVillainEntries: string[];
}

export interface EngineResultDegraded {
  status: "degraded";
  reason: EngineDegradedReason;
  mode: EngineMode;
  /** Pot odds nao dependem do range, entao o alpha sobrevive a degradacao. */
  requiredEquity: number;
}

/**
 * Uniao discriminada: o compilador cobra o `if`. Na F0, `Verdict` degradado
 * continuava carregando `evCall` finito e quem esquecesse de checar `decision`
 * voltava a pintar o "-13,8 fichas" fantasma. Aqui isso vira erro de compilacao
 * em vez de disciplina — e disciplina nao sobrevive a fronteira de worker.
 */
export type EngineResult = EngineResultOk | EngineResultDegraded;
