/**
 * Sprint Estudos-UX-Fix BUG-C (lesson #29) — ThemeDetailView isola cada
 * sub-secao com fetch numa ErrorBoundary local. Se uma sub-secao estourar no
 * render, a pagina do tema (nome + progresso + demais secoes) sobrevive em vez
 * de derrubar tudo (queixa do founder: "pagina de tema abre com erro").
 *
 * Estrategia: mocka MdaReadsSection para LANCAR no render; o ErrorBoundary
 * (real) em volta dela deve capturar e renderizar o fallback, e theme-detail-name
 * continua presente. ErrorBoundary NAO eh mockado (queremos o comportamento real).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/estudos/temas/th-1', mockNavigate],
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return { ...actual, apiRequest: (...args: any[]) => mockApiRequest(...args) };
});

// Sub-secao que ESTOURA no render — simula uma query/shape que derrubaria a
// pagina toda na ausencia do ErrorBoundary.
vi.mock('../MdaReadsSection', () => ({
  MdaReadsSection: () => {
    throw new Error('boom: MdaReadsSection render explodiu');
  },
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockApiRequest.mockReset();
  // Silencia o console.error do ErrorBoundary (esperado neste teste).
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const themeFixtures = [
  { id: 'th-1', name: 'C-Bet em Heads-Up', color: '#16a34a', emoji: 'C', progress: 35 },
];

describe('<ThemeDetailView /> — BUG-C ErrorBoundary por sub-secao', () => {
  it('sub-secao que lanca no render NAO derruba a pagina (nome do tema sobrevive)', async () => {
    mockApiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && /\/api\/study-themes/.test(url)) return themeFixtures;
      // stats-summary, stat-analysis/by-theme, mda by-theme -> vazio
      return [];
    });

    const { default: ThemeDetailView } = await import('../ThemeDetailView');
    renderWithQuery(<ThemeDetailView themeId="th-1" />);

    // Pagina renderiza apesar da MdaReadsSection estourar.
    await waitFor(() => {
      expect(screen.getByTestId('theme-detail-name').textContent).toMatch(
        /C-Bet em Heads-Up/i,
      );
    });
    // O fallback leve da MdaReadsSection aparece (texto de erro discreto da secao).
    expect(screen.getByText(/Nao foi possivel carregar os MDAs/i)).toBeInTheDocument();
  });
});
