/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-04: Stats view wrapper
 *
 * IMPORTANTE: Este teste NAO testa internals de StatsAnalyzerTab (zona Sess 3).
 * Apenas valida que o wrapper renderiza StatsAnalyzerTab + breadcrumb + botao "Sugerir temas".
 *
 * Lessons:
 *   #11 wrapper sem default actions decorativas
 *   contrato isolation: NAO modifica StatsAnalyzerTab nem passa props customizadas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/stats', navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

// Mock StatsAnalyzerTab — NAO renderiza implementacao real (preserva isolation Sess 3)
vi.mock('@/components/studies/StatsAnalyzerTab', () => ({
  default: () => <div data-testid="stats-analyzer-tab-mock" />,
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
import { StatsView } from '../StatsView';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  apiRequestMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/dashboard/leaks/active')) return [{ id: 'leak1', severity: 8 }];
    return null;
  });
  global.fetch = vi.fn(async (url: any) => {
    const data = await apiRequestMock(String(url));
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
});

describe('RF-04 StatsView wrapper', () => {
  it('renderiza StatsAnalyzerTab intacto (mock)', async () => {
    render(withClient(<StatsView />));
    expect(screen.getByTestId('stats-analyzer-tab-mock')).toBeInTheDocument();
  });

  it('renderiza breadcrumb "Studies > Stats Analyzer"', () => {
    render(withClient(<StatsView />));
    const root = screen.getByTestId('studies-stats-view');
    expect(root.textContent).toMatch(/Studies/i);
    expect(root.textContent).toMatch(/Stats/i);
  });

  it('botao "Sugerir temas" presente', () => {
    render(withClient(<StatsView />));
    expect(screen.getByTestId('suggest-themes-button')).toBeInTheDocument();
  });

  it('botao "Sugerir temas" navega para /estudos/temas?fromStats=leaks', async () => {
    render(withClient(<StatsView />));
    await waitFor(() => {
      const btn = screen.getByTestId('suggest-themes-button');
      expect(btn.hasAttribute('disabled')).toBe(false);
    });
    await userEvent.click(screen.getByTestId('suggest-themes-button'));
    expect(navigateMock).toHaveBeenCalledWith('/estudos/temas?fromStats=leaks');
  });

  it('botao desabilitado quando leaks=[]', async () => {
    apiRequestMock.mockImplementation(async () => []);
    render(withClient(<StatsView />));
    await waitFor(() => {
      const btn = screen.getByTestId('suggest-themes-button');
      expect(btn.hasAttribute('disabled')).toBe(true);
    });
  });
});
