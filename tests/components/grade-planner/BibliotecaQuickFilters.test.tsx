/**
 * BibliotecaQuickFilters — chips multi-select de plataforma.
 *
 * Sprint biblioteca-enrich: chips de dia-da-semana (Seg-Dom + "Hoje") foram
 * removidos. Este arquivo cobre apenas os chips de plataforma.
 *
 * Componente: client/src/components/grade-planner/BibliotecaQuickFilters.tsx.
 * Props: platforms?, filterSites, onFilterSitesChange.
 *
 * Lessons: #2 (testIds canonicos), #14 (await import).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => []),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Mock usePlatformsByPopularity para fornecer ordem custom (sem RT load).
vi.mock('@/hooks/usePlatformsByPopularity', () => ({
  usePlatformsByPopularity: () => ({
    sites: ['PokerStars', 'GGPoker', 'WPN', 'PartyPoker', '888poker',
            'iPoker', 'CoinPoker', 'Chico', 'Bodog', 'Suprema', 'Revolution'],
    isLoading: false,
  }),
}));

async function loadComponent() {
  const mod: any = await import('@/components/grade-planner/BibliotecaQuickFilters');
  return mod.BibliotecaQuickFilters as React.FC<any>;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FALLBACK_PLATFORMS = [
  'PokerStars', 'GGPoker', 'WPN', 'PartyPoker', '888poker',
  'iPoker', 'CoinPoker', 'Chico', 'Bodog', 'Suprema', 'Revolution',
];

function siteSlug(site: string): string {
  return site.toLowerCase().replace(/\s+/g, '-');
}

describe('BibliotecaQuickFilters — chips plataforma', () => {
  it('renderiza container biblioteca-quick-filters-platforms', async () => {
    const Comp = await loadComponent();
    render(<Comp filterSites={[]} onFilterSitesChange={vi.fn()} />);
    expect(screen.getByTestId('biblioteca-quick-filters-platforms')).toBeInTheDocument();
  });

  it('renderiza chips com testId canonico (slug lowercase)', async () => {
    const Comp = await loadComponent();
    render(<Comp filterSites={[]} onFilterSitesChange={vi.fn()} />);
    for (const site of FALLBACK_PLATFORMS) {
      expect(
        screen.getByTestId(`biblioteca-quick-filter-platform-${siteSlug(site)}`),
      ).toBeInTheDocument();
    }
  });

  it('chip plataforma usa aria-pressed=false quando nao selecionado', async () => {
    const Comp = await loadComponent();
    render(<Comp filterSites={[]} onFilterSitesChange={vi.fn()} />);
    const chip = screen.getByTestId('biblioteca-quick-filter-platform-pokerstars');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('chip plataforma usa aria-pressed=true quando selecionado', async () => {
    const Comp = await loadComponent();
    render(<Comp filterSites={['PokerStars']} onFilterSitesChange={vi.fn()} />);
    const chip = screen.getByTestId('biblioteca-quick-filter-platform-pokerstars');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('click em chip toggla site no array (add)', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();
    render(<Comp filterSites={[]} onFilterSitesChange={onChange} />);
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-platform-pokerstars'));
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toContain('PokerStars');
  });

  it('click em chip toggla site no array (remove)', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();
    render(<Comp filterSites={['PokerStars']} onFilterSitesChange={onChange} />);
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-platform-pokerstars'));
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).not.toContain('PokerStars');
  });

  it('multi-select: 2 chips ativos coexistem (sites contem ambos)', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();
    render(<Comp filterSites={['PokerStars']} onFilterSitesChange={onChange} />);
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-platform-ggpoker'));
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toEqual(expect.arrayContaining(['PokerStars', 'GGPoker']));
  });
});

describe('BibliotecaQuickFilters — prop platforms (override)', () => {
  it('respeita ordem fornecida em prop platforms', async () => {
    const Comp = await loadComponent();
    const customOrder = ['CoinPoker', 'WPN', 'PokerStars'];
    render(<Comp platforms={customOrder} filterSites={[]} onFilterSitesChange={vi.fn()} />);
    const container = screen.getByTestId('biblioteca-quick-filters-platforms');
    const chips = container.querySelectorAll('[data-testid^="biblioteca-quick-filter-platform-"]');
    expect(chips[0].getAttribute('data-testid')).toBe('biblioteca-quick-filter-platform-coinpoker');
    expect(chips[1].getAttribute('data-testid')).toBe('biblioteca-quick-filter-platform-wpn');
    expect(chips[2].getAttribute('data-testid')).toBe('biblioteca-quick-filter-platform-pokerstars');
  });

  it('prop platforms vazia cai no fallback do hook', async () => {
    const Comp = await loadComponent();
    render(<Comp filterSites={[]} onFilterSitesChange={vi.fn()} />);
    expect(screen.getByTestId('biblioteca-quick-filter-platform-pokerstars')).toBeInTheDocument();
  });
});

describe('BibliotecaQuickFilters — dia-da-semana removido', () => {
  it('NAO renderiza container de dias nem chip "Hoje"', async () => {
    const Comp = await loadComponent();
    render(<Comp filterSites={[]} onFilterSitesChange={vi.fn()} />);
    expect(screen.queryByTestId('biblioteca-quick-filters-days')).not.toBeInTheDocument();
    expect(screen.queryByTestId('biblioteca-quick-filter-day-today')).not.toBeInTheDocument();
    for (let dow = 0; dow <= 6; dow++) {
      expect(screen.queryByTestId(`biblioteca-quick-filter-day-${dow}`)).not.toBeInTheDocument();
    }
  });
});

describe('BibliotecaQuickFilters — a11y (roles)', () => {
  it('container plataformas tem role=group + aria-label', async () => {
    const Comp = await loadComponent();
    render(<Comp filterSites={[]} onFilterSitesChange={vi.fn()} />);
    const container = screen.getByTestId('biblioteca-quick-filters-platforms');
    expect(container.getAttribute('role')).toBe('group');
    expect(container.getAttribute('aria-label')).toBeTruthy();
  });
});
