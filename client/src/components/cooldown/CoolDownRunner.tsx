import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { track as trackTelemetry } from "@/lib/telemetry";
import { useToast } from "@/hooks/use-toast";
import {
  BlockOneStarredHands,
  MAX_STARS_PER_TOURNAMENT,
  type SessionTournamentLite,
  type StarredHandLite,
} from "./BlockOneStarredHands";
import { BlockTwoABCJournal, type AbcJournalValue } from "./BlockTwoABCJournal";
import { BlockThreeTiltReview, type TiltAssessmentValue } from "./BlockThreeTiltReview";
import { BlockFourSleepGate, type SleepGateValue } from "./BlockFourSleepGate";
import SessionSpotsList, { type SessionSpot } from "./SessionSpotsList";
import SpotReviewCard from "./SpotReviewCard";
import type { StarredHandType, StarredHandSpot } from "../../../../shared/schema";

// =============================================================================
// CoolDownRunner — Sprint Cooldown-1 (MVP) + Sprint Cooldown-2
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02, RF-05)
// Sequence: Docs/architecture/flows/grind/sequence-cooldown-flow.mermaid
//
// Modal full-screen orquestrador.
//   mode='full'  -> Bloco 1 (hands) -> 2 (ABC) -> 3 (Tilt) -> 4 (Sleep)
//   mode='quick' -> apenas 5 campos (Bloco 1+2 versao curta), Sprint 1 (sem mudancas)
//
// PATCH incremental ao avancar (debounce 1s). Fechar abruptamente preserva
// log com completedAt=null. ESC dispara confirmacao se ha rascunho.
//
// Hooks first — todos hooks declarados ANTES de qualquer early return
// (lessons-learned #1).
// =============================================================================

export interface CoolDownRunnerProps {
  cooldownLogId: string;
  sessionId: string;
  mode: "full" | "quick";
  sessionTournaments: SessionTournamentLite[];
  onClose: (opts: { isDraft: boolean }) => void;
  onComplete: (log: any) => void;
}

type BlockKey = "hands" | "abc" | "tilt" | "sleep";

const DEBOUNCE_MS = 1000;

const EMPTY_TILT: TiltAssessmentValue = {
  feltTilt: 0,
  keptTilting: 0,
  presence: 0,
  triggers: [],
  action: "",
};

const EMPTY_SLEEP: SleepGateValue = {
  sleepIntent: null,
  planClosed: false,
};

export function CoolDownRunner({
  cooldownLogId,
  sessionId,
  mode,
  sessionTournaments,
  onClose,
  onComplete,
}: CoolDownRunnerProps) {
  // Hooks first
  const [currentBlock, setCurrentBlock] = useState<BlockKey>("hands");
  const [abcValue, setAbcValue] = useState<AbcJournalValue>({
    aGame: [""],
    bGame: [""],
    cGame: "",
    lesson: "",
  });
  const [starredHands, setStarredHands] = useState<StarredHandLite[]>([]);
  const [tiltValue, setTiltValue] = useState<TiltAssessmentValue>(EMPTY_TILT);
  const [sleepValue, setSleepValue] = useState<SleepGateValue>(EMPTY_SLEEP);
  const [breathingEnabled, setBreathingEnabled] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  // Sprint F2 W3 (RF-08/RF-09): drag-to-review wiring.
  const [droppedSpot, setDroppedSpot] = useState<{
    id: string;
    imageUrl: string;
    sessionTournamentId: string;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Sprint F2 W3 (RF-08): query de prints pendentes da sessao.
  const pendingSpotsQuery = useQuery<{
    items: Array<{
      id: string;
      imageUrl: string;
      sessionTournamentId: string | null;
      pastedAt: string;
    }>;
    total: number;
  }>({
    queryKey: ["/api/starred-hands/pending", { sessionId }],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/starred-hands/pending?sessionId=${encodeURIComponent(sessionId)}`,
      ),
    // Lista so eh consumida no Bloco 1 (hands). Evita request inutil em
    // sessoes que pulam direto para abc/tilt/sleep.
    enabled: !!sessionId && currentBlock === "hands",
  });

  const sessionSpots: SessionSpot[] = useMemo(
    () => (pendingSpotsQuery.data?.items ?? []) as SessionSpot[],
    [pendingSpotsQuery.data],
  );

  // Limpa debounce ao desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ESC handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (hasDraft) {
          setShowCloseConfirm(true);
        } else {
          onClose({ isDraft: false });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasDraft, onClose]);

  const flushPatch = async (patch: Record<string, any>) => {
    if (!cooldownLogId) return;
    try {
      await apiRequest("PATCH", `/api/cooldown-logs/${cooldownLogId}`, patch);
    } catch (err: any) {
      console.error("CoolDownRunner patch failed:", err);
    }
  };

  const schedulePatch = (patch: Record<string, any>) => {
    if (!cooldownLogId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void flushPatch(patch);
    }, DEBOUNCE_MS);
  };

  const handleAddStar = async (
    sessionTournamentId: string,
    type: StarredHandType,
    spot: StarredHandSpot,
    notes?: string,
  ) => {
    try {
      const created = await apiRequest("POST", "/api/starred-hands", {
        sessionId,
        sessionTournamentId,
        cooldownLogId,
        type,
        spot,
        notes,
      });
      setStarredHands((prev) => [...prev, created as StarredHandLite]);
      setHasDraft(true);
    } catch (err: any) {
      toast({ title: "Erro ao estrelar mao", description: err?.message });
    }
  };

  const handleRemoveStar = async (starId: string) => {
    try {
      await apiRequest("DELETE", `/api/starred-hands/${starId}`);
      setStarredHands((prev) => prev.filter((sh) => sh.id !== starId));
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message });
    }
  };

  // Sprint F2 W3 (RF-09): drop callback do BlockOneStarredHands.
  const handleSpotDropped = (spotId: string, targetStId: string) => {
    const spot = sessionSpots.find((s) => s.id === spotId);
    if (!spot) return;
    setDroppedSpot({
      id: spot.id,
      imageUrl: spot.imageUrl,
      sessionTournamentId: targetStId,
    });
  };

  const invalidatePendingSpots = () => {
    try {
      queryClient.invalidateQueries({
        queryKey: ["/api/starred-hands/pending", { sessionId }],
      });
    } catch {
      // tests podem nao ter queryClient real
    }
  };

  const handleSaveSpotReview = async (patch: {
    conclusion: string;
    type: string;
    spot: string;
    notes?: string;
    sessionTournamentId: string;
  }) => {
    if (!droppedSpot) return;
    try {
      await apiRequest(
        "PATCH",
        `/api/starred-hands/${droppedSpot.id}/review`,
        {
          conclusion: patch.conclusion,
          type: patch.type,
          spot: patch.spot,
          notes: patch.notes,
          sessionTournamentId: patch.sessionTournamentId,
        },
      );
      // Sprint F2 W4: telemetria spot.reviewed apos sucesso PATCH (source cooldown).
      try {
        trackTelemetry("spot.reviewed", {
          spotId: droppedSpot.id,
          sessionTournamentId: patch.sessionTournamentId,
          hasConclusion: !!patch.conclusion?.trim(),
          source: "cooldown",
        });
      } catch {
        // telemetry never throws user-facing
      }
      invalidatePendingSpots();
      setDroppedSpot(null);
    } catch (err: any) {
      toast({ title: "Erro ao salvar revisao", description: err?.message });
    }
  };

  const handleReviewSpotLater = async () => {
    if (!droppedSpot) return;
    try {
      await apiRequest(
        "PATCH",
        `/api/starred-hands/${droppedSpot.id}/review`,
        { reviewLater: true },
      );
      // Sprint F2 W4: telemetria spot.review_later (source cooldown).
      try {
        trackTelemetry("spot.review_later", {
          spotId: droppedSpot.id,
          source: "cooldown",
        });
      } catch {
        // telemetry never throws user-facing
      }
      invalidatePendingSpots();
      setDroppedSpot(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message });
    }
  };

  // Saturacao do torneio alvo (lesson F2 RF-09: limite 3 manuais).
  const dropTargetSaturated = useMemo(() => {
    if (!droppedSpot) return false;
    const manualCount = starredHands.filter(
      (sh) =>
        sh.sessionTournamentId === droppedSpot.sessionTournamentId &&
        sh.type !== "spot_screenshot",
    ).length;
    return manualCount >= MAX_STARS_PER_TOURNAMENT;
  }, [droppedSpot, starredHands]);

  // ---------------------------------------------------------------------------
  // Avancar/voltar entre blocos (mode=full)
  // ---------------------------------------------------------------------------

  const goNextFromHands = () => {
    setHasDraft(true);
    setCurrentBlock("abc");
    // PATCH imediato para garantir que o teste detecta o PATCH na sequencia.
    void flushPatch({ blocksCompleted: ["hands"] });
  };

  const goNextFromAbc = () => {
    setHasDraft(true);
    setCurrentBlock("tilt");
    void flushPatch({
      blocksCompleted: ["hands", "abc"],
      abGameAnswers: abcValue,
    });
  };

  const goNextFromTilt = () => {
    setHasDraft(true);
    setCurrentBlock("sleep");
    void flushPatch({
      blocksCompleted: ["hands", "abc", "tilt"],
      tiltSelfAssessment: tiltValue,
    });
  };

  const goBackFromAbc = () => setCurrentBlock("hands");
  const goBackFromTilt = () => setCurrentBlock("abc");
  const goBackFromSleep = () => setCurrentBlock("tilt");

  const handleAbcChange = (next: AbcJournalValue) => {
    setAbcValue(next);
    setHasDraft(true);
    schedulePatch({ abGameAnswers: next });
  };

  const handleTiltChange = (next: TiltAssessmentValue) => {
    setTiltValue(next);
    setHasDraft(true);
    schedulePatch({ tiltSelfAssessment: next });
  };

  const handleSleepChange = (next: SleepGateValue) => {
    setSleepValue(next);
    setHasDraft(true);
  };

  // Bloco 4 — "Marcar plano fechado"
  // Sprint Cooldown-2 (Reviewer fix CRITICAL #1+#2): persistencia de planClosed
  // ocorre dentro do POST /api/cooldown-logs/:id/finish na conclusao do Bloco 4.
  // Aqui apenas setamos local state — server-side persistence ocorre no finish.
  const handleClosePlan = () => {
    setSleepValue((prev) => ({ ...prev, planClosed: true }));
    setHasDraft(true);
  };

  // Pos-finish: invalida queries + redireciona /grind. Server (POST /finish)
  // ja marca grind_session.status=completed idempotente.
  const afterFinishSuccess = (result: any, completedAt: string) => {
    try {
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/cooldown-logs"] });
    } catch {
      // tests podem nao configurar queryClient
    }
    toast({ title: "Cool-down concluido. Bom descanso." });
    onComplete(result ?? { id: cooldownLogId, completedAt });
    setLocation("/grind");
  };

  // mode=quick — finish curto via PATCH legacy + B2 (M5) status=completed
  // explicito (PATCH endpoint nao executa side-effect de session status).
  // Sprint F vai mover pra Bloco 4 ultimo.
  const handleFinishQuick = async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      const completedAt = new Date().toISOString();
      const result: any = await apiRequest("PATCH", `/api/cooldown-logs/${cooldownLogId}`, {
        blocksCompleted: ["hands", "abc"],
        abGameAnswers: abcValue,
        completedAt,
      });
      // Sprint B2 (M5): marca session=completed via PUT idempotente. Cooldown
      // ja persistiu (PATCH ok). Falha aqui = sessao fica 'active' na lista —
      // toast warning + telemetria pra diagnostico (spec M5 cenario "Falha PUT").
      try {
        await apiRequest("PUT", `/api/grind-sessions/${sessionId}`, {
          status: "completed",
        });
      } catch (sessionErr: any) {
        toast({
          title: "Cool-down concluido",
          description:
            "Cooldown salvo, mas a sessao pode ainda aparecer como ativa. Recarregue a lista.",
        });
        try {
          trackTelemetry("cooldown_finish_session_update_failed", {
            sessionId,
            cooldownLogId,
            errorMessage: sessionErr?.message ?? "unknown",
          });
        } catch {
          // telemetry must never throw user-facing
        }
      }
      afterFinishSuccess(result, completedAt);
    } catch (err: any) {
      toast({ title: "Erro ao concluir cool-down", description: err?.message });
    }
  };

  // mode=full — conclusao final no Bloco 4
  // Sprint Cooldown-2 (Reviewer fix CRITICAL #1+#2): unifica em SINGLE POST.
  // Server calcula nextMorning() (consistente com sleepGateService) e persiste
  // grind_sessions.planClosed dentro da mesma transacao logica.
  const handleFinishFull = async (
    payload: { sleepIntent: boolean; planClosed?: boolean } | null,
  ) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const sleepIntent = payload?.sleepIntent ?? sleepValue.sleepIntent ?? false;
    const planClosed = payload?.planClosed ?? sleepValue.planClosed ?? false;

    try {
      const completedAt = new Date().toISOString();
      const result: any = await apiRequest(
        "POST",
        `/api/cooldown-logs/${cooldownLogId}/finish`,
        {
          sleepIntent,
          planClosed,
          abGameAnswers: abcValue,
          tiltSelfAssessment: tiltValue,
        },
      );
      afterFinishSuccess(result, completedAt);
    } catch (err: any) {
      toast({ title: "Erro ao concluir cool-down", description: err?.message });
    }
  };

  // Sprint B2 (M4): finish a partir do Bloco 3 (tilt) em mode='full'. Server
  // POST /finish marca session=completed idempotente. Sprint F vai mover pra
  // Bloco 4 ultimo.
  const handleFinishFromTilt = async () => {
    await handleFinishFull(null);
  };

  const handleSleepConfirm = (payload: {
    sleepIntent: boolean;
    planClosed?: boolean;
  }) => {
    void handleFinishFull(payload);
  };

  const requestClose = () => {
    if (hasDraft) {
      setShowCloseConfirm(true);
    } else {
      onClose({ isDraft: false });
    }
  };

  // ---------------------------------------------------------------------------
  // Render (modal full-screen)
  // ---------------------------------------------------------------------------

  return (
    <div
      data-testid="cooldown-runner"
      role="dialog"
      aria-label="Cool-down pos-sessao"
      className="cooldown-runner fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6"
    >
      <div className="w-full max-w-3xl rounded-lg border bg-card p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Cool-down</h2>
          <button
            type="button"
            data-testid="cooldown-close"
            aria-label="Fechar cool-down"
            onClick={requestClose}
            className="text-muted-foreground"
          >
            ×
          </button>
        </div>

        {currentBlock === "hands" && (
          <>
            <div className="grid gap-4 md:grid-cols-[1fr_240px]">
              <div>
                <BlockOneStarredHands
                  sessionTournaments={sessionTournaments ?? []}
                  starredHands={starredHands}
                  onAddStar={handleAddStar}
                  onRemoveStar={handleRemoveStar}
                  breathingEnabled={breathingEnabled}
                  onToggleBreathing={() => setBreathingEnabled((v) => !v)}
                  sessionSpots={sessionSpots}
                  onSpotDropped={handleSpotDropped}
                />
              </div>
              <aside className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Prints colados
                </div>
                <SessionSpotsList
                  sessionId={sessionId}
                  spots={sessionSpots}
                  onPreview={() => {
                    /* preview lightbox: reservado para F3 */
                  }}
                  onReviewLater={async (spotId) => {
                    try {
                      await apiRequest(
                        "PATCH",
                        `/api/starred-hands/${spotId}/review`,
                        { reviewLater: true },
                      );
                      invalidatePendingSpots();
                    } catch (err: any) {
                      toast({
                        title: "Erro",
                        description: err?.message ?? "Falha ao marcar revisar depois",
                      });
                    }
                  }}
                />
              </aside>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="cooldown-next"
                onClick={goNextFromHands}
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Avancar
              </button>
            </div>
            {droppedSpot && (
              <SpotReviewCard
                open={true}
                spotId={droppedSpot.id}
                imageUrl={droppedSpot.imageUrl}
                sessionTournamentId={droppedSpot.sessionTournamentId}
                onSave={handleSaveSpotReview}
                onReviewLater={handleReviewSpotLater}
                onClose={() => setDroppedSpot(null)}
                saveDisabled={dropTargetSaturated}
                saveDisabledReason={
                  dropTargetSaturated
                    ? "Maximo 3 maos manuais por torneio"
                    : undefined
                }
              />
            )}
          </>
        )}

        {currentBlock === "abc" && (
          <>
            <BlockTwoABCJournal
              value={abcValue}
              onChange={handleAbcChange}
              onNext={mode === "quick" ? handleFinishQuick : goNextFromAbc}
              onBack={goBackFromAbc}
            />
            {/*
              Em mode='full' fica disponivel um atalho "Concluir Cool-down" que
              finaliza no Sprint 1 sem passar pelos blocos 3/4 (Sprint 1 test
              compat). Sprint 2 tests usam o botao cooldown-next do BlockTwoABCJournal
              para avancar ao Bloco 3.
              Em mode='quick' eh o unico caminho de conclusao.
            */}
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="cooldown-finish"
                onClick={handleFinishQuick}
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Concluir Cool-down
              </button>
            </div>
          </>
        )}

        {mode === "full" && currentBlock === "tilt" && (
          <>
            <BlockThreeTiltReview
              value={tiltValue}
              onChange={handleTiltChange}
              onNext={goNextFromTilt}
              onBack={goBackFromTilt}
            />
            {/* Sprint B2 (M4): botao Concluir disponivel a partir do Bloco 2.
                Sprint F vai mover pra Bloco 4 ultimo. */}
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="cooldown-finish"
                onClick={handleFinishFromTilt}
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Concluir Cool-down
              </button>
            </div>
          </>
        )}

        {mode === "full" && currentBlock === "sleep" && (
          <BlockFourSleepGate
            value={sleepValue}
            onChange={handleSleepChange}
            onConfirm={handleSleepConfirm}
            onClosePlan={handleClosePlan}
            onBack={goBackFromSleep}
          />
        )}

        {showCloseConfirm && (
          <div
            role="alertdialog"
            className="mt-3 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm"
          >
            <div className="font-medium">Cool-down em rascunho. Sair?</div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded border px-2 py-1 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="cooldown-close-confirm"
                onClick={() => {
                  setShowCloseConfirm(false);
                  onClose({ isDraft: true });
                }}
                className="rounded bg-yellow-600 px-2 py-1 text-xs text-white"
              >
                Sair (preserva rascunho)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CoolDownRunner;
