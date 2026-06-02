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
// Sprint Estudos-UX (founder) — "Iniciar sessao" navega pro form de registro
// UNIFICADO (/estudos/registrar) em vez de criar a sessao legacy minima.
// Supersede o RF-09 original (POST + navigate /estudos/sessao/:id).
// =============================================================================
describe('<ThemeDetailView> — botao "Registrar estudo" abre form unificado', () => {
  it('click -> navigate("/estudos/registrar?themeId=:id") (sem POST)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/study-themes') {
        return [baseTheme];
      }
      if (method === 'GET' && url.includes('/stats-summary')) {
        return { themeId: 'thm_1', stats: [] };
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
      expect(navigateMock).toHaveBeenCalled();
      const dest = navigateMock.mock.calls[0]?.[0];
      expect(String(dest)).toBe('/estudos/registrar?themeId=thm_1');
    });

    // Nao cria mais sessao legacy via POST.
    const postCalls = apiRequestMock.mock.calls.filter(
      (c) => c[0] === 'POST' && c[1] === '/api/study-sessions',
    );
    expect(postCalls.length).toBe(0);
  });
});

// =============================================================================
// Sprint Estudos-Fixes FASE 1 — GAP-1: editar + deletar tema
// =============================================================================
describe('<ThemeDetailView> GAP-1 — editar tema', () => {
  it('click "Editar" abre dialog e submit chama PUT /api/study-themes/:id', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/study-themes') return [baseTheme];
      if (method === 'GET' && url.includes('/stats-summary')) return { themeId: 'thm_1', stats: [] };
      if (method === 'PUT' && url === '/api/study-themes/thm_1') return { ...baseTheme, name: 'Editado' };
      return null;
    });

    const View = await loadView();
    renderWithClient(<View themeId="thm_1" />);

    const editBtn = await screen.findByTestId('theme-detail-edit');
    const user = userEvent.setup();
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByTestId('theme-form-dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('theme-form-submit'));

    await waitFor(() => {
      const putCalls = apiRequestMock.mock.calls.filter(
        (c) => c[0] === 'PUT' && c[1] === '/api/study-themes/thm_1',
      );
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });
});

describe('<ThemeDetailView> GAP-1 — deletar tema', () => {
  it('click "Remover" -> confirma -> DELETE -> navigate("/estudos/temas")', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/study-themes') return [baseTheme];
      if (method === 'GET' && url.includes('/stats-summary')) return { themeId: 'thm_1', stats: [] };
      if (method === 'DELETE' && url === '/api/study-themes/thm_1') return { message: 'ok' };
      return null;
    });

    const View = await loadView();
    renderWithClient(<View themeId="thm_1" />);

    const delBtn = await screen.findByTestId('theme-detail-delete');
    const user = userEvent.setup();
    await user.click(delBtn);

    await waitFor(() => {
      expect(screen.getByTestId('theme-delete-confirm-action')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('theme-delete-confirm-action'));

    await waitFor(() => {
      const delCalls = apiRequestMock.mock.calls.filter(
        (c) => c[0] === 'DELETE' && c[1] === '/api/study-themes/thm_1',
      );
      expect(delCalls.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/estudos/temas');
    });
  });
});
