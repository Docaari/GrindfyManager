// =============================================================================
// PlanningWizard — EST-6 (ADR-224)
//
// Wizard conversacional do Next-Week Planning Flow, embutido no chat do
// /coach-ai. Renderiza 4 cards de passo (grind/study/lessons/themes) com CTAs
// de confirm/skip que disparam mutations contra /api/coach/planning/...
//
// Encapsulado em ErrorBoundary local (lesson #29) — se renderizar sem
// QueryClientProvider (algum teste standalone), vira fallback silencioso sem
// derrubar a arvore.
//
// Lessons: #1 (hooks primeiro), #2 (data-testid estavel),
//   #13 (apiRequest retorna JSON parseado direto),
//   #19 (CTA de aula -> rota Wouter /biblioteca/curso/:courseSlug/:lessonSlug/play),
//   #29 (useQuery isolado por ErrorBoundary).
// =============================================================================

import React from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

class PlanningErrorBoundary extends React.Component<
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
    // swallow — o wizard secundario nao deve crashar a arvore do chat.
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const STEP_KEYS = ['grind', 'study', 'lessons', 'themes'] as const;
type StepKey = (typeof STEP_KEYS)[number];

const STEP_LABELS: Record<StepKey, string> = {
  grind: 'Grind — dias e horas',
  study: 'Estudo — blocos da semana',
  lessons: 'Aulas — o que assistir',
  themes: 'Temas-foco da semana',
};

interface PlanningSessionData {
  id: string;
  userId: string;
  weekStartDate: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  source: string;
  steps: Record<string, any>;
}

interface PlanningWizardProps {
  weekStartDate: string;
}

function PlanningWizardInner({ weekStartDate }: PlanningWizardProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const planningUrl = `/api/coach/planning/${weekStartDate}`;

  const { data } = useQuery<PlanningSessionData | null>({
    queryKey: [planningUrl],
    queryFn: async () => {
      try {
        return await apiRequest('GET', planningUrl);
      } catch {
        return null;
      }
    },
  });

  const stepMutation = useMutation({
    mutationFn: async ({ step, action, body }: { step: StepKey; action: 'confirm' | 'skip' | 'propose'; body?: any }) => {
      return await apiRequest(
        'POST',
        `/api/coach/planning/${weekStartDate}/step/${step}/${action}`,
        body ?? {},
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [planningUrl] });
    },
    onError: () => toast({ title: 'Falha ao atualizar o passo', variant: 'destructive' }),
  });

  const steps = data?.steps ?? {};
  const isCompleted = data?.status === 'completed';

  return (
    <div data-testid="planning-wizard" className="flex flex-col gap-3">
      {STEP_KEYS.map((step) => {
        const stepState = steps[step] ?? { status: 'pending' };
        const status = stepState.status ?? 'pending';
        return (
          <div
            key={step}
            data-testid={`planning-step-${step}`}
            data-status={status}
            className="rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{STEP_LABELS[step]}</span>
              <span className="text-xs text-white/50">{status}</span>
            </div>

            {step === 'lessons' && Array.isArray(stepState.lessons) && (
              <ul className="mt-2 flex flex-col gap-1">
                {stepState.lessons.map((lesson: any) => (
                  <li key={lesson.id}>
                    <Link
                      href={`/biblioteca/curso/${lesson.courseSlug}/${lesson.lessonSlug}/play`}
                      data-testid={`planning-lesson-cta-${lesson.id}`}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      {lesson.title ?? lesson.id}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid={`planning-step-confirm-${step}`}
                onClick={() => stepMutation.mutate({ step, action: 'confirm' })}
                disabled={stepMutation.isPending}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                type="button"
                data-testid={`planning-step-skip-${step}`}
                onClick={() => stepMutation.mutate({ step, action: 'skip' })}
                disabled={stepMutation.isPending}
                className="rounded bg-white/10 px-3 py-1 text-xs text-white/70 disabled:opacity-50"
              >
                Pular
              </button>
            </div>
          </div>
        );
      })}

      {isCompleted && (
        <div
          data-testid="planning-summary"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm"
        >
          Plano da semana de {data?.weekStartDate} concluido.
        </div>
      )}
    </div>
  );
}

export function PlanningWizard(props: PlanningWizardProps): JSX.Element {
  return (
    <PlanningErrorBoundary>
      <PlanningWizardInner {...props} />
    </PlanningErrorBoundary>
  );
}

export default PlanningWizard;
