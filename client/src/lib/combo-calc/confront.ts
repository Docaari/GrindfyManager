// Range Lab / F3b — quem esta na frente, com qual metodo e sobre qual base.
//
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.3, RF-03.4, F-4)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-24 os quatro baldes, D-F3-25 a base declarada, D-F3-35, D-F3-36)
//
// POR QUE ESTE MODULO EXISTE SEPARADO
//
// Dois paineis precisam da MESMA conta: o do MDF (para `valueMass` e
// `bluffMass`) e o de bloqueadores (para "quantos combos de value esta carta
// remove"). Poe-la em `mdf.ts` faria `blockers.ts` importar `mdf.ts` e tirar dele
// o papel de aritmetica minima; poe-la em `blockers.ts` faria `mdf.ts` importar o
// modulo pesado. Terceiro modulo, arvore rasa e aciclica (D-F3-24).
import { compareHands, evaluateHand } from "./evaluator";
import type { EngineResultOk, VillainComboResult } from "./engine/types";
import type { Card } from "./types";

/**
 * Avisa UMA vez por sessao que o resultado chegou sem `perVillainCombo`. Repetir a
 * cada render afogaria o console a cada tecla no pote — mesma manobra que
 * `RangeLab.tsx` ja usa para o mesmo caso.
 */
let missingVillainRowsWarned = false;

/**
 * `perVillainCombo` nasceu na F3a e e obrigatorio em `EngineResultOk`. Um resultado
 * sem ele so pode vir de um worker de bundle antigo ainda vivo no navegador do
 * jogador. Devolver `null` (e nao uma lista vazia) e o que permite ao chamador
 * dizer "nao sei" em vez de desenhar massa zero — que na barra da cascata seria
 * lido como "as suas cartas mataram o range inteiro". O log vem ANTES do fallback
 * (licao #9).
 */
export function villainRowsOf(result: EngineResultOk): VillainComboResult[] | null {
  const rows = result.perVillainCombo;
  if (Array.isArray(rows)) return rows;
  if (!missingVillainRowsWarned) {
    missingVillainRowsWarned = true;
    console.warn(
      "[range-lab] resultado do motor sem `perVillainCombo` (bundle antigo?): " +
        "cascata e bloqueador ficam indisponiveis nesta corrida.",
    );
  }
  return null;
}

/** Abaixo disso, um combo do vilao nao enfrenta ninguem: e bloqueado. */
const ALIVE_EPS = 1e-9;

/**
 * Divide as linhas do vilao em vivas e bloqueadas.
 *
 * Os tres consumidores (cascata, bloqueador e o cartao de MDF na pagina) faziam o
 * mesmo `filter(pairMass > 1e-9)` cada um por sua conta, um deles com o epsilon
 * escrito na mao. O criterio de "este combo existe neste spot" e conhecimento de
 * dominio e mora num lugar so.
 */
export function partitionVillainRows(rows: readonly VillainComboResult[]): {
  alive: VillainComboResult[];
  blocked: VillainComboResult[];
} {
  const alive: VillainComboResult[] = [];
  const blocked: VillainComboResult[] = [];
  for (const row of rows) {
    if (row.pairMass > ALIVE_EPS) alive.push(row);
    else blocked.push(row);
  }
  return { alive, blocked };
}

export type ConfrontOutcome = "value" | "bluff" | "chop" | "unknown";
export type ConfrontBasis = "discrete" | "effective";
export type ConfrontMethod = "showdown_now" | "equity_vs_range";

export interface ConfrontBucket {
  combos: number;
  mass: number;
}

export interface ConfrontationSplit {
  method: ConfrontMethod;
  basis: ConfrontBasis;
  value: ConfrontBucket;
  bluff: ConfrontBucket;
  chop: ConfrontBucket;
  unknown: ConfrontBucket;
  /** Massa DECLARADA das linhas recebidas — o denominador dos dois paineis. */
  totalMass: number;
}

/**
 * A base sai do RESULTADO, nunca do estado da UI.
 *
 * `discrete` exige as DUAS condicoes. No river com heroi de mao unica a equity de
 * um combo do vilao so pode ser 0, 0,5 ou 1 — contagem discreta e honesta. No
 * river com heroi como RANGE ela volta a ser continua (ele ganha de parte do seu
 * range), e uma "contagem de combos que perdem" seria inventada — foi assim que o
 * `breakevenFrequency` da F0 anunciou 0,42 contra 0,20 real (D11).
 *
 * O predicado le `perHeroCombo`, e nao o toggle "Minha mao" da tela: com ele
 * selecionado o jogador ainda pode pintar `AKs` e ter 4 combos. Quem manda e o
 * range expandido (D-F3-25).
 */
export function decisionBasis(
  result: EngineResultOk,
  board: readonly Card[],
): { basis: ConfrontBasis; heroCombos: number } {
  const heroCombos = result.perHeroCombo.length;
  const basis: ConfrontBasis = board.length === 5 && heroCombos === 1 ? "discrete" : "effective";
  return { basis, heroCombos };
}

/**
 * Quem esta na frente AGORA, no bordo atual. `evaluateHand` aceita 5 a 7 cartas,
 * entao flop e turn entram sem inventar carta (D-F3-17).
 *
 * O par pode ser IMPOSSIVEL (heroi e vilao dividindo carta) — e o caso dos combos
 * bloqueados. Nao ha avaliacao de 9 cartas em lugar nenhum: sao duas maos
 * separadas, cada uma legal em si, e comparar dois inteiros e aritmetica bem
 * definida (D-F3-27).
 *
 * O rotulo e o RESULTADO contra a sua mao, nao a intencao dele.
 */
export function confrontNow(
  hero: readonly [Card, Card],
  villain: readonly [Card, Card],
  board: readonly Card[],
): Exclude<ConfrontOutcome, "unknown"> {
  const cmp = compareHands(
    evaluateHand([...villain, ...board]),
    evaluateHand([...hero, ...board]),
  );
  return cmp > 0 ? "value" : cmp === 0 ? "chop" : "bluff";
}

export interface ConfrontRow {
  combo: [Card, Card];
  weight: number;
  equity: number | null;
}

function emptyBucket(): ConfrontBucket {
  return { combos: 0, mass: 0 };
}

/**
 * Separa as linhas em value / blefe / chop / desconhecido.
 *
 * O CHAMADOR decide quais linhas entram (vivas ou bloqueadas) — a conta do MDF usa
 * so as vivas, o painel de bloqueadores so as bloqueadas.
 *
 * Dois metodos, dois rotulos na tela, nunca o mesmo texto:
 *  - `hero` presente -> `showdown_now`: as CARTAS decidem. `equity: null` nao
 *    atrapalha, e por isso os combos bloqueados (que tem `pairMass 0` e portanto
 *    `equity: null` por construcao) continuam saindo separados em value removido e
 *    blefe removido (D-F3-35).
 *  - `hero` null -> `equity_vs_range`: sem "a sua mao" o showdown nao existe e o
 *    criterio passa a ser a equity contra o range. Aqui `equity: null` vai para
 *    `unknown`, NUNCA para `bluff`: zero disfarcado de blefe infla os blefes dele e
 *    vira o veredito de "da pra foldar mais" para "pague mais largo" (D-F3-24).
 *
 * A base viaja no resultado e nao muda em qual balde o combo cai: `mass` e sempre o
 * peso DECLARADO. Base e unidade de leitura do degrau da cascata, nao criterio de
 * classificacao — misturar as duas coisas daria baldes que nao fecham com
 * `totalMass` (D-F3-36).
 */
export function splitByConfrontation(input: {
  hero: readonly [Card, Card] | null;
  rows: readonly ConfrontRow[];
  board: readonly Card[];
  basis: ConfrontBasis;
}): ConfrontationSplit {
  const { hero, rows, board, basis } = input;
  const method: ConfrontMethod = hero ? "showdown_now" : "equity_vs_range";

  const buckets: Record<ConfrontOutcome, ConfrontBucket> = {
    value: emptyBucket(),
    bluff: emptyBucket(),
    chop: emptyBucket(),
    unknown: emptyBucket(),
  };
  let totalMass = 0;

  // A mao do heroi e CONSTANTE ao longo das linhas; `confrontNow` a reavaliava a
  // cada combo, e `evaluateHand` aloca um Map por chamada. Com o range inteiro sao
  // ate 1326 avaliacoes identicas jogadas fora por render. `confrontNow` continua
  // publica e intacta para quem compara um par so.
  const heroHand = hero ? evaluateHand([...hero, ...board]) : null;

  for (const row of rows) {
    let outcome: ConfrontOutcome;
    if (hero && heroHand) {
      const cmp = compareHands(evaluateHand([...row.combo, ...board]), heroHand);
      outcome = cmp > 0 ? "value" : cmp === 0 ? "chop" : "bluff";
    } else if (row.equity === null) {
      outcome = "unknown";
    } else {
      outcome = row.equity > 0.5 ? "value" : row.equity < 0.5 ? "bluff" : "chop";
    }

    buckets[outcome].combos++;
    buckets[outcome].mass += row.weight;
    totalMass += row.weight;
  }

  return {
    method,
    basis,
    value: buckets.value,
    bluff: buckets.bluff,
    chop: buckets.chop,
    unknown: buckets.unknown,
    totalMass,
  };
}
