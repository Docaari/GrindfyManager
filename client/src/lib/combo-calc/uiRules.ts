// Regras de tela da Calculadora de Combos como funcoes puras — testaveis fora do
// React. Cada uma existe porque a versao dentro do componente mentia ou calava:
//  - parseImportedFrequency: "AKo:50" virava 5000% na celula (RF-00.6).
//  - resolveCardClick: clique com bordo cheio nao fazia nada, sem dizer por que.
//  - describeSpotReadiness: range inteiro em frequencia 0 passava pelo portao e
//    produzia um FOLD vermelho de 0% (RF-00.2).
import type { Card, RangeEntry } from "./types";
import { cardKey } from "./cards";
import { clampFreq } from "./combos";
import type { BlockerAvailability } from "./blockers";
import type { CascadeStep, CascadeStepId, CascadeStepUnavailable } from "./cascade";
import type { BluffBalance, BluffBalanceVerdict, MdfDegradedReason, MdfResult } from "./mdf";

// ── RF-00.6: frequencia vinda do import ──────────────────────

export type ImportedFrequencyReason = "not_a_number" | "out_of_range";

export type ImportedFrequency =
  | { ok: true; frequency: number }
  | { ok: false; reason: ImportedFrequencyReason; raw: string };

/** Numero simples, com ponto ou virgula decimal. Recusa "1.2.3" e "NaN". */
const NUMERIC_RE = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Normaliza a frequencia na FRONTEIRA do import, nao la no fundo em `clampFreq`.
 * Valor `> 1` e lido como percentual (`50` -> `0.5`); `> 100` ou negativo e
 * RECUSADO com razao nomeada — truncar em silencio esconde um range errado.
 * `clampFreq` continua sendo a ultima linha de defesa.
 */
export function parseImportedFrequency(raw: unknown): ImportedFrequency {
  const asText = typeof raw === "string" ? raw : raw == null ? "" : String(raw);

  let n: number;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, reason: "not_a_number", raw: asText };
    n = raw;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    if (!NUMERIC_RE.test(t)) return { ok: false, reason: "not_a_number", raw: asText };
    n = parseFloat(t.replace(",", "."));
    if (!Number.isFinite(n)) return { ok: false, reason: "not_a_number", raw: asText };
  } else {
    return { ok: false, reason: "not_a_number", raw: asText };
  }

  if (n < 0 || n > 100) return { ok: false, reason: "out_of_range", raw: asText };
  // 1 e a fronteira: continua sendo 100%, nao vira 1%.
  return { ok: true, frequency: n > 1 ? n / 100 : n };
}

// ── RF-00.7: clique na grade de 52 cartas ────────────────────

export type CardSlot = "board" | "hero";

export type CardClickAction =
  | { type: "add"; to: CardSlot; retargeted: boolean }
  | { type: "remove"; from: CardSlot }
  | { type: "reject"; reason: "no_room" };

const CAPACITY: Record<CardSlot, number> = { board: 5, hero: 2 };

/**
 * Decide o que um clique na grade faz. Remover vem sempre antes de qualquer
 * recusa: uma carta ja alocada sai de onde estiver mesmo com tudo cheio — senao
 * o jogador fica preso sem conseguir desfazer.
 */
export function resolveCardClick(input: {
  card: Card;
  board: Card[];
  hero: Card[];
  target: CardSlot;
}): CardClickAction {
  const key = cardKey(input.card);
  if (input.board.some((c) => cardKey(c) === key)) return { type: "remove", from: "board" };
  if (input.hero.some((c) => cardKey(c) === key)) return { type: "remove", from: "hero" };

  const sizeOf = (slot: CardSlot) =>
    slot === "board" ? input.board.length : input.hero.length;
  const other: CardSlot = input.target === "board" ? "hero" : "board";

  if (sizeOf(input.target) < CAPACITY[input.target]) {
    return { type: "add", to: input.target, retargeted: false };
  }
  if (sizeOf(other) < CAPACITY[other]) {
    return { type: "add", to: other, retargeted: true };
  }
  return { type: "reject", reason: "no_room" };
}

// ── RF-00.2: quando o spot esta pronto para virar veredito ───

export type SpotReadinessReason =
  | "board_incomplete"
  | "hero_incomplete"
  | "pot_missing"
  | "call_missing"
  | "range_empty"
  | "range_weightless";

export interface SpotReadiness {
  ready: boolean;
  reason: SpotReadinessReason | null;
}

/** Peso vivo da classe: a frequencia da classe OU qualquer override por combo. */
function entryHasWeight(e: RangeEntry): boolean {
  if (clampFreq(e.frequency) > 0) return true;
  const overrides = e.comboFreqOverrides;
  if (!overrides) return false;
  return Object.values(overrides).some((v) => clampFreq(v) > 0);
}

/**
 * O portao antigo so checava `entries.length > 0`: um range inteiro em frequencia
 * 0 entrava e a tela mostrava FOLD -EV com 0.0% de equity. Um numero errado com
 * cara de certo. A razao e nomeada para a UI escolher a mensagem certa.
 */
export function describeSpotReadiness(draft: {
  board: Card[];
  hero: Card[];
  entries: RangeEntry[];
  potCurrent: number;
  callAmount: number;
}): SpotReadiness {
  const block = (reason: SpotReadinessReason): SpotReadiness => ({ ready: false, reason });

  if (draft.board.length < 3 || draft.board.length > 5) return block("board_incomplete");
  if (draft.hero.length !== 2) return block("hero_incomplete");
  // Pote/call ausentes zeram alpha e transformam qualquer equity em "CALL +EV".
  if (!(draft.potCurrent > 0)) return block("pot_missing");
  if (!(draft.callAmount > 0)) return block("call_missing");
  if (draft.entries.length === 0) return block("range_empty");
  if (!draft.entries.some(entryHasWeight)) return block("range_weightless");

  return { ready: true, reason: null };
}

// ── F3b: as frases da aritmetica da decisao (D-F3-16 + D-F3-32) ──
//
// A D-F3-16 e requisito de aceite: "numero nunca aparece solto; sempre em frase,
// com sujeito, com a consequencia escrita". Requisito de aceite que so existe
// dentro de JSX so se testa cacando texto no DOM — o anti-padrao da licao #2. As
// frases nascem AQUI, no modulo que ja e desse genero no Range Lab
// (`describeSpotReadiness`), e nao num modulo de copy novo: um segundo lugar para
// a mesma coisa e como a divergencia entra.
//
// Tres porcentagens parecidas dividem o mesmo cartao (a equity que VOCE precisa,
// o quanto o blefe DELE precisa funcionar, e o quanto voce precisa defender).
// Cada frase carrega o sujeito junto do numero — e a unica coisa que impede o
// jogador de somar duas delas com os olhos.

/** Formata fracao 0..1 como porcentagem PT-BR com uma casa. */
function formatPercentPtBr(fraction: number): string {
  return `${(fraction * 100).toFixed(1).replace(".", ",")}%`;
}

/** Massa de combos: inteiro sai sem casa decimal, fracao sai com uma. */
function formatMassPtBr(mass: number): string {
  return Number.isInteger(mass) ? String(mass) : mass.toFixed(1).replace(".", ",");
}

export type MdfCopy =
  | {
      status: "ok";
      headline: string;
      heroEquityLine: string;
      defenseLine: string;
      mdfLine: string;
      /** `null` enquanto nao houver corrida: as tres frases acima nao dependem dela. */
      balanceLine: string | null;
      action: string;
      formulaTooltip: string;
    }
  | {
      status: "degraded";
      reason: MdfDegradedReason;
      headline: string;
      action: string;
      formulaTooltip: string;
    };

/** A formula vive AQUI e em lugar nenhum mais — a face do cartao leva frase. */
const MDF_FORMULA_TOOLTIP =
  "Alpha de defesa = B / (P + B), com P sendo o pote antes da aposta e B a aposta dele. " +
  "O MDF e o complemento: o que sobra depois de tirar o alpha.";

const MDF_ACTION_BY_VERDICT: Record<BluffBalanceVerdict, string> = {
  bluffs_missing: "Ele blefa de menos aqui: da pra foldar mais contra esta aposta.",
  balanced: "Ele esta equilibrado: pague com os bluffcatchers de topo e solte o resto.",
  bluffs_excess: "Ele blefa demais aqui: pague mais largo do que a leitura padrao.",
};

const MDF_ACTION_WITHOUT_BALANCE =
  "Monte o range dele para saber se os blefes fecham a conta desta aposta.";

/**
 * `P <= 0` (ou pote/aposta nao finitos) vira frase de ESTADO, sem numero nenhum.
 * Zero seria pior que vazio, e um `NaN` que passa pinta um cartao inteiro de
 * tracinhos sem explicacao (criterio 3, D-F3-23).
 */
export function describeMdf(input: {
  mdf: MdfResult;
  requiredEquity: number;
  balance: BluffBalance | null;
}): MdfCopy {
  const { mdf, requiredEquity: heroAlpha, balance } = input;

  if (mdf.status !== "ok") {
    return {
      status: "degraded",
      reason: mdf.reason,
      headline:
        "Confira o pote e a aposta: o pote antes da aposta precisa ser maior que zero " +
        "para haver o que defender.",
      action: "Ajuste os valores e o cartao volta.",
      formulaTooltip: MDF_FORMULA_TOOLTIP,
    };
  }

  const balanceOk = balance !== null && balance.status === "ok" ? balance : null;

  let balanceLine: string | null = null;
  if (balanceOk) {
    const value = formatMassPtBr(balanceOk.valueMass);
    const needed = formatMassPtBr(balanceOk.bluffsNeeded);
    const gap = formatMassPtBr(Math.abs(balanceOk.bluffGap));
    const fecho =
      balanceOk.verdict === "bluffs_missing"
        ? `faltam ${gap} de blefe para a aposta se sustentar.`
        : balanceOk.verdict === "bluffs_excess"
          ? `ele passa disso em ${gap}.`
          : "e a conta fecha exatamente.";
    balanceLine = `Ele aposta ${value} de value e precisaria de ${needed} de blefe: ${fecho}`;
  }

  return {
    status: "ok",
    headline: "Quanto o blefe dele precisa funcionar",
    heroEquityLine: `Para pagar, a sua mao precisa de ${formatPercentPtBr(heroAlpha)} de equity.`,
    defenseLine: `O blefe dele so se paga se funcionar ${formatPercentPtBr(mdf.defenseAlpha)} das vezes.`,
    mdfLine: `Para o blefe dele nao sair de graca, a sua defesa tem de cobrir ${formatPercentPtBr(mdf.mdf)} da massa.`,
    balanceLine,
    action: balanceOk ? MDF_ACTION_BY_VERDICT[balanceOk.verdict] : MDF_ACTION_WITHOUT_BALANCE,
    formulaTooltip: MDF_FORMULA_TOOLTIP,
  };
}

// ── rotulos da cascata ───────────────────────────────────────

const CASCADE_LABEL: Record<CascadeStepId, string> = {
  nominal: "Todos os combos do baralho",
  declared: "O range que voce declarou",
  after_board_removal: "O que sobrou depois do bordo",
  after_mutual_removal: "O que sobrou depois das suas cartas",
  loses_to_hero: "O que perde para voce",
};

const CASCADE_UNAVAILABLE_NOTE: Record<CascadeStepUnavailable, string> = {
  no_result:
    "Ainda nao ha corrida: monte o spot para ver quanto as suas cartas tiram do range dele.",
  engine_degraded:
    "A corrida nao produziu numero, entao este degrau fica em branco — e nao vazio.",
};

/**
 * Fora do river (ou com o heroi como range) nao existe "combo que perde", existe
 * combo com equity: o rotulo passa a ser `massa efetiva` (F-4). Foi assim que o
 * `breakevenFrequency` da F0 anunciou 0,42 contra 0,20 real (D11).
 */
export function describeCascadeStep(step: CascadeStep): { label: string; note: string | null } {
  if (step.status !== "ok") {
    return { label: CASCADE_LABEL[step.id], note: CASCADE_UNAVAILABLE_NOTE[step.reason] };
  }

  if (step.id === "loses_to_hero") {
    return step.basis === "discrete"
      ? {
          label: CASCADE_LABEL.loses_to_hero,
          note: "Contagem de maos dele que a sua bate no showdown; o chop entra pela metade.",
        }
      : {
          label: CASCADE_LABEL.loses_to_hero,
          note: "Fora do river isto e massa efetiva, e nao contagem de maos.",
        };
  }

  return { label: CASCADE_LABEL[step.id], note: null };
}

// ── o motivo do bloqueador indisponivel ──────────────────────

/**
 * Frase especifica em vez do generico "indisponivel", que faz o jogador achar que
 * quebrou. `hero_is_range` cita a contagem; as outras duas nao inventam numero
 * nenhum, porque nao ha contagem de onde tirar (D-F3-30, D-F3-38).
 */
export function describeBlockerUnavailable(
  availability: Extract<BlockerAvailability, { available: false }>,
): string {
  if (availability.reason === "hero_is_range") {
    return (
      `O seu range tem ${availability.heroCombos} combos, e o efeito de bloqueio precisa ` +
      "de uma mao so. Escolha uma mao para ver o que ela tira do range dele."
    );
  }
  if (availability.reason === "engine_degraded") {
    return "A corrida nao produziu numero, entao o efeito das suas cartas fica indisponivel.";
  }
  return "Monte o spot: sem corrida nao da para dizer o que as suas cartas tiram do range dele.";
}
