import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SessionTournamentLite } from "./BlockOneStarredHands";

// =============================================================================
// QuickCoolDownDialog — Sprint Cooldown-1 (MVP)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Quick + US-04)
//
// 5 campos: 3 textareas curtas (hands, opcionais) + 2 perguntas (q1, q2).
// Submit persiste com mode='quick' + blocksCompleted=['quick'].
// =============================================================================

export interface QuickCoolDownDialogProps {
  cooldownLogId: string;
  sessionId: string;
  sessionTournaments?: SessionTournamentLite[];
  onSave: (payload: { hands: string[]; q1: string; q2: string }) => void;
  onClose: () => void;
}

export function QuickCoolDownDialog({
  cooldownLogId,
  sessionId,
  sessionTournaments,
  onSave,
  onClose,
}: QuickCoolDownDialogProps) {
  const [hands, setHands] = useState<string[]>(["", "", ""]);
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [showWarning, setShowWarning] = useState(false);
  const { toast } = useToast();

  const updateHand = (idx: number, value: string) => {
    setHands((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const handleSubmit = async () => {
    // Validacao soft — q1/q2 vazios mostram warning, mas permitem avanco.
    if (!q1.trim() && !q2.trim()) {
      setShowWarning(true);
      return;
    }

    try {
      // Persiste cool-down com mode=quick
      await apiRequest("PATCH", `/api/cooldown-logs/${cooldownLogId}`, {
        blocksCompleted: ["quick"],
        abGameAnswers: {
          aGame: q1 ? [q1] : [],
          bGame: [],
          cGame: "",
          lesson: q2,
        },
        completedAt: new Date().toISOString(),
      });
      toast({ title: "Cool-down rapido salvo" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar cool-down", description: err?.message });
    }

    onSave({ hands, q1, q2 });
  };

  return (
    <div
      data-testid="cooldown-quick-dialog"
      role="dialog"
      aria-label="Cool-down Rapido"
      className="cooldown-quick-dialog space-y-3 rounded border p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Cool-down Rapido (~3min)</h3>
        <button
          type="button"
          data-testid="cooldown-quick-close"
          aria-label="Fechar dialog"
          onClick={onClose}
          className="text-sm text-muted-foreground"
        >
          ×
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">3 maos criticas (opcional)</div>
        {[0, 1, 2].map((idx) => (
          <textarea
            key={idx}
            data-testid={`cooldown-quick-hand-${idx}`}
            value={hands[idx] ?? ""}
            onChange={(e) => updateHand(idx, e.target.value.slice(0, 500))}
            maxLength={500}
            placeholder={`Mao ${idx + 1} (anotacao curta)`}
            className="w-full rounded border p-2 text-sm"
            rows={2}
          />
        ))}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">O que voce fez bem?</label>
        <textarea
          data-testid="cooldown-quick-q1"
          value={q1}
          onChange={(e) => setQ1(e.target.value)}
          className="w-full rounded border p-2 text-sm"
          rows={2}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">O que faria diferente?</label>
        <textarea
          data-testid="cooldown-quick-q2"
          value={q2}
          onChange={(e) => setQ2(e.target.value)}
          className="w-full rounded border p-2 text-sm"
          rows={2}
        />
      </div>

      {showWarning && (
        <div className="text-xs text-yellow-600" role="status">
          warning: recomendado preencher pelo menos uma pergunta. Submit novamente para confirmar.
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border px-3 py-1 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="cooldown-quick-submit"
          onClick={handleSubmit}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

export default QuickCoolDownDialog;
