// =============================================================================
// useCoachFeedback — Sprint Coach-1 Frontend UX / RF-03
// Hook para enviar/remover feedback (thumbs up/down) em mensagens do assistant.
// POST/DELETE /api/coach/messages/:id/feedback
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-03)
//
// HIGH-2 fix: estado de feedback e mantido no queryClient cache (em vez de
// useState local) — re-mounts do componente recuperam o estado persistido.
// Optimistic update via onMutate/onError/onSettled.
// =============================================================================

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export type FeedbackRating = 'up' | 'down';

export interface UseCoachFeedbackResult {
  feedback: FeedbackRating | null;
  isPending: boolean;
  sendFeedback: (rating: FeedbackRating, comment?: string) => Promise<void>;
  removeFeedback: () => Promise<void>;
}

function feedbackQueryKey(messageId: string) {
  return ['coach-feedback', messageId] as const;
}

export function useCoachFeedback(messageId: string): UseCoachFeedbackResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Cache do estado de feedback no queryClient. Re-mounts recuperam o valor
  // anterior (em vez de resetar para null como acontecia com useState).
  const { data: feedback = null } = useQuery<FeedbackRating | null>({
    queryKey: feedbackQueryKey(messageId),
    queryFn: () => null,
    initialData: null,
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: false, // queryFn nao roda — usamos apenas como cache via setQueryData
  });

  const sendMutation = useMutation({
    mutationFn: async ({
      rating,
      comment,
    }: {
      rating: FeedbackRating;
      comment?: string;
    }) => {
      return apiRequest('POST', `/api/coach/messages/${messageId}/feedback`, {
        rating,
        ...(comment ? { comment } : {}),
      });
    },
    onMutate: async ({ rating }) => {
      await queryClient.cancelQueries({ queryKey: feedbackQueryKey(messageId) });
      const previousValue =
        queryClient.getQueryData<FeedbackRating | null>(feedbackQueryKey(messageId)) ?? null;
      // Optimistic: atualiza imediatamente
      queryClient.setQueryData<FeedbackRating | null>(feedbackQueryKey(messageId), rating);
      return { previousValue };
    },
    onError: (err: any, _vars, context) => {
      // Rollback
      if (context) {
        queryClient.setQueryData<FeedbackRating | null>(
          feedbackQueryKey(messageId),
          context.previousValue,
        );
      }
      const status = err?.response?.status;
      if (status === 409) {
        toast({
          title: 'Feedback ja existe',
          description: 'Remova o feedback atual primeiro.',
          variant: 'destructive' as any,
        });
      } else {
        toast({
          title: 'Erro ao registrar feedback',
          description: err?.message || 'Tente novamente.',
          variant: 'destructive' as any,
        });
      }
    },
    onSettled: () => {
      // Invalida cache do feedback do servidor (se existir endpoint GET)
      queryClient.invalidateQueries({
        queryKey: [`/api/coach/messages/${messageId}/feedback`],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/coach/messages/${messageId}/feedback`);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: feedbackQueryKey(messageId) });
      const previousValue =
        queryClient.getQueryData<FeedbackRating | null>(feedbackQueryKey(messageId)) ?? null;
      queryClient.setQueryData<FeedbackRating | null>(feedbackQueryKey(messageId), null);
      return { previousValue };
    },
    onError: (err: any, _vars, context) => {
      if (context) {
        queryClient.setQueryData<FeedbackRating | null>(
          feedbackQueryKey(messageId),
          context.previousValue,
        );
      }
      toast({
        title: 'Erro ao remover feedback',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive' as any,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/coach/messages/${messageId}/feedback`],
      });
    },
  });

  const sendFeedback = useCallback(
    async (rating: FeedbackRating, comment?: string) => {
      try {
        await sendMutation.mutateAsync({ rating, comment });
      } catch {
        // Rollback ja foi feito em onError
      }
    },
    [sendMutation],
  );

  const removeFeedback = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync();
    } catch {
      // Rollback ja foi feito em onError
    }
  }, [deleteMutation]);

  return {
    feedback,
    isPending: sendMutation.isPending || deleteMutation.isPending,
    sendFeedback,
    removeFeedback,
  };
}
