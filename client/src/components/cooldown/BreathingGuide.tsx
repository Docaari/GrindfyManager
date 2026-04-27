import { useEffect, useRef, useState } from "react";

// =============================================================================
// BreathingGuide — Sprint Cooldown-1 (MVP)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 1, RF-05)
//
// Animacao 4s inhale / 7s hold / 8s exhale (Weil 4-7-8). Loop 3x quando enabled.
// Toggle on/off via prop. aria-label "respiracao 4-7-8".
// =============================================================================

export interface BreathingGuideProps {
  enabled: boolean;
  onToggle: () => void;
}

type Phase = "inhale" | "hold" | "exhale";

const PHASES: Array<{ phase: Phase; seconds: number; label: string }> = [
  { phase: "inhale", seconds: 4, label: "Inspirar" },
  { phase: "hold", seconds: 7, label: "Segurar" },
  { phase: "exhale", seconds: 8, label: "Expirar" },
];

export function BreathingGuide({ enabled, onToggle }: BreathingGuideProps) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PHASES[0].seconds);
  const [cycleCount, setCycleCount] = useState(0);
  // Refs evitam que useEffect recrie o interval a cada transicao de fase
  // (MED-3 reviewer: deps [phaseIdx, cycleCount] causavam drift de timing).
  const phaseIdxRef = useRef(0);
  const cycleCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      phaseIdxRef.current = 0;
      cycleCountRef.current = 0;
      setPhaseIdx(0);
      setSecondsLeft(PHASES[0].seconds);
      setCycleCount(0);
      return;
    }

    const interval = setInterval(() => {
      if (cycleCountRef.current >= 3) return;
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        const nextIdx = phaseIdxRef.current + 1;
        if (nextIdx >= PHASES.length) {
          cycleCountRef.current += 1;
          phaseIdxRef.current = 0;
          setCycleCount(cycleCountRef.current);
          setPhaseIdx(0);
        } else {
          phaseIdxRef.current = nextIdx;
          setPhaseIdx(nextIdx);
        }
        return PHASES[phaseIdxRef.current].seconds;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [enabled]);

  const current = PHASES[phaseIdx];

  return (
    <div className="cooldown-breathing-guide">
      <button
        type="button"
        data-testid="cooldown-breathing-toggle"
        aria-label={enabled ? "Desativar guia" : "Ativar guia"}
        aria-pressed={enabled}
        onClick={onToggle}
        className="text-sm underline"
      >
        {enabled ? "Pausar respiracao" : "Ativar respiracao"}
      </button>

      {enabled && (
        <div
          aria-label="Guia de respiracao 4-7-8"
          role="status"
          aria-live="polite"
          className="mt-2 flex items-center gap-3 rounded-md border p-3"
          data-phase={current.phase}
        >
          <div className="text-base font-medium">
            {current.label} ({current.seconds}s)
          </div>
          <div className="text-xs text-muted-foreground">
            ciclo {Math.min(cycleCount + 1, 3)} / 3
          </div>
          <div className="ml-auto text-sm font-mono">{secondsLeft}s</div>
          <div className="sr-only">
            inhale 4s, hold 7s, exhale 8s
          </div>
        </div>
      )}
    </div>
  );
}

export default BreathingGuide;
