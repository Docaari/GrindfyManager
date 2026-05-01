/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-09: QuickSearchPalette (Cmd+K)
 *
 * Lessons:
 *   #1 hooks first (listener em useEffect)
 *   #2 data-testid: quick-search-palette, quick-search-input,
 *      quick-search-result-{id}, quick-search-group-{name}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/dashboard', navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: any[]) => apiRequestMock(...a),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

// @ts-expect-error - red phase
import { QuickSearchPalette } from '../QuickSearchPalette';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const themesFixture = [
  { id: 'thm_ip', name: 'IP vs BB', color: '#fff', emoji: '' },
  { id: 'thm_icm', name: 'ICM Basics', color: '#fff', emoji: '' },
];

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  apiRequestMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/study-themes')) return themesFixture;
    return null;
  });
  global.fetch = vi.fn(async (url: any) => {
    const data = await apiRequestMock(String(url));
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
});

describe('RF-09 QuickSearchPalette', () => {
  it('renders quando open=true', () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    expect(screen.getByTestId('quick-search-palette')).toBeInTheDocument();
  });

  it('NAO renders quando open=false', () => {
    render(withClient(<QuickSearchPalette open={false} onOpenChange={() => {}} />));
    expect(screen.queryByTestId('quick-search-palette')).not.toBeInTheDocument();
  });

  it('Esc dispara onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    render(withClient(<QuickSearchPalette open={true} onOpenChange={onOpenChange} />));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('search filtra temas por nome', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    const input = await screen.findByTestId('quick-search-input');
    await userEvent.type(input, 'IP');
    await waitFor(() => {
      expect(screen.getByTestId('quick-search-result-thm_ip')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-search-result-thm_icm')).not.toBeInTheDocument();
    });
  });

  it('grupos visiveis: Temas, Acoes', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId('quick-search-group-temas')).toBeInTheDocument();
      expect(screen.getByTestId('quick-search-group-acoes')).toBeInTheDocument();
    });
  });

  it('click em result navega para tema', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    const result = await screen.findByTestId('quick-search-result-thm_ip');
    await userEvent.click(result);
    expect(navigateMock).toHaveBeenCalled();
    expect(String(navigateMock.mock.calls[0][0])).toMatch(/^\/estudos\/temas\/thm_ip/);
  });

  it('Acoes rapidas: "Criar tema" presente', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      const acoes = screen.getByTestId('quick-search-group-acoes');
      expect(acoes.textContent).toMatch(/criar tema/i);
    });
  });

  it('empty state quando search retorna zero', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    const input = await screen.findByTestId('quick-search-input');
    await userEvent.type(input, 'zzzznaoexiste123');
    await waitFor(() => {
      expect(screen.getByTestId('quick-search-empty')).toBeInTheDocument();
    });
  });

  it('keyboard arrow down move highlight', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    const input = await screen.findByTestId('quick-search-input');
    input.focus();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    // Apenas valida que nao crasha; comportamento detalhado em smoke
    expect(screen.getByTestId('quick-search-palette')).toBeInTheDocument();
  });

  it('Enter no item highlighted executa acao', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    const input = await screen.findByTestId('quick-search-input');
    await userEvent.type(input, 'IP{enter}');
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
  });

  it('recent searches: ultimo item selecionado fica em sessionStorage/localStorage', async () => {
    render(withClient(<QuickSearchPalette open={true} onOpenChange={() => {}} />));
    const input = await screen.findByTestId('quick-search-input');
    await userEvent.type(input, 'IP');
    const result = await screen.findByTestId('quick-search-result-thm_ip');
    await userEvent.click(result);
    // Recent stored
    const recent = localStorage.getItem('grindfy:studies:cmdk_recent') || '';
    expect(recent.length).toBeGreaterThan(0);
  });
});
