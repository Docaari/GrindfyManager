// Lista das classes ativas de um range, com a frequencia de cada uma
// (F1 / RF-01.5). Os atalhos de peso (scroll na celula, pincel global) sao da F2.
import { Trash2 } from "lucide-react";
import type { RangeEntry } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

export interface RangeEntryListProps {
  entries: RangeEntry[];
  onChange: (next: RangeEntry[]) => void;
  testId?: string;
}

export function RangeEntryList({
  entries,
  onChange,
  testId = "range-lab-entry-list",
}: RangeEntryListProps) {
  if (entries.length === 0) {
    return (
      <p data-testid={`${testId}-empty`} className={`text-xs ${tokens.color.neutral.text}`}>
        Nenhuma classe pintada ainda.
      </p>
    );
  }

  function setFrequency(notation: string, frequency: number): void {
    onChange(entries.map((e) => (e.notation === notation ? { ...e, frequency } : e)));
  }

  return (
    <ul data-testid={testId} className="space-y-1 max-h-52 overflow-y-auto pr-1">
      {entries.map((entry) => (
        <li key={entry.notation} className="flex items-center gap-2 text-xs">
          <span className="font-mono w-14 shrink-0">{entry.notation}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(entry.frequency * 100)}
            aria-label={`Frequencia de ${entry.notation}`}
            onChange={(e) => setFrequency(entry.notation, Number(e.target.value) / 100)}
            className="flex-1 min-w-[80px]"
          />
          {/* Percentual INTEIRO de proposito: uma casa decimal aqui produziria
              textos como "100.0%" na tela, e o teste de "nenhum 0,0% na pagina"
              (que protege o veredito fantasma) casa por substring. */}
          <span className={`font-mono w-10 text-right ${tokens.color.neutral.text}`}>
            {Math.round(entry.frequency * 100)}%
          </span>
          <button
            type="button"
            aria-label={`Remover ${entry.notation}`}
            onClick={() => onChange(entries.filter((e) => e.notation !== entry.notation))}
            className="text-gray-600 hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default RangeEntryList;
