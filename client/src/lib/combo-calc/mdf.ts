// Range Lab / F3b — a aritmetica minima da defesa: alpha do vilao, MDF, blefes
// necessarios e a ordem dos bluffcatchers.
//
// Spec  : Docs/specs/range-lab/F3b-decisao.md (criterios 1, 2 e 3)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (achado F-1)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-12, D-F3-23, D-F3-31, D-F3-37)
//
// ESTE MODULO NAO CONHECE `ev.ts`, E ISSO E DELIBERADO.
//
// Sao dois alphas com significados diferentes que vao para o MESMO cartao:
//   - o alpha do HEROI (`ev.ts`) e quanto de equity ele precisa para pagar;
//   - o alpha de DEFESA (aqui) e quanto o blefe DELE precisa funcionar.
// Com pote 20 e aposta 10 sao 25% contra 33,3%. Reusar o primeiro como base do
// MDF produz 75% onde o certo e 67% — numero plausivel, estavel e falso. Nao
// importar o vizinho e o que torna a confusao impossivel de escrever por
// acidente; ha teste estrutural cobrando a ausencia do import.
import { comboKey } from "./cards";
import type { Card } from "./types";

/** Abaixo disso, dois pesos sao o mesmo peso (mesmo epsilon do motor). */
const EPS = 1e-9;

// ── MDF e alpha de defesa ────────────────────────────────────

export type MdfDegradedReason = "invalid_pot_before_bet";

export interface MdfOk {
  status: "ok";
  /** P = pote ANTES da aposta = potCurrent - callAmount. */
  potBeforeBet: number;
  /** B = a aposta dele = callAmount. */
  bet: number;
  /** B / (P + B) — o quanto o blefe DELE precisa funcionar. */
  defenseAlpha: number;
  /** P / (P + B) = 1 - defenseAlpha — o quanto voce precisa defender. */
  mdf: number;
}

export interface MdfDegraded {
  status: "degraded";
  reason: MdfDegradedReason;
}

/**
 * Uniao discriminada, nao objeto de campos nulos (D-F3-23). Campo lido e campo
 * que alguem le: um `mdf: null` sobrevive a um `if` esquecido e vira `NaN%` na
 * tela; um campo AUSENTE nao tem como vazar.
 */
export type MdfResult = MdfOk | MdfDegraded;

/**
 * `potCurrent` ja inclui a aposta do vilao (mesma convencao do resto da
 * calculadora), entao o pote antes dela e `potCurrent - callAmount`.
 *
 * Entrada nao finita cai na MESMA razao de `P <= 0`: o jogador digitando o pote
 * produz `NaN` no meio da digitacao, e um `NaN` que passa vira `alpha = NaN` e um
 * cartao inteiro de tracinhos sem explicacao.
 */
export function computeMdf(potCurrent: number, callAmount: number): MdfResult {
  const degraded: MdfDegraded = { status: "degraded", reason: "invalid_pot_before_bet" };

  if (!Number.isFinite(potCurrent) || !Number.isFinite(callAmount)) return degraded;
  if (callAmount < 0) return degraded;

  const potBeforeBet = potCurrent - callAmount;
  if (!(potBeforeBet > 0)) return degraded;

  const finalPot = potBeforeBet + callAmount;
  const defenseAlpha = callAmount / finalPot;

  return {
    status: "ok",
    potBeforeBet,
    bet: callAmount,
    defenseAlpha,
    // Subtracao em vez de `P / (P + B)`: e o que faz `mdf + defenseAlpha` fechar
    // em 1 por construcao, sem depender de duas divisoes coincidirem em ULP.
    mdf: 1 - defenseAlpha,
  };
}

// ── blefes necessarios ───────────────────────────────────────

export type BluffBalanceVerdict = "bluffs_missing" | "balanced" | "bluffs_excess";
export type BluffBalanceDegradedReason = "no_value_mass";

export interface BluffBalanceOk {
  status: "ok";
  valueMass: number;
  bluffMass: number;
  chopMass: number;
  /** Combos sem numero: exibidos, NUNCA somados como blefe (D-F3-24). */
  unknownMass: number;
  bluffsNeeded: number;
  /** `bluffsNeeded - bluffMass`; negativo significa que ele blefa demais. */
  bluffGap: number;
  verdict: BluffBalanceVerdict;
}

export interface BluffBalanceDegraded {
  status: "degraded";
  reason: BluffBalanceDegradedReason;
}

export type BluffBalance = BluffBalanceOk | BluffBalanceDegraded;

/**
 * `valueMass * alpha / (1 - alpha)` simplifica EXATAMENTE para
 * `valueMass * B / P`. E essa a forma implementada: uma divisao em vez de tres
 * operacoes, e o unico denominador que aparece e o `P` que a guarda de
 * `computeMdf` ja protegeu (D-F3-23).
 *
 * Aceita apenas `MdfOk`: o compilador cobra o `if` uma vez, no lugar certo.
 */
export function computeBluffBalance(
  mdf: MdfOk,
  masses: { value: number; bluff: number; chop: number; unknown: number },
): BluffBalance {
  const valueMass = masses.value;
  // "Precisa de 0 blefes" nao e resposta: sem massa de value nao existe razao de
  // blefe a cobrar dele.
  if (!Number.isFinite(valueMass) || valueMass <= EPS) {
    return { status: "degraded", reason: "no_value_mass" };
  }

  const bluffsNeeded = (valueMass * mdf.bet) / mdf.potBeforeBet;
  const bluffGap = bluffsNeeded - masses.bluff;

  const verdict: BluffBalanceVerdict =
    Math.abs(bluffGap) <= EPS ? "balanced" : bluffGap > 0 ? "bluffs_missing" : "bluffs_excess";

  return {
    status: "ok",
    valueMass,
    bluffMass: masses.bluff,
    chopMass: masses.chop,
    unknownMass: masses.unknown,
    bluffsNeeded,
    bluffGap,
    verdict,
  };
}

// ── ordem dos bluffcatchers ──────────────────────────────────

/**
 * Forma minima de uma linha do lado do heroi. Declarada AQUI, e nao importada de
 * `engine/types`, porque este modulo nao depende do motor (D-F3-12) —
 * `HeroComboResult` satisfaz este contrato por estrutura.
 */
export interface BluffcatcherRow {
  combo: readonly [Card, Card];
  equity: number | null;
  evCall: number | null;
}

export interface BluffcatcherRanking {
  /** comboKeys, do melhor ao pior. So combos COM numero (D-F3-37). */
  order: string[];
  /** Posicao 1-based por comboKey. */
  rankByCombo: Map<string, number>;
  /** Tem que bater com `EngineResultOk.callThresholdIndex`. */
  thresholdIndex: number;
  /** Combos COM numero — nao `perHeroCombo.length`. */
  total: number;
}

/**
 * `evCall = equity * finalPot - callAmount` e funcao afim CRESCENTE da equity,
 * entao ordenar por EV e ordenar por equity: o corte de EV zero e necessariamente
 * um prefixo desta ordem.
 *
 * O desempate por `comboKey` e a regra, nao a excecao: no river metade do range
 * costuma ter equity exatamente 1 ou 0, e a ordem de `perHeroCombo` acompanha a
 * ordem das entradas do range — que muda quando o jogador pinta uma celula. Sem
 * desempate total, o `k` da tela piscaria sem nada ter mudado (D-F3-31).
 *
 * Combo com `equity: null` fica FORA do ranking: no fim seria dizer que ele e o
 * pior, no comeco que e o melhor (D-F3-37).
 */
export function rankBluffcatchers(rows: readonly BluffcatcherRow[]): BluffcatcherRanking {
  const withNumber = rows.filter((row) => row.equity !== null);

  const keyed = withNumber.map((row) => ({
    key: comboKey(row.combo[0], row.combo[1]),
    equity: row.equity as number,
    evCall: row.evCall,
  }));

  keyed.sort((a, b) => {
    if (b.equity !== a.equity) return b.equity - a.equity;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const rankByCombo = new Map<string, number>();
  keyed.forEach((row, index) => rankByCombo.set(row.key, index + 1));

  let thresholdIndex = 0;
  for (const row of keyed) {
    if (row.evCall !== null && row.evCall >= 0) thresholdIndex++;
  }

  return {
    order: keyed.map((row) => row.key),
    rankByCombo,
    thresholdIndex,
    total: keyed.length,
  };
}
