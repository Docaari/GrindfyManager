/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 RF-08 surfaces
 *
 * Surfaces "Analisar esta stat" + review por stat + session detail.
 * Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-08 surfaces 1/2/3)
 * ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md (D-1/D-7)
 * Diagrama: Docs/architecture/diagrams/est-3/component-tree.mermaid
 *
 * Componentes NET-NEW / surfaces (red phase):
 *   - StatAnalysisReviewList (lista entradas agrupadas por stat — consome RF-07)
 *   - SessaoDetailPage /estudos/sessao/:id (entries + counts — RF-08 surface 3)
 *   - Botao "Analisar esta stat" em StatsView/ThemeDetailView (surface 1)
 *
 * Contrato data-testid (lesson #2):
 *   - analyze-stat-button            (surface 1; abre form stat_analysis)
 *   - stat-analysis-review-list      (surface 2; root)
 *   - stat-analysis-review-group-{statId}
 *   - stat-analysis-entry-count-{statId}
 *   - session-detail-page            (surface 3; root)
 *   - session-detail-entry-{entryId}
 *   - session-detail-hands-solved / session-detail-filters-analyzed
 *
 * Lessons: #14/#26/#38 await import; #29 useQuery isolado por QueryClientProvider/ErrorBoundary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/estudos', mockNavigate],
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
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

// Indirecao para evitar resolucao estatica do Vite (modulos nao existem em red phase).
// Cada `it` falha em RUNTIME por modulo ausente — red legitimo. O implementer
// troca por import direto quando os arquivos existirem.
async function loadDefault(p: string): Promise<any> {
  const mod = await import(/* @vite-ignore */ p);
  return mod.default;
}

// =============================================================================
// Surface 2 — StatAnalysisReviewList (consome RF-07 — grupos por stat)
// =============================================================================

describe('EST-3 StatAnalysisReviewList — agrupado por stat (RF-07/RF-08 surface 2)', () => {
  const reviewGroups = [
    {
      statId: 'vpip',
      entryCount: 3,
      sessions: [
        {
          sessionId: 'sess_A', registeredAt: '2026-06-02T00:00:00.000Z', durationMinutes: 30,
          entries: [
            { id: 'a1', filters: 'BTN vs BB', errorText: 'erro', learnedText: 'aprendi', playImageUrl: '/api/study-sessions/sess_A/stat-analysis/entries/a1/image/play', solutionImageUrl: null },
          ],
        },
      ],
    },
    {
      statId: 'pfr',
      entryCount: 1,
      sessions: [
        {
          sessionId: 'sess_C', registeredAt: '2026-06-01T00:00:00.000Z', durationMinutes: 20,
          entries: [
            { id: 'c1', filters: 'CO vs BTN', errorText: 'e', learnedText: 'l', playImageUrl: null, solutionImageUrl: null },
          ],
        },
      ],
    },
  ];

  it('renderiza um grupo por statId com entryCount', async () => {
    mockApiRequest.mockResolvedValue(reviewGroups);
    const StatAnalysisReviewList = await loadDefault('../StatAnalysisReviewList');
    renderWithQuery(<StatAnalysisReviewList themeId="theme_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-analysis-review-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('stat-analysis-review-group-vpip')).toBeInTheDocument();
    expect(screen.getByTestId('stat-analysis-review-group-pfr')).toBeInTheDocument();
    expect(screen.getByTestId('stat-analysis-entry-count-vpip').textContent).toMatch(/3/);
  });

  it('consome GET /api/study-sessions/stat-analysis com themeId', async () => {
    mockApiRequest.mockResolvedValue(reviewGroups);
    const StatAnalysisReviewList = await loadDefault('../StatAnalysisReviewList');
    renderWithQuery(<StatAnalysisReviewList themeId="theme_1" />);
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
    const calledUrls = mockApiRequest.mock.calls.map((c) => String(c[1] ?? c[0]));
    expect(calledUrls.some((u) => u.includes('/api/study-sessions/stat-analysis') && u.includes('themeId=theme_1'))).toBe(true);
  });
});

// =============================================================================
// Surface 3 — SessaoDetailPage (/estudos/sessao/:id)
// =============================================================================

describe('EST-3 SessaoDetailPage — entries + counts (RF-08 surface 3)', () => {
  const session = {
    id: 'sess_1', mode: 'stat_analysis', statId: 'vpip',
    handsSolvedCount: 12, filtersAnalyzedCount: 3,
    statAnalysisEntries: [
      { id: 'e1', filters: 'BTN vs BB', errorText: 'foldei demais', learnedText: 'defender turn',
        playImageUrl: '/api/study-sessions/sess_1/stat-analysis/entries/e1/image/play', solutionImageUrl: null },
    ],
  };

  it('exibe entries da sessao + counts', async () => {
    mockApiRequest.mockResolvedValue(session);
    const SessaoDetailPage = await loadDefault('../SessaoDetailPage');
    renderWithQuery(<SessaoDetailPage sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-detail-entry-e1')).toBeInTheDocument();
    expect(screen.getByTestId('session-detail-hands-solved').textContent).toMatch(/12/);
    expect(screen.getByTestId('session-detail-filters-analyzed').textContent).toMatch(/3/);
  });

  it('consome GET /api/study-sessions/:id', async () => {
    mockApiRequest.mockResolvedValue(session);
    const SessaoDetailPage = await loadDefault('../SessaoDetailPage');
    renderWithQuery(<SessaoDetailPage sessionId="sess_1" />);
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
    const calledUrls = mockApiRequest.mock.calls.map((c) => String(c[1] ?? c[0]));
    expect(calledUrls.some((u) => u.includes('/api/study-sessions/sess_1'))).toBe(true);
  });
});
