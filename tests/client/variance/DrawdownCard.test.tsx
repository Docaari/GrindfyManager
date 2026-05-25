// =============================================================================
// Sprint VR-3 — RF-11: DrawdownCard (client component)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-11)
// ADR   : 211 (engine output shape VarianceSimulationResult)
//
// Mode  : TDD (red phase) — component DOES NOT EXIST yet.
//
// Tests cover:
//   - Card renders with 3 drawdown levels (Tipico, Preparar, Pior raro)
//   - Correct data mapping: median -> Tipico, p95 -> Preparar, worst -> Pior raro
//   - Contextual explanatory text
//   - Visual proportion bar
//   - USD formatting
//   - data-testid stable selectors (lesson #2)
//
// Convention: await import() NOT require() for components (lesson #14/#26/#38).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeDrawdown() {
  return {
    mean: 3500,
    median: 2787,
    p95: 6737,
    p99: 12400,
    worst: 18273,
  };
}

// ---------------------------------------------------------------------------
// Dynamic import helper (lesson #14/#26)
// ---------------------------------------------------------------------------

async function tryLoadComponent(): Promise<any | null> {
  try {
    const p = '@/components/primedope/DrawdownCard';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).DrawdownCard ?? null;
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
// Tests
// =============================================================================

describe('DrawdownCard (RF-11)', () => {
  // -------------------------------------------------------------------------
  // Render & data-testid
  // -------------------------------------------------------------------------

  it('deve renderizar card com data-testid="drawdown-card"', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    expect(screen.getByTestId('drawdown-card')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 3 levels
  // -------------------------------------------------------------------------

  it('deve renderizar nivel Tipico (median) com data-testid="drawdown-tipico"', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const tipico = screen.getByTestId('drawdown-tipico');
    expect(tipico).toBeInTheDocument();
    // median = 2787, should display as $2.787
    expect(tipico.textContent).toMatch(/\$2[.,]787/);
  });

  it('deve renderizar nivel Preparar (p95) com data-testid="drawdown-preparar"', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const preparar = screen.getByTestId('drawdown-preparar');
    expect(preparar).toBeInTheDocument();
    // p95 = 6737, should display as $6.737
    expect(preparar.textContent).toMatch(/\$6[.,]737/);
  });

  it('deve renderizar nivel Pior raro (worst) com data-testid="drawdown-pior"', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const pior = screen.getByTestId('drawdown-pior');
    expect(pior).toBeInTheDocument();
    // worst = 18273, should display as $18.273
    expect(pior.textContent).toMatch(/\$18[.,]273/);
  });

  // -------------------------------------------------------------------------
  // Labels
  // -------------------------------------------------------------------------

  it('deve exibir label "Tipico" ou "Mediano" no nivel tipico', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const tipico = screen.getByTestId('drawdown-tipico');
    expect(tipico.textContent).toMatch(/t[ií]pico|mediano/i);
  });

  it('deve exibir label "Preparar" ou "95%" no nivel preparar', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const preparar = screen.getByTestId('drawdown-preparar');
    expect(preparar.textContent).toMatch(/preparar|95%/i);
  });

  it('deve exibir label "Pior raro" ou "Extremo" no nivel pior', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const pior = screen.getByTestId('drawdown-pior');
    expect(pior.textContent).toMatch(/pior|extremo|raro/i);
  });

  // -------------------------------------------------------------------------
  // Explanatory text
  // -------------------------------------------------------------------------

  it('deve conter texto explicativo sobre drawdown', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const card = screen.getByTestId('drawdown-card');
    // Should contain some explanation about peak-to-valley / drawdown
    expect(card.textContent).toMatch(/queda|pico.*vale|drawdown/i);
  });

  // -------------------------------------------------------------------------
  // Visual proportion bar
  // -------------------------------------------------------------------------

  it('deve renderizar barra visual de proporcao entre os niveis', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const card = screen.getByTestId('drawdown-card');
    // There should be some visual bar element — could be a div with width style
    // proportional to the drawdown values
    const bars = card.querySelectorAll('[data-testid*="drawdown-bar"], [role="progressbar"], [class*="bar"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Order: Tipico < Preparar < Pior
  // -------------------------------------------------------------------------

  it('deve manter ordem visual Tipico -> Preparar -> Pior (crescente)', async () => {
    const DrawdownCard = await tryLoadComponent();
    expect(DrawdownCard).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(DrawdownCard, { drawdown: makeDrawdown() }));

    const tipico = screen.getByTestId('drawdown-tipico');
    const preparar = screen.getByTestId('drawdown-preparar');
    const pior = screen.getByTestId('drawdown-pior');

    // All 3 should be present in the DOM, in order
    const card = screen.getByTestId('drawdown-card');
    const allText = card.textContent ?? '';
    const idxTipico = allText.search(/t[ií]pico|mediano/i);
    const idxPreparar = allText.search(/preparar|95%/i);
    const idxPior = allText.search(/pior|extremo/i);

    expect(idxTipico).toBeLessThan(idxPreparar);
    expect(idxPreparar).toBeLessThan(idxPior);
  });
});
