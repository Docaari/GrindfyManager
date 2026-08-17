// Spots salvos do Range Lab (F1 / RF-01.5). Le e escreve o formato v2, e o
// `loadSavedSpotsV2` converte a v1 na leitura — spot salvo antes da F1 abre
// normal (criterio de aceite 5).
import { FolderOpen, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  loadSavedSpotsV2,
  persistSavedSpotsV2,
  type SavedSpotV2,
} from "@/lib/combo-calc/persistence";
import { tokens } from "@/lib/ui-tokens";

const MAX_SPOTS = 50;

export interface SpotLibraryProps {
  spots: SavedSpotV2[];
  onSpotsChange: (next: SavedSpotV2[]) => void;
  /** Estado corrente, ja serializado pela pagina. */
  current: Omit<SavedSpotV2, "id" | "name" | "savedAt">;
  onLoad: (spot: SavedSpotV2) => void;
  canSave: boolean;
}

export function SpotLibrary({
  spots,
  onSpotsChange,
  current,
  onLoad,
  canSave,
}: SpotLibraryProps) {
  const [name, setName] = useState("");

  function save(): void {
    const label = (name.trim() || `Spot ${spots.length + 1}`).slice(0, 60);
    const spot: SavedSpotV2 = {
      ...current,
      id: `${current.board.join("")}-${Date.now()}`,
      name: label,
      savedAt: Date.now(),
    };
    const next = [spot, ...spots].slice(0, MAX_SPOTS);
    onSpotsChange(next);
    persistSavedSpotsV2(next);
    setName("");
  }

  function remove(id: string): void {
    const next = spots.filter((s) => s.id !== id);
    onSpotsChange(next);
    persistSavedSpotsV2(next);
  }

  return (
    <div data-testid="range-lab-spot-library" className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do spot (opcional)"
          className="flex-1 rounded bg-gray-800/50 border border-gray-700 text-gray-100 text-xs px-2 py-1.5 placeholder:text-gray-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs bg-emerald-600 text-white disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          Salvar
        </button>
      </div>

      {spots.length > 0 && (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {spots.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => onLoad(s)}
                className="flex-1 text-left truncate hover:text-primary"
              >
                <FolderOpen className="inline h-3 w-3 mr-1" />
                {s.name}
                <span className={`ml-2 font-mono ${tokens.color.neutral.text}`}>
                  {s.board.join(" ")}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Apagar ${s.name}`}
                onClick={() => remove(s.id)}
                className="text-gray-600 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Leitura inicial — a conversao da v1 acontece dentro do storage. */
export function readSavedSpots(): SavedSpotV2[] {
  return loadSavedSpotsV2();
}

export default SpotLibrary;
