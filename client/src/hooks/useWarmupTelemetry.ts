/**
 * useWarmupTelemetry — Sprint W-1 (RF-19, ADR-030)
 *
 * Telemetria client-only nesta sprint: console.log estruturado.
 * Eventos: warmup_started, block_completed, emotional_check_submitted,
 * gate_triggered, override_used, warmup_completed, warmup_aborted,
 * weekly_heuristics_saved, grind_blocked_by_gate.
 */

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type WarmupEventName =
  | "warmup_started"
  | "warmup_resumed"
  | "block_completed"
  | "emotional_check_submitted"
  | "gate_triggered"
  | "override_used"
  | "warmup_completed"
  | "warmup_aborted"
  | "weekly_heuristics_saved"
  | "grind_blocked_by_gate";

export interface WarmupTelemetryPayload {
  userId?: string | null;
  ts: string;
  viewport: "mobile" | "desktop";
  [key: string]: any;
}

function detectViewport(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth ?? 1024;
  return w <= 768 ? "mobile" : "desktop";
}

export function useWarmupTelemetry() {
  const auth = useAuth() as any;
  const userId = auth?.user?.userPlatformId ?? null;

  const track = useCallback(
    (eventName: WarmupEventName | string, props: Record<string, any> = {}) => {
      const payload: WarmupTelemetryPayload = {
        userId,
        ts: new Date().toISOString(),
        viewport: detectViewport(),
        ...props,
      };
      // eslint-disable-next-line no-console
      console.log("[telemetry][warmup]", eventName, payload);
    },
    [userId],
  );

  return { track };
}
