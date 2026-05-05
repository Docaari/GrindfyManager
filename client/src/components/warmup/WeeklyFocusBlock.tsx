/**
 * WeeklyFocusBlock — Sprint W-1 (RF-06, RF-22) — Reform 2026-05-05.
 *
 * Bloco "Foco da semana" (heuristicas). Sempre editavel: mostra heuristicas
 * salvas + botao Editar que abre form inline. Toggle "Li em voz alta".
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil } from "lucide-react";
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
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<[string, string, string]>(["", "", ""]);

  const isEmpty = !heuristics || heuristics.length !== 3;

  // Sync draft com heuristicas quando entrar em edicao ou quando heuristicas chegam
  useEffect(() => {
    if (heuristics && !editing) {
      setDraft([heuristics[0] ?? "", heuristics[1] ?? "", heuristics[2] ?? ""]);
    }
  }, [heuristics, editing]);

  // Auto-abre editor APENAS apos load completo (evita falso-positivo durante loading)
  useEffect(() => {
    if (isLoading) return;
    if (isEmpty && !editing) setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isEmpty]);

  const handleSave = async () => {
    const trimmed: [string, string, string] = [
      draft[0].trim(),
      draft[1].trim(),
      draft[2].trim(),
    ];
    if (trimmed.some((s) => s.length === 0)) return;
    await save(trimmed);
    setEditing(false);
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
        {!editing && !isEmpty && (
          <p className="text-sm">
            Leia as 3 heuristicas que voce esta trabalhando. Em voz alta se ajudar a fixar.
          </p>
        )}
      </header>

      {editing ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Defina suas 3 heuristicas. Voce pode editar a qualquer momento.
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
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            />
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSave}
              data-testid="weekly-focus-save"
              disabled={isSaving || draft.some((s) => s.trim().length === 0)}
            >
              Salvar heuristicas
            </Button>
            {!isEmpty && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : !isEmpty ? (
        <>
          <ol className="list-decimal ml-5 space-y-2">
            {heuristics!.map((h, idx) => (
              <li key={idx} className="text-base">
                {h}
              </li>
            ))}
          </ol>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              data-testid="weekly-focus-edit"
            >
              <Pencil className="h-3 w-3 mr-1" />
              Editar heuristicas
            </Button>
          </div>
        </>
      ) : null}

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
          disabled={isEmpty || editing}
        >
          Proximo
        </Button>
      </div>
    </div>
  );
}
