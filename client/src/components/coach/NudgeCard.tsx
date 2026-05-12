// =============================================================================
// NudgeCard — Sprint AI-1B / RF-08.3 (ADR-157)
//
// Card de um nudge in-app na timeline do hub /coach-ai. Recebe o nudge por prop
// (nao usa useQuery — entao nao precisa de QueryClientProvider). Quando o status
// eh acionavel (sent / engaged), mostra 4 botoes: snooze short / snooze long /
// engage (-> /coach-ai?tab=chat) / dismiss — chamando os endpoints do AI-1A
// (POST /api/coach/nudges/:id/{snooze,engage,dismiss}). Quando
// triggeredByEvent === 'auto_freeze_notice' -> aviso de categoria pausada SEM
// botoes de snooze. Status dismissed/expired -> so o card + status.
//
// Lessons: #1 (hooks primeiro), #2 (data-testid estaveis), #13 (apiRequest JSON).
// =============================================================================

import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface NudgeCardNudge {
  id: string;
  category: string;
  status: string;
  title?: string | null;
  titleI18n?: string | null;
  bodyPreview?: string | null;
  sentAt?: string | null;
  engagedAt?: string | null;
  dismissedAt?: string | null;
  snoozeUntil?: string | null;
  chatSessionId?: string | null;
  triggeredByEvent?: string | null;
}

const SNOOZE_SHORT_HOURS = 4;
const SNOOZE_LONG_HOURS = 24 * 7;

function isActionable(nudge: NudgeCardNudge): boolean {
  const s = String(nudge.status ?? "");
  return s === "sent" || s === "engaged" || s === "snoozed";
}

export default function NudgeCard({ nudge }: { nudge: NudgeCardNudge }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);

  const title = nudge.title ?? nudge.titleI18n ?? "Aviso do Grindfy AI";
  const isFreezeNotice = nudge.triggeredByEvent === "auto_freeze_notice";
  const actionable = !dismissed && isActionable(nudge);

  const post = useCallback(
    async (path: string, body?: any) => {
      try {
        await apiRequest("POST", `/api/coach/nudges/${nudge.id}/${path}`, body ?? {});
      } catch (err) {
        toast?.({ title: "Não foi possível concluir a ação.", variant: "destructive" } as any);
      }
    },
    [nudge.id, toast],
  );

  const onDismiss = useCallback(async () => {
    setDismissed(true);
    await post("dismiss", {});
  }, [post]);

  const onSnoozeShort = useCallback(async () => {
    setDismissed(true);
    await post("snooze", { durationHours: SNOOZE_SHORT_HOURS });
  }, [post]);

  const onSnoozeLong = useCallback(async () => {
    setDismissed(true);
    await post("snooze", { durationHours: SNOOZE_LONG_HOURS });
  }, [post]);

  const onEngage = useCallback(async () => {
    await post("engage", { chatSessionId: nudge.chatSessionId ?? null });
    const target = nudge.chatSessionId
      ? `/coach-ai?tab=chat&session=${encodeURIComponent(nudge.chatSessionId)}`
      : `/coach-ai?tab=chat`;
    setLocation(target);
  }, [post, nudge.chatSessionId, setLocation]);

  return (
    <div
      data-testid="coach-nudge-card"
      data-category={nudge.category}
      className="rounded-lg border border-gray-700 bg-gray-800/50 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 data-testid="coach-nudge-card-title" className="text-sm font-medium text-gray-200">
          {title}
        </h4>
        <span
          data-testid="coach-nudge-card-status"
          className="shrink-0 rounded-full bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300"
        >
          {dismissed ? "dismissed" : nudge.status}
        </span>
      </div>
      {nudge.bodyPreview ? (
        <p data-testid="coach-nudge-card-body" className="mt-2 text-xs text-gray-400 whitespace-pre-wrap">
          {nudge.bodyPreview}
        </p>
      ) : null}

      {isFreezeNotice ? (
        <div data-testid="coach-nudge-card-freeze-notice" className="mt-3 rounded-md bg-amber-900/20 border border-amber-800/30 p-2 text-xs text-amber-300">
          Pausei esses lembretes — reative em Preferências.
          {!dismissed ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="coach-nudge-card-dismiss"
                onClick={onDismiss}
                className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
              >
                Ok
              </button>
            </div>
          ) : null}
        </div>
      ) : actionable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="coach-nudge-card-engage"
            onClick={onEngage}
            className="rounded-md bg-green-600/20 px-2 py-1 text-[11px] text-green-400 hover:bg-green-600/30"
          >
            Ver no chat
          </button>
          <button
            type="button"
            data-testid="coach-nudge-card-snooze-short"
            onClick={onSnoozeShort}
            className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
          >
            Não agora
          </button>
          <button
            type="button"
            data-testid="coach-nudge-card-snooze-long"
            onClick={onSnoozeLong}
            className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
          >
            Não por enquanto
          </button>
          <button
            type="button"
            data-testid="coach-nudge-card-dismiss"
            onClick={onDismiss}
            className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
          >
            Dispensar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { NudgeCard };
