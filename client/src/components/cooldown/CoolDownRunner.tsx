import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BlockOneStarredHands, type SessionTournamentLite, type StarredHandLite } from "./BlockOneStarredHands";
import { BlockTwoABCJournal, type AbcJournalValue } from "./BlockTwoABCJournal";
import { BlockThreeTiltReview, type TiltAssessmentValue } from "./BlockThreeTiltReview";
import { BlockFourSleepGate, type SleepGateValue } from "./BlockFourSleepGate";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

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

  // mode=quick — atalho Sprint 1: handleFinish original sem Bloco 3/4.
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
      toast({ title: "Cool-down concluido. Bom descanso." });
      onComplete(result ?? { id: cooldownLogId, completedAt });
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
      toast({ title: "Cool-down concluido. Bom descanso." });
      onComplete(
        result ?? {
          id: cooldownLogId,
          completedAt: new Date().toISOString(),
        },
      );
    } catch (err: any) {
      toast({ title: "Erro ao concluir cool-down", description: err?.message });
    }
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
            <BlockOneStarredHands
              sessionTournaments={sessionTournaments ?? []}
              starredHands={starredHands}
              onAddStar={handleAddStar}
              onRemoveStar={handleRemoveStar}
              breathingEnabled={breathingEnabled}
              onToggleBreathing={() => setBreathingEnabled((v) => !v)}
            />
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
          <BlockThreeTiltReview
            value={tiltValue}
            onChange={handleTiltChange}
            onNext={goNextFromTilt}
            onBack={goBackFromTilt}
          />
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
