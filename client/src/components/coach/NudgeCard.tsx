// =============================================================================
// NudgeCard — Sprint AI-1B / RF-08.3 (ADR-157) + MP-VALIDATION RF-01.
//
// Card de um nudge in-app na timeline do hub /coach-ai. Recebe o nudge por prop
// (nao usa useQuery — entao nao precisa de QueryClientProvider). Quando o status
// eh acionavel (sent / engaged), mostra 4 botoes: snooze short / snooze long /
// engage (-> /coach-ai?tab=chat) / dismiss — chamando os endpoints do AI-1A
// (POST /api/coach/nudges/:id/{snooze,engage,dismiss}). Quando
// triggeredByEvent === 'auto_freeze_notice' -> aviso de categoria pausada SEM
// botoes de snooze. Status dismissed/expired -> so o card + status.
//
// Sprint MP-VALIDATION RF-01: emite coach.nudge_received (mount),
// coach.nudge_dismissed (X), coach.nudge_cta_clicked (CTA). Suporta tambem o
// shape simplificado { id, category, title, body, ctaLabel, targetUrl,
// onDismiss } (usado em smoke / tests).
//
// Lessons: #1 (hooks primeiro), #2 (data-testid estaveis), #13 (apiRequest JSON).
// =============================================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { emitCoachEvent } from "@/lib/activity-telemetry";

// Best-effort telemetria — NUNCA throws (lesson #9 swallow ok aqui pois ja
// loga em activity-telemetry).
function safeEmit(action: string, payload: Record<string, unknown>): void {
  try {
    void emitCoachEvent(action, payload);
  } catch {
    // never throw
  }
}

export interface NudgeCardNudge {
  id: string;
  category: string;
  status?: string;
  title?: string | null;
  titleI18n?: string | null;
  body?: string | null;
  bodyPreview?: string | null;
  sentAt?: string | null;
  engagedAt?: string | null;
  dismissedAt?: string | null;
  snoozeUntil?: string | null;
  chatSessionId?: string | null;
  triggeredByEvent?: string | null;
  // MP-VALIDATION RF-01 simplified shape.
  ctaLabel?: string | null;
  targetUrl?: string | null;
}

const SNOOZE_SHORT_HOURS = 4;
const SNOOZE_LONG_HOURS = 24 * 7;

function isActionable(nudge: NudgeCardNudge): boolean {
  const s = String(nudge.status ?? "");
  return s === "sent" || s === "engaged" || s === "snoozed";
}

export interface NudgeCardProps {
  nudge: NudgeCardNudge;
  onDismiss?: () => void;
}

export default function NudgeCard({ nudge, onDismiss: onDismissProp }: NudgeCardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  // Sprint MP-VALIDATION RF-01: nudge.received emit 1x ao montar.
  const receivedEmittedRef = useRef(false);
  useEffect(() => {
    if (receivedEmittedRef.current) return;
    receivedEmittedRef.current = true;
    safeEmit("coach.nudge_received", {
      nudge_id: nudge.id,
      category: nudge.category,
    });
  }, [nudge.id, nudge.category]);

  const title = nudge.title ?? nudge.titleI18n ?? "Aviso do Grindfy AI";
  const body = nudge.body ?? nudge.bodyPreview ?? null;
  const isFreezeNotice = nudge.triggeredByEvent === "auto_freeze_notice";
  const actionable = !dismissed && (isActionable(nudge) || !!nudge.ctaLabel);
  // MP-VALIDATION: shape simplificado quando ctaLabel+targetUrl presentes
  // (smoke / tests). Caso contrario, fallback ao fluxo legacy AI-1B (engage).
  const usesSimpleShape = !!nudge.ctaLabel || !!nudge.targetUrl;

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

  const emitDismissTelemetry = useCallback(
    (reason: string) => {
      safeEmit("coach.nudge_dismissed", {
        nudge_id: nudge.id,
        category: nudge.category,
        reason,
      });
    },
    [nudge.id, nudge.category],
  );

  const onDismiss = useCallback(async () => {
    setDismissed(true);
    emitDismissTelemetry("user_click_x");
    if (usesSimpleShape) {
      try { onDismissProp?.(); } catch { /* swallow */ }
      return;
    }
    await post("dismiss", {});
    try { onDismissProp?.(); } catch { /* swallow */ }
  }, [post, emitDismissTelemetry, usesSimpleShape, onDismissProp]);

  const onSnoozeShort = useCallback(async () => {
    setDismissed(true);
    emitDismissTelemetry("snooze_short");
    await post("snooze", { durationHours: SNOOZE_SHORT_HOURS });
  }, [post, emitDismissTelemetry]);

  const onSnoozeLong = useCallback(async () => {
    setDismissed(true);
    emitDismissTelemetry("snooze_long");
    await post("snooze", { durationHours: SNOOZE_LONG_HOURS });
  }, [post, emitDismissTelemetry]);

  const onCta = useCallback(async () => {
    safeEmit("coach.nudge_cta_clicked", {
      nudge_id: nudge.id,
      category: nudge.category,
      cta_label: nudge.ctaLabel ?? "Ver no chat",
      target_url: nudge.targetUrl ?? `/coach-ai?tab=chat`,
    });
    if (usesSimpleShape && nudge.targetUrl) {
      setLocation(nudge.targetUrl);
      return;
    }
    await post("engage", { chatSessionId: nudge.chatSessionId ?? null });
    const target = nudge.chatSessionId
      ? `/coach-ai?tab=chat&session=${encodeURIComponent(nudge.chatSessionId)}`
      : `/coach-ai?tab=chat`;
    setLocation(target);
  }, [post, nudge.chatSessionId, nudge.id, nudge.category, nudge.ctaLabel, nudge.targetUrl, setLocation, usesSimpleShape]);

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
          {dismissed ? "dismissed" : nudge.status ?? "sent"}
        </span>
      </div>
      {body ? (
        <p data-testid="coach-nudge-card-body" className="mt-2 text-xs text-gray-400 whitespace-pre-wrap">
          {body}
        </p>
      ) : null}

      {isFreezeNotice ? (
        <div data-testid="coach-nudge-card-freeze-notice" className="mt-3 rounded-md bg-amber-900/20 border border-amber-800/30 p-2 text-xs text-amber-300">
          Pausei esses lembretes — reative em Preferências.
          {!dismissed ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="nudge-dismiss"
                data-legacy-testid="coach-nudge-card-dismiss"
                onClick={onDismiss}
                className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
              >
                Ok
              </button>
            </div>
          ) : null}
        </div>
      ) : actionable ? (
        usesSimpleShape ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="nudge-cta"
              onClick={onCta}
              className="rounded-md bg-green-600/20 px-2 py-1 text-[11px] text-green-400 hover:bg-green-600/30"
            >
              {nudge.ctaLabel ?? "Ver no chat"}
            </button>
            <button
              type="button"
              data-testid="nudge-dismiss"
              onClick={onDismiss}
              className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
            >
              Dispensar
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="coach-nudge-card-engage"
              onClick={onCta}
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
        )
      ) : null}
    </div>
  );
}

export { NudgeCard };
