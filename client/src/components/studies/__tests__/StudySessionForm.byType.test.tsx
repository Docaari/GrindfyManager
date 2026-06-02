/**
 * Sprint Estudos-WS-Fix — campos do form mudam por tipo de estudo.
 *
 * Gap reportado pelo founder: "ao registrar um estudo os campos a serem
 * preenchidos devem mudar de acordo ao tipo de estudo". Antes do fix o
 * StudySessionForm so variava o bloco stat_analysis; os outros 5 tipos
 * mostravam os mesmos 2 campos genericos + sem input de duracao.
 *
 * Aditivo ao EST-3 (RF-08): mantem enriched-fields-block + field-hands-solved
 * + field-filters-analyzed; ADICIONA duracao/notas (qualquer modo) + blocos
 * especificos por modo (drill_gto -> plataforma+precisao; review -> spots
 * dificeis).
 *
 * Lessons: #14/#26/#38 await import; #2 data-testid estaveis.
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

async function loadForm(): Promise<any> {
  const mod = await import('../StudySessionForm');
  return mod.default;
}

describe('StudySessionForm — campos comuns sempre presentes', () => {
  it('mostra input de duracao em qualquer modo', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="other" />);
    await waitFor(() => {
      expect(screen.getByTestId('field-duration')).toBeInTheDocument();
    });
  });

  it('mostra campo de notas em qualquer modo', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="other" />);
    await waitFor(() => {
      expect(screen.getByTestId('field-notes')).toBeInTheDocument();
    });
  });
});

describe('StudySessionForm — blocos especificos por tipo', () => {
  it('drill_gto: mostra plataforma + precisao (e nao spots dificeis)', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="drill_gto" />);
    await waitFor(() => {
      expect(screen.getByTestId('field-drill-platform')).toBeInTheDocument();
    });
    expect(screen.getByTestId('field-drill-accuracy')).toBeInTheDocument();
    expect(screen.queryByTestId('difficult-spots-block')).not.toBeInTheDocument();
  });

  it('hand_review: mostra spots dificeis (e nao plataforma de drill)', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="hand_review" />);
    await waitFor(() => {
      expect(screen.getByTestId('difficult-spots-block')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('field-drill-platform')).not.toBeInTheDocument();
  });

  it('tournament_review: mostra spots dificeis', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="tournament_review" />);
    await waitFor(() => {
      expect(screen.getByTestId('difficult-spots-block')).toBeInTheDocument();
    });
  });

  it('trocar o tipo no select troca os campos exibidos', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="drill_gto" />);
    await waitFor(() => {
      expect(screen.getByTestId('field-drill-platform')).toBeInTheDocument();
    });
    await userEvent.selectOptions(
      screen.getByTestId('study-session-mode-select'),
      'hand_review',
    );
    await waitFor(() => {
      expect(screen.getByTestId('difficult-spots-block')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('field-drill-platform')).not.toBeInTheDocument();
  });
});

describe('StudySessionForm — submit inclui campos por tipo', () => {
  it('drill_gto envia drillPlatform + drillAccuracy quando preenchidos', async () => {
    const StudySessionForm = await loadForm();
    renderWithQuery(<StudySessionForm initialMode="drill_gto" />);
    const platform = await screen.findByTestId('field-drill-platform');
    const accuracy = await screen.findByTestId('field-drill-accuracy');
    await userEvent.clear(accuracy);
    await userEvent.type(accuracy, '85');
    await userEvent.selectOptions(platform, 'gtowizard');
    await userEvent.click(screen.getByTestId('study-session-submit'));
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
    // O form agora carrega temas (GET /api/study-themes) no mount via apiRequest,
    // entao a chamada de submit nao e mais necessariamente calls[0] — localiza o POST.
    const postCall = mockApiRequest.mock.calls.find(
      (c: any) => c[0] === 'POST' && c[1] === '/api/study-sessions',
    );
    const payload = postCall?.[2];
    expect(payload.drillPlatform).toBe('gtowizard');
    expect(payload.drillAccuracy).toBe(85);
  });
});
