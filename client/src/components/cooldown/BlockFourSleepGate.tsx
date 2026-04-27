import { useState } from "react";
import { BlockTimer } from "./BlockTimer";
import { BreathingGuide } from "./BreathingGuide";
import { AudioLibraryDialog } from "@/components/mental-prep/AudioLibraryDialog";

// Pool replica do server/services/sleepGateService.ts (client-side, sem import).
const ACTIVITY_SUGGESTIONS: readonly string[] = [
  "Ler livro 20min",
  "Caminhar 10min",
  "Banho quente",
  "Conversar com alguem",
  "Cozinhar",
  "Tarefa domestica leve",
];

// =============================================================================
// BlockFourSleepGate — Sprint Cooldown-2
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4)
//
// Toggle "Vou dormir agora?":
//   SIM -> botao "Marcar plano fechado" (onClosePlan), BreathingGuide destacado,
//          AudioLibraryDialog opcional. onConfirm({sleepIntent:true, planClosed:true})
//   NAO -> sugestao de atividade aleatoria + msg "Cool-down completo na proxima sessao".
//          onConfirm({sleepIntent:false})
// BlockTimer 2min.
// =============================================================================

export type SleepGateValue = {
  sleepIntent: boolean | null;
  planClosed: boolean;
};

export interface BlockFourSleepGateProps {
  value: SleepGateValue;
  onChange: (value: SleepGateValue) => void;
  onConfirm: (payload: { sleepIntent: boolean; planClosed?: boolean }) => void;
  onClosePlan: () => void;
  onBack: () => void;
  audioEnabled?: boolean;
}

// Sugestao gerada uma vez por mount para nao trocar a cada render.
function pickInitialSuggestion(): string {
  const idx = Math.floor(Math.random() * ACTIVITY_SUGGESTIONS.length);
  return ACTIVITY_SUGGESTIONS[idx];
}

export function BlockFourSleepGate({
  value,
  onChange,
  onConfirm,
  onClosePlan,
  onBack,
  audioEnabled = false,
}: BlockFourSleepGateProps) {
  // Hooks first — sem early returns antes deste ponto (lessons-learned #1).
  const [breathingEnabled, setBreathingEnabled] = useState(true);
  const [audioOpen, setAudioOpen] = useState<boolean>(audioEnabled === true);
  const [suggestion] = useState<string>(pickInitialSuggestion);

  const setSleepIntent = (b: boolean) => {
    onChange({ ...value, sleepIntent: b });
  };

  const handleClosePlan = () => {
    onClosePlan();
  };

  const handleConfirm = () => {
    if (value.sleepIntent === true) {
      onConfirm({ sleepIntent: true, planClosed: value.planClosed === true });
    } else {
      // null ou false -> trata como NAO dormiu (sem snooze).
      onConfirm({ sleepIntent: false });
    }
  };

  return (
    <div data-testid="cooldown-block-4" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Bloco 4 — Sleep Gate</h3>
        <BlockTimer blockNumber={4} durationSeconds={120} />
      </div>

      <div
        data-testid="cooldown-block-4-sleep-toggle"
        role="radiogroup"
        aria-label="Vou dormir agora?"
        className="flex gap-2"
      >
        <span className="text-sm font-medium self-center mr-2">
          Vou dormir agora?
        </span>
        <button
          type="button"
          data-value="true"
          data-testid="cooldown-block-4-sleep-yes"
          aria-pressed={value.sleepIntent === true}
          role="radio"
          aria-checked={value.sleepIntent === true}
          onClick={() => setSleepIntent(true)}
          className={`rounded border px-3 py-1 text-sm ${
            value.sleepIntent === true
              ? "bg-primary text-primary-foreground"
              : ""
          }`}
        >
          Sim
        </button>
        <button
          type="button"
          data-value="false"
          data-testid="cooldown-block-4-sleep-no"
          aria-pressed={value.sleepIntent === false}
          role="radio"
          aria-checked={value.sleepIntent === false}
          onClick={() => setSleepIntent(false)}
          className={`rounded border px-3 py-1 text-sm ${
            value.sleepIntent === false
              ? "bg-primary text-primary-foreground"
              : ""
          }`}
        >
          Nao
        </button>
      </div>

      {value.sleepIntent === true && (
        <div className="space-y-3">
          <button
            type="button"
            data-testid="cooldown-block-4-close-plan"
            onClick={handleClosePlan}
            disabled={value.planClosed === true}
            className="rounded bg-yellow-500 px-3 py-1 text-sm text-white disabled:opacity-60"
          >
            {value.planClosed ? "Plano fechado" : "Marcar plano fechado"}
          </button>

          <div data-testid="cooldown-breathing-guide">
            <BreathingGuide
              enabled={breathingEnabled}
              onToggle={() => setBreathingEnabled((v) => !v)}
            />
          </div>

          {audioEnabled && (
            <div>
              <button
                type="button"
                data-testid="cooldown-block-4-audio-trigger"
                onClick={() => setAudioOpen((v) => !v)}
                className="text-sm underline"
              >
                Biblioteca de audios (sleep transition)
              </button>
              <AudioLibraryDialog
                open={audioOpen}
                onOpenChange={setAudioOpen}
              />
            </div>
          )}
        </div>
      )}

      {value.sleepIntent === false && (
        <div className="space-y-2 rounded border p-3 text-sm">
          <div data-testid="cooldown-block-4-activity-suggestion">
            <span className="font-medium">Sugestao: </span>
            {suggestion}
          </div>
          <div className="text-xs text-muted-foreground">
            Cool-down completo na proxima sessao.
          </div>
        </div>
      )}

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
          data-testid="cooldown-finish"
          onClick={handleConfirm}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
        >
          Concluir
        </button>
      </div>
    </div>
  );
}

export default BlockFourSleepGate;
