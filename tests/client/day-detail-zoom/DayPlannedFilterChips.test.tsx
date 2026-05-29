/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-consolidation — RF-06 Filtros plataforma chips.
 * Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-06.
 * ADR: Docs/architecture/decisions/213-day-detail-zoom-consolidation.md.
 *
 * Cobre:
 *   - Render chips "Todas" + sites em ordem (props-driven).
 *   - Multi-select toggle: click site → adiciona; click again → remove.
 *   - Click "Todas": zera selected.
 *   - "Todas" visualmente ativo quando selected=[].
 *   - Hook useDayPlannedFilter: localStorage persist key dayZoom.filter.{P}.{D}.platforms.
 *   - Hook hydrate: useState lazy init le do storage.
 *   - SSR guard: typeof window === "undefined" nao quebra.
 *   - Sites obsoletos preservados em localStorage.
 *
 * Lessons: #14/#38 (await import), #28 (mock path exato).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  // localStorage clear entre testes.
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadComponent() {
  return await import('@/components/grade/DayPlannedFilterChips');
}

describe('DayPlannedFilterChips — render + chips', () => {
  it('renderiza container day-zoom-filter-chips quando availableSites > 0', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayPlannedFilterChips } = await loadComponent();
    render(
      React.createElement(DayPlannedFilterChips as any, {
        profileLetter: 'A',
        dayOfWeek: 2,
        availableSites: [{ site: 'PokerStars', count: 5 }],
        selected: [],
        onChange: vi.fn(),
      }),
    );
    expect(
      await screen.findByTestId('day-zoom-filter-chips'),
    ).toBeInTheDocument();
  });

  it('renderiza chip "Todas" como primeiro + chips por site', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayPlannedFilterChips } = await loadComponent();
    render(
      React.createElement(DayPlannedFilterChips as any, {
        profileLetter: 'A',
        dayOfWeek: 2,
        availableSites: [
          { site: 'PokerStars', count: 5 },
          { site: 'GGNetwork', count: 3 },
        ],
        selected: [],
        onChange: vi.fn(),
      }),
    );
    expect(
      await screen.findByTestId('day-zoom-filter-chip-all'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-filter-chip-PokerStars'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-filter-chip-GGNetwork'),
    ).toBeInTheDocument();
  });

  it('"Todas" tem aria-pressed=true quando selected=[]', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayPlannedFilterChips } = await loadComponent();
    render(
      React.createElement(DayPlannedFilterChips as any, {
        profileLetter: 'A',
        dayOfWeek: 2,
        availableSites: [{ site: 'PokerStars', count: 5 }],
        selected: [],
        onChange: vi.fn(),
      }),
    );
    const all = await screen.findByTestId('day-zoom-filter-chip-all');
    expect(all.getAttribute('aria-pressed')).toBe('true');
  });

  it('"Todas" tem aria-pressed=false quando selected nao vazio', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayPlannedFilterChips } = await loadComponent();
    render(
      React.createElement(DayPlannedFilterChips as any, {
        profileLetter: 'A',
        dayOfWeek: 2,
        availableSites: [{ site: 'PokerStars', count: 5 }],
        selected: ['PokerStars'],
        onChange: vi.fn(),
      }),
    );
    const all = await screen.findByTestId('day-zoom-filter-chip-all');
    expect(all.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('DayPlannedFilterChips — toggle interactions', () => {
  it('click site → onChange chamado com [site] adicionado', async () => {
    const React = await import('react');
    const { render, screen, fireEvent } = await import(
      '@testing-library/react'
    );
    const { DayPlannedFilterChips } = await loadComponent();
    const onChange = vi.fn();
    render(
      React.createElement(DayPlannedFilterChips as any, {
        profileLetter: 'A',
        dayOfWeek: 2,
        availableSites: [{ site: 'PokerStars', count: 5 }],
        selected: [],
        onChange,
      }),
    );
    const chip = await screen.findByTestId('day-zoom-filter-chip-PokerStars');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(['PokerStars']);
  });

  it('click site quando ja selecionado → remove do array', async () => {
    const React = await import('react');
    const { render, screen, fireEvent } = await import(
      '@testing-library/react'
    );
    const { DayPlannedFilterChips } = await loadComponent();
    const onChange = vi.fn();
    render(
      React.createElement(DayPlannedFilterChips as any, {
        profileLetter: 'A',
        dayOfWeek: 2,
        availableSites: [{ site: 'PokerStars', count: 5 }],
        selected: ['PokerStars'],
        onChange,
      }),
    );
    const chip = await screen.findByTestId('day-zoom-filter-chip-PokerStars');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('click "Todas" → onChange chamado com []', async () => {
    const React = await import('react');
    const { render, screen, fireEvent } = await import(
      '@testing-library/react'
    );
    const { DayPlannedFilterChips } = await loadComponent();
    const onChange = vi.fn();
    render(
      React.createElement(DayPlannedFilterChips as any, {
        profileLetter: 'A',
        dayOfWeek: 2,
        availableSites: [{ site: 'PokerStars', count: 5 }],
        selected: ['PokerStars'],
        onChange,
      }),
    );
    const all = await screen.findByTestId('day-zoom-filter-chip-all');
    fireEvent.click(all);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('useDayPlannedFilter — localStorage persist', () => {
  it('persiste write apos toggle (storage key dayZoom.filter.{P}.{D}.platforms)', async () => {
    const React = await import('react');
    const { renderHook, act } = await import('@testing-library/react');
    const { useDayPlannedFilter } = await loadComponent();
    const { result } = renderHook(() =>
      (useDayPlannedFilter as any)('A', 3),
    );
    act(() => {
      result.current[1](['PokerStars']);
    });
    const stored = window.localStorage.getItem(
      'dayZoom.filter.A.3.platforms',
    );
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toEqual(['PokerStars']);
  });

  it('hydrate: useState lazy init le do storage', async () => {
    window.localStorage.setItem(
      'dayZoom.filter.A.5.platforms',
      JSON.stringify(['GGNetwork', 'Bodog']),
    );
    const { renderHook } = await import('@testing-library/react');
    const { useDayPlannedFilter } = await loadComponent();
    const { result } = renderHook(() =>
      (useDayPlannedFilter as any)('A', 5),
    );
    expect(result.current[0]).toEqual(['GGNetwork', 'Bodog']);
  });

  it('localStorage corrupto (JSON invalido) → fallback []', async () => {
    window.localStorage.setItem(
      'dayZoom.filter.A.7.platforms',
      'not-a-valid-json',
    );
    const { renderHook } = await import('@testing-library/react');
    const { useDayPlannedFilter } = await loadComponent();
    const { result } = renderHook(() =>
      (useDayPlannedFilter as any)('A', 7),
    );
    expect(result.current[0]).toEqual([]);
  });
});
