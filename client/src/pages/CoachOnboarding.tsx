// =============================================================================
// CoachOnboarding — Sprint AI-1A / RF-07 (ADR-153)
//
// Pagina full-page em /coach-ai/onboarding. Carrega o estado via
// GET /api/coach/onboarding e renderiza o OnboardingWizard no modo certo
// (light se perfil vazio + conta antiga; full caso contrario).
//
// Lessons: #1 (hooks antes de qualquer return), #2 (data-testid), #13 (apiRequest
//          JSON parseado), #29/#30 (useQuery -> QueryClientProvider nos testes).
// =============================================================================

import React from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import OnboardingWizard from '@/components/coach/onboarding/OnboardingWizard';

interface OnboardingState {
  completed: boolean;
  mode: 'full' | 'light' | null;
  draft: { step: number; mode: 'full' | 'light'; startedAt: string } | null;
  structuredProfile: any;
  levelEstimate: any;
  hasImport: boolean;
}

export function CoachOnboarding(): JSX.Element {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<OnboardingState>({
    queryKey: ['/api/coach/onboarding'],
    queryFn: getQueryFn({ on401: 'throw' }),
  });

  const mode = data?.mode ?? data?.draft?.mode ?? 'full';

  return (
    <div data-testid="coach-onboarding-page" className="h-full overflow-auto bg-gray-900 text-gray-100">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-xl font-semibold mb-4">Configurar perfil com o Grindfy AI</h1>
        {isLoading && <p className="text-sm text-gray-500">Carregando...</p>}
        <div data-testid="coach-onboarding-wizard">
          <OnboardingWizard
            mode={mode}
            draft={data?.draft ?? null}
            levelEstimate={data?.levelEstimate ?? null}
            onCompleted={(chatSessionId) =>
              navigate(chatSessionId ? `/coach-ai?session=${chatSessionId}` : '/coach-ai')
            }
          />
        </div>
      </div>
    </div>
  );
}

export default CoachOnboarding;
