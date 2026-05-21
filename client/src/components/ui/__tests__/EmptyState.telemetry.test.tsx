/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-3 — RF-05: telemetria secondaryCTA via `@/lib/telemetry`.
 *
 * Spec: Docs/specs/sprint-ux-qw-3.md (RF-05)
 *
 * Contrato esperado (novo, RF-05):
 *   - EmptyState aceita prop opcional `telemetryContext?: string`.
 *   - Quando clique no secondaryCTA acontece E telemetryContext esta definido,
 *     o util `track` de `@/lib/telemetry` eh invocado com:
 *         track('empty_state.secondary_cta_click', { context })
 *   - Quando `telemetryContext` eh `undefined`, `track` NAO eh invocado por
 *     RF-05 (nota: o callback `secondaryCTA.onClick` continua sendo chamado
 *     normalmente, e o helper legado `window.__telemetry.track` continua
 *     funcionando — isso eh coberto em EmptyState.secondary-cta.test.tsx).
 *
 * O contrato NOVO de RF-05 cobre apenas a integracao com `@/lib/telemetry`
 * (track), que e o pipeline oficial do projeto (vide queryClient + Coach).
 *
 * Lessons aplicadas:
 *   #14/#26 import estatico para `.tsx`
 *   #11     prop opcional sem default
 *   #9      telemetria silenciosa nao propaga erro
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock do modulo de telemetria — captura chamadas ao track.
const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: any[]) => trackMock(...args),
}));

// Import estatico (lesson #14/#26).
import { EmptyState } from '@/components/ui/EmptyState';

beforeEach(() => {
  trackMock.mockClear();
});

describe('RF-05 EmptyState — telemetria secondaryCTA via track()', () => {
  it('clique no secondaryCTA com telemetryContext -> chama track("empty_state.secondary_cta_click", { context })', () => {
    const onClick = vi.fn();

    render(
      <EmptyState
        title="Sem carteiras"
        description="Adicione sua primeira carteira para comecar."
        ctaLabel="Adicionar carteira"
        ctaAction={() => {}}
        secondaryCTA={{
          label: 'Importar historico',
          onClick,
        }}
        // @ts-expect-error — prop nova a ser adicionada em RF-05
        telemetryContext="bankroll_empty"
      />,
    );

    fireEvent.click(screen.getByTestId('empty-state-secondary-cta'));

    // onClick original continua sendo invocado.
    expect(onClick).toHaveBeenCalledTimes(1);

    // track chamado com o evento canonico de RF-05.
    const matching = trackMock.mock.calls.find(
      (c) => c[0] === 'empty_state.secondary_cta_click',
    );
    expect(matching).toBeDefined();
    expect(matching![1]).toEqual(
      expect.objectContaining({ context: 'bankroll_empty' }),
    );
  });

  it('SEM telemetryContext -> track NAO chamado pelo pipeline RF-05', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Sem carteiras"
        description="Crie a primeira carteira"
        ctaLabel="Criar"
        ctaAction={() => {}}
        secondaryCTA={{ label: 'Pular', onClick }}
      />,
    );

    fireEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    expect(onClick).toHaveBeenCalledTimes(1);

    // Pode existir telemetria legada (window.__telemetry) — mas o pipeline
    // novo via `@/lib/telemetry.track` com evento `secondary_cta_click` NAO
    // deve disparar sem contexto.
    const matching = trackMock.mock.calls.find(
      (c) => c[0] === 'empty_state.secondary_cta_click',
    );
    expect(matching).toBeUndefined();
  });

  it('clique no CTA primario NAO dispara o evento de secondary', () => {
    const ctaAction = vi.fn();
    render(
      <EmptyState
        title="Sem dados"
        description="Importe um CSV"
        ctaLabel="Importar"
        ctaAction={ctaAction}
        secondaryCTA={{ label: 'Demo', onClick: () => {} }}
        // @ts-expect-error — prop nova a ser adicionada em RF-05
        telemetryContext="grind_live_empty"
      />,
    );

    fireEvent.click(screen.getByTestId('empty-state-cta'));
    expect(ctaAction).toHaveBeenCalledTimes(1);

    const matching = trackMock.mock.calls.find(
      (c) => c[0] === 'empty_state.secondary_cta_click',
    );
    expect(matching).toBeUndefined();
  });

  it('clique em secondaryCTA com diferentes contextos passa context correto', () => {
    const { rerender } = render(
      <EmptyState
        title="A"
        description="A"
        ctaLabel="A"
        ctaAction={() => {}}
        secondaryCTA={{ label: 'Sec', onClick: () => {} }}
        // @ts-expect-error — prop nova
        telemetryContext="week_grid_empty"
      />,
    );
    fireEvent.click(screen.getByTestId('empty-state-secondary-cta'));

    rerender(
      <EmptyState
        title="B"
        description="B"
        ctaLabel="B"
        ctaAction={() => {}}
        secondaryCTA={{ label: 'Sec', onClick: () => {} }}
        // @ts-expect-error — prop nova
        telemetryContext="coach_empty"
      />,
    );
    fireEvent.click(screen.getByTestId('empty-state-secondary-cta'));

    const ctxValues = trackMock.mock.calls
      .filter((c) => c[0] === 'empty_state.secondary_cta_click')
      .map((c) => c[1]?.context);

    expect(ctxValues).toEqual(
      expect.arrayContaining(['week_grid_empty', 'coach_empty']),
    );
  });
});
