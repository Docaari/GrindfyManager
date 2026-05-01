// =============================================================================
// SpotReviewCard — Sprint F2 W3 (RF-09)
// Modal de revisao de print colado: preview + selects (type/spot) +
// conclusion (max 500) + botoes Salvar/Revisar Depois/Fechar.
//
// Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-09)
// Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2A)
// C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
//
// Lessons aplicadas:
//   #1  hooks first — todos hooks declarados ANTES de qualquer return condicional
//   #2  data-testid estavel
//   #11 default minimo — Save so dispara apos clique explicito do user
//   #12 estado persistente via initial* props (parent reabre modal pre-popula)
//
// Implementacao usa <select> nativo (nao Radix Select) para que o teste possa
// inspecionar `sel.options` e usar `userEvent.selectOptions(sel, value)`.
// =============================================================================
import { useEffect, useState } from "react";
import {
  STARRED_HAND_TYPES,
  STARRED_HAND_SPOTS,
} from "../../../../shared/schema";
import { getSpotImageUrl } from "@/lib/spotConstants";

export interface SpotReviewCardProps {
  open: boolean;
  spotId: string;
  /** @deprecated Mantido para compat — src real eh derivado de `spotId` via getSpotImageUrl(). */
  imageUrl?: string;
  sessionTournamentId: string;
  initialType?: string;
  initialSpot?: string;
  initialNotes?: string;
  onSave?: (patch: {
    conclusion: string;
    type: string;
    spot: string;
    notes?: string;
    sessionTournamentId: string;
  }) => Promise<void>;
  onReviewLater?: () => Promise<void>;
  onClose: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveDisabledReason?: string;
}

const MAX_CONCLUSION = 500;

// Filtra placeholders F2 (spot_screenshot + screenshot_pending) — RF-09: o
// modal so deve oferecer valores classificaveis pelo jogador.
const SELECTABLE_TYPES = STARRED_HAND_TYPES.filter(
  (t) => t !== "spot_screenshot",
);
const SELECTABLE_SPOTS = STARRED_HAND_SPOTS.filter(
  (s) => s !== "screenshot_pending",
);

export default function SpotReviewCard(props: SpotReviewCardProps) {
  const {
    open,
    spotId,
    sessionTournamentId,
    initialType = "",
    initialSpot = "",
    initialNotes = "",
    onSave,
    onReviewLater,
    onClose,
    saving = false,
    saveDisabled = false,
    saveDisabledReason,
  } = props;

  // Hooks first — declarados ANTES de qualquer return condicional (lesson #1).
  const [typeValue, setTypeValue] = useState<string>(initialType);
  const [spotValue, setSpotValue] = useState<string>(initialSpot);
  const [notesValue, setNotesValue] = useState<string>(initialNotes);
  const [conclusion, setConclusion] = useState<string>("");

  // Re-popula form quando spotId muda (parent reabre modal para outro print).
  useEffect(() => {
    setTypeValue(initialType);
    setSpotValue(initialSpot);
    setNotesValue(initialNotes);
    setConclusion("");
    // Intencional: depende do spotId (instancia do modal), nao das props
    // initial* — tests passam initial* fixos no render inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);

  const conclusionTooLong = conclusion.length > MAX_CONCLUSION;
  const imageSrc = getSpotImageUrl(spotId);

  if (!open) return null;

  const isSaveDisabled =
    saving || saveDisabled || conclusionTooLong;

  const handleSave = async () => {
    if (isSaveDisabled) return;
    if (!onSave) return;
    await onSave({
      conclusion,
      type: typeValue,
      spot: spotValue,
      notes: notesValue || undefined,
      sessionTournamentId,
    });
  };

  const handleReviewLater = async () => {
    if (!onReviewLater) return;
    await onReviewLater();
  };

  return (
    <div
      data-testid="spot-review-card"
      role="dialog"
      aria-label="Revisar print"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
    >
      <div className="w-full max-w-2xl rounded-lg border bg-card p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Revisar print</h3>
          <button
            type="button"
            data-testid="spot-review-close"
            aria-label="Fechar"
            onClick={onClose}
            className="text-muted-foreground"
          >
            ×
          </button>
        </div>

        <div className="flex justify-center">
          <img
            data-testid="spot-review-image"
            src={imageSrc}
            alt="Print do spot"
            className="max-h-64 rounded border"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">
            <div className="mb-1">Tipo</div>
            <select
              data-testid="spot-review-type"
              value={typeValue}
              onChange={(e) => setTypeValue(e.target.value)}
              className="w-full rounded border text-xs p-1"
            >
              <option value="">--</option>
              {SELECTABLE_TYPES.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <div className="mb-1">Spot</div>
            <select
              data-testid="spot-review-spot"
              value={spotValue}
              onChange={(e) => setSpotValue(e.target.value)}
              className="w-full rounded border text-xs p-1"
            >
              <option value="">--</option>
              {SELECTABLE_SPOTS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span>Conclusao</span>
            <span
              className={
                conclusionTooLong
                  ? "text-red-600"
                  : "text-muted-foreground"
              }
            >
              {conclusion.length}/{MAX_CONCLUSION}
            </span>
          </div>
          <textarea
            data-testid="spot-review-conclusion"
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            maxLength={MAX_CONCLUSION}
            rows={4}
            className="w-full rounded border text-xs p-2"
            placeholder="O que voce aprendeu deste spot?"
          />
          {conclusionTooLong && (
            <div
              data-testid="spot-review-conclusion-error"
              className="mt-1 text-xs text-red-600"
            >
              Conclusao deve ter no maximo {MAX_CONCLUSION} caracteres.
            </div>
          )}
        </label>

        <label className="block text-xs">
          <div className="mb-1">Notas (opcional)</div>
          <input
            type="text"
            data-testid="spot-review-notes"
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            maxLength={500}
            className="w-full rounded border text-xs p-1"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="spot-review-later"
            onClick={() => void handleReviewLater()}
            className="rounded border px-3 py-1 text-xs"
          >
            Revisar Depois
          </button>
          <button
            type="button"
            data-testid="spot-review-save"
            disabled={isSaveDisabled}
            title={saveDisabled ? saveDisabledReason : undefined}
            aria-label={saveDisabled ? saveDisabledReason : undefined}
            onClick={() => void handleSave()}
            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar revisao"}
          </button>
        </div>
      </div>
    </div>
  );
}
