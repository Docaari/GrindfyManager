import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// SelectorCard — testes RTL reais (Sprint 1 ressalva 1, fechada UX-2 2026-04-25)
//
// Cobre subset estrategico de 12 cenarios do todo-list em SelectorCard.test.ts:
// - 5 de "render basico"
// - 4 de "warnings"
// - 3 de "botoes" (happy paths)
//
// Os demais it.todo (acessibilidade, modal, panel-only) ficam no .test.ts
// original ate haver demanda especifica.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { SelectorCard } from '../../../client/src/components/tournament-selector/SelectorCard';
import type { SelectorTournament } from '../../../shared/scoring';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeTournament(overrides: Partial<SelectorTournament> = {}): SelectorTournament {
  return {
    id: 'lib-1',
    source: 'library',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: 22,
    buyInUSD: 22,
    category: 'Vanilla',
    speed: 'Normal',
    dayOfWeek: 0,
    time: '20:00',
    fieldSizeEstimate: 5000,
    score: 75,
    grade: 'A',
    confidence: 'high',
    rationale: 'Forte ROI em PokerStars + Vanilla',
    signals: {
      siteRoi: { value: 25, sample: 200, score: 75, weight: 0.2 },
      buyInRoi: { value: 20, sample: 150, score: 70, weight: 0.18 },
      categoryRoi: { value: 22, sample: 180, score: 73, weight: 0.18 },
      speedRoi: { value: 15, sample: 100, score: 65, weight: 0.14 },
      dayOfWeekRoi: { value: 18, sample: 50, score: 68, weight: 0.1 },
      timeOfDayRoi: { value: 20, sample: 60, score: 70, weight: 0.1 },
      fieldRoi: { value: 17, sample: 80, score: 67, weight: 0.1 },
    },
    warnings: [],
    bankrollOk: true,
    alreadyInGrid: false,
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Render basico
// ===========================================================================

describe('SelectorCard - render basico', () => {
  it('renderiza badge de grade colorida', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ grade: 'A' })} />));
    const badge = screen.getByTestId('selector-card-grade-badge');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('aria-label')).toContain('A');
  });

  it('renderiza score grande no topo', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ score: 87 })} />));
    expect(screen.getByText('87')).toBeTruthy();
  });

  it('renderiza nome, horario, site, buy-in', () => {
    render(withClient(<SelectorCard tournament={makeTournament({
      name: 'Big Million Sunday',
      site: 'PokerStars',
      time: '21:00',
      buyIn: 109,
    })} />));
    expect(screen.getByTestId('selector-card-name').textContent).toBe('Big Million Sunday');
    expect(screen.getByTestId('selector-card-buyin').textContent).toContain('109');
    expect(screen.getByText('PokerStars')).toBeTruthy();
    expect(screen.getByText('21:00')).toBeTruthy();
  });

  it('renderiza rationale', () => {
    render(withClient(<SelectorCard tournament={makeTournament({
      rationale: 'Excelente match com seu historico',
    })} />));
    expect(screen.getByTestId('selector-card-rationale').textContent).toBe('Excelente match com seu historico');
  });

  it('renderiza badge de confidence', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ confidence: 'medium' })} />));
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toMatch(/Media/i);
  });
});

// ===========================================================================
// Warnings
// ===========================================================================

describe('SelectorCard - warnings', () => {
  it('warning bankrollOk=false renderiza badge', () => {
    render(withClient(<SelectorCard
      tournament={makeTournament({ bankrollOk: false })}
      bankrollHardLimitUSD={15}
    />));
    expect(screen.getByTestId('warn-bankroll')).toBeTruthy();
  });

  it('warning unfamiliar_site renderiza badge', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ warnings: ['unfamiliar_site'] })} />));
    expect(screen.getByTestId('warn-site').textContent).toMatch(/Site novo/i);
  });

  it('warning never_played_category renderiza badge', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ warnings: ['never_played_category'] })} />));
    expect(screen.getByTestId('warn-category').textContent).toMatch(/Categoria nunca jogada/i);
  });

  it('warning low_sample renderiza badge', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ warnings: ['low_sample'] })} />));
    expect(screen.getByTestId('warn-sample').textContent).toMatch(/Baixa amostra/i);
  });

  it('sem warnings, sem badges (exceto confidence sempre presente)', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ warnings: [], bankrollOk: true })} />));
    expect(screen.queryByTestId('warn-bankroll')).toBeNull();
    expect(screen.queryByTestId('warn-site')).toBeNull();
    expect(screen.queryByTestId('warn-category')).toBeNull();
    expect(screen.queryByTestId('warn-sample')).toBeNull();
    expect(screen.queryByTestId('confidence-badge')).toBeTruthy();
  });
});

// ===========================================================================
// Botoes (happy paths)
// ===========================================================================

describe('SelectorCard - botoes', () => {
  it('botao "Adicionar a grade" dispara mutation com metadata.fromSelector=true', async () => {
    (apiRequest as any).mockResolvedValue({ success: true });
    render(withClient(<SelectorCard tournament={makeTournament()} />));

    const button = screen.getByRole('button', { name: /Adicionar a grade/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });
    const call = (apiRequest as any).mock.calls[0];
    // assinatura real: (method, url, data)
    expect(call[0]).toBe('POST');
    expect(call[1]).toContain('/api/planned-tournaments');
    expect(call[2]).toMatchObject({
      metadata: expect.objectContaining({ fromSelector: true }),
    });
  });

  it('alreadyInGrid=true: botao desabilitado com texto "Ja na grade"', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ alreadyInGrid: true })} />));
    const button = screen.getByRole('button', { name: /Ja na grade/i });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('botao "Detalhes" dispara onOpenDetails callback', () => {
    const onOpen = vi.fn();
    const tournament = makeTournament();
    render(withClient(<SelectorCard tournament={tournament} onOpenDetails={onOpen} />));

    const detailsBtn = screen.getByRole('button', { name: /Detalhes/i });
    fireEvent.click(detailsBtn);

    expect(onOpen).toHaveBeenCalledWith(tournament);
  });
});
