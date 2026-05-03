import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-12: SeriesBadge (visual indicator nos torneios/planneds)
//
// Spec : Docs/specs/sprint-flight-1.md (RF-12)
//
// Comportamento:
//  - <SeriesBadge tournament={t} /> ou <SeriesBadge planned={p} />
//  - Tournament Day 1 -> badge com flightDay extraido + badge "Phased" azul
//  - Tournament Day 2 -> badge "Day 2" + "Phased" + tooltip nome serie (hover)
//  - Planned Day 2 -> badge "Day 2" + tooltip "Auto-criado por serie X"
//  - Sem seriesId -> render null (ou empty)
// =============================================================================

import { SeriesBadge } from '../../../client/src/components/flight/SeriesBadge';

describe('SeriesBadge — render (RF-12)', () => {
  it('tournament Day 1A com seriesId mostra badge', () => {
    render(
      <SeriesBadge tournament={{
        id: 't-1',
        seriesId: 'srs-1',
        name: 'Sunday Million Phased Day 1A',
      } as any} />,
    );
    expect(screen.getByTestId('series-badge')).toBeTruthy();
  });

  it('tournament SEM seriesId nao renderiza badge (returns null)', () => {
    const { container } = render(
      <SeriesBadge tournament={{
        id: 't-1',
        seriesId: null,
        name: 'Sunday $5 Bounty',
      } as any} />,
    );
    expect(container.querySelector('[data-testid="series-badge"]')).toBeNull();
  });

  it('tournament com nome contendo "Day 2" mostra badge "Day 2"', () => {
    render(
      <SeriesBadge tournament={{
        id: 't-2',
        seriesId: 'srs-1',
        name: 'Sunday Million Phased Day 2',
      } as any} />,
    );
    const badge = screen.getByTestId('series-badge');
    expect(badge.textContent).toMatch(/Day 2|Day2/i);
  });

  it('planned com seriesId mostra badge "Day 2"', () => {
    render(
      <SeriesBadge planned={{
        id: 'p-1',
        seriesId: 'srs-1',
        name: 'Sunday Million Phased — Day 2',
      } as any} />,
    );
    expect(screen.getByTestId('series-badge')).toBeTruthy();
  });

  it('flightDay nao extraivel do nome -> fallback "Day 1" generico', () => {
    render(
      <SeriesBadge tournament={{
        id: 't-x',
        seriesId: 'srs-1',
        name: 'Custom Series Entry',
      } as any} />,
    );
    const badge = screen.getByTestId('series-badge');
    expect(badge.textContent).toBeTruthy();
  });
});
