/**
 * IntentionBlock — Sprint W-1 (RF-09) — Reform 2026-05-05.
 *
 * 3 textareas OPCIONAIS. Botao Proximo sempre habilitado. Campos vazios viram null.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface SessionIntentionPayload {
  focus: string;
  tiltPlan: string;
  stopCriteria: string;
}

export interface IntentionBlockProps {
  onSubmit: (intention: SessionIntentionPayload | null) => void;
  ctaLabel?: string;
}

export function IntentionBlock({ onSubmit, ctaLabel = "Proximo" }: IntentionBlockProps) {
  const [focus, setFocus] = useState<string>("");
  const [tiltPlan, setTiltPlan] = useState<string>("");
  const [stopCriteria, setStopCriteria] = useState<string>("");

  const handleSubmit = () => {
    const f = focus.trim();
    const t = tiltPlan.trim();
    const s = stopCriteria.trim();
    if (!f && !t && !s) {
      onSubmit(null);
      return;
    }
    onSubmit({ focus: f, tiltPlan: t, stopCriteria: s });
  };

  return (
    <div className="flex flex-col gap-5 max-w-xl mx-auto px-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Intencao da sessao</h2>
        <p className="text-sm text-muted-foreground">
          Opcional. Fixa intencao, prepara resposta a tilt, define criterio de encerramento.
        </p>
      </header>

      <div className="space-y-2">
        <label htmlFor="intention-focus" className="block text-sm font-medium">
          Foco desta sessao
        </label>
        <textarea
          id="intention-focus"
          data-testid="intention-focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Ex: 'Defender BB vs BTN open 25bb seguindo a range estudada'"
          className="w-full rounded-md border px-3 py-2 text-sm bg-background"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="intention-tilt-plan" className="block text-sm font-medium">
          Se sentir tilt, vou
        </label>
        <textarea
          id="intention-tilt-plan"
          data-testid="intention-tilt-plan"
          value={tiltPlan}
          onChange={(e) => setTiltPlan(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Ex: '5 respiracoes 4-4-4-4 + reler a intencao'"
          className="w-full rounded-md border px-3 py-2 text-sm bg-background"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="intention-stop-criteria"
          className="block text-sm font-medium"
        >
          Vou encerrar quando
        </label>
        <textarea
          id="intention-stop-criteria"
          data-testid="intention-stop-criteria"
          value={stopCriteria}
          onChange={(e) => setStopCriteria(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Ex: 'Stop-loss: -3 buy-ins do dia OU 4h de sessao'"
          className="w-full rounded-md border px-3 py-2 text-sm bg-background"
        />
      </div>

      <div className="flex justify-center pt-2">
        <Button
          type="button"
          data-testid="intention-submit"
          onClick={handleSubmit}
          className="min-w-[220px]"
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
