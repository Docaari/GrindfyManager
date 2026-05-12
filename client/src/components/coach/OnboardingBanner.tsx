// =============================================================================
// OnboardingBanner — Sprint AI-1A / RF-07 (ADR-153)
//
// Banner persistente no topo de /coach-ai (aba chat) e em /inicio quando o
// onboarding nao foi completado. "Comecar" -> navega para /coach-ai/onboarding.
// "agora nao" -> PATCH /api/coach/onboarding { skip: true } + esconde por sessao.
//
// Encapsulado em ErrorBoundary local (lesson #29) — se renderizar sem
// QueryClientProvider (algum teste da Home), vira null silenciosamente.
//
// Lessons: #1 (hooks primeiro), #2 (data-testid), #13 (apiRequest JSON).
// =============================================================================

import React from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from '@/lib/queryClient';

class BannerErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // swallow — banner secundario nao deve crashar a arvore.
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface OnboardingState {
  completed: boolean;
  mode: 'full' | 'light' | null;
}

function OnboardingBannerInner(): JSX.Element | null {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = React.useState(false);

  const { data } = useQuery<OnboardingState>({
    queryKey: ['/api/coach/onboarding'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const handleSkip = React.useCallback(async () => {
    setDismissed(true);
    try {
      await apiRequest('PATCH', '/api/coach/onboarding', { skip: true });
    } catch {
      // ignora — o banner ja foi escondido por essa sessao.
    }
  }, []);

  const handleStart = React.useCallback(() => {
    navigate('/coach-ai/onboarding');
  }, [navigate]);

  if (dismissed) return null;
  if (!data || data.completed) return null;

  return (
    <div
      data-testid="coach-onboarding-banner"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-green-900/20 border border-green-700/40 text-sm text-green-200"
    >
      <span>Configure seu perfil com o Grindfy AI — 3 min</span>
      <div className="flex items-center gap-2">
        <a
          href="/coach-ai/onboarding"
          data-href="/coach-ai/onboarding"
          data-testid="coach-onboarding-banner-start"
          onClick={(e) => { e.preventDefault(); handleStart(); }}
          className="px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-xs"
        >
          Comecar
        </a>
        <button
          type="button"
          data-testid="coach-onboarding-banner-skip"
          onClick={handleSkip}
          className="px-2 py-1 rounded border border-green-700/40 text-green-300 text-xs"
        >
          Agora nao
        </button>
      </div>
    </div>
  );
}

export function OnboardingBanner(): JSX.Element {
  return (
    <BannerErrorBoundary>
      <OnboardingBannerInner />
    </BannerErrorBoundary>
  );
}

export default OnboardingBanner;
