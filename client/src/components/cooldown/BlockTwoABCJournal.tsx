import { useMemo } from "react";
import { BlockTimer } from "./BlockTimer";

// =============================================================================
// BlockTwoABCJournal — Sprint Cooldown-1 (MVP)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 2)
//
// 4 textareas: aGame[] (1-3), bGame[] (1-3), cGame (multiline), lesson (max 200).
// Validacao soft (warning amarelo se < 10 chars). Avanco sempre permitido.
// =============================================================================

export type AbcJournalValue = {
  aGame: string[];
  bGame: string[];
  cGame: string;
  lesson: string;
};

export interface BlockTwoABCJournalProps {
  value: AbcJournalValue;
  onChange: (value: AbcJournalValue) => void;
  onNext: () => void;
  onBack: () => void;
}

const MAX_ITEMS = 3;
const SOFT_MIN_CHARS = 10;
const LESSON_MAX = 200;

export function BlockTwoABCJournal({
  value,
  onChange,
  onNext,
  onBack,
}: BlockTwoABCJournalProps) {
  const aGame = value.aGame.length > 0 ? value.aGame : [""];
  const bGame = value.bGame.length > 0 ? value.bGame : [""];

  const update = (patch: Partial<AbcJournalValue>) => {
    onChange({ ...value, aGame, bGame, ...patch });
  };

  const renderArrayItems = (
    field: "aGame" | "bGame",
    items: string[],
    label: string,
  ) => {
    const canAdd = items.length < MAX_ITEMS;
    const canRemove = items.length > 1;

    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">{label}</div>
        {items.map((item, idx) => (
          <div key={`${field}-${idx}`} className="flex gap-2 items-start">
            <textarea
              data-testid={`cooldown-journal-${field}-${idx}`}
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[idx] = e.target.value;
                update({ [field]: next } as any);
              }}
              className="w-full rounded border p-2 text-sm"
              rows={2}
            />
            <button
              type="button"
              data-testid={`cooldown-journal-${field}-remove-${idx}`}
              aria-label={`Remover item ${idx + 1}`}
              onClick={() => {
                if (!canRemove) return;
                const next = items.filter((_, i) => i !== idx);
                update({ [field]: next } as any);
              }}
              disabled={!canRemove}
              className="text-xs text-muted-foreground"
            >
              ×
            </button>
            {item.length > 0 && item.length < SOFT_MIN_CHARS && (
              <span className="text-xs text-yellow-600" role="status">
                warning: minimo {SOFT_MIN_CHARS} chars sugerido
              </span>
            )}
          </div>
        ))}
        <button
          type="button"
          data-testid={`cooldown-journal-${field}-add`}
          onClick={() => {
            if (!canAdd) return;
            update({ [field]: [...items, ""] } as any);
          }}
          disabled={!canAdd}
          className="text-xs underline"
        >
          {`Adicionar ${label}`}
        </button>
      </div>
    );
  };

  const cGameWarning = value.cGame.length > 0 && value.cGame.length < SOFT_MIN_CHARS;
  const lessonWarning = value.lesson.length > 0 && value.lesson.length < SOFT_MIN_CHARS;

  return (
    <div data-testid="cooldown-block-2" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Bloco 2 — A/B/C Game Journal</h3>
        <BlockTimer blockNumber={2} durationSeconds={300} />
      </div>

      {renderArrayItems("aGame", aGame, "A-Game")}
      {renderArrayItems("bGame", bGame, "B-Game")}

      <div className="space-y-1">
        <label className="text-sm font-medium">C-Game (erros conscientes)</label>
        <textarea
          data-testid="cooldown-journal-cGame"
          value={value.cGame}
          onChange={(e) => update({ cGame: e.target.value })}
          className="w-full rounded border p-2 text-sm"
          rows={4}
        />
        {cGameWarning && (
          <span className="text-xs text-yellow-600" role="status">
            warning: minimo {SOFT_MIN_CHARS} chars sugerido
          </span>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Licao para a proxima sessao</label>
        <input
          type="text"
          data-testid="cooldown-journal-lesson"
          value={value.lesson}
          onChange={(e) => update({ lesson: e.target.value.slice(0, LESSON_MAX) })}
          maxLength={LESSON_MAX}
          className="w-full rounded border p-2 text-sm"
        />
        {lessonWarning && (
          <span className="text-xs text-yellow-600" role="status">
            warning: minimo {SOFT_MIN_CHARS} chars sugerido
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {value.lesson.length}/{LESSON_MAX}
        </span>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          data-testid="cooldown-back"
          onClick={onBack}
          className="rounded border px-3 py-1 text-sm"
        >
          Voltar
        </button>
        <button
          type="button"
          data-testid="cooldown-next"
          onClick={onNext}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
        >
          Avancar
        </button>
      </div>
    </div>
  );
}

export default BlockTwoABCJournal;
