/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1A / RF-07 — OnboardingBanner.tsx
 *   Aparece no topo de /coach-ai (aba chat) e em /inicio quando !onboardingCompletedAt.
 *   "agora nao" -> PATCH /api/coach/onboarding { skip: true } + esconde por sessao.
 *   "Comecar" -> navega para /coach-ai/onboarding.
 *   Encapsulado em ErrorBoundary local (lesson #29) — se a Home renderiza sem
 *   QueryClientProvider, o banner vira null silenciosamente.
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1a.md (RF-07)
 *   - Docs/architecture/decisions/153-onboarding-conversacional-wizard-guiado.md (§Banner, §1)
 *
 * data-testid esperados:
 *   - coach-onboarding-banner          — wrapper
 *   - coach-onboarding-banner-start    — botao "Comecar"
 *   - coach-onboarding-banner-skip     — botao "agora nao"
 *
 * Lessons: #14/#26 (await import .tsx), #13 (apiRequest JSON), #1 (hooks primeiro),
 *          #2 (data-testid), #29 (useQuery sem provider -> ErrorBoundary local).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai', navMock] as const,
  Link: ({ href, children }: any) => <a href={href} data-href={href}>{children}</a>,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));

const onboardingState = { completed: false };
const apiRequestMock = vi.fn(async (_method: string, _url: string, _body?: any) => ({ structuredProfile: { schemaVersion: 1, onboardingSkippedAt: new Date().toISOString() } }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: undefined,
  getQueryFn: () => async () => ({
    completed: onboardingState.completed, mode: onboardingState.completed ? null : 'full', draft: null,
    structuredProfile: { schemaVersion: 1 }, levelEstimate: null, hasImport: false,
  }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadBanner() {
  const mod: any = await import('@/components/coach/OnboardingBanner');
  return (mod.default ?? mod.OnboardingBanner) as React.ComponentType<any>;
}

beforeEach(() => {
  vi.clearAllMocks();
  onboardingState.completed = false;
});

describe('OnboardingBanner', () => {
  it('aparece quando !onboardingCompletedAt', async () => {
    const Banner = await loadBanner();
    render(wrap(<Banner />));
    await waitFor(() => expect(screen.getByTestId('coach-onboarding-banner')).toBeTruthy());
    expect(screen.getByTestId('coach-onboarding-banner-start')).toBeTruthy();
    expect(screen.getByTestId('coach-onboarding-banner-skip')).toBeTruthy();
  });

  it('NAO aparece quando completed', async () => {
    onboardingState.completed = true;
    const Banner = await loadBanner();
    render(wrap(<Banner />));
    // pequeno wait para o useQuery resolver
    await new Promise(r => setTimeout(r, 30));
    expect(screen.queryByTestId('coach-onboarding-banner')).toBeNull();
  });

  it('"agora nao" -> PATCH /api/coach/onboarding { skip: true } e esconde o banner', async () => {
    const Banner = await loadBanner();
    render(wrap(<Banner />));
    await waitFor(() => expect(screen.getByTestId('coach-onboarding-banner-skip')).toBeTruthy());
    await userEvent.click(screen.getByTestId('coach-onboarding-banner-skip'));
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(c => c[0] === 'PATCH' && String(c[1]).includes('/api/coach/onboarding') && c[2] && c[2].skip === true)).toBe(true);
    });
    await waitFor(() => expect(screen.queryByTestId('coach-onboarding-banner')).toBeNull());
  });

  it('"Comecar" leva para /coach-ai/onboarding', async () => {
    const Banner = await loadBanner();
    render(wrap(<Banner />));
    await waitFor(() => expect(screen.getByTestId('coach-onboarding-banner-start')).toBeTruthy());
    const startEl = screen.getByTestId('coach-onboarding-banner-start');
    // O botao pode ser um <a href> (Link) ou disparar nav() — aceitamos qualquer das duas.
    await userEvent.click(startEl);
    const wentViaLink = !!startEl.closest('a[data-href="/coach-ai/onboarding"]') || startEl.getAttribute('data-href') === '/coach-ai/onboarding';
    const wentViaNav = navMock.mock.calls.some(c => String(c[0]).includes('/coach-ai/onboarding'));
    expect(wentViaLink || wentViaNav).toBe(true);
  });

  it('lesson #29 — sem QueryClientProvider o banner nao crasha a arvore (ErrorBoundary local -> null)', async () => {
    const Banner = await loadBanner();
    // render SEM o wrap (sem provider)
    expect(() => render(<Banner />)).not.toThrow();
  });
});
