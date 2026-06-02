/**
 * Sprint home-reform-4 / MEDIUM-6 reviewer.
 *
 * Cobre <ThemeDetailView />:
 *   - Render header (nome + emoji) quando id existe na lista.
 *   - Empty state quando id desconhecido.
 *   - Botao "Iniciar sessao" dispara POST /api/study-sessions com themeId.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  return {
    ...actual,
    apiRequest: (...args: any[]) => mockApiRequest(...args),
  };
});

beforeEach(() => {
  mockNavigate.mockReset();
  mockApiRequest.mockReset();
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
  { id: 'th-2', name: 'BB Defense', color: '#dc2626', emoji: 'B', progress: 10 },
];

describe('<ThemeDetailView /> — render', () => {
  it('renderiza nome do tema quando themeId existe', async () => {
    mockApiRequest.mockResolvedValue(themeFixtures);
    const { default: ThemeDetailView } = await import('../ThemeDetailView');
    renderWithQuery(<ThemeDetailView themeId="th-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('theme-detail-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('theme-detail-name').textContent).toMatch(/C-Bet em Heads-Up/i);
  });

  it('renderiza empty state quando themeId desconhecido', async () => {
    mockApiRequest.mockResolvedValue(themeFixtures);
    const { default: ThemeDetailView } = await import('../ThemeDetailView');
    renderWithQuery(<ThemeDetailView themeId="th-naoexiste" />);
    await waitFor(() => {
      expect(screen.getByTestId('theme-detail-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/Tema nao encontrado/i)).toBeInTheDocument();
  });

  it('botao "Registrar estudo" navega pro form unificado com themeId', async () => {
    mockApiRequest.mockResolvedValue(themeFixtures); // GET /api/study-themes
    const { default: ThemeDetailView } = await import('../ThemeDetailView');
    renderWithQuery(<ThemeDetailView themeId="th-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('theme-detail-start-session')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('theme-detail-start-session'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/estudos/registrar?themeId=th-1');
    });
    // Nao cria mais sessao legacy via POST.
    const postCalls = mockApiRequest.mock.calls.filter(
      (args) => args[0] === 'POST' && typeof args[1] === 'string' && args[1].includes('/api/study-sessions'),
    );
    expect(postCalls.length).toBe(0);
  });
});
