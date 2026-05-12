/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1A / RF-07 — Pagina /coach-ai/onboarding -> CoachOnboarding.tsx
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1a.md (RF-07)
 *   - Docs/architecture/decisions/153-onboarding-conversacional-wizard-guiado.md (§1)
 *
 * data-testid esperados (estaveis — implementer cria; lesson #2):
 *   - coach-onboarding-page         — wrapper da pagina
 *   - coach-onboarding-wizard       — o OnboardingWizard renderizado dentro
 *
 * Lessons: #14/#26 (await import em .tsx), #13 (apiRequest JSON), #1 (hooks primeiro),
 *          #29/#30 (useQuery -> QueryClientProvider no teste).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai/onboarding', vi.fn()] as const,
  useSearch: () => '',
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));

// apiRequest retorna JSON parseado (lesson #13).
const apiRequestMock = vi.fn(async (_method: string, url: string) => {
  if (url.includes('/api/coach/onboarding')) {
    return {
      completed: false, mode: 'full', draft: null,
      structuredProfile: { schemaVersion: 1 },
      levelEstimate: { nivel: 'sem_dados', confidence: 'low', humanLabel: 'ainda sem dados suficientes', evidence: {}, note: 'amostra insuficiente' },
      hasImport: false,
    };
  }
  if (url.includes('/api/coach/level-estimate')) {
    return { nivel: 'sem_dados', confidence: 'low', humanLabel: 'ainda sem dados suficientes', evidence: {}, note: 'amostra insuficiente' };
  }
  return {};
});
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: undefined,
  getQueryFn: () => async ({ queryKey }: any) => apiRequestMock('GET', String(queryKey[0])),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadPage() {
  const mod: any = await import('@/pages/CoachOnboarding');
  return (mod.default ?? mod.CoachOnboarding) as React.ComponentType<any>;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('CoachOnboarding — pagina /coach-ai/onboarding', () => {
  it('renderiza a pagina + o OnboardingWizard', async () => {
    const Page = await loadPage();
    render(wrap(<Page />));
    await waitFor(() => {
      expect(screen.getByTestId('coach-onboarding-page')).toBeTruthy();
    });
    expect(screen.getByTestId('coach-onboarding-wizard')).toBeTruthy();
  });

  it('carrega o estado via GET /api/coach/onboarding', async () => {
    const Page = await loadPage();
    render(wrap(<Page />));
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(c => String(c[1]).includes('/api/coach/onboarding'))).toBe(true);
    });
  });
});
