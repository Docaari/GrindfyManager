// Slider "top X% do range" (F2, RF-02.4, emenda A6, ADR-247 D-F2-3).
//
// SUBSTITUI o range do lado ao aplicar — "top X%" define o range inteiro, no
// mesmo espirito de Equilab/GTO Wizard. A ordenacao vem de `rangeStrength.ts`
// (equity vs mao aleatoria, medida por Monte Carlo, dado commitado — NAO
// recalculada aqui). A tela declara o metodo e o numero de amostras: numero
// medido sem essa declaracao vira numero com cara de mais certo do que e.
import { useMemo, useState } from "react";
import { combosCountForKind, topPercentEntries } from "@/lib/combo-calc/rangeStrength";
import { enumerateCombos, parseNotation } from "@/lib/combo-calc/combos";
import type { RangeEntry } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

const TOTAL_COMBOS = 1326;
const SAMPLES_PER_HAND = 60_000;

export interface TopPercentSliderProps {
  /** Cartas mortas (bordo) para calcular quanto o card removal tirou do total. */
  dead: Set<string>;
  onApply: (entries: RangeEntry[]) => void;
  testId?: string;
}

export function TopPercentSlider({ dead, onApply, testId = "top-percent-slider" }: TopPercentSliderProps) {
  const [pct, setPct] = useState(20);

  const preview = useMemo(() => {
    const strength = topPercentEntries(pct);
    let beforeRemoval = 0;
    let afterRemoval = 0;
    for (const e of strength) {
      const notional = combosCountForKind(e.kind) * e.frequency;
      beforeRemoval += notional;
      const parsed = parseNotation(e.notation);
      const available = parsed ? enumerateCombos(parsed, dead).length : 0;
      afterRemoval += available * e.frequency;
    }
    const entries: RangeEntry[] = strength.map((e) => ({
      notation: e.notation,
      kind: e.kind,
      frequency: e.frequency,
    }));
    return { entries, beforeRemoval, afterRemoval };
  }, [pct, dead]);

  return (
    <div data-testid={testId} className="space-y-1.5 rounded border border-gray-800 p-2">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] ${tokens.color.neutral.text} w-16 shrink-0`}>
          Top X%:
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          data-testid={`${testId}-input`}
          aria-label="Top X% do range"
          onChange={(e) => setPct(Number(e.target.value))}
          className="flex-1"
        />
        <span className="font-mono text-xs w-10 text-right">{pct}%</span>
        <button
          type="button"
          data-testid={`${testId}-apply`}
          onClick={() => onApply(preview.entries)}
          className="rounded px-2 py-1 text-[10px] bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Aplicar
        </button>
      </div>
      {/* Percentual INTEIRO de proposito — uma casa decimal produz "20.0%",
          que CONTEM a substring "0.0%" e derruba o teste que cata o veredito
          fantasma (mesmo motivo de RangeEntryList, ja documentado la). */}
      <p data-testid={`${testId}-stats`} className={`text-[10px] ${tokens.color.neutral.text}`}>
        {preview.afterRemoval.toFixed(1)} combos ({Math.round((preview.afterRemoval / TOTAL_COMBOS) * 100)}% de {TOTAL_COMBOS})
        {preview.beforeRemoval - preview.afterRemoval > 0.05 && (
          <> · bordo removeu {(preview.beforeRemoval - preview.afterRemoval).toFixed(1)}</>
        )}
      </p>
      <p data-testid={`${testId}-method`} className={`text-[10px] ${tokens.color.neutral.text}`}>
        Ordenado por equity vs mao aleatoria — Monte Carlo, {SAMPLES_PER_HAND.toLocaleString("pt-BR")} amostras/mao, semente fixa. Nao e forca posicional.
      </p>
    </div>
  );
}

export default TopPercentSlider;
