/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-03: Themes view + filtro fromStats
 *
 * Lessons aplicadas:
 *   #1 hooks first
 *   #2 data-testid: themes-grid, theme-card-{id}, theme-filter-fromStats
 *   #11 sem actions decorativas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
const locationStateMock = vi.hoisted(() => ({ path: '/estudos/temas' }));

vi.mock('wouter', () => ({
  useLocation: () => [locationStateMock.path, navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  useSearch: () => locationStateMock.path.includes('?') ? locationStateMock.path.split('?')[1] : '',
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: any[]) => apiRequestMock(...a),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

// @ts-expect-error - red phase
import { ThemesView } from '../ThemesView';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const themesFixture = [
  {
    id: 'thm_1', userId: 'USER-0001', name: 'IP vs BB', color: '#fff', emoji: '',
    isFavorite: false, sortOrder: 0, progress: 50,
    createdAt: '2026-04-20', updatedAt: '2026-04-30', lastVisitedAt: '2026-04-30',
    attacksLeakType: 'preflop_leak', attacksLeakSeverity: 8,
  },
  {
    id: 'thm_2', userId: 'USER-0001', name: 'Push/Fold ICM', color: '#fff', emoji: '',
    isFavorite: false, sortOrder: 1, progress: 30,
    createdAt: '2026-04-21', updatedAt: '2026-04-29', lastVisitedAt: '2026-04-29',
    attacksLeakType: null, attacksLeakSeverity: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  locationStateMock.path = '/estudos/temas';
  apiRequestMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/study-themes')) return themesFixture;
    if (url.includes('/api/dashboard/leaks/delta')) return { thm_1: -10, thm_2: 0 };
    return null;
  });
  global.fetch = vi.fn(async (url: any) => {
    const data = await apiRequestMock(String(url));
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
});

describe('RF-03 ThemesView', () => {
  it('renderiza grid com todos os temas', async () => {
    render(withClient(<ThemesView />));
    await waitFor(() => {
      expect(screen.getByTestId('themes-grid')).toBeInTheDocument();
      expect(screen.getByTestId('theme-card-thm_1')).toBeInTheDocument();
      expect(screen.getByTestId('theme-card-thm_2')).toBeInTheDocument();
    });
  });

  it('?fromStats=leaks filtra apenas temas com attacksLeakType', async () => {
    locationStateMock.path = '/estudos/temas?fromStats=leaks';
    render(withClient(<ThemesView />));
    await waitFor(() => {
      expect(screen.getByTestId('theme-card-thm_1')).toBeInTheDocument();
      expect(screen.queryByTestId('theme-card-thm_2')).not.toBeInTheDocument();
    });
  });

  it('badge "Filtrando por leaks" visivel quando filtro ativo', async () => {
    locationStateMock.path = '/estudos/temas?fromStats=leaks';
    render(withClient(<ThemesView />));
    await waitFor(() => {
      expect(screen.getByTestId('themes-filter-badge')).toBeInTheDocument();
    });
  });

  it('botao "Limpar filtro" remove ?fromStats da URL', async () => {
    locationStateMock.path = '/estudos/temas?fromStats=leaks';
    render(withClient(<ThemesView />));
    const clearBtn = await screen.findByTestId('themes-filter-clear');
    await userEvent.click(clearBtn);
    expect(navigateMock).toHaveBeenCalledWith('/estudos/temas');
  });

  it('tag "Sugerido" em tema com delta stats negativo', async () => {
    render(withClient(<ThemesView />));
    await waitFor(() => {
      const card = screen.getByTestId('theme-card-thm_1');
      expect(card.textContent).toMatch(/sugerido/i);
    });
  });

  it('search filtra por nome', async () => {
    render(withClient(<ThemesView />));
    const search = await screen.findByTestId('themes-search-input');
    await userEvent.type(search, 'ICM');
    await waitFor(() => {
      expect(screen.queryByTestId('theme-card-thm_1')).not.toBeInTheDocument();
      expect(screen.getByTestId('theme-card-thm_2')).toBeInTheDocument();
    });
  });

  it('empty state quando filtro retorna zero', async () => {
    apiRequestMock.mockImplementation(async () => []);
    render(withClient(<ThemesView />));
    await waitFor(() => {
      expect(screen.getByTestId('themes-empty')).toBeInTheDocument();
    });
  });

  it('click em theme card navega para detail', async () => {
    render(withClient(<ThemesView />));
    const card = await screen.findByTestId('theme-card-thm_1');
    await userEvent.click(card);
    expect(navigateMock).toHaveBeenCalled();
    expect(String(navigateMock.mock.calls[0][0])).toMatch(/^\/estudos\/temas\/thm_1/);
  });
});
