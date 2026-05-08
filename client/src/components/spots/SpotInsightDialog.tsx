/**
 * SpotInsightDialog — Sprint Spot-Anki-Reentry-3 / RF-1.2.
 *
 * Dialog que captura spot insight estruturado:
 *   - Textarea (max 1000 char)
 *   - Confidence slider 1-5 (default 3)
 *   - Toggle decisao correta (Sim/Nao sei/Nao)
 *   - Tags input (max 10)
 *   - Checkbox "Adicionar a reentry" (showAddToReentry + alreadyActive)
 *   - Submit primary: PATCH starred-hands + (opcional) POST /spots/:id/reentry
 *   - Submit secundario "Salvar sem revisar": apenas PATCH
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #11 sem decorativos default
 *   #13 apiRequest retorna JSON parseado direto
 *
 * Implementacao usa overlay nativo + portal-less (renderiza inline) para
 * compat com jsdom + simplicidade no test (sem Radix Portal).
 */

import * as React from "react";
import { X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface SpotInsightInitialValues {
  insight?: string;
  decisionCorrect?: boolean | null;
  confidenceLevel?: number | null;
  tags?: string[];
}

export interface SpotInsightDialogProps {
  spotId: string;
  open: boolean;
  onClose: () => void;
  initialValues?: SpotInsightInitialValues;
  showAddToReentry?: boolean;
  defaultAddToReentry?: boolean;
  /** Quando o spot ja tem card SRS ativo, marca o checkbox como disabled. */
  alreadyActive?: boolean;
  /** Callback opcional pos-save sucesso. */
  onSaved?: (data: { addedToReentry: boolean }) => void;
}

type Decision = "yes" | "unknown" | "no";

const MAX_INSIGHT = 1000;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 40;

function decisionToValue(d: Decision): boolean | null {
  if (d === "yes") return true;
  if (d === "no") return false;
  return null;
}

function valueToDecision(v: boolean | null | undefined): Decision {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "unknown";
}

export function SpotInsightDialog(
  props: SpotInsightDialogProps,
): React.ReactElement | null {
  const {
    spotId,
    open,
    onClose,
    initialValues,
    showAddToReentry = false,
    defaultAddToReentry = false,
    alreadyActive = false,
    onSaved,
  } = props;

  // Hooks first (lesson #1) — todos antes de qualquer return condicional.
  const [insight, setInsight] = React.useState<string>(
    initialValues?.insight ?? "",
  );
  const [confidence, setConfidence] = React.useState<number>(
    initialValues?.confidenceLevel ?? 3,
  );
  const [decision, setDecision] = React.useState<Decision>(
    valueToDecision(initialValues?.decisionCorrect ?? null),
  );
  const [tags, setTags] = React.useState<string[]>(initialValues?.tags ?? []);
  const [tagDraft, setTagDraft] = React.useState<string>("");
  const [addToReentry, setAddToReentry] = React.useState<boolean>(
    !!defaultAddToReentry && !alreadyActive,
  );
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Reset/hidrata fields quando reopen com novos initialValues.
  React.useEffect(() => {
    if (!open) return;
    setInsight(initialValues?.insight ?? "");
    setConfidence(initialValues?.confidenceLevel ?? 3);
    setDecision(valueToDecision(initialValues?.decisionCorrect ?? null));
    setTags(initialValues?.tags ?? []);
    setAddToReentry(!!defaultAddToReentry && !alreadyActive);
    setErrorMsg(null);
    setTagDraft("");
  }, [
    open,
    spotId,
    initialValues?.insight,
    initialValues?.confidenceLevel,
    initialValues?.decisionCorrect,
    defaultAddToReentry,
    alreadyActive,
  ]);

  const insightLen = insight.length;
  const insightOver = insightLen > MAX_INSIGHT;
  const tagsOver = tags.length > MAX_TAGS;
  const decisionWrongRequiresInsight =
    decision === "no" && insight.trim().length === 0;
  const submitDisabled =
    submitting ||
    insightOver ||
    tagsOver ||
    decisionWrongRequiresInsight;

  function commitTagDraft() {
    const trimmed = tagDraft.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_TAG_LEN) return;
    if (tags.length >= MAX_TAGS) return;
    if (tags.includes(trimmed)) {
      setTagDraft("");
      return;
    }
    setTags([...tags, trimmed]);
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function performSave(withReentry: boolean): Promise<void> {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const body: Record<string, unknown> = {
        insight: insight.length > 0 ? insight : null,
        confidenceLevel: confidence,
        decisionCorrect: decisionToValue(decision),
        tags: tags.length > 0 ? tags : null,
      };
      await apiRequest("PATCH", `/api/starred-hands/${spotId}`, body);

      let addedToReentry = false;
      if (withReentry && !alreadyActive) {
        try {
          await apiRequest("POST", `/api/spots/${spotId}/reentry`);
          addedToReentry = true;
        } catch (e) {
          // Reentry creation falhou — patch ja foi feito; comunica mas nao bloqueia
          setErrorMsg(
            "Insight salvo mas falhou ao criar card de reentry — tente novamente em /estudos/spots.",
          );
        }
      }

      try {
        queryClient.invalidateQueries({ queryKey: ["/api/starred-hands"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reentry/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reentry/stats"] });
      } catch {
        // ignore
      }

      onSaved?.({ addedToReentry });

      if (!errorMsg) onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Erro ao salvar insight";
      setErrorMsg(typeof msg === "string" ? msg : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault?.();
    if (submitDisabled) return;
    void performSave(addToReentry && showAddToReentry);
  }

  function handleSubmitWithoutReview() {
    if (submitDisabled) return;
    void performSave(false);
  }

  if (!open) return null;

  return (
    <div
      data-testid="spot-insight-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar insight ao spot"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg border border-gray-700 bg-gray-900 p-5 space-y-4 shadow-2xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-100">
            Insight do spot
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="spot-insight-close"
            className="text-xs text-gray-400 hover:text-gray-200"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* 1. Insight textarea + counter */}
        <div className="space-y-1">
          <label
            htmlFor="spot-insight-textarea-id"
            className="text-xs font-medium text-gray-300"
          >
            O que aprendeu desse spot?
            {decision === "no" && (
              <span className="text-red-400 ml-1">* obrigatorio</span>
            )}
          </label>
          <textarea
            id="spot-insight-textarea-id"
            data-testid="spot-insight-textarea"
            value={insight}
            onChange={(e) => setInsight(e.target.value)}
            maxLength={MAX_INSIGHT * 2}
            rows={4}
            placeholder="Bluff river OOP em pot grande contra range condensado..."
            className="w-full rounded-md border border-gray-700 bg-gray-950/40 p-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 resize-y"
          />
          <div
            data-testid="spot-insight-counter"
            className={`text-[10px] font-mono ${
              insightOver ? "text-red-400" : "text-gray-500"
            }`}
          >
            {insightLen}/{MAX_INSIGHT}
          </div>
        </div>

        {/* 2. Confidence slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="spot-insight-confidence-slider"
              className="text-xs font-medium text-gray-300"
            >
              Confianca
            </label>
            <span className="text-xs text-gray-400">{confidence}/5</span>
          </div>
          <input
            id="spot-insight-confidence-slider"
            data-testid="spot-insight-confidence-slider"
            type="range"
            min={1}
            max={5}
            step={1}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={confidence}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>1 — Adivinhei</span>
            <span>5 — Certeza</span>
          </div>
        </div>

        {/* 3. Decisao toggle */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-300">
            Decisao foi correta?
          </label>
          <div
            role="radiogroup"
            aria-label="Decisao foi correta"
            className="flex gap-2"
          >
            <button
              type="button"
              data-testid="spot-insight-decision-yes"
              role="radio"
              aria-checked={decision === "yes"}
              onClick={() => setDecision("yes")}
              className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                decision === "yes"
                  ? "bg-green-600 border-green-700 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Sim
            </button>
            <button
              type="button"
              data-testid="spot-insight-decision-unknown"
              role="radio"
              aria-checked={decision === "unknown"}
              onClick={() => setDecision("unknown")}
              className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                decision === "unknown"
                  ? "bg-blue-600 border-blue-700 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Nao sei
            </button>
            <button
              type="button"
              data-testid="spot-insight-decision-no"
              role="radio"
              aria-checked={decision === "no"}
              onClick={() => setDecision("no")}
              className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                decision === "no"
                  ? "bg-red-600 border-red-700 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Nao
            </button>
          </div>
        </div>

        {/* 4. Tags input */}
        <div className="space-y-1">
          <label
            htmlFor="spot-insight-tags-input"
            className="text-xs font-medium text-gray-300"
          >
            Tags
            <span className="text-gray-500 ml-1">
              ({tags.length}/{MAX_TAGS})
            </span>
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {tags.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 inline-flex items-center gap-1"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  aria-label={`Remover tag ${t}`}
                  className="text-gray-400 hover:text-gray-100"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <input
            id="spot-insight-tags-input"
            data-testid="spot-insight-tags-input"
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitTagDraft();
              } else if (
                e.key === "Backspace" &&
                tagDraft === "" &&
                tags.length > 0
              ) {
                setTags(tags.slice(0, -1));
              }
            }}
            onBlur={() => commitTagDraft()}
            placeholder="ICM, river, GTO..."
            disabled={tags.length >= MAX_TAGS}
            className="w-full rounded-md border border-gray-700 bg-gray-950/40 p-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-60"
          />
        </div>

        {/* 5. Add to reentry checkbox */}
        {showAddToReentry && (
          <div className="flex items-center gap-2">
            <input
              id="spot-insight-add-to-reentry-id"
              data-testid="spot-insight-add-to-reentry"
              type="checkbox"
              checked={addToReentry}
              disabled={alreadyActive}
              aria-disabled={alreadyActive}
              onChange={(e) => setAddToReentry(e.target.checked)}
              className="rounded"
            />
            <label
              htmlFor="spot-insight-add-to-reentry-id"
              className="text-xs text-gray-300"
            >
              Adicionar a reentry (cria card de revisao espacada)
              {alreadyActive && (
                <span className="text-[10px] text-gray-500 ml-1">
                  — ja na fila
                </span>
              )}
            </label>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div
            role="alert"
            data-testid="spot-insight-error"
            className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded px-2 py-1.5"
          >
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
          <button
            type="button"
            data-testid="spot-insight-submit-without-review"
            onClick={handleSubmitWithoutReview}
            disabled={submitDisabled}
            className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-60"
          >
            Salvar sem revisar
          </button>
          <button
            type="submit"
            data-testid="spot-insight-submit"
            disabled={submitDisabled}
            aria-disabled={submitDisabled}
            className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-60"
          >
            {submitting ? "Salvando..." : "Salvar"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default SpotInsightDialog;
