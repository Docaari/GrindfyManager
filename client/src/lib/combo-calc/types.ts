// Combo Calculator — shared types.
// Estudo de poker: dado bordo + mao do heroi + range do vilao com frequencias +
// aposta, calcula se call no river e +EV, quanto falta, e qual frequencia destrava.

export type Suit = "c" | "d" | "h" | "s";
// 2..10 (T=10), J=11, Q=12, K=13, A=14.
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type RangeKind = "pair" | "suited" | "offsuit" | "anytwo" | "specific";

export interface RangeEntry {
  /** Notacao crua, ex.: "A7s", "76o", "55", "QhJh", "K7hh". */
  notation: string;
  kind: RangeKind;
  /** 0..1 — frequencia da classe (independente, nao soma 1). */
  frequency: number;
  /** Override opcional por combo concreto, chave = key(combo) ("Ac7c"). */
  comboFreqOverrides?: Record<string, number>;
  /**
   * Filtro de naipe opcional: lista de comboKeys concretos a INCLUIR. Se ausente,
   * todos os combos da classe entram. Se presente, so os listados (interseccao com
   * os disponiveis por card removal). Ex.: Q3s restrito a Qh3h + Qs3s.
   */
  suits?: string[];
}

export interface Spot {
  board: Card[]; // 3..5 cartas
  hero: [Card, Card];
  villainRange: RangeEntry[];
  potCurrent: number; // ja inclui a aposta do vilao
  callAmount: number;
}

export type Outcome = "win" | "lose" | "chop";

export interface ComboResult {
  combo: [Card, Card];
  weight: number;
  outcome: Outcome; // categoria dominante (river: deterministico; turn/flop: arredondado)
  equity: number; // 1 / 0 / 0.5 no river; fracao em turn/flop
}

export type Decision = "call" | "fold" | "breakeven";

/** Razao nomeada pela qual o veredito nao tem decisao (00-produto.md: numero errado perde para ausente). */
export type VerdictDegradedReason = "empty_range";

export interface Verdict {
  heroEquity: number; // E ponderada (0..1)
  requiredEquity: number; // alpha (0..1)
  evCall: number; // fichas, relativo a foldar
  /** null quando a massa do range e zero — a UI mostra empty state, nao FOLD. */
  decision: Decision | null;
  /** Preenchido junto com `decision: null`; null quando o veredito e legitimo. */
  degradedReason: VerdictDegradedReason | null;
  W: number; // combos ponderados que o heroi ganha (bucket discreto — contagem)
  L: number; // combos ponderados que o heroi perde (bucket discreto — contagem)
  C: number; // combos ponderados de chop (bucket discreto — contagem)
  totalCombos: number;
  /** Massa total ponderada do range (soma dos pesos dos combos vivos). */
  totalWeight: number;
  /** Massa efetiva de vitoria: soma(w * equity). Base do calculo fora do river. */
  wEff: number;
  /** Massa efetiva de derrota: soma(w * (1 - equity)). */
  lEff: number;
  equityGap: number; // pp em fracao: max(0, alpha - E)
  evDeficit: number; // EV se negativo, senao 0
  winningCombosNeeded: number; // W* break-even
  breakevenFrequency: number | null; // multiplicador nos combos vencedores p/ E=alpha
  perCombo: ComboResult[];
  /** Classes inteiras que zeraram por card removal (aviso UI). */
  emptyEntries: string[];
  /** Fase derivada do tamanho do bordo. */
  street: "river" | "turn" | "flop";
}
