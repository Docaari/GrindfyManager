/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint Estudos-Sessao-1 — RF-09 (redirect pos-POST start session)
 *
 * Spec : Docs/specs/sprint-estudos-sessao-1.md §RF-09
 *
 * Cobertura:
 *   - Click "Iniciar sessao" -> POST /api/study-sessions -> navigate('/estudos/sessao/:id')
 *   - Erro POST -> toast erro (sem redirect)
 *
 * Lessons aplicadas:
 *   #2  data-testid theme-detail-start-session ja existe.
 *   #13 apiRequest retorna JSON parseado direto — { id, ... } na onSuccess.
 *   #14 await import(...) ESM compat.
 *   #15 vi.mock hoisted (top-level).
 *
 * Status RED esperado: onSuccess do startSessionMutation atualmente faz toast
 * "Sessao de estudo iniciada" e NAO navigate (codigo atual em
 * client/src/components/studies/ThemeDetailView.tsx:128-132). O implementer
 * vai trocar pra navigate('/estudos/sessao/' + created.id).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { apiRequestMock, navigateMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  navigateMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/temas/thm_1', navigateMock],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

// ThemeStatsFocoSection + StatLinkPicker dependem de fetches secundarios.
// Mocka como stubs simples.
vi.mock('@/components/study-themes/ThemeStatsFocoSection', () => ({
  ThemeStatsFocoSection: () => (
    <div data-testid="theme-stats-foco-section-stub" />
  ),
  default: () => <div data-testid="theme-stats-foco-section-stub" />,
}));

vi.mock('@/components/study-themes/StatLinkPicker', () => ({
  StatLinkPicker: () => <div data-testid="stat-link-picker-stub" />,
  default: () => <div data-testid="stat-link-picker-stub" />,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => true,
}));

const baseTheme = {
  id: 'thm_1',
  name: 'Jogando OOP PosFlop',
  color: '#16a34a',
  emoji: 'OOP',
  progress: 25,
  linkedStats: [],
};

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  navigateMock.mockReset();
  toastMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadView() {
  const mod: any = await import('@/components/studies/ThemeDetailView');
  return mod.default ?? mod.ThemeDetailView;
}

// =============================================================================
// RF-09 — navigate apos POST sucesso
// =============================================================================
describe('<ThemeDetailView> RF-09 — redirect apos iniciar sessao', () => {
  it('click "Iniciar sessao" -> POST -> navigate("/estudos/sessao/:id")', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/study-themes') {
        return [baseTheme];
      }
      if (method === 'GET' && url.includes('/stats-summary')) {
        return { themeId: 'thm_1', stats: [] };
      }
      if (method === 'POST' && url === '/api/study-sessions') {
        return {
          id: 'sess_new_123',
          userId: 'USER-OWNER',
          themeId: 'thm_1',
          status: 'active',
          date: new Date().toISOString(),
          duration: 0,
          activities: ['theme'],
        };
      }
      return null;
    });

    const View = await loadView();
    renderWithClient(<View themeId="thm_1" />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-detail-start-session')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('theme-detail-start-session'));

    await waitFor(() => {
      const postCalls = apiRequestMock.mock.calls.filter(
        (c) => c[0] === 'POST' && c[1] === '/api/study-sessions',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
      const dest = navigateMock.mock.calls[0]?.[0];
      expect(String(dest)).toBe('/estudos/sessao/sess_new_123');
    });
  });

  it('erro do POST -> toast erro + NAO navigate', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/study-themes') {
        return [baseTheme];
      }
      if (method === 'GET' && url.includes('/stats-summary')) {
        return { themeId: 'thm_1', stats: [] };
      }
      if (method === 'POST' && url === '/api/study-sessions') {
        throw new Error('Server error');
      }
      return null;
    });

    const View = await loadView();
    renderWithClient(<View themeId="thm_1" />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-detail-start-session')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('theme-detail-start-session'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
      const calls = toastMock.mock.calls;
      const errToast = calls.find((c) => {
        const arg = c[0] ?? {};
        return (
          arg?.variant === 'destructive' ||
          /erro/i.test(arg?.title ?? '') ||
          /erro/i.test(arg?.description ?? '')
        );
      });
      expect(errToast).toBeTruthy();
    });

    // Em caso de erro NAO deve navegar pra /estudos/sessao/*
    const sessionRedirects = navigateMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/estudos/sessao/'),
    );
    expect(sessionRedirects.length).toBe(0);
  });
});
