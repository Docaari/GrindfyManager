/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-01 + RF-08
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * Estende `<EmptyState>` (Foundation UI-FND-1) com prop `secondaryCTA`:
 *   secondaryCTA?: { label: string; onClick: () => void; ariaLabel?: string }
 *
 * Cenarios (RF-08):
 *   1. Render quando secondaryCTA definido (data-testid="empty-state-secondary-cta").
 *   2. NAO renderiza quando undefined (regressao).
 *   3. onClick dispara ao clicar.
 *   4. Telemetria `ui.empty_state_secondary_cta_clicked` chamada (try/catch silencioso).
 *   5. Ambos secondaryCTA + secondaryLink renderizam quando ambos fornecidos.
 *   6. ariaLabel respeitado (fallback para label).
 *   7. Telemetria nao quebra quando window.__telemetry indisponivel.
 *   8. Areas novas aceitas: grade-planner-empty, grind-live-empty, bankroll-empty.
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel.
 *   #9  telemetria silenciosa nao propaga erro.
 *   #11 prop opcional sem default decorativo.
 *   #14/#26 import estatico (NUNCA require em .tsx).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Import estatico — lesson #14/#26. NAO usar require em .tsx.
import { EmptyState } from '@/components/ui/EmptyState';

beforeEach(() => {
  delete (window as any).__telemetry;
});

afterEach(() => {
  delete (window as any).__telemetry;
});

// ===========================================================================
// 1. Render condicional do secondaryCTA
// ===========================================================================

describe('RF-01 EmptyState.secondaryCTA — render condicional', () => {
  it('renderiza botao secundario quando secondaryCTA definido', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED: prop secondaryCTA ainda nao existe no tipo
        secondaryCTA={{ label: 'Ver tour', onClick: () => {} }}
      />,
    );
    const btn = screen.getByTestId('empty-state-secondary-cta');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe('Ver tour');
  });

  it('NAO renderiza botao secundario quando secondaryCTA undefined', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
      />,
    );
    expect(screen.queryByTestId('empty-state-secondary-cta')).toBeNull();
  });

  it('botao secundario eh um <button> nativo (interacao via teclado)', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Tour', onClick: () => {} }}
      />,
    );
    const btn = screen.getByTestId('empty-state-secondary-cta');
    expect(btn.tagName).toBe('BUTTON');
  });
});

// ===========================================================================
// 2. onClick callback
// ===========================================================================

describe('RF-01 EmptyState.secondaryCTA — onClick', () => {
  it('chama onClick uma vez ao clicar', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Secondary', onClick }}
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('click no secundario NAO chama o ctaAction primario', async () => {
    const ctaAction = vi.fn();
    const secondaryOnClick = vi.fn();
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={ctaAction}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Secondary', onClick: secondaryOnClick }}
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    expect(secondaryOnClick).toHaveBeenCalledTimes(1);
    expect(ctaAction).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. Telemetria (lesson #9)
// ===========================================================================

describe('RF-01 EmptyState.secondaryCTA — telemetria', () => {
  it('chama window.__telemetry.track com area no payload quando definido', async () => {
    const trackMock = vi.fn();
    (window as any).__telemetry = { track: trackMock };
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Secondary', onClick: () => {} }}
        area="grade-planner-empty"
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    // Convencao spec RF-01: evento `ui.empty_state_secondary_cta_clicked`
    // (espelha o `ui.empty_state_cta_clicked` existente).
    const calls = trackMock.mock.calls;
    const found = calls.find(
      (c) => c[0] === 'ui.empty_state_secondary_cta_clicked',
    );
    expect(found).toBeDefined();
    expect(found![1]).toMatchObject({ area: 'grade-planner-empty' });
  });

  it('NAO quebra quando window.__telemetry ausente (try/catch silencioso)', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Secondary', onClick }}
        area="bankroll-empty"
      />,
    );
    await expect(
      userEvent.click(screen.getByTestId('empty-state-secondary-cta')),
    ).resolves.toBeUndefined();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('NAO propaga erro quando track lanca (mantem onClick funcional)', async () => {
    const onClick = vi.fn();
    (window as any).__telemetry = {
      track: () => {
        throw new Error('telemetria broke');
      },
    };
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Secondary', onClick }}
        area="grind-live-empty"
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 4. Coexistencia com secondaryLink (legado)
// ===========================================================================

describe('RF-01 EmptyState.secondaryCTA — coexistencia com secondaryLink', () => {
  it('renderiza AMBOS quando secondaryCTA e secondaryLink fornecidos', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Tour', onClick: () => {} }}
        secondaryLink={{ label: 'Docs', href: '/docs' }}
      />,
    );
    expect(screen.getByTestId('empty-state-secondary-cta')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-secondary-link')).toBeInTheDocument();
  });

  it('quando apenas secondaryLink fornecido, NAO renderiza secondaryCTA', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        secondaryLink={{ label: 'Docs', href: '/docs' }}
      />,
    );
    expect(screen.queryByTestId('empty-state-secondary-cta')).toBeNull();
    expect(screen.getByTestId('empty-state-secondary-link')).toBeInTheDocument();
  });
});

// ===========================================================================
// 5. Acessibilidade (ariaLabel)
// ===========================================================================

describe('RF-01 EmptyState.secondaryCTA — acessibilidade', () => {
  it('aria-label segue ariaLabel quando fornecido', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{
          label: 'Tour',
          onClick: () => {},
          ariaLabel: 'Ver tour rapido do planner',
        }}
      />,
    );
    expect(
      screen.getByTestId('empty-state-secondary-cta').getAttribute('aria-label'),
    ).toBe('Ver tour rapido do planner');
  });

  it('aria-label cai para label quando ariaLabel nao fornecido', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={() => {}}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Ver tour', onClick: () => {} }}
      />,
    );
    expect(
      screen.getByTestId('empty-state-secondary-cta').getAttribute('aria-label'),
    ).toBe('Ver tour');
  });
});

// ===========================================================================
// 6. Novas areas do catalog
// ===========================================================================

describe('RF-01 EmptyState — novas areas (catalog)', () => {
  const newAreas = [
    'grade-planner-empty',
    'grind-live-empty',
    'bankroll-empty',
  ] as const;

  for (const area of newAreas) {
    it(`aceita area="${area}" no data-area`, () => {
      render(
        <EmptyState
          title="x"
          description="y"
          ctaLabel="Primary"
          ctaAction={() => {}}
          // @ts-expect-error — RED: area pode nao existir no enum ate implementer adicionar
          area={area}
        />,
      );
      expect(screen.getByTestId('empty-state').getAttribute('data-area')).toBe(
        area,
      );
    });
  }
});

// ===========================================================================
// 7. Sem regressao no componente existente
// ===========================================================================

describe('RF-01 EmptyState — sem regressao (smoke)', () => {
  it('render minimo (sem secondaryCTA) ainda funciona', () => {
    render(
      <EmptyState
        title="Titulo"
        description="Descricao"
        ctaLabel="CTA"
        ctaAction={() => {}}
      />,
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-secondary-cta')).toBeNull();
    expect(screen.queryByTestId('empty-state-secondary-link')).toBeNull();
  });

  it('ctaAction primario continua funcional com secondaryCTA tambem presente', async () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Primary"
        ctaAction={primary}
        // @ts-expect-error — RED
        secondaryCTA={{ label: 'Secondary', onClick: secondary }}
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).not.toHaveBeenCalled();
  });
});
