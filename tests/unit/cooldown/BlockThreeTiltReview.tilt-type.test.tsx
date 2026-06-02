import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #4 — RF-02/RF-03/RF-05: seletor de tipo + antidoto no cool-down
//
// Spec: Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md (RF-02/03/05)
// ADR : Docs/architecture/decisions/232-fase-c-4-tilt-tipado-7-tipos-antidoto.md (D-6)
//
// Componente REAL: client/src/components/cooldown/BlockThreeTiltReview.tsx
//   - controlado: props value: TiltAssessmentValue + onChange(value)
//   - TiltAssessmentValue estende com tiltType?: TiltTypeId | null (RF-02)
//
// testids estaveis (lesson #2): tilt-type-selector, tilt-type-option-{id} (7),
// tilt-antidote-card.
//
// Comportamento esperado:
//   - seletor dos 7 tipos renderizado quando ha tilt declarado (feltTilt>0 || keptTilting>0)
//   - sugestao heuristica pre-destacada ("Parece tilt de ___?") — NAO auto-grava (lesson #11)
//   - selecionar um tipo chama onChange com tiltType setado (escolha vence sugestao)
//   - tilt-antidote-card mostra getTiltType(id).antidote do tipo selecionado
//   - tiltType null -> nenhum antidote card (RF-03, sem fallback decorativo)
//
// Status RED: o componente ainda nao renderiza os elementos de tipo/antidoto.
//
// Lessons: #2 (data-testid estavel), #11 (sem auto-grava / sem decorativo),
//   #14/#26 (await import em .tsx, NAO require), #30 (.test.tsx = jsdom).
// =============================================================================

const noop = () => {};

async function loadComponent() {
  const mod = await import('@/components/cooldown/BlockThreeTiltReview');
  return mod.BlockThreeTiltReview ?? (mod as any).default;
}

async function loadCatalog() {
  return await import('@shared/tilt-types');
}

function baseValue(overrides: any = {}) {
  return {
    feltTilt: 6,
    keptTilting: 4,
    presence: 7,
    triggers: [] as string[],
    action: '',
    tiltType: null as string | null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Seletor dos 7 tipos
// ---------------------------------------------------------------------------

describe('BlockThreeTiltReview — seletor de tipo', () => {
  it('renderiza tilt-type-selector quando ha tilt declarado', async () => {
    const BlockThreeTiltReview = await loadComponent();
    render(
      <BlockThreeTiltReview
        value={baseValue({ feltTilt: 7 })}
        onChange={noop}
        onNext={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByTestId('tilt-type-selector')).toBeTruthy();
  });

  it.each([
    'running_bad',
    'injustice',
    'hate_losing',
    'mistake',
    'entitlement',
    'revenge',
    'desperation',
  ])('renderiza option tilt-type-option-%s', async (id) => {
    const BlockThreeTiltReview = await loadComponent();
    render(
      <BlockThreeTiltReview
        value={baseValue({ feltTilt: 7 })}
        onChange={noop}
        onNext={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByTestId(`tilt-type-option-${id}`)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Selecao chama onChange com tiltType
// ---------------------------------------------------------------------------

describe('BlockThreeTiltReview — selecao persiste tiltType via onChange', () => {
  it('clicar em tilt-type-option-revenge chama onChange com tiltType="revenge"', async () => {
    const BlockThreeTiltReview = await loadComponent();
    const onChange = vi.fn();
    render(
      <BlockThreeTiltReview
        value={baseValue({ feltTilt: 7 })}
        onChange={onChange}
        onNext={noop}
        onBack={noop}
      />,
    );

    fireEvent.click(screen.getByTestId('tilt-type-option-revenge'));

    expect(onChange).toHaveBeenCalled();
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastArg.tiltType).toBe('revenge');
  });
});

// ---------------------------------------------------------------------------
// Antidoto (RF-03) — texto === catalogo
// ---------------------------------------------------------------------------

describe('BlockThreeTiltReview — antidoto (RF-03)', () => {
  it('com tiltType="revenge" selecionado, tilt-antidote-card mostra o antidoto do catalogo', async () => {
    const BlockThreeTiltReview = await loadComponent();
    const { getTiltType } = await loadCatalog();
    render(
      <BlockThreeTiltReview
        value={baseValue({ feltTilt: 7, tiltType: 'revenge' })}
        onChange={noop}
        onNext={noop}
        onBack={noop}
      />,
    );

    const card = await waitFor(() => screen.getByTestId('tilt-antidote-card'));
    const expected = getTiltType('revenge')!.antidote;
    expect(card.textContent ?? '').toContain(expected);
  });

  it('tiltType null -> NENHUM tilt-antidote-card (RF-03, sem fallback decorativo lesson #11)', async () => {
    const BlockThreeTiltReview = await loadComponent();
    render(
      <BlockThreeTiltReview
        value={baseValue({ feltTilt: 7, tiltType: null })}
        onChange={noop}
        onNext={noop}
        onBack={noop}
      />,
    );
    expect(screen.queryByTestId('tilt-antidote-card')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sugestao heuristica pre-destacada (RF-02) — NAO auto-grava (lesson #11)
// ---------------------------------------------------------------------------

describe('BlockThreeTiltReview — sugestao heuristica (lesson #11)', () => {
  it('triggers:["cooler"] sem tiltType: NAO chama onChange automaticamente no mount (sem auto-grava)', async () => {
    const BlockThreeTiltReview = await loadComponent();
    const onChange = vi.fn();
    render(
      <BlockThreeTiltReview
        value={baseValue({ feltTilt: 7, triggers: ['cooler'], tiltType: null })}
        onChange={onChange}
        onNext={noop}
        onBack={noop}
      />,
    );
    // a sugestao pode ser exibida (pre-destacada), mas nunca grava sozinha
    expect(onChange).not.toHaveBeenCalled();
  });

  it('com tiltType ja escolhido, a escolha do jogador e mantida (vence sugestao)', async () => {
    const BlockThreeTiltReview = await loadComponent();
    render(
      <BlockThreeTiltReview
        // triggers sugeririam 'injustice' (cooler) mas jogador escolheu 'mistake'
        value={baseValue({ feltTilt: 7, triggers: ['cooler'], tiltType: 'mistake' })}
        onChange={noop}
        onNext={noop}
        onBack={noop}
      />,
    );
    const card = screen.getByTestId('tilt-antidote-card');
    // antidoto exibido e o de 'mistake', nao o de 'injustice'
    const { getTiltType } = await loadCatalog();
    expect(card.textContent ?? '').toContain(getTiltType('mistake')!.antidote);
  });
});
