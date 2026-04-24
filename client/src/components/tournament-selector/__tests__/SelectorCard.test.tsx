import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectorCard } from '../SelectorCard';
import type { SelectorTournament } from '../../../../../shared/scoring';

// =============================================================================
// SelectorCard tests (RF-04 frontend)
// =============================================================================

vi.mock('../../../lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../../../lib/queryClient';

function makeTournament(overrides: Partial<SelectorTournament> = {}): SelectorTournament {
  return {
    id: 't1',
    source: 'suprema',
    name: 'Mystery KO #1',
    site: 'Suprema',
    buyIn: 22,
    time: '22:00',
    dayOfWeek: 4,
    category: 'PKO',
    speed: 'Turbo',
    fieldSizeEstimate: 280,
    score: 87,
    grade: 'S',
    confidence: 'high',
    rationale: 'ROI 18% em PKO (87 amostras, 90d).',
    signals: {
      siteRoi: { value: 14, sample: 120, weight: 0.20, score: 78 },
      buyInRoi: { value: 16.8, sample: 134, weight: 0.20, score: 80 },
      categoryRoi: { value: 18, sample: 87, weight: 0.20, score: 84 },
      speedRoi: { value: 9, sample: 90, weight: 0.10, score: 65 },
      dayOfWeekRoi: { value: 22, sample: 78, weight: 0.10, score: 88 },
      timeOfDayRoi: { value: 21, sample: 102, weight: 0.15, score: 86 },
      fieldRoi: { value: 11, sample: 188, weight: 0.05, score: 70 },
    },
    warnings: [],
    bankrollOk: true,
    alreadyInGrid: false,
    ...overrides,
  };
}

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SelectorCard - render basico', () => {
  it('renderiza score, grade, nome, site, buy-in e rationale', () => {
    render(withClient(<SelectorCard tournament={makeTournament()} />));
    expect(screen.getByTestId('selector-card-name').textContent).toContain('Mystery KO #1');
    expect(screen.getByTestId('selector-card-buyin').textContent).toContain('22');
    expect(screen.getByTestId('selector-card-rationale').textContent).toContain('PKO');
    const badge = screen.getByTestId('selector-card-grade-badge');
    expect(badge.textContent).toContain('87');
    expect(badge.textContent).toContain('S');
  });
});

describe('SelectorCard - alreadyInGrid disabled', () => {
  it('botao mostra "Ja na grade" e fica disabled quando alreadyInGrid=true', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ alreadyInGrid: true })} />));
    const btn = screen.getByTestId('selector-card-add-button');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.textContent).toContain('Ja na grade');
  });
});

describe('SelectorCard - add to grid mutation', () => {
  it('clicar "Adicionar a grade" chama apiRequest com metadata.fromSelector=true e metadata.selectorScore', async () => {
    (apiRequest as any).mockResolvedValue({ id: 'planned-1' });

    render(withClient(<SelectorCard tournament={makeTournament()} />));
    const btn = screen.getByTestId('selector-card-add-button');
    await userEvent.click(btn);

    expect(apiRequest).toHaveBeenCalled();
    const [method, url, body] = (apiRequest as any).mock.calls[0];
    expect(method).toBe('POST');
    expect(url).toBe('/api/planned-tournaments');
    expect(body.metadata.fromSelector).toBe(true);
    expect(body.metadata.selectorScore).toBe(87);
    expect(body.metadata.selectorGrade).toBe('S');
    // libraryTemplateId nulo para Suprema
    expect(body.libraryTemplateId).toBeNull();
    // externalId preenchido para Suprema
    expect(body.externalId).toBe('t1');
  });

  it('Library source: libraryTemplateId preenchido, externalId null', async () => {
    (apiRequest as any).mockResolvedValue({ id: 'planned-2' });
    render(withClient(<SelectorCard tournament={makeTournament({ source: 'library' })} />));
    await userEvent.click(screen.getByTestId('selector-card-add-button'));
    const [, , body] = (apiRequest as any).mock.calls[0];
    expect(body.libraryTemplateId).toBe('t1');
    expect(body.externalId).toBeNull();
  });
});

describe('SelectorCard - warnings', () => {
  it('bankrollOk=false mostra badge "Fora do bankroll"', () => {
    render(withClient(<SelectorCard tournament={makeTournament({ bankrollOk: false })} />));
    expect(screen.getByTestId('warn-bankroll').textContent).toContain('Fora do bankroll');
  });
  it('warnings unfamiliar_site, never_played_category, low_sample renderizam badges proprios', () => {
    render(withClient(<SelectorCard tournament={makeTournament({
      warnings: ['unfamiliar_site', 'never_played_category', 'low_sample'],
    })} />));
    expect(screen.getByTestId('warn-site')).toBeTruthy();
    expect(screen.getByTestId('warn-category')).toBeTruthy();
    expect(screen.getByTestId('warn-sample')).toBeTruthy();
  });
});

describe('SelectorCard - acessibilidade', () => {
  it('grade badge tem aria-label com texto + grade', () => {
    render(withClient(<SelectorCard tournament={makeTournament()} />));
    const badge = screen.getByTestId('selector-card-grade-badge');
    const aria = badge.getAttribute('aria-label') ?? '';
    expect(aria).toContain('S');
    expect(aria.toLowerCase()).toContain('grade');
  });
});
