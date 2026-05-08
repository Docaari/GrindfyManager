/**
 * useReentryQueue — Sprint Spot-Anki-Reentry-3 / RF-3.
 *
 * Hook TanStack Query que carrega a fila de reentry (cards pendentes hoje) +
 * expoe mutations grade/skip. Apos sucesso de mutation, invalida queue + stats.
 *
 * GET  /api/reentry/queue         -> { items, pendingTotal, pendingTodayCap, nextScheduledAt }
 * POST /api/reentry/:cardId/grade -> avanca SRS state (+ optional nextCard)
 * POST /api/reentry/:cardId/skip  -> reagenda card para amanha
 *
 * Lessons:
 *   #13 apiRequest retorna JSON parseado direto
 *   #29 sub-tree com useQuery; consumers podem ErrorBoundary local
 */

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface ReentryQueueItem {
  card: {
    id: string;
    spotId: string;
    intervalDays: string;
    easeFactor: string;
    reviewCount: number;
    correctCount: number;
    nextReviewAt: string | Date;
    [k: string]: any;
  };
  spot: {
    id: string;
    insight: string | null;
    tags: string[] | null;
    decisionCorrect: boolean | null;
    confidenceLevel: number | null;
    imageUrl: string | null;
    [k: string]: any;
  };
}

export interface ReentryQueueResponse {
  items: ReentryQueueItem[];
  pendingTotal: number;
  pendingTodayCap: number;
  nextScheduledAt: string | Date | null;
}

export type Grade = "again" | "hard" | "good" | "easy";

export interface GradeMutationVars {
  cardId: string;
  grade: Grade;
}

export interface SkipMutationVars {
  cardId: string;
}

export const REENTRY_QUEUE_KEY = ["/api/reentry/queue"];
export const REENTRY_STATS_KEY = ["/api/reentry/stats"];

export function useReentryQueue() {
  const query = useQuery<ReentryQueueResponse>({
    queryKey: REENTRY_QUEUE_KEY,
    queryFn: async () => await apiRequest("GET", "/api/reentry/queue"),
    retry: false,
    staleTime: 30 * 1000,
  });

  const invalidate = React.useCallback(() => {
    try {
      queryClient.invalidateQueries({ queryKey: REENTRY_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: REENTRY_STATS_KEY });
    } catch {
      // Defensive — TanStack pode estar instrumentado em testes
    }
  }, []);

  const gradeMutation = useMutation({
    mutationFn: async ({ cardId, grade }: GradeMutationVars) =>
      await apiRequest("POST", `/api/reentry/${cardId}/grade`, { grade }),
    onSuccess: invalidate,
  });

  const skipMutation = useMutation({
    mutationFn: async ({ cardId }: SkipMutationVars) =>
      await apiRequest("POST", `/api/reentry/${cardId}/skip`),
    onSuccess: invalidate,
  });

  return {
    queue: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    gradeMutation,
    skipMutation,
  };
}

export default useReentryQueue;
