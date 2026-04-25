/**
 * WarmUpRunner — Sprint W-1 (RF-02, T-11)
 *
 * Componente fullscreen orquestrador dos 5 blocos.
 * Header: timer geral 10:00 + indicador "X/5".
 * Footer: Pausar / Abortar.
 * Aborto requer confirmacao via AlertDialog.
 *
 * Microcopy literal spec.
 */

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { useWarmupRitual } from "@/hooks/useWarmupRitual";
import { useWarmupTelemetry } from "@/hooks/useWarmupTelemetry";
import { EmotionalCheckBlock } from "./EmotionalCheckBlock";
import { WeeklyFocusBlock } from "./WeeklyFocusBlock";
import { PFCDrillBlock } from "./PFCDrillBlock";
import { PhysicalSetupBlock } from "./PhysicalSetupBlock";
import { IntentionBlock } from "./IntentionBlock";

const TOTAL_SECONDS = 10 * 60; // 10 min

export interface WarmUpRunnerProps {
  onClose: () => void;
  onComplete: (ritual: any) => void;
  resume?: boolean;
}

function formatMmSs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function WarmUpRunner({ onClose, onComplete, resume = false }: WarmUpRunnerProps) {
  const ritual = useWarmupRitual();
  const { track } = useWarmupTelemetry();
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // Timer global (10 min countdown). Implementacao com tick contador (compat fakeTimers).
  const [, setTick] = useState(0);
  const accRef = useRef(0);
  const tickerStartedRef = useRef(false);

  // Inicia (ou retoma) ritual ao montar (idempotente).
  // Quando `resume=true`, restaura o draft em vez de sobrescrever.
  useEffect(() => {
    if (ritual.status !== "idle") return;
    if (resume) {
      ritual.restoreDraft();
      track("warmup_resumed", {});
    } else {
      ritual.start();
      track("warmup_started", {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inicia ticker
  useEffect(() => {
    if (tickerStartedRef.current) return;
    tickerStartedRef.current = true;
    const TICK_MS = 250;
    const interval = setInterval(() => {
      accRef.current += TICK_MS;
      flushSync(() => {
        setTick((t) => t + 1);
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const elapsedSec = Math.floor(accRef.current / 1000);
  const remaining = Math.max(TOTAL_SECONDS - elapsedSec, 0);

  // Handlers de cada bloco
  const handleBlock1Submit = (score: number, override: boolean) => {
    track("emotional_check_submitted", { score });
    if (score < 6 && !override) {
      track("gate_triggered", { score });
    }
    if (override) {
      // O gate ja foi resolvido via OverrideConfirmDialog dentro do block.
      track("override_used", { score });
      // Set state diretamente — a versao Block fez o roteamento de gate
      // internamente; aqui aproveitamos para registrar score+override e
      // avancar.
      ritual.submitEmotionalCheck(score);
      ritual.confirmOverride();
      track("block_completed", { blockId: 1 });
      return;
    }
    ritual.submitEmotionalCheck(score);
    ritual.advanceBlock({ blockId: 1, emotionalCheckScore: score });
    track("block_completed", { blockId: 1 });
  };

  const handleBlock1Cancel = async () => {
    // "Nao vou jogar" -> abort com gate_no_go
    track("gate_triggered", { score: ritual.emotionalCheckScore ?? 0 });
    await ritual.abort("gate_no_go");
    track("warmup_aborted", { reason: "gate_no_go" });
    onClose();
  };

  const handleBlockAdvance = (blockId: number, payload: any) => {
    ritual.advanceBlock({ blockId, ...payload });
    track("block_completed", { blockId });
  };

  const handleConcluir = async (intention: any) => {
    try {
      await ritual.completeRitual(intention);
      track("warmup_completed", {});
      onComplete({
        intention,
        emotionalCheckScore: ritual.emotionalCheckScore,
        overrideUsed: ritual.overrideUsed,
      });
    } catch (e) {
      // mantem warm-up aberto; usuario pode tentar de novo
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  const handleAbort = async () => {
    setShowAbortConfirm(false);
    await ritual.abort("user_cancel");
    track("warmup_aborted", { reason: "user_cancel" });
    onClose();
  };

  return (
    <div
      data-testid="warmup-runner"
      className="fixed inset-0 z-40 bg-background min-h-screen flex flex-col"
    >
      {showAbortConfirm && (
        <div
          role="alertdialog"
          aria-labelledby="abort-confirm-title"
          aria-describedby="abort-confirm-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg space-y-4">
            <h3 id="abort-confirm-title" className="text-lg font-semibold">
              Cancelar warm-up?
            </h3>
            <p id="abort-confirm-description" className="text-sm">
              O progresso sera perdido.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAbortConfirm(false)}
              >
                Continuar
              </Button>
              <Button
                type="button"
                onClick={handleAbort}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Cancelar warm-up
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <div
          role="timer"
          aria-live="polite"
          aria-label="Tempo total do warm-up"
          className="text-lg font-mono font-bold tabular-nums"
        >
          {formatMmSs(remaining)}
        </div>
        <div className="text-sm text-muted-foreground">
          Bloco {ritual.currentBlock}/5
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto py-6">
        {ritual.currentBlock === 1 && (
          <EmotionalCheckBlock
            onSubmit={handleBlock1Submit}
            onCancel={handleBlock1Cancel}
          />
        )}
        {ritual.currentBlock === 2 && (
          <WeeklyFocusBlock
            onAdvance={(payload) => handleBlockAdvance(2, payload)}
          />
        )}
        {ritual.currentBlock === 3 && (
          <PFCDrillBlock
            onAdvance={(payload) => handleBlockAdvance(3, payload)}
          />
        )}
        {ritual.currentBlock === 4 && (
          <PhysicalSetupBlock
            onAdvance={(payload) => handleBlockAdvance(4, payload)}
          />
        )}
        {ritual.currentBlock === 5 && (
          <IntentionBlock onSubmit={handleConcluir} />
        )}
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-3 border-t gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAbortConfirm(true)}
        >
          Abortar
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            ritual.status === "paused" ? ritual.resume() : ritual.pause()
          }
        >
          {ritual.status === "paused" ? "Retomar" : "Pausar"}
        </Button>
      </footer>

    </div>
  );
}
