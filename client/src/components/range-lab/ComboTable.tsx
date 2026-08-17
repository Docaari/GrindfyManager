// Tabela por combo do heroi (F1 / RF-01.3). Ordenavel por equity ou por EV do
// call — que e a pergunta "quais das minhas maos pagam" vista de perto.
import { useState } from "react";
import { comboKey, rankChar } from "@/lib/combo-calc/cards";
import type { HeroComboResult } from "@/lib/combo-calc/engine/types";
import { heat, tokens } from "@/lib/ui-tokens";

const SUIT_GLYPH: Record<string, string> = {
  c: String.fromCodePoint(0x2663),
  d: String.fromCodePoint(0x2666),
  h: String.fromCodePoint(0x2665),
  s: String.fromCodePoint(0x2660),
};

type SortKey = "equity" | "ev";

export interface ComboTableProps {
  rows: HeroComboResult[];
}

export function ComboTable({ rows }: ComboTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("equity");

  // Combo sem oponente vai para o FIM em qualquer ordenacao: ele nao tem numero,
  // entao nao disputa posicao com quem tem.
  const sorted = [...rows].sort((a, b) => {
    const av = sortKey === "equity" ? a.equity : a.evCall;
    const bv = sortKey === "equity" ? b.equity : b.evCall;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });

  return (
    <div data-testid="range-lab-combo-table" className="space-y-1">
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

      <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-800">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-800 text-gray-400">
            <tr>
              <th className="text-left p-2">Mao</th>
              <th className="text-right p-2">Enfrenta</th>
              <th className="text-right p-2">Equity</th>
              <th className="text-right p-2">EV</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = comboKey(row.combo[0], row.combo[1]);
              return (
                <tr key={key} className="border-t border-gray-800">
                  <td className="p-2 font-mono">
                    {row.combo
                      .map((c) => `${rankChar(c.rank)}${SUIT_GLYPH[c.suit]}`)
                      .join("")}
                  </td>
                  <td className={`p-2 text-right font-mono ${tokens.color.neutral.text}`}>
                    {row.pairMass.toFixed(1)}
                  </td>
                  <td
                    className={`p-2 text-right font-mono ${
                      row.equity === null ? tokens.color.neutral.text : heat.text(row.equity)
                    }`}
                  >
                    {/* Sem oponente NAO e 0%: e ausencia de numero. */}
                    {row.equity === null ? "—" : `${(row.equity * 100).toFixed(1)}%`}
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
    </div>
  );
}

export default ComboTable;
