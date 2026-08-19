// Range Lab / F3b — a cascata: cinco degraus, cada um com fonte nomeada.
//
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.2, criterio 6 REESCRITO)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (Refutacao 2, Refutacao 3, D-F3-26, D-F3-36)
//
// A cascata responde "de onde veio esse numero": 1326 combos possiveis, o que ele
// declarou, o que o bordo comeu, o que as SUAS cartas mataram, e o que sobra
// perdendo para voce.
import {
  decisionBasis,
  partitionVillainRows,
  splitByConfrontation,
  villainRowsOf,
} from "./confront";
import type { ConfrontBasis } from "./confront";
import { boardDeadSet, expandRangeV2 } from "./engine/expand";
import type { EngineResult, EngineResultOk, VillainComboResult } from "./engine/types";
import type { Card, RangeEntry } from "./types";

const EPS = 1e-9;

/** Combos distintos de duas cartas num baralho de 52: C(52,2). */
export const NOMINAL_COMBOS = 1326;

export type CascadeStepId =
  | "nominal"
  | "declared"
  | "after_board_removal"
  | "after_mutual_removal"
  | "loses_to_hero";

export type CascadeStepUnavailable = "no_result" | "engine_degraded";

export type CascadeStep =
  | {
      id: CascadeStepId;
      status: "ok";
      mass: number;
      /** `null` = esta base nao produz contagem discreta (D-F3-26). */
      combos: number | null;
      /** So o degrau 5 declara base. */
      basis: ConfrontBasis | null;
    }
  | { id: CascadeStepId; status: "unavailable"; reason: CascadeStepUnavailable };

export interface Cascade {
  /** Sempre 5, sempre na mesma ordem. */
  steps: CascadeStep[];
  basis: ConfrontBasis | null;
  /** Degrau 3 menos degrau 4 — o mesmo numero do painel de bloqueadores. */
  blockedMass: number | null;
}

function ok(
  id: CascadeStepId,
  mass: number,
  combos: number | null,
  basis: ConfrontBasis | null = null,
): CascadeStep {
  return { id, status: "ok", mass, combos, basis };
}

function unavailable(id: CascadeStepId, reason: CascadeStepUnavailable): CascadeStep {
  return { id, status: "unavailable", reason };
}

/** Massa total do range do heroi — o denominador do degrau 4 (Refutacao 2). */
function heroTotalWeight(result: EngineResultOk): number {
  let total = 0;
  for (const row of result.perHeroCombo) total += row.weight;
  return total;
}

/**
 * Degrau 4: quanto da massa DELE sobrevive as SUAS cartas.
 *
 * NAO e `sum(pairMass)` (Refutacao 2): somar `villainPairMass` sobre `v` conta a
 * massa do HEROI uma vez por combo do vilao. Com heroi de massa 1 e 200 combos
 * vivos, esse degrau marcaria 200 logo abaixo de um degrau 3 de 138 — a barra
 * SUBIRIA. Ponderar por `heroTotalWeight` devolve a grandeza a unidade do degrau
 * 3, e a monotonia passa a valer por construcao.
 */
function afterMutualRemoval(
  result: EngineResultOk,
  villainRows: readonly VillainComboResult[],
): number {
  const heroTotal = heroTotalWeight(result);
  if (!(heroTotal > EPS)) return 0;
  let mass = 0;
  for (const row of villainRows) {
    mass += (row.weight * row.pairMass) / heroTotal;
  }
  return mass;
}

/**
 * Degrau 5, sobre os combos VIVOS.
 *
 * Base `discrete` (river E heroi de mao unica): `blefe + 0,5 * chop`, com a
 * contagem do balde de blefe. Base `effective`: `SUM w * (1 - equity)` — o chop
 * ja entra pela metade dentro da equity, entao nao ha bucket a somar por fora, e
 * nao ha contagem discreta a dar (D-F3-36).
 */
function losesToHero(
  result: EngineResultOk,
  alive: readonly VillainComboResult[],
  board: readonly Card[],
  basis: ConfrontBasis,
): { mass: number; combos: number | null } {
  if (basis === "discrete") {
    const hero = result.perHeroCombo[0]?.combo ?? null;
    const split = splitByConfrontation({
      hero,
      rows: alive.map((row) => ({ combo: row.combo, weight: row.weight, equity: row.equity })),
      board,
      basis,
    });
    return { mass: split.bluff.mass + 0.5 * split.chop.mass, combos: split.bluff.combos };
  }

  let mass = 0;
  for (const row of alive) {
    if (row.equity === null) {
      // Combo vivo sem numero nao deveria existir no modo exato; se aparecer, o
      // log vem ANTES do fallback e a linha fica de fora — somar 0 seria dizer
      // "ele perde inteiro", somar o peso seria dizer "ele ganha inteiro"
      // (licao #9).
      console.warn(
        "[range-lab] combo vivo do vilao sem equity no degrau 5 da cascata: " +
          "ele fica fora da massa efetiva desta corrida.",
      );
      continue;
    }
    mass += row.weight * (1 - row.equity);
  }
  return { mass, combos: null };
}

/**
 * Os degraus 1 a 3 sao LOCAIS: existem sem o motor, e continuam de pe enquanto a
 * corrida nao chega. Os degraus 4 e 5 dependem dela e saem `unavailable` com razao
 * — nunca com massa zero, que na barra seria lido como "as suas cartas mataram o
 * range inteiro" (D-F3-26).
 */
export function buildCascade(input: {
  villainRange: readonly RangeEntry[];
  board: readonly Card[];
  result: EngineResult | null;
}): Cascade {
  const { villainRange, board, result } = input;
  const entries = villainRange as RangeEntry[];

  // Degrau 2 sai de `expandRangeV2` com o conjunto de mortas VAZIO, e nao de
  // `enumerateCombos` por fora: e ele quem faz parse, filtro de naipe, clampFreq e
  // o DEDUPE por comboKey que impede "AKs" mais "AsKs" de contar duas vezes — e o
  // dedupe e o que ninguem lembraria de reimplementar (D-F3-26).
  const declared = expandRangeV2(entries, new Set<string>());
  const afterBoard = expandRangeV2(entries, boardDeadSet(board as Card[]));

  const locals: CascadeStep[] = [
    ok("nominal", NOMINAL_COMBOS, NOMINAL_COMBOS),
    ok("declared", declared.totalWeight, declared.combos.length),
    ok("after_board_removal", afterBoard.totalWeight, afterBoard.combos.length),
  ];

  // `villainRowsOf` devolve `null` quando o resultado chegou sem `perVillainCombo`
  // (worker de bundle antigo). Ai os degraus 4 e 5 saem indisponiveis com razao —
  // massa zero seria mentira, nao ausencia.
  const villainRows = result !== null && result.status === "ok" ? villainRowsOf(result) : null;

  if (result === null || result.status !== "ok" || villainRows === null) {
    const reason: CascadeStepUnavailable = result === null ? "no_result" : "engine_degraded";
    return {
      steps: [
        ...locals,
        unavailable("after_mutual_removal", reason),
        unavailable("loses_to_hero", reason),
      ],
      basis: null,
      blockedMass: null,
    };
  }

  const { basis } = decisionBasis(result, board);
  const mutualMass = afterMutualRemoval(result, villainRows);
  const { alive } = partitionVillainRows(villainRows);
  const last = losesToHero(result, alive, board, basis);

  return {
    steps: [
      ...locals,
      ok("after_mutual_removal", mutualMass, alive.length),
      ok("loses_to_hero", last.mass, last.combos, basis),
    ],
    basis,
    blockedMass: afterBoard.totalWeight - mutualMass,
  };
}
