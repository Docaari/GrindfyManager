/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint Estudos-Sessao-1 — RF-05 (rota /estudos/sessao/:id)
 *
 * Spec : Docs/specs/sprint-estudos-sessao-1.md §RF-05
 *
 * Cobertura:
 *   - Path /estudos/sessao/abc123 resolve para viewKey "sessao-detail"
 *     e renderiza <StudySessionPage sessionId="abc123" />
 *   - Path /estudos/sessao (sem id) cai no Redirect default /estudos/dashboard
 *
 * Lessons aplicadas:
 *   #14 await import(...) ESM compat
 *   #15 vi.mock hoisted top-level
 *   #2  data-testid estaveis: studies-view-sessao-detail (espelha o padrao
 *       studies-view-tema-detail / studies-view-dashboard ja existentes)
 *
 * Status RED esperado: Studies.tsx ainda nao reconhece /estudos/sessao/:id;
 * helper extractSessionIdFromPath + view 'sessao-detail' nao existem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { locationRef, navigateMock } = vi.hoisted(() => ({
  locationRef: { current: '/estudos/sessao/abc123' },
  navigateMock: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => [locationRef.current, navigateMock],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  Redirect: ({ to }: any) => (
    <div data-testid={`redirect-${String(to).replace(/\//g, '-')}`}>
      Redirect to {to}
    </div>
  ),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => true,
}));

// Stub child views — focamos em ROUTING, nao no conteudo.
vi.mock('@/components/studies/StudiesNavSidebar', () => ({
  StudiesNavSidebar: () => <div data-testid="studies-nav-sidebar-stub" />,
}));

vi.mock('@/components/studies/StudiesBottomNav', () => ({
  StudiesBottomNav: () => <div data-testid="studies-bottom-nav-stub" />,
}));

vi.mock('@/components/studies/QuickSearchPalette', () => ({
  QuickSearchPalette: () => null,
}));

vi.mock('@/components/studies/onboarding/OnboardingWizard', () => ({
  OnboardingWizard: () => null,
}));

vi.mock('@/components/studies/ThemesView', () => ({
  ThemesView: () => <div data-testid="themes-view-stub" />,
}));

vi.mock('@/components/studies/ThemeDetailView', () => ({
  default: ({ themeId }: any) => (
    <div data-testid="theme-detail-view-stub" data-theme-id={themeId} />
  ),
}));

// IMPORTANTE: O componente novo StudySessionPage deve aceitar prop sessionId
// e renderizar com data-testid="study-session-page". O wrapper deve embrulhar
// num <div data-testid="studies-view-sessao-detail">.
vi.mock('@/components/studies/StudySessionPage', () => ({
  default: ({ sessionId }: any) => (
    <div data-testid="study-session-page-stub" data-session-id={sessionId} />
  ),
  StudySessionPage: ({ sessionId }: any) => (
    <div data-testid="study-session-page-stub" data-session-id={sessionId} />
  ),
}));

vi.mock('@/components/studies/StatsView', () => ({
  StatsView: () => <div data-testid="stats-view-stub" />,
}));

vi.mock('@/components/studies/SpotsView', () => ({
  SpotsView: () => <div data-testid="spots-view-stub" />,
}));

vi.mock('@/components/studies/dashboard/StudiesDashboard', () => ({
  StudiesDashboard: () => <div data-testid="studies-dashboard-stub" />,
}));

vi.mock('@/components/studies/recommendations/RecommendationsView', () => ({
  RecommendationsView: () => <div data-testid="recommendations-view-stub" />,
}));

vi.mock('@/pages/studies/Reentry', () => ({
  ReentryQueuePage: () => <div data-testid="reentry-queue-stub" />,
}));

vi.mock('@/components/AccessDenied', () => ({
  default: () => <div data-testid="access-denied-stub" />,
}));

beforeEach(() => {
  cleanup();
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadStudies() {
  const mod: any = await import('@/pages/Studies');
  return mod.default ?? mod.Studies;
}

// =============================================================================
// RF-05 — Resolve /estudos/sessao/:id para StudySessionPage
// =============================================================================
describe('Studies routing — /estudos/sessao/:id (RF-05)', () => {
  it('renderiza studies-view-sessao-detail + StudySessionPage com sessionId="abc123"', async () => {
    locationRef.current = '/estudos/sessao/abc123';
    const Studies = await loadStudies();
    renderWithClient(<Studies />);

    await waitFor(() => {
      const view = screen.queryByTestId('studies-view-sessao-detail');
      expect(view).toBeInTheDocument();
    });

    const stub = screen.getByTestId('study-session-page-stub');
    expect(stub.getAttribute('data-session-id')).toBe('abc123');
  });

  it('outras views NAO renderizam quando rota eh /estudos/sessao/:id', async () => {
    locationRef.current = '/estudos/sessao/xyz';
    const Studies = await loadStudies();
    renderWithClient(<Studies />);
    await waitFor(() => {
      expect(screen.queryByTestId('study-session-page-stub')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('studies-dashboard-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('themes-view-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('theme-detail-view-stub')).not.toBeInTheDocument();
  });
});

// =============================================================================
// RF-05 — /estudos/sessao (sem id) -> Redirect dashboard
// =============================================================================
describe('Studies routing — /estudos/sessao sem id', () => {
  it('cai em Redirect /estudos/dashboard quando path eh "/estudos/sessao"', async () => {
    locationRef.current = '/estudos/sessao';
    const Studies = await loadStudies();
    renderWithClient(<Studies />);
    await waitFor(() => {
      // Aceita o stub do Redirect OU que dashboard apareca direto.
      const redirected =
        screen.queryByTestId('redirect--estudos-dashboard') ??
        screen.queryByTestId('studies-dashboard-stub');
      expect(redirected).toBeInTheDocument();
    });
    // E NAO deve montar StudySessionPage.
    expect(screen.queryByTestId('study-session-page-stub')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Regressao — outras rotas continuam funcionando
// =============================================================================
describe('Studies routing — regressao rotas existentes', () => {
  it('/estudos/dashboard ainda renderiza dashboard', async () => {
    locationRef.current = '/estudos/dashboard';
    const Studies = await loadStudies();
    renderWithClient(<Studies />);
    await waitFor(() => {
      expect(screen.getByTestId('studies-dashboard-stub')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('study-session-page-stub')).not.toBeInTheDocument();
  });

  it('/estudos/temas/thm_1 ainda renderiza ThemeDetailView', async () => {
    locationRef.current = '/estudos/temas/thm_1';
    const Studies = await loadStudies();
    renderWithClient(<Studies />);
    await waitFor(() => {
      const stub = screen.getByTestId('theme-detail-view-stub');
      expect(stub.getAttribute('data-theme-id')).toBe('thm_1');
    });
    expect(screen.queryByTestId('study-session-page-stub')).not.toBeInTheDocument();
  });
});
