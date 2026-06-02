import { BlockTimer } from "./BlockTimer";
import {
  TILT_TYPE_CATALOG,
  getTiltType,
  suggestTiltType,
  type TiltTypeId,
} from "@shared/tilt-types";

// =============================================================================
// BlockThreeTiltReview — Sprint Cooldown-2 + Fase C #4 (ADR-232)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 3)
//     + Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md (RF-02/03/05)
//
// 3 sliders 0-10 (feltTilt, keptTilting, presence) + checklist 9 triggers
// multi-select + textarea action (max 500). BlockTimer 3min.
// Validacao soft (avanco sempre permitido).
//
// Fase C #4: seletor dos 7 tipos de tilt + card de antidoto do tipo selecionado.
// Sugestao heuristica pre-destacada (suggestTiltType), NUNCA auto-grava (lesson #11).
// =============================================================================

export type TiltAssessmentValue = {
  feltTilt: number;
  keptTilting: number;
  presence: number;
  triggers: string[];
  action: string;
  // Fase C #4 — tipo de tilt selecionado (1 dos 7) ou null (nao tipificou).
  tiltType?: TiltTypeId | null;
};

export interface BlockThreeTiltReviewProps {
  value: TiltAssessmentValue;
  onChange: (value: TiltAssessmentValue) => void;
  onNext: () => void;
  onBack: () => void;
}

const TRIGGERS: Array<{ id: string; label: string }> = [
  { id: "cooler", label: "Cooler" },
  { id: "slowroll", label: "Slowroll" },
  { id: "big-bluff-fail", label: "Big bluff fail" },
  { id: "downswing", label: "Downswing" },
  { id: "distracao", label: "Distracao" },
  { id: "fome", label: "Fome" },
  { id: "sono", label: "Sono" },
  { id: "briga-interpessoal", label: "Briga interpessoal" },
  { id: "outro", label: "Outro" },
];

const ACTION_MAX = 500;

interface SliderProps {
  testId: string;
  label: string;
  value: number;
  onValueChange: (n: number) => void;
}

function NumberSlider({ testId, label, value, onValueChange }: SliderProps) {
  return (
    <div data-testid={testId} className="cooldown-tilt-slider space-y-1">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">{value}/10</span>
      </div>
      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value}
        aria-label={label}
        tabIndex={0}
      >
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onValueChange(Number(e.target.value))}
          aria-label={label}
          className="w-full"
        />
      </div>
    </div>
  );
}

export function BlockThreeTiltReview({
  value,
  onChange,
  onNext,
  onBack,
}: BlockThreeTiltReviewProps) {
  const update = (patch: Partial<TiltAssessmentValue>) => {
    onChange({ ...value, ...patch });
  };

  const toggleTrigger = (id: string) => {
    const has = value.triggers.includes(id);
    const nextTriggers = has
      ? value.triggers.filter((t) => t !== id)
      : [...value.triggers, id];
    update({ triggers: nextTriggers });
  };

  // Fase C #4 — so tipifica quando ha tilt declarado (feltTilt>0 || keptTilting>0).
  const hasTilt = value.feltTilt > 0 || value.keptTilting > 0;
  // Sugestao heuristica pre-destacada (NAO auto-grava — lesson #11).
  const suggestion = suggestTiltType({
    triggers: value.triggers,
    feltTilt: value.feltTilt,
    keptTilting: value.keptTilting,
    presence: value.presence,
  });
  // Antidoto do tipo selecionado (RF-03) — null se nao tipificou (sem decorativo).
  const selectedMeta = value.tiltType ? getTiltType(value.tiltType) : undefined;

  return (
    <div data-testid="cooldown-block-3" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Bloco 3 — Revisao de Tilt</h3>
        <BlockTimer blockNumber={3} durationSeconds={180} />
      </div>

      <NumberSlider
        testId="cooldown-block-3-felt-tilt"
        label="Senti tilt durante a sessao?"
        value={value.feltTilt}
        onValueChange={(n) => update({ feltTilt: n })}
      />
      <NumberSlider
        testId="cooldown-block-3-kept-tilting"
        label="Continuei jogando em tilt?"
        value={value.keptTilting}
        onValueChange={(n) => update({ keptTilting: n })}
      />
      <NumberSlider
        testId="cooldown-block-3-presence"
        label="Quao presente eu estava? (mindfulness)"
        value={value.presence}
        onValueChange={(n) => update({ presence: n })}
      />

      <div data-testid="cooldown-block-3-triggers" className="space-y-2">
        <div className="text-sm font-medium">Gatilhos do tilt (multi-select)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TRIGGERS.map((t) => {
            const checked = value.triggers.includes(t.id);
            return (
              <label
                key={t.id}
                data-trigger={t.id}
                className={`flex items-center gap-2 rounded border p-2 text-sm cursor-pointer ${
                  checked ? "border-primary bg-primary/10" : "border-muted"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTrigger(t.id)}
                  aria-label={t.label}
                />
                <span>{t.label}</span>
                <span className="sr-only">{t.id}</span>
              </label>
            );
          })}
        </div>
      </div>

      {hasTilt && (
        <div data-testid="tilt-type-selector" className="space-y-2">
          <div className="text-sm font-medium">Que tipo de tilt foi esse?</div>
          {suggestion && value.tiltType == null && (
            <div className="text-xs text-muted-foreground">
              Parece tilt de {getTiltType(suggestion)?.label}? Selecione para confirmar.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TILT_TYPE_CATALOG.map((t) => {
              const selected = value.tiltType === t.id;
              const suggested = suggestion === t.id && value.tiltType == null;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`tilt-type-option-${t.id}`}
                  onClick={() => update({ tiltType: t.id })}
                  aria-pressed={selected}
                  className={`rounded border p-2 text-left text-sm cursor-pointer ${
                    selected
                      ? "border-primary bg-primary/10"
                      : suggested
                        ? "border-primary/50 bg-primary/5"
                        : "border-muted"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedMeta && (
        <div
          data-testid="tilt-antidote-card"
          className="rounded border border-primary/40 bg-primary/5 p-3 text-sm"
        >
          <div className="font-medium">Antidoto — {selectedMeta.label}</div>
          <p className="mt-1 text-muted-foreground">{selectedMeta.antidote}</p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">
          Como agir diferente da proxima vez? (opcional)
        </label>
        <textarea
          data-testid="cooldown-block-3-action"
          value={value.action}
          maxLength={ACTION_MAX}
          onChange={(e) =>
            update({ action: e.target.value.slice(0, ACTION_MAX) })
          }
          rows={3}
          className="w-full rounded border p-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {value.action.length}/{ACTION_MAX}
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

export default BlockThreeTiltReview;
