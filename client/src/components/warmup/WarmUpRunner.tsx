/**
 * WarmUpRunner — Sprint W-1 (RF-02) — Reform 2026-05-05.
 *
 * Componente fullscreen orquestrador dos 5 blocos.
 *
 * Nova ordem:
 *   1. Setup Fisico (sem timer global; user clica Proximo para iniciar)
 *   2. Respiracao + check emocional (timer global comeca aqui)
 *   3. Foco da semana (heuristicas)
 *   4. Intencao (opcional)
 *   5. Drills GTO/Estudo (PFC)
 *
 * Modos: 6m / 15m / 30m. Tempos por bloco em durations.ts.
 *
 * Header: timer geral countdown + indicador "X/5".
 * Footer: Pausar / Abortar (com confirmacao).
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWarmupRitual } from "@/hooks/useWarmupRitual";
import { formatMmSs } from "@/lib/timeFormat";
import { useWarmupTelemetry } from "@/hooks/useWarmupTelemetry";
import { PhysicalSetupBlock } from "./PhysicalSetupBlock";
import { EmotionalCheckBlock } from "./EmotionalCheckBlock";
import { WeeklyFocusBlock } from "./WeeklyFocusBlock";
import { IntentionBlock } from "./IntentionBlock";
import { PFCDrillBlock } from "./PFCDrillBlock";
import { MODE_CONFIGS, totalSeconds, type WarmupMode } from "./durations";

const TOTAL_BLOCKS = 5;

const BLOCK_LABELS: Record<number, string> = {
  1: "Setup fisico",
  2: "Respiracao",
  3: "Foco da semana",
  4: "Intencao",
  5: "Drills GTO/Estudo",
};

export interface WarmUpRunnerProps {
  onClose: () => void;
  onComplete: (ritual: any) => void;
  resume?: boolean;
  mode?: WarmupMode;
}

export function WarmUpRunner({
  onClose,
  onComplete,
  resume = false,
  mode = "15m",
}: WarmUpRunnerProps) {
  const ritual = useWarmupRitual();
  const { track } = useWarmupTelemetry();
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const cfg = MODE_CONFIGS[mode];
  const totalSec = totalSeconds(mode);

  // Timer global. Inicia apenas quando entra no bloco 2 (Respiracao).
  // Pausa quando ritual.status === 'paused'.
  const [, setTick] = useState(0);
  const accRef = useRef(0);

  // Inicia (ou retoma) ritual ao montar (idempotente).
  useEffect(() => {
    if (ritual.status !== "idle") return;
    if (resume) {
      ritual.restoreDraft();
      track("warmup_resumed", {});
    } else {
      ritual.start(mode);
      track("warmup_started", { mode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reform 2026-05-05 v2: previne fechar/recarregar aba durante warm-up sem confirmacao.
  // Browser exibe dialog nativo (texto ignorado em browsers modernos).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (ritual.status === "completed" || ritual.status === "aborted") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ritual.status]);

  // Ticker — so roda em bloco >= 2 e quando nao pausado.
  const shouldTick = ritual.currentBlock >= 2 && ritual.status !== "paused";
  useEffect(() => {
    if (!shouldTick) return;
    const TICK_MS = 500;
    const interval = setInterval(() => {
      accRef.current += TICK_MS;
      setTick((t) => t + 1);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [shouldTick]);

  const elapsedSec = Math.floor(accRef.current / 1000);
  const remaining = Math.max(totalSec - elapsedSec, 0);
  const timerActive = ritual.currentBlock >= 2;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSetupAdvance = (payload: any) => {
    ritual.advanceBlock({ blockId: 1, ...payload });
    track("block_completed", { blockId: 1 });
  };

  const handleEmotionalCheckSubmit = (score: number, override: boolean) => {
    track("emotional_check_submitted", { score });
    if (score < 6 && !override) {
      track("gate_triggered", { score });
    }
    if (override) {
      track("override_used", { score });
      ritual.submitEmotionalCheck(score);
      ritual.confirmOverride();
      track("block_completed", { blockId: 2 });
      return;
    }
    ritual.submitEmotionalCheck(score);
    ritual.advanceBlock({ blockId: 2, emotionalCheckScore: score });
    track("block_completed", { blockId: 2 });
  };

  const handleEmotionalCheckCancel = async (score: number) => {
    // score passado direto para abort para evitar race com setState async.
    track("gate_triggered", { score });
    await ritual.abort("gate_no_go", { emotionalCheckScore: score });
    track("warmup_aborted", { reason: "gate_no_go" });
    onClose();
  };

  const handleHeuristicsAdvance = (payload: any) => {
    ritual.advanceBlock({ blockId: 3, ...payload });
    track("block_completed", { blockId: 3 });
  };

  const handleIntentionSubmit = (intention: any) => {
    ritual.advanceBlock({ blockId: 4, sessionIntention: intention });
    track("block_completed", { blockId: 4 });
  };

  const handlePFCAdvance = async (payload: any) => {
    track("block_completed", { blockId: 5 });
    const intention = (ritual.blocksData?.[4] as any)?.sessionIntention ?? null;
    let success = true;
    let error: string | null = null;
    try {
      await ritual.completeRitual(intention);
      track("warmup_completed", { mode });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[warmup] completeRitual falhou:", e);
      track("warmup_completed_error", { mode });
      success = false;
      error = e?.message ?? "Falha ao salvar warm-up";
    }
    // Sempre fecha runner — completion final ou erro.
    onComplete({
      intention,
      emotionalCheckScore: ritual.emotionalCheckScore,
      overrideUsed: ritual.overrideUsed,
      mode,
      pfc: payload,
      success,
      error,
    });
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
      className="fixed inset-0 z-[60] bg-background min-h-screen flex flex-col"
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
          aria-live="off"
          aria-label="Tempo total do warm-up"
          className="text-lg font-mono font-bold tabular-nums"
        >
          {timerActive ? formatMmSs(remaining) : "--:--"}
        </div>
        <div className="text-sm text-muted-foreground">
          {BLOCK_LABELS[ritual.currentBlock] ?? ""} · {ritual.currentBlock}/{TOTAL_BLOCKS}
        </div>
        <div className="text-xs text-muted-foreground">
          {cfg.label}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto py-6">
        {ritual.currentBlock === 1 && (
          <PhysicalSetupBlock onAdvance={handleSetupAdvance} />
        )}
        {ritual.currentBlock === 2 && (
          <EmotionalCheckBlock
            onSubmit={handleEmotionalCheckSubmit}
            onCancel={handleEmotionalCheckCancel}
            breathingSeconds={cfg.breathingSeconds}
          />
        )}
        {ritual.currentBlock === 3 && (
          <WeeklyFocusBlock
            onAdvance={(payload) => handleHeuristicsAdvance(payload)}
          />
        )}
        {ritual.currentBlock === 4 && (
          <IntentionBlock onSubmit={handleIntentionSubmit} />
        )}
        {ritual.currentBlock === 5 && (
          <PFCDrillBlock
            durationSeconds={cfg.pfcSeconds}
            paused={ritual.status === "paused"}
            onAdvance={(payload) => handlePFCAdvance(payload)}
          />
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
