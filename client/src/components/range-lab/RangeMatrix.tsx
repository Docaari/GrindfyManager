// Matriz 13x13 de classes (F1 / RF-01.5). Serve os DOIS lados — o range do
// heroi e o do vilao — com o mesmo componente; um range e um range.
//
// Os atalhos de pintura, a grade de naipes e o peso por combo sao da F2. Aqui a
// matriz faz o minimo para exercitar o motor: ligar e desligar a classe, e
// regular a frequencia dela.
import { RANKS, rankChar } from "@/lib/combo-calc/cards";
import { parseNotation } from "@/lib/combo-calc/combos";
import type { RangeEntry } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

const RANKS_DESC = [...RANKS].sort((a, b) => b - a);

/** Notacao da celula: pares na diagonal, suited acima, offsuit abaixo. */
export function cellNotation(row: number, col: number): string {
  const a = RANKS_DESC[row];
  const b = RANKS_DESC[col];
  if (row === col) return rankChar(a) + rankChar(a);
  if (row < col) return rankChar(a) + rankChar(b) + "s";
  return rankChar(b) + rankChar(a) + "o";
}

export interface RangeMatrixProps {
  entries: RangeEntry[];
  onChange: (next: RangeEntry[]) => void;
  /** Frequencia aplicada a classe que acabou de ser ligada. */
  defaultFrequency?: number;
  testId?: string;
}

export function RangeMatrix({
  entries,
  onChange,
  defaultFrequency = 1,
  testId = "range-lab-matrix",
}: RangeMatrixProps) {
  const byNotation = new Map(entries.map((e) => [e.notation, e]));

  function toggle(notation: string): void {
    if (byNotation.has(notation)) {
      onChange(entries.filter((e) => e.notation !== notation));
      return;
    }
    const parsed = parseNotation(notation);
    if (!parsed) return;
    onChange([...entries, { notation, kind: parsed.kind, frequency: defaultFrequency }]);
  }

  return (
    <div data-testid={testId} className="overflow-x-auto select-none">
      <div
        className="inline-grid"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {RANKS_DESC.map((_, row) =>
          RANKS_DESC.map((__, col) => {
            const notation = cellNotation(row, col);
            const entry = byNotation.get(notation);
            const isPair = row === col;
            const isSuited = row < col;
            return (
              <button
                key={`${row}-${col}`}
                type="button"
                data-testid={`range-cell-${notation}`}
                title={notation}
                onClick={() => toggle(notation)}
                className={`w-[26px] h-[26px] text-[9px] font-mono border border-gray-800 ${
                  entry
                    ? "bg-emerald-600 text-white"
                    : isPair
                      ? "bg-gray-700/60 text-gray-300"
                      : isSuited
                        ? "bg-gray-800/60 text-gray-400"
                        : "bg-gray-800/30 text-gray-500"
                } hover:outline hover:outline-1 hover:outline-emerald-400`}
                style={
                  entry && entry.frequency < 1
                    ? { opacity: 0.4 + entry.frequency * 0.6 }
                    : undefined
                }
              >
                {notation.replace(/[so]$/, "")}
              </button>
            );
          }),
        )}
      </div>
      <p className={`mt-1 text-[10px] ${tokens.color.neutral.text}`}>
        Clique para ligar ou desligar a classe.
      </p>
    </div>
  );
}

export default RangeMatrix;
