/**
 * BreathingBox4444 — Sprint W-1 (RF-03, RNF-09)
 *
 * Animacao de respiracao caixa 4-4-4-4 (5 ciclos = 80s).
 * Botao "Pular animacao" aparece apos primeiro ciclo (16s).
 * Respeita prefers-reduced-motion: substitui animacao por texto.
 */

import { useEffect, useRef, useState } from "react";

const CYCLE_MS = 16_000; // 4+4+4+4 = 16s
const DEFAULT_TOTAL_CYCLES = 5;
const DEFAULT_TOTAL_MS = CYCLE_MS * DEFAULT_TOTAL_CYCLES; // 80s

type Phase = "inhale" | "hold-in" | "exhale" | "hold-out";

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "inhale":
      return "Inspire";
    case "hold-in":
      return "Segure";
    case "exhale":
      return "Expire";
    case "hold-out":
      return "Segure";
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  } catch {
    return false;
  }
}

export interface BreathingBox4444Props {
  onComplete: () => void;
  onSkip?: () => void;
  /** Duracao total em segundos. Default 80s (5 ciclos). Arredondado para multiplo de 16s. */
  durationSeconds?: number;
}

export function BreathingBox4444({ onComplete, onSkip, durationSeconds }: BreathingBox4444Props) {
  const reduced = prefersReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completedFlag, setCompletedFlag] = useState(false);

  // Math.ceil garante que duracao real >= duracao pedida (sem desincronizar com timer global).
  const totalCycles = durationSeconds && durationSeconds > 0
    ? Math.max(1, Math.ceil(durationSeconds / 16))
    : DEFAULT_TOTAL_CYCLES;
  const totalMs = totalCycles * CYCLE_MS;

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const completedRef = useRef(false);

  useEffect(() => {
    const TICK_MS = 100;
    let acc = 0;
    const interval = setInterval(() => {
      acc += TICK_MS;
      setElapsedMs(acc);
      if (acc >= totalMs && !completedRef.current) {
        completedRef.current = true;
        clearInterval(interval);
        try {
          onCompleteRef.current?.();
        } catch {
          /* ignore */
        }
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [reduced, totalMs]);

  const cycleIdx = Math.min(Math.floor(elapsedMs / CYCLE_MS), totalCycles - 1);
  const intoCycle = elapsedMs % CYCLE_MS;
  let phase: Phase = "inhale";
  if (intoCycle < 4_000) phase = "inhale";
  else if (intoCycle < 8_000) phase = "hold-in";
  else if (intoCycle < 12_000) phase = "exhale";
  else phase = "hold-out";

  // Skip button so apos 1 ciclo (16s)
  const showSkip = elapsedMs >= CYCLE_MS;

  // Tamanho do circulo (transform scale)
  let scale = 1;
  if (phase === "inhale") {
    scale = 1 + (intoCycle / 4000) * 0.6; // 1 → 1.6
  } else if (phase === "hold-in") {
    scale = 1.6;
  } else if (phase === "exhale") {
    scale = 1.6 - ((intoCycle - 8000) / 4000) * 0.6; // 1.6 → 1
  } else {
    scale = 1;
  }

  return (
    <div
      data-testid="breathing-box"
      role="region"
      aria-label="Respiracao caixa 4-4-4-4"
      className="flex flex-col items-center justify-center gap-6 py-6"
    >
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Sente na cadeira. Nenhuma mesa aberta ainda. Faca 5 respiracoes com caixa:
        4s inspira, 4s segura, 4s expira, 4s segura.
      </p>

      {reduced ? (
        <div className="text-center text-base font-medium" aria-live="polite">
          Inspire 4s · Segure 4s · Expire 4s · Segure 4s
        </div>
      ) : (
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute w-32 h-32 rounded-full bg-primary/20 transition-transform duration-200 ease-linear"
            style={{ transform: `scale(${scale.toFixed(3)})` }}
          />
          <div className="relative z-10 text-center">
            <div className="text-3xl font-bold">{phaseLabel(phase)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              4s · Ciclo {cycleIdx + 1}/{totalCycles}
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Inspire 4s · Segure 4s · Expire 4s · Segure 4s
      </div>

      {showSkip && (
        <button
          type="button"
          onClick={() => {
            try {
              onSkip?.();
            } finally {
              setCompletedFlag(true);
              try {
                onComplete();
              } catch {
                /* ignore */
              }
            }
          }}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Pular animacao
        </button>
      )}
    </div>
  );
}
