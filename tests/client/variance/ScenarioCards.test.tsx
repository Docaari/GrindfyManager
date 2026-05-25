// =============================================================================
// Sprint VR-3 — RF-10: ScenarioCards (client component)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-10)
// ADR   : 211 (engine output shape VarianceSimulationResult)
//
// Mode  : TDD (red phase) — component DOES NOT EXIST yet.
//
// Tests cover:
//   - 3 cards: Pessimista (p2_5), Mediana (p50), Otimista (p97_5)
//   - Color coding: red, blue, green
//   - Odds label contextualized by period (semanas/meses/trimestres/anos)
//   - USD formatting with sign (+/-)
//   - data-testid stable selectors (lesson #2)
//
// Convention: await import() NOT require() for components (lesson #14/#26/#38).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makePercentiles() {
  return {
    p0_15: -18273,
    p2_5: -3171,
    p15: 2400,
    p30: 5800,
    p50: 10200,
    p70: 14600,
    p85: 19200,
    p97_5: 28400,
    p99_85: 38900,
  };
}

// ---------------------------------------------------------------------------
// Dynamic import helper (lesson #14/#26)
// ---------------------------------------------------------------------------

async function tryLoadComponent(): Promise<any | null> {
  try {
    const p = '@/components/primedope/ScenarioCards';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).ScenarioCards ?? null;
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

describe('ScenarioCards (RF-10)', () => {
  // -------------------------------------------------------------------------
  // Render all 3 cards
  // -------------------------------------------------------------------------

  it('deve renderizar 3 cards: pessimista, mediana, otimista', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    expect(screen.getByTestId('scenario-card-pessimista')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-card-mediana')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-card-otimista')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Pessimista card
  // -------------------------------------------------------------------------

  it('card pessimista deve exibir valor de p2_5 formatado com sinal negativo', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-pessimista');
    // p2_5 = -3171, should display as -$3.171 (pt-BR formatting)
    expect(card.textContent).toMatch(/-\$3[.,]171/);
  });

  it('card pessimista deve ter indicacao visual vermelha', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-pessimista');
    const classes = card.className || '';
    const hasRedIndicator = classes.includes('red') || card.querySelector('[class*="red"]') !== null;
    expect(hasRedIndicator).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Mediana card
  // -------------------------------------------------------------------------

  it('card mediana deve exibir valor de p50 formatado com sinal positivo', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-mediana');
    // p50 = 10200, should display as +$10.200
    expect(card.textContent).toMatch(/\+?\$10[.,]200/);
  });

  it('card mediana deve exibir label "Resultado tipico"', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-mediana');
    expect(card.textContent).toMatch(/resultado t[ií]pico/i);
  });

  it('card mediana deve ter indicacao visual azul', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-mediana');
    const classes = card.className || '';
    const hasBlueIndicator = classes.includes('blue') || card.querySelector('[class*="blue"]') !== null;
    expect(hasBlueIndicator).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Otimista card
  // -------------------------------------------------------------------------

  it('card otimista deve exibir valor de p97_5 formatado com sinal positivo', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-otimista');
    // p97_5 = 28400, should display as +$28.400
    expect(card.textContent).toMatch(/\+?\$28[.,]400/);
  });

  it('card otimista deve ter indicacao visual verde', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-otimista');
    const classes = card.className || '';
    const hasGreenIndicator = classes.includes('green') || classes.includes('emerald')
      || card.querySelector('[class*="green"]') !== null
      || card.querySelector('[class*="emerald"]') !== null;
    expect(hasGreenIndicator).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Period label contextualization
  // -------------------------------------------------------------------------

  it('deve exibir "trimestres" quando weeks=12', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const pessimista = screen.getByTestId('scenario-card-pessimista');
    expect(pessimista.textContent).toMatch(/1 a cada 40 trimestres/i);
  });

  it('deve exibir "semanas" quando weeks=1', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 1,
    }));

    const pessimista = screen.getByTestId('scenario-card-pessimista');
    expect(pessimista.textContent).toMatch(/1 a cada 40 semanas/i);
  });

  it('deve exibir "meses" quando weeks=4', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 4,
    }));

    const pessimista = screen.getByTestId('scenario-card-pessimista');
    expect(pessimista.textContent).toMatch(/1 a cada 40 meses/i);
  });

  it('deve exibir "anos" quando weeks=52', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 52,
    }));

    const pessimista = screen.getByTestId('scenario-card-pessimista');
    expect(pessimista.textContent).toMatch(/1 a cada 40 anos/i);
  });

  // -------------------------------------------------------------------------
  // Otimista odds label
  // -------------------------------------------------------------------------

  it('card otimista deve exibir odds "1 a cada 40 {periodo}"', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(ScenarioCards, {
      percentiles: makePercentiles(),
      weeks: 12,
    }));

    const otimista = screen.getByTestId('scenario-card-otimista');
    expect(otimista.textContent).toMatch(/1 a cada 40 trimestres/i);
  });

  // -------------------------------------------------------------------------
  // Negative p50 (edge case: losing player)
  // -------------------------------------------------------------------------

  it('card mediana exibe sinal negativo quando p50 < 0', async () => {
    const ScenarioCards = await tryLoadComponent();
    expect(ScenarioCards).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    const losingPercentiles = {
      ...makePercentiles(),
      p50: -2000,
    };

    render(React.createElement(ScenarioCards, {
      percentiles: losingPercentiles,
      weeks: 12,
    }));

    const card = screen.getByTestId('scenario-card-mediana');
    expect(card.textContent).toMatch(/-\$2[.,]000/);
  });
});
