// Range Lab — a tabela por combo. Da F1 ela veio como UMA lista (por combo do
// heroi); a F3a a transforma em DUAS LISTAS PARALELAS (RF-03.8 / D-F3-19) e
// acrescenta a mao feita de cada combo.
//
// POR QUE PARALELAS E NUNCA PAREADAS
//
// O exemplo da spec ("KhQh = flush de copas -> voce A6s = top par") vem do shape
// v1 do popup (`Verdict.perCombo`), onde o heroi e uma mao so e cada linha e um
// combo do vilao contra ela. Aqui a linha do heroi ja vem agregada contra o range
// INTEIRO do vilao: nao existe "o combo do vilao daquela linha", e parear seria
// inventar um confronto que o modelo v2 nao tem.
import { useState } from "react";
import { comboKey, rankChar } from "@/lib/combo-calc/cards";
import { classifyCombo } from "@/lib/combo-calc/classify";
import type { HandRead } from "@/lib/combo-calc/classify";
import type { HeroComboResult, VillainComboResult } from "@/lib/combo-calc/engine/types";
import type { Card } from "@/lib/combo-calc/types";
import { categoryPalette, heat, tokens } from "@/lib/ui-tokens";

const SUIT_GLYPH: Record<string, string> = {
  c: String.fromCodePoint(0x2663),
  d: String.fromCodePoint(0x2666),
  h: String.fromCodePoint(0x2665),
  s: String.fromCodePoint(0x2660),
};

const MADE_LABEL: Record<string, string> = {
  straight_flush: "Straight flush",
  quads: "Quadra",
  full_house: "Full house",
  flush: "Flush",
  straight: "Sequencia",
  set: "Set",
  trips: "Trinca",
  two_pair: "Dois pares",
  overpair: "Overpair",
  top_pair: "Top par",
  second_pair: "2o par",
  third_pair: "3o par",
  weak_pair: "Par fraco",
  underpair: "Underpair",
  ace_high: "As alto",
  no_pair: "Sem par",
};

const QUALIFIER_LABEL: Record<string, string> = {
  nut: "nut",
  strong: "forte",
  weak: "fraco",
  top_two: "os dois de cima",
  top_bottom: "topo e base",
  bottom_two: "os dois de baixo",
  with_board_pair: "com par da mesa",
  k_top: "kicker A/K",
  k_good: "kicker Q/J/T",
  k_weak: "kicker fraco",
};

type SortKey = "equity" | "ev";
type HeroMode = "hand" | "range";

export interface ComboTableProps {
  heroRows: HeroComboResult[];
  villainRows: VillainComboResult[];
  board: Card[];
  heroMode: HeroMode;
}

function handLabel(combo: [Card, Card]): string {
  return combo.map((c) => `${rankChar(c.rank)}${SUIT_GLYPH[c.suit]}`).join("");
}

function readLabel(read: HandRead): string {
  const base = MADE_LABEL[read.made] ?? read.made;
  const qualifier = read.madeQualifier ? QUALIFIER_LABEL[read.madeQualifier] : null;
  const nut = read.nutKicker ? " (o melhor possivel neste bordo)" : "";
  return qualifier ? `${base}, ${qualifier}${nut}` : `${base}${nut}`;
}

function formatEquity(equity: number | null): string {
  // Sem oponente (ou sem amostra) NAO e 0%: e ausencia de numero.
  return equity === null ? "—" : `${(equity * 100).toFixed(1)}%`;
}

export function ComboTable({ heroRows, villainRows, board, heroMode }: ComboTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("equity");

  // Combo sem oponente vai para o FIM em qualquer ordenacao: ele nao tem numero,
  // entao nao disputa posicao com quem tem.
  const byNumber = <T extends { equity: number | null }>(rows: T[], pick: (row: T) => number | null) =>
    [...rows].sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });

  const heroSorted = byNumber(heroRows, (row) => (sortKey === "equity" ? row.equity : row.evCall));
  const villainSorted = byNumber(villainRows, (row) => row.equity);

  return (
    <div data-testid="range-lab-combo-table" className="space-y-2">
      {board.length < 5 ? (
        <p
          data-testid="range-lab-combo-table-street-note"
          className={`text-[10px] ${tokens.color.neutral.text}`}
        >
          A mao feita e a de agora: ainda vem carta, e a leitura muda com ela.
        </p>
      ) : null}

      {/* ── lado do heroi ── */}
      {heroMode === "hand" ? (
        // No modo mao unica a mao do heroi aparece UMA vez, no cabecalho — repetir
        // por linha do vilao seria afirmar o confronto pareado que nao existe.
        <p
          data-testid="range-lab-combo-table-hero-hand"
          className="text-xs font-mono border-b border-gray-800 pb-1"
        >
          {heroRows.length > 0
            ? `Sua mao: ${handLabel(heroRows[0].combo)} - ${readLabel(
                classifyCombo(heroRows[0].combo, board),
              )}`
            : "Sua mao: nenhuma carta escolhida"}
        </p>
      ) : (
        <section data-testid="range-lab-combo-table-hero" className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Suas maos
            </h3>
            <div className="flex gap-1">
              {(
                [
                  ["equity", "Equity"],
                  ["ev", "EV do call"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className={`rounded px-2 py-0.5 text-[10px] border ${
                    sortKey === key
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-800 text-gray-400">
                <tr>
                  <th className="text-left p-2">Mao</th>
                  <th className="text-left p-2">Leitura</th>
                  <th className="text-right p-2">Equity</th>
                  <th className="text-right p-2">EV</th>
                </tr>
              </thead>
              <tbody>
                {heroSorted.map((row) => {
                  const key = comboKey(row.combo[0], row.combo[1]);
                  const read = classifyCombo(row.combo, board);
                  return (
                    <tr
                      key={key}
                      data-testid={`combo-row-hero-${key}`}
                      className="border-t border-gray-800"
                    >
                      <td className="p-2 font-mono">{handLabel(row.combo)}</td>
                      <td data-testid={`combo-made-hero-${key}`} className="p-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-sm ${categoryPalette.made(read.made)}`}
                        />
                        <span className="ml-1">{readLabel(read)}</span>
                      </td>
                      <td
                        className={`p-2 text-right font-mono ${
                          row.equity === null ? tokens.color.neutral.text : heat.text(row.equity)
                        }`}
                      >
                        {formatEquity(row.equity)}
                      </td>
                      <td
                        className={`p-2 text-right font-mono ${
                          row.evCall === null
                            ? tokens.color.neutral.text
                            : row.evCall >= 0
                              ? tokens.color.delta.positive
                              : tokens.color.delta.negative
                        }`}
                      >
                        {row.evCall === null
                          ? "—"
                          : `${row.evCall >= 0 ? "+" : ""}${row.evCall.toFixed(1)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── lado do vilao: lista PARALELA, sem evCall e sem decisao (D-F3-11) ── */}
      <section data-testid="range-lab-combo-table-villain" className="space-y-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Maos do oponente
        </h3>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-800 text-gray-400">
              <tr>
                <th className="text-left p-2">Mao</th>
                <th className="text-left p-2">Leitura</th>
                <th className="text-right p-2">Enfrenta</th>
                <th className="text-right p-2">Equity</th>
              </tr>
            </thead>
            <tbody>
              {villainSorted.map((row) => {
                const key = comboKey(row.combo[0], row.combo[1]);
                const read = classifyCombo(row.combo, board);
                return (
                  <tr
                    key={key}
                    data-testid={`combo-row-villain-${key}`}
                    className="border-t border-gray-800"
                  >
                    <td className="p-2 font-mono">{handLabel(row.combo)}</td>
                    <td data-testid={`combo-made-villain-${key}`} className="p-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-sm ${categoryPalette.made(read.made)}`}
                      />
                      <span className="ml-1">{readLabel(read)}</span>
                    </td>
                    <td className={`p-2 text-right font-mono ${tokens.color.neutral.text}`}>
                      {row.pairMass.toFixed(1)}
                    </td>
                    <td
                      className={`p-2 text-right font-mono ${
                        row.equity === null ? tokens.color.neutral.text : heat.text(row.equity)
                      }`}
                    >
                      {formatEquity(row.equity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default ComboTable;
