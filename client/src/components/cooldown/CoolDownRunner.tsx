import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BlockOneStarredHands, type SessionTournamentLite, type StarredHandLite } from "./BlockOneStarredHands";
import { BlockTwoABCJournal, type AbcJournalValue } from "./BlockTwoABCJournal";
import type { StarredHandType, StarredHandSpot } from "../../../../shared/schema";

// =============================================================================
// CoolDownRunner — Sprint Cooldown-1 (MVP)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02, RF-05)
// Sequence: Docs/architecture/flows/grind/sequence-cooldown-flow.mermaid
//
// Modal full-screen orquestrador. Bloco 1 (hands) -> Bloco 2 (ABC).
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

type BlockKey = "hands" | "abc";

const DEBOUNCE_MS = 1000;

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

  const schedulePatch = (patch: Record<string, any>) => {
    if (!cooldownLogId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await apiRequest("PATCH", `/api/cooldown-logs/${cooldownLogId}`, patch);
      } catch (err: any) {
        // Falha em autosave nao bloqueia UX (RF-04 disponibilidade)
        console.error("CoolDownRunner autosave failed:", err);
      }
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

  const handleNextFromBlockOne = () => {
    setHasDraft(true);
    setCurrentBlock("abc");
    schedulePatch({ blocksCompleted: ["hands"] });
  };

  const handleBackToBlockOne = () => {
    setCurrentBlock("hands");
  };

  const handleAbcChange = (next: AbcJournalValue) => {
    setAbcValue(next);
    setHasDraft(true);
    schedulePatch({ abGameAnswers: next });
  };

  const handleFinish = async () => {
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

  const requestClose = () => {
    if (hasDraft) {
      setShowCloseConfirm(true);
    } else {
      onClose({ isDraft: false });
    }
  };

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
                onClick={handleNextFromBlockOne}
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
              onNext={handleFinish}
              onBack={handleBackToBlockOne}
            />
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="cooldown-finish"
                onClick={handleFinish}
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Concluir Cool-down
              </button>
            </div>
          </>
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
