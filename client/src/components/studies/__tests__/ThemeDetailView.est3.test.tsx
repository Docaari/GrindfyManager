/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 RF-08 surface 1 + 2
 *
 * ThemeDetailView ganha:
 *   - botao "Analisar esta stat" por stat foco linkada (surface 1) -> navega para
 *     o form unificado em mode stat_analysis com statId+themeId pre-preenchidos.
 *   - embute StatAnalysisReviewList (surface 2) — lista entradas agrupadas por stat.
 *
 * Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-08)
 *
 * Contrato data-testid (lesson #2):
 *   - analyze-stat-button-{statId}    (CTA por stat)
 *   - theme-stat-analysis-review      (embed do review list)
 *
 * NOTA: ThemeDetailView ja existe; estes testes cobrem ADIÇÕES EST-3. Devem
 * falhar (red) ate o implementer wirar o CTA + review list.
 *
 * Lessons: #14/#26/#38 await import; #29 QueryClientProvider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/estudos/temas/theme_1', mockNavigate],
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return { ...actual, apiRequest: (...args: any[]) => mockApiRequest(...args) };
});

beforeEach(() => {
  mockNavigate.mockReset();
  mockApiRequest.mockReset();
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Tema com uma stat foco linkada (vpip) + stats-summary com a stat.
function wireApi() {
  mockApiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url === '/api/study-themes') {
      return [{ id: 'theme_1', name: 'BB Defense', linkedStats: ['vpip'] }];
    }
    if (url.includes('/stats-summary')) {
      return { themeId: 'theme_1', stats: [{ statId: 'vpip', label: 'VPIP', groupId: 'basics', groupLabel: 'Basicos', currentValue: 22, targetMin: 20, targetMax: 25, direction: 'context', unit: 'pct', sparkline30d: [] }] };
    }
    if (url.includes('/api/study-sessions/stat-analysis')) {
      return [];
    }
    return null;
  });
}

describe('EST-3 ThemeDetailView — "Analisar esta stat" (surface 1)', () => {
  it('renderiza CTA analyze-stat-button por stat foco linkada', async () => {
    wireApi();
    const { default: ThemeDetailView } = await import('../ThemeDetailView');
    renderWithQuery(<ThemeDetailView themeId="theme_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('theme-detail-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('analyze-stat-button-vpip')).toBeInTheDocument();
  });

  it('CTA navega para o form em mode stat_analysis com statId+themeId', async () => {
    wireApi();
    const { default: ThemeDetailView } = await import('../ThemeDetailView');
    renderWithQuery(<ThemeDetailView themeId="theme_1" />);
    const btn = await screen.findByTestId('analyze-stat-button-vpip');
    await userEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalled();
    const target = String(mockNavigate.mock.calls[0][0]);
    expect(target).toMatch(/stat_analysis|stat-analysis/);
    expect(target).toContain('statId=vpip');
    expect(target).toContain('themeId=theme_1');
  });
});

describe('EST-3 ThemeDetailView — embed review list (surface 2)', () => {
  it('renderiza theme-stat-analysis-review (lista por stat)', async () => {
    wireApi();
    const { default: ThemeDetailView } = await import('../ThemeDetailView');
    renderWithQuery(<ThemeDetailView themeId="theme_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('theme-stat-analysis-review')).toBeInTheDocument();
    });
  });
});
