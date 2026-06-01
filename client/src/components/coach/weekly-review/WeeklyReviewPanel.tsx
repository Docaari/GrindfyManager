// =============================================================================
// WeeklyReviewPanel — EST-5 (ADR-226 / RF-08)
//
// UI da maquina de estados do ritual de segunda. No mount chama
// POST /api/coach/weekly-review/start (idempotente — DEC-3: a chave de semana
// vem do SERVER, nunca recalculada divergente no client) para obter a review
// corrente. Renderiza por estado:
//   - sem review (null/404)              -> empty state.
//   - recap_sent / awaiting_upload       -> recap + CTA "confirmar upload".
//   - upload_confirmed / deep_analysis_done -> analise + CTA "montar plano".
//   - planning                           -> <PlanningWizard weekStartDate>.
//
// Encapsulado em ErrorBoundary local (lesson #29) — se renderizar sem
// QueryClientProvider (teste standalone), vira fallback silencioso sem derrubar
// a arvore.
//
// Lessons: #1 (hooks primeiro), #2 (data-testid estavel),
//   #13 (apiRequest retorna JSON parseado direto), #19 (CTA -> superficie real,
//   sem rota orfa), #29 (useQuery/useMutation isolados por ErrorBoundary).
// =============================================================================

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { PlanningWizard } from '@/components/coach/planning/PlanningWizard';

class WeeklyReviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // swallow — o painel secundario nao deve crashar a arvore do hub.
  }
  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="weekly-review-panel" className="p-4 text-gray-400">
          <div data-testid="weekly-review-empty">
            Sua revisao de segunda aparece aqui.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface WeeklyReviewData {
  id: string;
  userId: string;
  weekStartDate: string;
  status:
    | 'recap_sent'
    | 'awaiting_upload'
    | 'upload_confirmed'
    | 'deep_analysis_done'
    | 'planning';
  recapContent?: { markdown?: string } | null;
  analysisContent?: { markdown?: string } | null;
}

function WeeklyReviewPanelInner(): JSX.Element {
  const queryClient = useQueryClient();

  // DEC-3: mount chama POST /start (idempotente) para obter a review corrente.
  const { data: startData, isLoading } = useQuery<{ review: WeeklyReviewData } | null>({
    queryKey: ['/api/coach/weekly-review/start'],
    queryFn: async () => {
      try {
        return await apiRequest('POST', '/api/coach/weekly-review/start', {});
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const review: WeeklyReviewData | null = startData?.review ?? null;
  const weekStartDate = review?.weekStartDate ?? null;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!weekStartDate) return null;
      return await apiRequest(
        'POST',
        `/api/coach/weekly-review/${weekStartDate}/confirm-upload`,
        {},
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/coach/weekly-review/start'] });
    },
  });

  if (isLoading) {
    return (
      <div data-testid="weekly-review-panel" className="p-4 text-gray-400">
        Carregando revisao da semana...
      </div>
    );
  }

  if (!review) {
    return (
      <div data-testid="weekly-review-panel" className="p-4 text-gray-300">
        <div data-testid="weekly-review-empty">
          Sua revisao de segunda aparece aqui.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="weekly-review-panel" className="p-4 text-gray-200">
      {(review.status === 'recap_sent' || review.status === 'awaiting_upload') && (
        <div data-testid="weekly-review-recap">
          <pre className="whitespace-pre-wrap text-sm text-gray-300">
            {review.recapContent?.markdown ?? ''}
          </pre>
          <button
            type="button"
            data-testid="weekly-review-confirm-upload"
            onClick={() => confirmMutation.mutate()}
            className="mt-3 rounded bg-green-600/20 px-3 py-2 text-sm text-green-400"
          >
            Ja importei — confirmar upload
          </button>
        </div>
      )}

      {(review.status === 'upload_confirmed' ||
        review.status === 'deep_analysis_done') && (
        <div data-testid="weekly-review-analysis">
          <pre className="whitespace-pre-wrap text-sm text-gray-300">
            {review.analysisContent?.markdown ?? ''}
          </pre>
          <button
            type="button"
            data-testid="weekly-review-build-plan"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['/api/coach/weekly-review/start'],
              })
            }
            className="mt-3 rounded bg-green-600/20 px-3 py-2 text-sm text-green-400"
          >
            Montar plano da semana
          </button>
        </div>
      )}

      {review.status === 'planning' && weekStartDate && (
        <div data-testid="weekly-review-planning">
          <PlanningWizard weekStartDate={weekStartDate} />
        </div>
      )}
    </div>
  );
}

export function WeeklyReviewPanel(): JSX.Element {
  return (
    <WeeklyReviewErrorBoundary>
      <WeeklyReviewPanelInner />
    </WeeklyReviewErrorBoundary>
  );
}

export default WeeklyReviewPanel;
