/**
 * PFCDrillBlock — Sprint W-1 (RF-07, T-10)
 *
 * Bloco 3: Drill PFC. Timer 4 min cronometrado (nao pausavel).
 * Link externo configuravel + checkbox "Completei o drill" (nao bloqueante).
 * Microcopy spec secao 9.3.
 */

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const DRILL_SECONDS = 4 * 60;
const DEFAULT_DRILL_URL = "https://app.gtowizard.com/";

export interface PFCDrillBlockProps {
  drillUrl?: string;
  onAdvance: (payload: {
    drillCompleted: boolean;
    drillUrl: string;
  }) => void;
}

function formatMmSs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function PFCDrillBlock({ drillUrl, onAdvance }: PFCDrillBlockProps) {
  // Usamos um tick counter (forca re-render) + acc em ref para o tempo real.
  const [tick, setTick] = useState<number>(0);
  const accRef = useRef<number>(0);
  const [completed, setCompleted] = useState<boolean>(false);
  const finishedRef = useRef<boolean>(false);

  useEffect(() => {
    const TICK_MS = 250;
    const interval = setInterval(() => {
      accRef.current += TICK_MS;
      // flushSync para que cada tick reflita imediatamente no DOM (necessario
      // para tests com vi.useFakeTimers que assertem textContent apos
      // advanceTimersByTime).
      flushSync(() => {
        setTick((t) => t + 1);
      });
      const elapsed = Math.floor(accRef.current / 1000);
      if (elapsed >= DRILL_SECONDS) {
        finishedRef.current = true;
        clearInterval(interval);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const remaining = Math.max(
    DRILL_SECONDS - Math.floor(accRef.current / 1000),
    0,
  );
  // referencia tick (lint) — forca re-render
  void tick;

  const url = drillUrl || DEFAULT_DRILL_URL;

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto px-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Ativacao do PFC</h2>
        <p className="text-sm text-muted-foreground">
          4 minutos de drill no foco da semana
        </p>
      </header>

      <p className="text-sm">
        Abra o GTO Wizard Trainer (ou seu drill preferido) em modo 'Close
        Decisions — Fast'. Foque no spot da semana. Objetivo NAO e acertar — e
        pre-ativar os circuitos de decisao. Erros aqui sao informativos.
      </p>

      <div
        role="timer"
        aria-live="polite"
        aria-label="Tempo restante do drill PFC"
        className="text-center text-5xl font-mono font-bold tabular-nums"
      >
        {formatMmSs(remaining)}
      </div>

      <div className="flex justify-center">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Abrir Trainer (GTO Wizard)
        </a>
      </div>

      <div className="flex items-center gap-2 justify-center">
        <Checkbox
          id="pfc-drill-completed"
          data-testid="pfc-drill-completed"
          checked={completed}
          onCheckedChange={(v) => setCompleted(Boolean(v))}
        />
        <label htmlFor="pfc-drill-completed" className="text-sm">
          Completei o drill
        </label>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Se voce nao tem acesso a um drill agora, use estes 4 minutos para
        revisar mentalmente as 3 heuristicas e simular spots tipicos.
      </p>

      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="pfc-drill-advance"
          onClick={() =>
            onAdvance({ drillCompleted: completed, drillUrl: url })
          }
        >
          Proximo
        </Button>
      </div>
    </div>
  );
}
