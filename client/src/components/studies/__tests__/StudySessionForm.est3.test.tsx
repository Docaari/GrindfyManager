/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 RF-08
 *
 * Form de registro UNIFICADO — campos condicionais por mode.
 * Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-08)
 * ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md
 * Diagrama: Docs/architecture/diagrams/est-3/component-tree.mermaid
 *
 * Componente NOVO (red phase): client/src/components/studies/StudySessionForm.tsx
 *
 * Contrato de data-testid (lesson #2 — estaveis):
 *   - study-session-form               (root)
 *   - study-session-mode-select        (seletor de mode)
 *   - stat-analysis-block              (bloco condicional mode=stat_analysis)
 *   - stat-analysis-stat-id            (stat pre-preenchida, read-only)
 *   - stat-analysis-add-play           (botao "adicionar jogada")
 *   - play-entry-row-{index}           (cada jogada)
 *   - play-entry-error-{index} / play-entry-learned-{index}
 *   - enriched-fields-block            (bloco campos B — qualquer mode)
 *   - field-hands-solved / field-filters-analyzed / field-lesson-insights
 *
 * Lessons: #14/#26/#38 await import (nunca require); #27 Radix tabs -> userEvent.click;
 * #29 useQuery isolado por QueryClientProvider.
 *
 * NOTA red phase: o modulo StudySessionForm AINDA NAO EXISTE. Vite resolve
 * `await import('../StudySessionForm')` em build-time e quebraria a suite inteira
 * ("Failed to resolve import"). Usamos indirecao via variavel + `@vite-ignore`
 * (lesson session mini-player-1.2) para que cada `it` rode e falhe em RUNTIME
 * por modulo ausente — red legitimo. O implementer remove o `@vite-ignore` /
 * usa import direto quando o arquivo existir.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/estudos/registrar', mockNavigate],
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
  mockApiRequest.mockResolvedValue({ id: 'sess_NEW' });
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Indirecao para evitar resolucao estatica do Vite (modulo nao existe em red phase).
async function loadForm(): Promise<any> {
  const p = '../StudySessionForm';
  const mod = await import(/* @vite-ignore */ p);
  return mod.default;
}

describe('EST-3 StudySessionForm — bloco condicional por mode (RF-08)', () => {
  it('renderiza o root do form', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm />);
    await waitFor(() => {
      expect(screen.getByTestId('study-session-form')).toBeInTheDocument();
    });
  });

  it('mostra stat-analysis-block quando mode=stat_analysis (statId+themeId pre-preenchidos)', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(
      <StudySessionForm initialMode="stat_analysis" statId="vpip" themeId="theme_1" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('stat-analysis-block')).toBeInTheDocument();
    });
    // stat pre-preenchida exibida
    expect(screen.getByTestId('stat-analysis-stat-id').textContent).toMatch(/vpip|VPIP/i);
  });

  it('NAO mostra stat-analysis-block quando mode=lesson', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="lesson" lessonId="lesson_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('study-session-form')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('stat-analysis-block')).not.toBeInTheDocument();
  });

  it('mostra enriched-fields-block (campos B) em qualquer modo', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="drill_gto" themeId="theme_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('enriched-fields-block')).toBeInTheDocument();
    });
    expect(screen.getByTestId('field-hands-solved')).toBeInTheDocument();
    expect(screen.getByTestId('field-filters-analyzed')).toBeInTheDocument();
  });

  it('lessonInsights so aparece quando lessonId presente', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="lesson" lessonId="lesson_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('field-lesson-insights')).toBeInTheDocument();
    });
  });
});

describe('EST-3 StudySessionForm — jogadas (até 10, RF-08)', () => {
  it('permite adicionar jogadas via stat-analysis-add-play', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="stat_analysis" statId="vpip" themeId="theme_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-analysis-add-play')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('stat-analysis-add-play'));
    expect(screen.getByTestId('play-entry-row-0')).toBeInTheDocument();
  });

  it('bloqueia a 11a jogada (cap 10)', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="stat_analysis" statId="vpip" themeId="theme_1" />);
    const addBtn = await screen.findByTestId('stat-analysis-add-play');
    for (let i = 0; i < 10; i++) {
      await userEvent.click(addBtn);
    }
    // 10 rows presentes
    expect(screen.getByTestId('play-entry-row-9')).toBeInTheDocument();
    // botao desabilitado OU a 11a row nao aparece
    await userEvent.click(addBtn).catch(() => {});
    expect(screen.queryByTestId('play-entry-row-10')).not.toBeInTheDocument();
  });

  it('cada jogada tem campos erro + aprendizado', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="stat_analysis" statId="vpip" themeId="theme_1" />);
    const addBtn = await screen.findByTestId('stat-analysis-add-play');
    await userEvent.click(addBtn);
    expect(screen.getByTestId('play-entry-error-0')).toBeInTheDocument();
    expect(screen.getByTestId('play-entry-learned-0')).toBeInTheDocument();
  });
});
