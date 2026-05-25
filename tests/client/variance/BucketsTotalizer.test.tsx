// =============================================================================
// Sprint VR-3 — RF-13: BucketsTotalizer (client component)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-13)
// ADR   : 212 (aggregate tiers + buckets)
//
// Mode  : TDD (red phase) — component DOES NOT EXIST yet.
//
// Tests cover:
//   - Totalizer row in buckets table: count total, investment total, ABI avg
//   - PT-BR day labels in "Por dia" mode
//   - data-testid stable selectors (lesson #2)
//
// Convention: await import() NOT require() for components (lesson #14/#26/#38).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock data — aggregated buckets with multiple groups
// ---------------------------------------------------------------------------

function makeBucketsForTotalizer() {
  return [
    { name: 'High Vanilla', count: 72, buyIn: 120, investment: 8640 },
    { name: 'Mid Vanilla', count: 144, buyIn: 55, investment: 7920 },
    { name: 'Mid PKO', count: 72, buyIn: 60, investment: 4320 },
    { name: 'Low Vanilla', count: 144, buyIn: 33, investment: 4752 },
    { name: 'Entry Vanilla', count: 72, buyIn: 16, investment: 1152 },
  ];
}

// Total count = 72+144+72+144+72 = 504
// Total investment = 8640+7920+4320+4752+1152 = 26784
// ABI = 26784 / 504 = 53.14... (avg buy-in)

const DIAS_PT_BR = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

// ---------------------------------------------------------------------------
// Dynamic import helper (lesson #14/#26)
// ---------------------------------------------------------------------------

async function tryLoadTotalizer(): Promise<any | null> {
  try {
    const p = '@/components/primedope/BucketsTotalizer';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).BucketsTotalizer ?? null;
  } catch {
    return null;
  }
}

async function tryLoadDaySelector(): Promise<any | null> {
  try {
    const p = '@/components/primedope/DaySelector';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).DaySelector ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Tests — Totalizer
// =============================================================================

describe('BucketsTotalizer (RF-13 — Totalizador)', () => {
  // -------------------------------------------------------------------------
  // Render & data-testid
  // -------------------------------------------------------------------------

  it('deve renderizar totalizador com data-testid="buckets-totalizer"', async () => {
    const BucketsTotalizer = await tryLoadTotalizer();
    expect(BucketsTotalizer).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(BucketsTotalizer, { buckets: makeBucketsForTotalizer() }));

    expect(screen.getByTestId('buckets-totalizer')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Count total
  // -------------------------------------------------------------------------

  it('deve exibir count total com data-testid="totalizer-count"', async () => {
    const BucketsTotalizer = await tryLoadTotalizer();
    expect(BucketsTotalizer).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const buckets = makeBucketsForTotalizer();

    render(React.createElement(BucketsTotalizer, { buckets }));

    const countEl = screen.getByTestId('totalizer-count');
    expect(countEl).toBeInTheDocument();
    // 72+144+72+144+72 = 504
    expect(countEl.textContent).toContain('504');
  });

  // -------------------------------------------------------------------------
  // Investment total
  // -------------------------------------------------------------------------

  it('deve exibir investimento total com data-testid="totalizer-investment"', async () => {
    const BucketsTotalizer = await tryLoadTotalizer();
    expect(BucketsTotalizer).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const buckets = makeBucketsForTotalizer();

    render(React.createElement(BucketsTotalizer, { buckets }));

    const invEl = screen.getByTestId('totalizer-investment');
    expect(invEl).toBeInTheDocument();
    // Total = 26784 -> $26.784
    expect(invEl.textContent).toMatch(/\$26[.,]784/);
  });

  // -------------------------------------------------------------------------
  // ABI (Average Buy-In)
  // -------------------------------------------------------------------------

  it('deve exibir ABI medio com data-testid="totalizer-abi"', async () => {
    const BucketsTotalizer = await tryLoadTotalizer();
    expect(BucketsTotalizer).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const buckets = makeBucketsForTotalizer();

    render(React.createElement(BucketsTotalizer, { buckets }));

    const abiEl = screen.getByTestId('totalizer-abi');
    expect(abiEl).toBeInTheDocument();
    // ABI = 26784 / 504 = ~53 (rounded)
    expect(abiEl.textContent).toMatch(/\$5[23]/);
  });

  // -------------------------------------------------------------------------
  // Edge case: empty buckets
  // -------------------------------------------------------------------------

  it('deve lidar com lista vazia sem erro', async () => {
    const BucketsTotalizer = await tryLoadTotalizer();
    expect(BucketsTotalizer).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(BucketsTotalizer, { buckets: [] }));

    expect(screen.getByTestId('buckets-totalizer')).toBeInTheDocument();
  });

  it('deve exibir 0 para count e investment quando lista vazia', async () => {
    const BucketsTotalizer = await tryLoadTotalizer();
    expect(BucketsTotalizer).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(BucketsTotalizer, { buckets: [] }));

    const countEl = screen.getByTestId('totalizer-count');
    expect(countEl.textContent).toContain('0');

    const invEl = screen.getByTestId('totalizer-investment');
    expect(invEl.textContent).toMatch(/\$0/);
  });
});

// =============================================================================
// Tests — Day labels PT-BR
// =============================================================================

describe('DaySelector PT-BR (RF-13 — Dias)', () => {
  it('deve exibir nomes dos dias em PT-BR', async () => {
    const DaySelector = await tryLoadDaySelector();
    expect(DaySelector).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DaySelector, { selectedDay: 0, onDayChange: vi.fn() }));

    // At minimum, some PT-BR day names should be visible
    for (const dia of DIAS_PT_BR) {
      expect(screen.getByText(new RegExp(dia, 'i'))).toBeInTheDocument();
    }
  });

  it('deve chamar onDayChange ao selecionar dia', async () => {
    const DaySelector = await tryLoadDaySelector();
    expect(DaySelector).not.toBeNull();

    const { render, screen, fireEvent } = await import('@testing-library/react');
    const onDayChange = vi.fn();

    render(React.createElement(DaySelector, { selectedDay: 0, onDayChange }));

    // Click on "Segunda" (index 1)
    const segunda = screen.getByText(/segunda/i);
    fireEvent.click(segunda);

    expect(onDayChange).toHaveBeenCalledWith(1);
  });

  it('deve marcar o dia selecionado visualmente', async () => {
    const DaySelector = await tryLoadDaySelector();
    expect(DaySelector).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DaySelector, { selectedDay: 3, onDayChange: vi.fn() }));

    // "Quarta" (index 3) should have aria-pressed or active styling
    const quarta = screen.getByText(/quarta/i);
    const parent = quarta.closest('[aria-pressed], [data-active], [aria-selected]');
    const isActive = parent?.getAttribute('aria-pressed') === 'true'
      || parent?.getAttribute('data-active') === 'true'
      || parent?.getAttribute('aria-selected') === 'true'
      || quarta.className?.includes('active')
      || quarta.className?.includes('selected');
    expect(isActive).toBe(true);
  });
});
