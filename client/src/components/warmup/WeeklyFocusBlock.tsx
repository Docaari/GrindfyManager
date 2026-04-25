/**
 * WeeklyFocusBlock — Sprint W-1 (RF-06, RF-22, T-10)
 *
 * Bloco 2: foco da semana. Le user_settings.weeklyHeuristics, permite editar
 * inline se vazio, toggle "Li em voz alta" (nao bloqueante).
 *
 * Microcopy spec secao 9.2.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useWeeklyHeuristics } from "@/hooks/useWeeklyHeuristics";

export interface WeeklyFocusBlockProps {
  onAdvance: (payload: {
    heuristicsSnapshot: [string, string, string] | null;
    heuristicsRead: boolean;
  }) => void;
}

export function WeeklyFocusBlock({ onAdvance }: WeeklyFocusBlockProps) {
  const { heuristics, isLoading, save, isSaving } = useWeeklyHeuristics();
  const [readAloud, setReadAloud] = useState<boolean>(false);
  const [draft, setDraft] = useState<[string, string, string]>(["", "", ""]);

  const isEmpty = !heuristics || heuristics.length !== 3;

  const handleSave = async () => {
    const trimmed: [string, string, string] = [
      draft[0].trim(),
      draft[1].trim(),
      draft[2].trim(),
    ];
    if (trimmed.some((s) => s.length === 0)) return;
    await save(trimmed);
  };

  const handleAdvance = () => {
    onAdvance({
      heuristicsSnapshot: heuristics ?? null,
      heuristicsRead: readAloud,
    });
  };

  if (isLoading) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6">
        Carregando heuristicas…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto px-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Foco da semana</h2>
        <p className="text-sm text-muted-foreground">
          Carregar as 3 heuristicas-alvo na memoria de trabalho
        </p>
        <p className="text-sm">
          Leia as 3 heuristicas que voce esta trabalhando essa semana. Em voz
          alta se ajudar a fixar.
        </p>
      </header>

      {isEmpty ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Defina suas 3 heuristicas para esta semana. Ex: 'BB vs BTN 25bb:
            defender 58% contra minraise; 3betar 11% polarizado; fold tudo
            abaixo de Q7o.'
          </p>
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              data-testid={`weekly-focus-input-${i + 1}`}
              type="text"
              maxLength={280}
              placeholder={`Heuristica ${i + 1}`}
              value={draft[i]}
              onChange={(e) => {
                const next = [...draft] as [string, string, string];
                next[i] = e.target.value;
                setDraft(next);
              }}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          ))}
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || draft.some((s) => s.trim().length === 0)}
          >
            Salvar heuristicas da semana
          </Button>
        </div>
      ) : (
        <ol className="list-decimal ml-5 space-y-2">
          {heuristics.map((h, idx) => (
            <li key={idx} className="text-base">
              {h}
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id="weekly-focus-read-aloud"
          data-testid="weekly-focus-read-aloud"
          checked={readAloud}
          onCheckedChange={(v) => setReadAloud(Boolean(v))}
        />
        <label htmlFor="weekly-focus-read-aloud" className="text-sm">
          Li em voz alta
        </label>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="weekly-focus-advance"
          onClick={handleAdvance}
          disabled={isEmpty}
        >
          Proximo
        </Button>
      </div>
    </div>
  );
}
