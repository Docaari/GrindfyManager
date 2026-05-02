// =============================================================================
// CoachActionUndoBadge — Sprint Coach-2B / RF-10
//
// Timer regressivo 5min apos confirm. Botao Desfazer dentro da janela.
//
// Lessons aplicadas:
//   - #1 (hooks first), #2 (data-testid), #11 (default minimo: cursor-pointer
//     so no botao), #12 (estado persistente: useQuery enabled=false).
// =============================================================================

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CoachActionUndoBadgeProps {
  actionId: string;
  undoExpiresAt: string; // ISO
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CoachActionUndoBadge({
  actionId,
  undoExpiresAt,
}: CoachActionUndoBadgeProps): JSX.Element {
  const queryClient = useQueryClient();
  // Lesson #12: estado persistente via useQuery cache (sobrevive re-mount).
  useQuery({
    queryKey: ["coach-action", actionId],
    queryFn: async () => null,
    enabled: false,
    staleTime: Infinity,
  });

  const expiresAtMs = React.useMemo(
    () => new Date(undoExpiresAt).getTime(),
    [undoExpiresAt],
  );
  const [now, setNow] = React.useState(() => Date.now());
  const [undone, setUndone] = React.useState(false);

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const undoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/coach/actions/${actionId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: (data) => {
      setUndone(true);
      queryClient.setQueryData(["coach-action", actionId], data);
    },
  });

  const remaining = expiresAtMs - now;
  const expired = remaining <= 0;

  const handleUndo = React.useCallback(() => {
    if (!expired && !undone) undoMutation.mutate();
  }, [expired, undone, undoMutation]);

  let label = "";
  let buttonLabel = "Desfazer";
  if (undone) {
    label = "Desfeito";
  } else if (expired) {
    buttonLabel = "Janela expirada";
    label = "Janela expirada";
  } else {
    label = `Confirmado. Desfazer em ${formatRemaining(remaining)}`;
  }

  return (
    <div
      data-testid={`coach-action-undo-${actionId}`}
      className={
        "border-l-4 p-2 rounded-md my-2 text-sm " +
        (undone
          ? "border-gray-400 bg-gray-50 text-gray-600"
          : "border-green-500 bg-green-50")
      }
    >
      <span className="cursor-help">{label}</span>
      <button
        type="button"
        data-testid={`coach-action-undo-button-${actionId}`}
        onClick={handleUndo}
        disabled={expired || undone}
        className="ml-3 cursor-pointer underline text-xs"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export default CoachActionUndoBadge;
