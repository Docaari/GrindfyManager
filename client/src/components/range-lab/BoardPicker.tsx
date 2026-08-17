// Bordo sem fileira de slots (F1 / RF-01.5, emenda A20).
//
// Um baralho unico: as 3 primeiras cartas clicadas viram flop, a 4a turn, a 5a
// river. Clicar de novo remove. Menos clique e menos estado do que a fileira de
// slots da calculadora antiga, que exigia escolher o alvo antes de escolher a
// carta.
import { RANKS, SUITS, cardKey, rankChar } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";
import { Shuffle } from "lucide-react";

const RANKS_DESC = [...RANKS].sort((a, b) => b - a);

// Simbolos por codePoint: o hook do projeto bloqueia glifo cru no fonte.
const SUIT_GLYPH: Record<string, string> = {
  c: String.fromCodePoint(0x2663),
  d: String.fromCodePoint(0x2666),
  h: String.fromCodePoint(0x2665),
  s: String.fromCodePoint(0x2660),
};

const MAX_BOARD = 5;

const STREET_LABEL: Record<number, string> = {
  0: "Bordo vazio",
  1: "1 carta",
  2: "2 cartas",
  3: "Flop",
  4: "Turn",
  5: "River",
};

export interface BoardPickerProps {
  board: Card[];
  onChange: (next: Card[]) => void;
  /**
   * Injetavel para o teste ser deterministico sem prender o sorteio a uma
   * sequencia especifica. Em producao cai em `Math.random`.
   */
  random?: () => number;
}

function suitColor(suit: string): string {
  return suit === "h" || suit === "d" ? "text-red-400" : "text-gray-200";
}

export function BoardPicker({ board, onChange, random = Math.random }: BoardPickerProps) {
  const chosen = new Set(board.map(cardKey));

  function toggle(card: Card): void {
    const key = cardKey(card);
    if (chosen.has(key)) {
      // Remover vem ANTES de qualquer recusa: com o bordo cheio o jogador
      // precisa conseguir desfazer, senao fica preso.
      onChange(board.filter((c) => cardKey(c) !== key));
      return;
    }
    if (board.length >= MAX_BOARD) return;
    onChange([...board, card]);
  }

  /** Vazio sorteia o flop inteiro; com cartas na mesa completa UMA por vez. */
  function dealRandom(): void {
    if (board.length >= MAX_BOARD) return;
    const wanted = board.length === 0 ? 3 : 1;
    const taken = new Set(board.map(cardKey));
    const pool: Card[] = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        const c = { rank, suit };
        if (!taken.has(cardKey(c))) pool.push(c);
      }
    }
    const drawn: Card[] = [];
    for (let i = 0; i < wanted && pool.length > 0; i++) {
      const idx = Math.min(pool.length - 1, Math.floor(random() * pool.length));
      drawn.push(pool[idx]);
      pool.splice(idx, 1);
    }
    onChange([...board, ...drawn]);
  }

  return (
    <div data-testid="range-lab-board-picker" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs ${tokens.color.neutral.text}`}>
          {STREET_LABEL[board.length] ?? `${board.length} cartas`}
          {board.length > 0 && (
            <span className="ml-2 font-mono">
              {board.map((c) => `${rankChar(c.rank)}${SUIT_GLYPH[c.suit]}`).join(" ")}
            </span>
          )}
        </span>
        <button
          type="button"
          data-testid="board-random"
          onClick={dealRandom}
          title={
            board.length === 0
              ? "Sortear um flop inteiro"
              : "Sortear a proxima carta do bordo"
          }
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs border ${tokens.color.neutral.border} ${tokens.color.neutral.text} hover:text-primary`}
        >
          <Shuffle className="h-3 w-3" />
          Aleatorio
        </button>
      </div>

      <div className="space-y-1">
        {SUITS.map((suit) => (
          <div key={suit} className="flex gap-1 flex-wrap">
            {RANKS_DESC.map((rank) => {
              const card = { rank, suit } as Card;
              const key = cardKey(card);
              const active = chosen.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`board-card-${key}`}
                  onClick={() => toggle(card)}
                  aria-pressed={active}
                  className={`w-7 h-8 rounded text-xs font-mono border transition-colors ${
                    active
                      ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-200"
                      : `bg-gray-800/40 border-gray-700 hover:border-emerald-500/50 ${suitColor(suit)}`
                  }`}
                >
                  {rankChar(rank)}
                  {SUIT_GLYPH[suit]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BoardPicker;
