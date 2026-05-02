// =============================================================================
// CoachActionConfirmCard — Sprint Coach-2B / RF-10
//
// Card de confirmation inline no chat. Recebe SSE tool_pending_confirmation,
// renderiza diff visual + botoes Confirmar/Cancelar.
//
// Lessons aplicadas:
//   - #1 (hooks first): early returns DEPOIS de hooks.
//   - #2 (data-testid estavel): coach-action-confirm-<actionId>.
//   - #11 (default minimo): cursor-pointer SO nos botoes.
//   - #12 (estado persistente): useQuery enabled=false + setQueryData.
// =============================================================================

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface DiffPreview {
  added?: Record<string, unknown>;
  removed?: Record<string, unknown>;
  changed?: Record<string, { from: unknown; to: unknown }>;
}

export interface CoachActionConfirmCardProps {
  actionId: string;
  toolName: string;
  input: Record<string, unknown>;
  diffPreview: DiffPreview;
  undoWindowMs?: number;
}

const TOOL_LABELS: Record<string, string> = {
  record_wallet_transaction: "Registrar transacao na wallet",
  start_grind_session: "Iniciar sessao de grind",
  log_session_completed: "Marcar sessao como completed",
  register_tournament_in_grade: "Adicionar torneio ao grade",
  log_leak_focus: "Registrar foco de leak",
  log_study_session: "Registrar sessao de estudo",
};

function friendlyTitle(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

export function CoachActionConfirmCard({
  actionId,
  toolName,
  input,
  diffPreview,
  undoWindowMs: _undoWindowMs,
}: CoachActionConfirmCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<"pending" | "confirming" | "completed" | "error">(
    "pending",
  );
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/coach/actions/${actionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setStatus("completed");
      queryClient.setQueryData(["coach-action", actionId], data);
    },
    onError: (err: any) => {
      setStatus("error");
      setErrorMsg(err?.message ?? "Erro ao confirmar");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/coach/actions/${actionId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const handleConfirm = React.useCallback(() => {
    setStatus("confirming");
    confirmMutation.mutate();
  }, [confirmMutation]);

  const handleCancel = React.useCallback(() => {
    cancelMutation.mutate();
  }, [cancelMutation]);

  const changedEntries = Object.entries(diffPreview?.changed ?? {});

  return (
    <div
      data-testid={`coach-action-confirm-${actionId}`}
      className="border-l-4 border-amber-500 bg-amber-50 p-3 rounded-md my-2"
    >
      <div className="font-semibold text-sm mb-2">{friendlyTitle(toolName)}</div>

      {changedEntries.length > 0 && (
        <table className="text-xs w-full mb-2">
          <thead>
            <tr>
              <th className="text-left">Campo</th>
              <th className="text-left">Antes</th>
              <th className="text-left">Apos</th>
            </tr>
          </thead>
          <tbody>
            {changedEntries.map(([key, { from, to }]) => (
              <tr key={key}>
                <td>{key}</td>
                <td className="bg-red-50">{String(from)}</td>
                <td className="bg-green-50">{String(to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details className="text-xs my-1">
        <summary>Parametros</summary>
        <pre>{JSON.stringify(input, null, 2)}</pre>
      </details>

      {status === "error" && errorMsg && (
        <div className="text-xs text-red-700 my-1">{errorMsg}</div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          data-testid={`coach-action-confirm-button-${actionId}`}
          onClick={handleConfirm}
          disabled={status === "confirming" || status === "completed"}
          className="cursor-pointer bg-amber-600 text-white px-3 py-1 rounded text-sm"
        >
          {status === "confirming" ? "Confirmando..." : "Confirmar"}
        </button>
        <button
          type="button"
          data-testid={`coach-action-cancel-button-${actionId}`}
          onClick={handleCancel}
          disabled={status === "confirming" || status === "completed"}
          className="cursor-pointer border px-3 py-1 rounded text-sm"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default CoachActionConfirmCard;
