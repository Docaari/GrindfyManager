/**
 * EmotionalCheckBlock — Sprint W-1 (RF-03, T-09)
 *
 * Bloco 1 do warm-up: respiracao 4-4-4-4 + slider 0-10 + gate Go/No-Go.
 * Microcopy literal spec secao 9.1.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BreathingBox4444 } from "./BreathingBox4444";
import { GoNoGoModal } from "./GoNoGoModal";
import { OverrideConfirmDialog } from "./OverrideConfirmDialog";

export interface EmotionalCheckBlockProps {
  onSubmit: (score: number, overrideUsed: boolean) => void;
  onCancel: () => void;
}

export function EmotionalCheckBlock({ onSubmit, onCancel }: EmotionalCheckBlockProps) {
  const [score, setScore] = useState<number>(6);
  const [showGate, setShowGate] = useState<boolean>(false);
  const [showOverride, setShowOverride] = useState<boolean>(false);

  const handleSubmit = () => {
    if (score < 6) {
      setShowGate(true);
      return;
    }
    onSubmit(score, false);
  };

  const handleNotPlaying = () => {
    setShowGate(false);
    onCancel();
  };

  const handleWantsToPlay = () => {
    setShowGate(false);
    setShowOverride(true);
  };

  const handleOverrideConfirm = () => {
    setShowOverride(false);
    onSubmit(score, true);
  };

  const handleOverrideCancel = () => {
    setShowOverride(false);
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto px-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Check-in emocional</h2>
        <p className="text-sm text-muted-foreground">
          Respire. Olhe pra dentro. Decida com honestidade.
        </p>
      </header>

      <BreathingBox4444 onComplete={() => { /* anim termina; UI permanece */ }} />

      <div className="space-y-3">
        <label
          htmlFor="emotional-check-slider"
          className="block text-base font-medium text-center"
        >
          Estou emocionalmente OK pra jogar agora? ({score})
        </label>
        <input
          id="emotional-check-slider"
          data-testid="emotional-check-slider"
          type="range"
          min={0}
          max={10}
          step={1}
          value={score}
          onChange={(e) => setScore(parseInt(e.target.value, 10))}
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-label="Score emocional 0 a 10"
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Pessimo</span>
          <span>Otimo</span>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          0 = totalmente fora · 6 = aceitavel pra jogar · 10 = otimo estado
        </p>
      </div>

      <div className="flex justify-center pt-2">
        <Button
          type="button"
          data-testid="emotional-check-submit"
          onClick={handleSubmit}
          className="min-w-[140px]"
        >
          Submeter
        </Button>
      </div>

      <GoNoGoModal
        open={showGate}
        score={score}
        onCancel={handleNotPlaying}
        onWantsToPlay={handleWantsToPlay}
      />

      <OverrideConfirmDialog
        open={showOverride}
        onConfirm={handleOverrideConfirm}
        onCancel={handleOverrideCancel}
      />
    </div>
  );
}
