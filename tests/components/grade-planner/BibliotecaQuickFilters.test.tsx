/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-05: BibliotecaQuickFilters.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-05.
 * UX audit: Docs/ux-audit-2026-05-07/biblioteca-quick-filters.md.
 *
 * Componente novo `BibliotecaQuickFilters` em
 * client/src/components/grade-planner/BibliotecaQuickFilters.tsx, render
 * acima dos filtros avancados em `BibliotecaPanel`. Aceita props:
 *
 *   - platforms?: string[]      (override de ordem; se ausente, hook calcula)
 *   - filterSites: string[]     (state controlado)
 *   - filterDaysOfWeek: number[]
 *   - onFilterSitesChange(sites)
 *   - onFilterDaysOfWeekChange(days)
 *   - todayDow?: number         (override para testes; se ausente, usa Date)
 *
 * Comportamento:
 *   - Multi-select chip plataforma: aria-pressed + toggle add/remove no array.
 *   - Multi-select chip dia: 7 chips Seg-Dom (1,2,3,4,5,6,0).
 *   - Chip "Hoje": SUBSTITUI seleção por [todayDow] (nao adiciona).
 *   - aria roles: role=group para containers; aria-pressed nos chips.
 *   - Empty state via "Limpar tudo" e logica de filtragem combinada (AND
 *     entre dimensoes plataforma+dia+search; OR dentro de cada).
 *
 * Lessons:
 *   #2 — testIds canonicos.
 *   #14 — await import().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock useQuery / apiRequest se o componente puxar algo internamente.
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
  // @ts-expect-error - red phase: arquivo ainda nao implementado
  const mod: any = await import('@/components/grade-planner/BibliotecaQuickFilters');
  return mod.BibliotecaQuickFilters as React.FC<any>;
}

beforeEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // ok
  }
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
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
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('biblioteca-quick-filters-platforms')).toBeInTheDocument();
  });

  it('renderiza chips com testId canonico (slug lowercase)', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    for (const site of FALLBACK_PLATFORMS) {
      const slug = siteSlug(site);
      expect(screen.getByTestId(`biblioteca-quick-filter-platform-${slug}`)).toBeInTheDocument();
    }
  });

  it('chip plataforma usa aria-pressed=false quando nao selecionado', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    const chip = screen.getByTestId('biblioteca-quick-filter-platform-pokerstars');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('chip plataforma usa aria-pressed=true quando selecionado', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={['PokerStars']}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    const chip = screen.getByTestId('biblioteca-quick-filter-platform-pokerstars');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('click em chip toggla site no array (add)', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={onChange}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-platform-pokerstars'));
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toContain('PokerStars');
  });

  it('click em chip toggla site no array (remove)', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();
    render(
      <Comp
        filterSites={['PokerStars']}
        filterDaysOfWeek={[]}
        onFilterSitesChange={onChange}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-platform-pokerstars'));
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).not.toContain('PokerStars');
  });

  it('multi-select: 2 chips ativos coexistem (sites contem ambos)', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();
    render(
      <Comp
        filterSites={['PokerStars']}
        filterDaysOfWeek={[]}
        onFilterSitesChange={onChange}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-platform-ggpoker'));
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toEqual(expect.arrayContaining(['PokerStars', 'GGPoker']));
  });
});

describe('BibliotecaQuickFilters — prop platforms (override)', () => {
  it('respeita ordem fornecida em prop platforms', async () => {
    const Comp = await loadComponent();
    const customOrder = ['CoinPoker', 'WPN', 'PokerStars'];
    render(
      <Comp
        platforms={customOrder}
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    // O primeiro chip deve ser CoinPoker.
    const container = screen.getByTestId('biblioteca-quick-filters-platforms');
    const chips = container.querySelectorAll('[data-testid^="biblioteca-quick-filter-platform-"]');
    expect(chips[0].getAttribute('data-testid')).toBe('biblioteca-quick-filter-platform-coinpoker');
    expect(chips[1].getAttribute('data-testid')).toBe('biblioteca-quick-filter-platform-wpn');
    expect(chips[2].getAttribute('data-testid')).toBe('biblioteca-quick-filter-platform-pokerstars');
  });

  it('prop platforms vazia cai no fallback do hook (testa override null/undefined)', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    // Sem prop: usa hook mock com fallback global.
    expect(screen.getByTestId('biblioteca-quick-filter-platform-pokerstars')).toBeInTheDocument();
  });
});

describe('BibliotecaQuickFilters — chips dia da semana', () => {
  it('renderiza container biblioteca-quick-filters-days', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('biblioteca-quick-filters-days')).toBeInTheDocument();
  });

  it('renderiza 7 chips de dia (0-6) + 1 chip Hoje', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    for (let dow = 0; dow <= 6; dow++) {
      expect(screen.getByTestId(`biblioteca-quick-filter-day-${dow}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('biblioteca-quick-filter-day-today')).toBeInTheDocument();
  });

  it('chips dia ordem PT-BR (Seg-Dom) — testa por DOM order', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    const container = screen.getByTestId('biblioteca-quick-filters-days');
    // Filtra apenas chips de dia (exclui Hoje).
    const dayChips = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="biblioteca-quick-filter-day-"]')
    ).filter((el) => /biblioteca-quick-filter-day-\d$/.test(el.getAttribute('data-testid') || ''));
    // Ordem esperada: 1, 2, 3, 4, 5, 6, 0 (Seg-Sab + Dom).
    const order = dayChips.map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual([
      'biblioteca-quick-filter-day-1',
      'biblioteca-quick-filter-day-2',
      'biblioteca-quick-filter-day-3',
      'biblioteca-quick-filter-day-4',
      'biblioteca-quick-filter-day-5',
      'biblioteca-quick-filter-day-6',
      'biblioteca-quick-filter-day-0',
    ]);
  });

  it('click em chip dia adiciona ao array filterDaysOfWeek', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-day-3'));
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toContain(3);
  });

  it('chip dia tem aria-pressed quando selecionado', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[3]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    const chip = screen.getByTestId('biblioteca-quick-filter-day-3');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('BibliotecaQuickFilters — chip "Hoje" semantica', () => {
  it('click em "Hoje" SUBSTITUI filterDaysOfWeek por [todayDow]', async () => {
    const Comp = await loadComponent();
    const onChange = vi.fn();

    // Mock Date.now: hoje = quarta-feira (dow=3).
    // 2026-05-06 (Wed) = quarta-feira.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T12:00:00Z'));

    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[1, 5]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={onChange}
        todayDow={3}
      />
    );
    fireEvent.click(screen.getByTestId('biblioteca-quick-filter-day-today'));

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    // Substitui — nao mantem [1,5].
    expect(lastCall).toEqual([3]);
  });

  it('chip "Hoje" tem destaque visual amber (border ou background)', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
        todayDow={3}
      />
    );
    const chip = screen.getByTestId('biblioteca-quick-filter-day-today');
    const className = chip.className || '';
    expect(/amber|orange|yellow/.test(className)).toBe(true);
  });
});

describe('BibliotecaQuickFilters — a11y (roles)', () => {
  it('container plataformas tem role=group + aria-label', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    const container = screen.getByTestId('biblioteca-quick-filters-platforms');
    expect(container.getAttribute('role')).toBe('group');
    expect(container.getAttribute('aria-label')).toBeTruthy();
  });

  it('container dias tem role=group + aria-label', async () => {
    const Comp = await loadComponent();
    render(
      <Comp
        filterSites={[]}
        filterDaysOfWeek={[]}
        onFilterSitesChange={vi.fn()}
        onFilterDaysOfWeekChange={vi.fn()}
      />
    );
    const container = screen.getByTestId('biblioteca-quick-filters-days');
    expect(container.getAttribute('role')).toBe('group');
    expect(container.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('BibliotecaQuickFilters — filterSites/filterDays migration shape', () => {
  it('aceita filterSites como array (nao single string)', async () => {
    const Comp = await loadComponent();
    // Nao deve lancar exception com array vazio.
    expect(() => {
      render(
        <Comp
          filterSites={[]}
          filterDaysOfWeek={[]}
          onFilterSitesChange={vi.fn()}
          onFilterDaysOfWeekChange={vi.fn()}
        />
      );
    }).not.toThrow();
  });
});
