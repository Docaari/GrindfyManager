// =============================================================================
// Sprint VR-3 — RF-12: GroupContributions (client component)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-12)
// ADR   : 211 (engine output shape VarianceSimulationResult)
//
// Mode  : TDD (red phase) — component DOES NOT EXIST yet.
//
// Tests cover:
//   - Table/list with all groups (name, tournaments, invested, EV)
//   - Sorted by |EV| descending
//   - Total row at the bottom
//   - Green color for positive EV, red for negative
//   - data-testid stable selectors (lesson #2)
//
// Convention: await import() NOT require() for components (lesson #14/#26/#38).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock data — 6 groups typical quarter
// ---------------------------------------------------------------------------

function makeGroupContributions() {
  return [
    { name: 'G2 Mid Vanilla', count: 336, invested: 24192, expectedProfit: 3730 },
    { name: 'G4 Low Vanilla', count: 408, invested: 14280, expectedProfit: 2142 },
    { name: 'G3 Mid PKO', count: 168, invested: 12096, expectedProfit: 1814 },
    { name: 'G1 High Vanilla', count: 120, invested: 14400, expectedProfit: 1152 },
    { name: 'G5 Entry Vanilla', count: 288, invested: 4608, expectedProfit: 1380 },
    { name: 'G6 High PKO', count: 120, invested: 2412, expectedProfit: 580 },
  ];
}

function makeGroupContributionsWithNegative() {
  return [
    { name: 'G2 Mid Vanilla', count: 336, invested: 24192, expectedProfit: 3730 },
    { name: 'G4 Low Vanilla', count: 408, invested: 14280, expectedProfit: 2142 },
    { name: 'G6 Entry Satellite', count: 144, invested: 2880, expectedProfit: -576 },
  ];
}

// ---------------------------------------------------------------------------
// Dynamic import helper (lesson #14/#26)
// ---------------------------------------------------------------------------

async function tryLoadComponent(): Promise<any | null> {
  try {
    const p = '@/components/primedope/GroupContributions';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).GroupContributions ?? null;
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

describe('GroupContributions (RF-12)', () => {
  // -------------------------------------------------------------------------
  // Render & data-testid
  // -------------------------------------------------------------------------

  it('deve renderizar container com data-testid="group-contributions"', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, {
      groupContributions: makeGroupContributions(),
    }));

    expect(screen.getByTestId('group-contributions')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Rows for each group
  // -------------------------------------------------------------------------

  it('deve renderizar uma row para cada grupo', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    for (let i = 0; i < groups.length; i++) {
      expect(screen.getByTestId(`group-contribution-row-${i}`)).toBeInTheDocument();
    }
  });

  it('cada row deve exibir nome do grupo', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    // The row with highest |EV| should be first (sorted); check first row
    // G2 Mid Vanilla has highest EV=3730
    const row0 = screen.getByTestId('group-contribution-row-0');
    expect(row0.textContent).toContain('G2 Mid Vanilla');
  });

  it('cada row deve exibir count de torneios', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    // First row (sorted by |EV| desc) = G2 Mid Vanilla, count = 336
    const row0 = screen.getByTestId('group-contribution-row-0');
    expect(row0.textContent).toContain('336');
  });

  it('cada row deve exibir investimento formatado USD', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    // G2 Mid Vanilla invested = 24192 -> $24.192
    const row0 = screen.getByTestId('group-contribution-row-0');
    expect(row0.textContent).toMatch(/\$24[.,]192/);
  });

  it('cada row deve exibir EV formatado USD com sinal', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    // G2 Mid Vanilla EV = 3730 -> +$3.730
    const row0 = screen.getByTestId('group-contribution-row-0');
    expect(row0.textContent).toMatch(/\+\$3[.,]730/);
  });

  // -------------------------------------------------------------------------
  // Sort by |EV| desc
  // -------------------------------------------------------------------------

  it('deve ordenar rows por |EV| decrescente', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    // Sorted by |EV| desc: G2(3730) > G4(2142) > G3(1814) > G5(1380) > G1(1152) > G6(580)
    const row0 = screen.getByTestId('group-contribution-row-0');
    const row1 = screen.getByTestId('group-contribution-row-1');
    const row5 = screen.getByTestId('group-contribution-row-5');

    expect(row0.textContent).toContain('G2 Mid Vanilla');
    expect(row1.textContent).toContain('G4 Low Vanilla');
    expect(row5.textContent).toContain('G6 High PKO');
  });

  // -------------------------------------------------------------------------
  // Total row
  // -------------------------------------------------------------------------

  it('deve renderizar row de TOTAL com data-testid="group-contribution-total"', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, {
      groupContributions: makeGroupContributions(),
    }));

    expect(screen.getByTestId('group-contribution-total')).toBeInTheDocument();
  });

  it('row TOTAL deve somar count de torneios corretamente', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();
    // Total count = 336+408+168+120+288+120 = 1440
    const expectedCount = groups.reduce((s, g) => s + g.count, 0);

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    const total = screen.getByTestId('group-contribution-total');
    expect(total.textContent).toContain(String(expectedCount));
  });

  it('row TOTAL deve somar investimento corretamente', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();
    // Total invested = 24192+14280+12096+14400+4608+2412 = 71988
    const expectedInvested = groups.reduce((s, g) => s + g.invested, 0);

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    const total = screen.getByTestId('group-contribution-total');
    expect(total.textContent).toMatch(/\$71[.,]988/);
  });

  it('row TOTAL deve somar EV corretamente', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const groups = makeGroupContributions();
    // Total EV = 3730+2142+1814+1152+1380+580 = 10798
    const expectedEv = groups.reduce((s, g) => s + g.expectedProfit, 0);

    render(React.createElement(GroupContributions, { groupContributions: groups }));

    const total = screen.getByTestId('group-contribution-total');
    expect(total.textContent).toMatch(/\+\$10[.,]798/);
  });

  // -------------------------------------------------------------------------
  // Color coding by EV sign
  // -------------------------------------------------------------------------

  it('row com EV positivo deve ter indicacao verde', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, {
      groupContributions: makeGroupContributions(),
    }));

    const row0 = screen.getByTestId('group-contribution-row-0');
    const classes = row0.innerHTML;
    const hasGreen = classes.includes('green') || classes.includes('emerald');
    expect(hasGreen).toBe(true);
  });

  it('row com EV negativo deve ter indicacao vermelha', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, {
      groupContributions: makeGroupContributionsWithNegative(),
    }));

    // Sorted by |EV| desc: G2(3730) > G4(2142) > G6(-576)
    // G6 (negative) should be at index 2
    const row2 = screen.getByTestId('group-contribution-row-2');
    const classes = row2.innerHTML;
    const hasRed = classes.includes('red');
    expect(hasRed).toBe(true);
  });

  it('row com EV negativo deve exibir sinal negativo no valor', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, {
      groupContributions: makeGroupContributionsWithNegative(),
    }));

    // G6 Entry Satellite EV = -576 -> -$576
    const row2 = screen.getByTestId('group-contribution-row-2');
    expect(row2.textContent).toMatch(/-\$576/);
  });

  // -------------------------------------------------------------------------
  // Progress bar relative to EV proportion
  // -------------------------------------------------------------------------

  it('cada row deve conter barra de progresso relativa ao EV do grupo', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, {
      groupContributions: makeGroupContributions(),
    }));

    const row0 = screen.getByTestId('group-contribution-row-0');
    // Should contain a progress bar element (div with width style, role=progressbar, or class "bar"/"progress")
    const progressEl = row0.querySelector('[role="progressbar"], [data-testid*="progress"], [class*="bar"], [class*="progress"]');
    expect(progressEl).not.toBeNull();
  });

  it('barra de progresso do grupo com maior |EV| deve ser a mais larga (width 100%)', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, {
      groupContributions: makeGroupContributions(),
    }));

    // Row 0 = G2 Mid Vanilla (highest |EV| = 3730) should have the widest bar
    const row0 = screen.getByTestId('group-contribution-row-0');
    const bar = row0.querySelector('[role="progressbar"], [data-testid*="progress"], [class*="bar"], [class*="progress"]');
    expect(bar).not.toBeNull();
    // The widest bar should have width ~100% or the largest relative width
    const style = bar?.getAttribute('style') || '';
    expect(style).toMatch(/width:\s*100%/);
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('deve lidar graciosamente com lista vazia de grupos', async () => {
    const GroupContributions = await tryLoadComponent();
    expect(GroupContributions).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(GroupContributions, { groupContributions: [] }));

    expect(screen.getByTestId('group-contributions')).toBeInTheDocument();
  });
});
