import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): WeeklyFocusBlock (RF-06, RF-22, T-10)
//
// Contrato:
//   <WeeklyFocusBlock onAdvance={(payload) => void} />
//
// Comportamento:
//   - Le user_settings.weeklyHeuristics via React Query.
//   - Se vazio: exibe 3 inputs editaveis + botao "Salvar heurísticas da semana".
//   - Se preenchido: exibe lista + toggle "Li em voz alta".
//   - Avancar permite com toggle marcado (ou sem marcar — toggle nao-bloqueante).
//   - PUT /api/user-settings/weekly-heuristics quando salva.
//
// Status: red phase.
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';
import { WeeklyFocusBlock } from '@/components/warmup/WeeklyFocusBlock';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WeeklyFocusBlock - render', () => {
  it('exibe titulo "Foco da semana"', async () => {
    (apiRequest as any).mockResolvedValue({ weeklyHeuristics: ['h1', 'h2', 'h3'] });
    render(withClient(<WeeklyFocusBlock onAdvance={() => {}} />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/foco da semana/i);
    });
  });

  it('exibe instrucao "Em voz alta se ajudar a fixar" (spec 9.2)', async () => {
    (apiRequest as any).mockResolvedValue({ weeklyHeuristics: ['h1', 'h2', 'h3'] });
    render(withClient(<WeeklyFocusBlock onAdvance={() => {}} />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/voz alta/i);
    });
  });
});

describe('WeeklyFocusBlock - heuristicas existentes', () => {
  it('exibe as 3 heuristicas quando user_settings.weeklyHeuristics nao-null', async () => {
    (apiRequest as any).mockResolvedValue({
      weeklyHeuristics: [
        'BB vs BTN 25bb defender 58%',
        '3betar 11% polarizado',
        'fold abaixo de Q7o',
      ],
    });

    render(withClient(<WeeklyFocusBlock onAdvance={() => {}} />));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/BB vs BTN 25bb/);
      expect(document.body.textContent).toMatch(/3betar 11%/);
      expect(document.body.textContent).toMatch(/Q7o/);
    });
  });

  it('toggle "Li em voz alta" presente', async () => {
    (apiRequest as any).mockResolvedValue({
      weeklyHeuristics: ['h1', 'h2', 'h3'],
    });
    render(withClient(<WeeklyFocusBlock onAdvance={() => {}} />));

    await waitFor(() => {
      expect(screen.getByTestId('weekly-focus-read-aloud')).toBeTruthy();
    });
  });
});

describe('WeeklyFocusBlock - heuristicas vazias (modo edicao)', () => {
  it('exibe inputs editaveis quando weeklyHeuristics=null', async () => {
    (apiRequest as any).mockResolvedValue({ weeklyHeuristics: null });

    render(withClient(<WeeklyFocusBlock onAdvance={() => {}} />));

    await waitFor(() => {
      expect(screen.getByTestId('weekly-focus-input-1')).toBeTruthy();
      expect(screen.getByTestId('weekly-focus-input-2')).toBeTruthy();
      expect(screen.getByTestId('weekly-focus-input-3')).toBeTruthy();
    });
  });

  it('botao "Salvar heurísticas da semana" presente', async () => {
    (apiRequest as any).mockResolvedValue({ weeklyHeuristics: null });

    render(withClient(<WeeklyFocusBlock onAdvance={() => {}} />));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /salvar heur[ií]sticas/i }),
      ).toBeTruthy();
    });
  });

  it('clicar em salvar faz PUT /api/user-settings/weekly-heuristics', async () => {
    (apiRequest as any)
      .mockResolvedValueOnce({ weeklyHeuristics: null })
      .mockResolvedValueOnce({ heuristics: ['n1', 'n2', 'n3'] });

    render(withClient(<WeeklyFocusBlock onAdvance={() => {}} />));

    await waitFor(() => {
      expect(screen.getByTestId('weekly-focus-input-1')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('weekly-focus-input-1'), { target: { value: 'n1' } });
    fireEvent.change(screen.getByTestId('weekly-focus-input-2'), { target: { value: 'n2' } });
    fireEvent.change(screen.getByTestId('weekly-focus-input-3'), { target: { value: 'n3' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar heur[ií]sticas/i }));

    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const putCall = calls.find((args: any[]) =>
        JSON.stringify(args).includes('weekly-heuristics'),
      );
      expect(putCall).toBeTruthy();
    });
  });
});

describe('WeeklyFocusBlock - avancar', () => {
  it('clicar em "Próximo" chama onAdvance com payload do bloco', async () => {
    (apiRequest as any).mockResolvedValue({
      weeklyHeuristics: ['h1', 'h2', 'h3'],
    });
    const onAdvance = vi.fn();
    render(withClient(<WeeklyFocusBlock onAdvance={onAdvance} />));

    await waitFor(() => {
      expect(screen.getByTestId('weekly-focus-advance')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('weekly-focus-advance'));
    expect(onAdvance).toHaveBeenCalled();
    const payload = onAdvance.mock.calls[0][0];
    expect(payload).toBeDefined();
    expect(payload.heuristicsSnapshot).toBeDefined();
  });
});
