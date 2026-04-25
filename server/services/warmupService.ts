/**
 * Warmup Service — Sprint W-1 (RF-15 a RF-22)
 *
 * Fonte: Docs/specs/warm-up-sprint-w1-spec.md (Secao 7)
 *        ADR-027 (soft gate), ADR-028 (warmup_rituals), ADR-029 (no dual-write)
 *
 * API:
 *   createRitual(userId, payload)            -> RF-15 (POST /api/warmup-rituals)
 *   getLatestRitual(userId)                  -> RF-16 (GET /api/warmup-rituals/latest)
 *   listRituals(filters)                     -> RF-17 (GET /api/warmup-rituals)
 *   updateWeeklyHeuristics(userId, tuple)    -> RF-22 (PUT /api/user-settings/weekly-heuristics)
 *
 * Encapsula chamadas ao storage. Nao escreve em preparation_logs (ADR-029).
 */

import {
  createWarmupRitual,
  getLatestWarmupRitual,
  listWarmupRituals,
  updateUserSettingsWeeklyHeuristics,
  type CreateWarmupRitualInput,
  type ListWarmupRitualsParams,
} from "../storage";

export interface CreateRitualPayload {
  startedAt: Date | string;
  completedAt?: Date | string | null;
  durationMinutes: number;
  version: "full" | "aborted";
  emotionalCheckScore?: number | null;
  decisionToPlay?: boolean | null;
  overrideUsed?: boolean;
  blocksCompleted?: any[];
  sessionIntention?: any | null;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  return new Date(v);
}

export const warmupService = {
  async createRitual(userId: string, payload: CreateRitualPayload): Promise<any> {
    const startedAt = toDate(payload.startedAt) ?? new Date();
    const completedAt = toDate(payload.completedAt ?? null);
    const input: CreateWarmupRitualInput = {
      userId,
      startedAt,
      completedAt,
      durationMinutes: payload.durationMinutes ?? 0,
      version: payload.version,
      emotionalCheckScore: payload.emotionalCheckScore ?? null,
      decisionToPlay: payload.decisionToPlay ?? null,
      overrideUsed: payload.overrideUsed ?? false,
      blocksCompleted: payload.blocksCompleted ?? [],
      sessionIntention: payload.sessionIntention ?? null,
    };
    return createWarmupRitual(input);
  },

  async getLatestRitual(userId: string): Promise<any | null> {
    return getLatestWarmupRitual(userId);
  },

  async listRituals(
    params: ListWarmupRitualsParams,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    return listWarmupRituals(params);
  },

  async updateWeeklyHeuristics(
    userId: string,
    heuristics: [string, string, string],
  ): Promise<{ heuristics: [string, string, string] }> {
    return updateUserSettingsWeeklyHeuristics(userId, heuristics);
  },
};
