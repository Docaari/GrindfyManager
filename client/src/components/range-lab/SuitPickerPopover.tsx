// Selecao de naipe em grade (F2, RF-02.2, emenda A8, ADR-247).
// Forma VALIDADA pelo founder: um botao por combo com o simbolo do naipe
// colorido, slider por combo (RF-02.3, escreve em `comboFreqOverrides`),
// presets de frequencia 25/50/75/100 e "Limpar" no rodape. Combo impossivel
// pelo bordo (ja filtrado por quem monta a prop `combos`) NAO aparece.
import { comboKey } from "@/lib/combo-calc/cards";
import { clampFreq } from "@/lib/combo-calc/combos";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

// Simbolos de naipe via codePoint (hook bloqueia glyph cru no fonte).
const SUIT_SYM: Record<string, string> = {
  c: String.fromCodePoint(0x2663),
  d: String.fromCodePoint(0x2666),
  h: String.fromCodePoint(0x2665),
  s: String.fromCodePoint(0x2660),
};

function suitColor(suit: string): string {
  return suit === "h" || suit === "d" ? "text-red-400" : "text-gray-200";
}

export interface SuitPickerPopoverProps {
  notation: string;
  /** JA filtrados por card removal — quem chama decide. */
  combos: [Card, Card][];
  entry: RangeEntry;
  onChange: (next: RangeEntry) => void;
}

const PRESETS: { id: string; value: number }[] = [
  { id: "25", value: 0.25 },
  { id: "50", value: 0.5 },
  { id: "75", value: 0.75 },
  { id: "100", value: 1 },
];

export function SuitPickerPopover({ notation, combos, entry, onChange }: SuitPickerPopoverProps) {
  function applyPreset(value: number): void {
    onChange({ ...entry, frequency: clampFreq(value) });
  }

  function clear(): void {
    const next = { ...entry };
    delete next.comboFreqOverrides;
    delete next.suits;
    onChange(next);
  }

  function setComboOverride(key: string, value: number): void {
    const overrides = { ...(entry.comboFreqOverrides ?? {}) };
    overrides[key] = clampFreq(value);
    onChange({ ...entry, comboFreqOverrides: overrides });
  }

  return (
    <div
      data-testid="suit-picker-popover"
      className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-3 text-xs"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-gray-300">{notation}</span>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`suit-picker-preset-${p.id}`}
              onClick={() => applyPreset(p.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] border border-gray-700 bg-gray-800/60 text-gray-300 hover:border-emerald-500/50 hover:text-emerald-300`}
            >
              {Math.round(p.value * 100)}%
            </button>
          ))}
          <button
            type="button"
            data-testid="suit-picker-clear"
            onClick={clear}
            className={`px-1.5 py-0.5 rounded text-[10px] border border-gray-700 bg-gray-800/60 ${tokens.color.neutral.text} hover:text-red-400`}
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {combos.map(([a, b]) => {
          const key = comboKey(a, b);
          const override = entry.comboFreqOverrides?.[key];
          const value = override ?? entry.frequency;
          return (
            <div
              key={key}
              data-testid={`suit-picker-combo-${key}`}
              className="flex items-center gap-1.5 rounded border border-gray-800 px-1.5 py-1"
            >
              <span className="font-mono">
                <span className={suitColor(a.suit)}>{SUIT_SYM[a.suit]}</span>
                <span className={suitColor(b.suit)}>{SUIT_SYM[b.suit]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(value * 100)}
                data-testid={`suit-picker-slider-${key}`}
                aria-label={`Frequencia de ${key}`}
                onChange={(e) => setComboOverride(key, Number(e.target.value) / 100)}
                className="flex-1 min-w-[60px]"
              />
              <span className={`font-mono w-8 text-right ${tokens.color.neutral.text}`}>
                {Math.round(value * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SuitPickerPopover;
