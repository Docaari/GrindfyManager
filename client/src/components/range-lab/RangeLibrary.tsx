// Biblioteca de ranges nomeados (F2, RF-02.5, emenda A12, ADR-247 D-F2-3).
// Separada de spot salvo (`SpotLibrary.tsx`): so a lista de classes, aplicavel
// em qualquer lado. Export/import via `collapseRangeToNotation`/`parseRangeText`
// — notacao curta colavel em formato solver/GTO Wizard.
import { Copy, FolderOpen, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  loadRangeLibrary,
  persistRangeLibrary,
  type SavedRange,
} from "@/lib/combo-calc/persistence";
import { collapseRangeToNotation } from "@/lib/combo-calc/rangeSerializer";
import { parseRangeText } from "@/lib/combo-calc/rangeImport";
import type { RangeEntry } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

const MAX_RANGES = 50;

export interface RangeLibraryProps {
  /** Range corrente deste lado (heroi ou vilao) — o que "Salvar" grava. */
  entries: RangeEntry[];
  /** Substitui o range deste lado pelo range aplicado/importado. */
  onApply: (entries: RangeEntry[]) => void;
  testId?: string;
}

export function RangeLibrary({ entries, onApply, testId = "range-library" }: RangeLibraryProps) {
  const [ranges, setRanges] = useState<SavedRange[]>(() => loadRangeLibrary());
  const [name, setName] = useState("");
  const [importText, setImportText] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  function persist(next: SavedRange[]): void {
    setRanges(next);
    persistRangeLibrary(next);
  }

  function save(): void {
    if (entries.length === 0) return;
    const label = (name.trim() || `Range ${ranges.length + 1}`).slice(0, 60);
    const range: SavedRange = { id: `range-${Date.now()}`, name: label, savedAt: Date.now(), entries };
    persist([range, ...ranges].slice(0, MAX_RANGES));
    setName("");
  }

  function duplicate(range: SavedRange): void {
    const copy: SavedRange = {
      id: `range-${Date.now()}`,
      name: `${range.name} (copia)`,
      savedAt: Date.now(),
      entries: range.entries,
    };
    persist([copy, ...ranges].slice(0, MAX_RANGES));
  }

  function remove(id: string): void {
    persist(ranges.filter((r) => r.id !== id));
  }

  function doImport(): void {
    const { entries: parsed, warnings } = parseRangeText(importText);
    setImportWarnings(warnings);
    if (parsed.length > 0) onApply(parsed);
  }

  const exportText = collapseRangeToNotation(entries);

  return (
    <div data-testid={testId} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do range (opcional)"
          data-testid={`${testId}-name`}
          className="flex-1 rounded bg-gray-800/50 border border-gray-700 text-gray-100 text-xs px-2 py-1.5 placeholder:text-gray-500"
        />
        <button
          type="button"
          data-testid={`${testId}-save`}
          onClick={save}
          disabled={entries.length === 0}
          className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs bg-emerald-600 text-white disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          Salvar range
        </button>
      </div>

      {ranges.length > 0 && (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {ranges.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <button
                type="button"
                data-testid={`${testId}-apply-${r.id}`}
                onClick={() => onApply(r.entries)}
                className="flex-1 text-left truncate hover:text-primary"
                title={collapseRangeToNotation(r.entries)}
              >
                <FolderOpen className="inline h-3 w-3 mr-1" />
                {r.name}
              </button>
              <button
                type="button"
                data-testid={`${testId}-duplicate-${r.id}`}
                aria-label={`Duplicar ${r.name}`}
                onClick={() => duplicate(r)}
                className="text-gray-600 hover:text-primary"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                data-testid={`${testId}-delete-${r.id}`}
                aria-label={`Apagar ${r.name}`}
                onClick={() => remove(r.id)}
                className="text-gray-600 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1">
        <label className={`flex items-center gap-1 text-[10px] ${tokens.color.neutral.text}`}>
          <Copy className="h-3 w-3" /> Exportar (formato solver, colavel)
        </label>
        <textarea
          readOnly
          value={exportText}
          data-testid={`${testId}-export`}
          placeholder="Range vazio"
          className="w-full h-12 rounded bg-gray-800/50 border border-gray-700 text-gray-100 font-mono text-[10px] p-2"
        />
      </div>

      <div className="space-y-1">
        <label className={`text-[10px] ${tokens.color.neutral.text}`}>Importar (cole a notacao)</label>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="99+, ATs+, KQs, A5s-A2s:50%, QhJh"
          data-testid={`${testId}-import-text`}
          className="w-full h-12 rounded bg-gray-800/50 border border-gray-700 text-gray-100 font-mono text-[10px] p-2 placeholder:text-gray-600"
        />
        <button
          type="button"
          data-testid={`${testId}-import`}
          onClick={doImport}
          className="rounded px-2 py-1 text-[10px] bg-gray-800/60 border border-gray-700 text-gray-300 hover:border-emerald-500/50 hover:text-emerald-300"
        >
          Substituir range pelo colado
        </button>
        {importWarnings.length > 0 && (
          <div data-testid={`${testId}-import-warnings`} className="text-[10px] text-amber-400 space-y-0.5">
            {importWarnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RangeLibrary;
