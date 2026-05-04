/**
 * Test — Sprint home-reform-5 item 4.
 *
 * Spec: Docs/specs/home-reform-5.md item 4 (Acao Imediata).
 *
 * Cobre componente <ImmediateAction /> com 3 variants + null:
 *   - pending_hand: count + CTA /estudos.
 *   - focus_stat:   statName + daysSince + CTA ctaHref.
 *   - start_session: plannedCount + activeProfilesLabel + CTA /grind?open=quickstart.
 *   - null: nao renderiza nada.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

describe('<ImmediateAction /> — null', () => {
  it('nao renderiza nada quando data eh null', async () => {
    const { default: ImmediateAction } = await import('../ImmediateAction');
    const { container } = render(<ImmediateAction data={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('<ImmediateAction /> — pending_hand', () => {
  it('mostra contagem e CTA /estudos', async () => {
    const { default: ImmediateAction } = await import('../ImmediateAction');
    render(
      <ImmediateAction
        data={{ kind: 'pending_hand', count: 3, ctaHref: '/estudos' }}
      />,
    );
    const card = screen.getByTestId('immediate-action');
    expect(card).toHaveAttribute('data-kind', 'pending_hand');
    expect(card.textContent).toMatch(/3/);
    expect(card.textContent?.toLowerCase()).toMatch(/m[ãa]os? pendentes?/i);
    const cta = screen.getByTestId('immediate-action-cta');
    expect(cta).toHaveAttribute('href', '/estudos');
  });

  it('singular quando count=1', async () => {
    const { default: ImmediateAction } = await import('../ImmediateAction');
    render(
      <ImmediateAction
        data={{ kind: 'pending_hand', count: 1, ctaHref: '/estudos' }}
      />,
    );
    expect(screen.getByTestId('immediate-action').textContent).toMatch(/1 m[ãa]o pendente/i);
  });
});

describe('<ImmediateAction /> — focus_stat (slot dormante)', () => {
  it('mostra statName + daysSince + CTA ctaHref repassado', async () => {
    const { default: ImmediateAction } = await import('../ImmediateAction');
    render(
      <ImmediateAction
        data={{
          kind: 'focus_stat',
          statName: 'PFR',
          daysSince: 11,
          ctaHref: '/estudos/stats/PFR',
        }}
      />,
    );
    const card = screen.getByTestId('immediate-action');
    expect(card).toHaveAttribute('data-kind', 'focus_stat');
    expect(card.textContent).toContain('PFR');
    expect(card.textContent).toMatch(/11/);
    const cta = screen.getByTestId('immediate-action-cta');
    expect(cta).toHaveAttribute('href', '/estudos/stats/PFR');
  });
});

describe('<ImmediateAction /> — start_session', () => {
  it('mostra plannedCount + activeProfilesLabel + CTA /grind?open=quickstart', async () => {
    const { default: ImmediateAction } = await import('../ImmediateAction');
    render(
      <ImmediateAction
        data={{
          kind: 'start_session',
          plannedCount: 8,
          activeProfilesLabel: 'A + B',
          ctaHref: '/grind?open=quickstart',
        }}
      />,
    );
    const card = screen.getByTestId('immediate-action');
    expect(card).toHaveAttribute('data-kind', 'start_session');
    expect(card.textContent).toMatch(/8/);
    expect(card.textContent).toContain('A + B');
    const cta = screen.getByTestId('immediate-action-cta');
    expect(cta).toHaveAttribute('href', '/grind?open=quickstart');
    expect(cta.textContent?.toLowerCase()).toMatch(/in[ií]cio r[áa]pido|iniciar/i);
  });

  it('omite linha de perfis quando activeProfilesLabel eh null', async () => {
    const { default: ImmediateAction } = await import('../ImmediateAction');
    render(
      <ImmediateAction
        data={{
          kind: 'start_session',
          plannedCount: 3,
          activeProfilesLabel: null,
          ctaHref: '/grind?open=quickstart',
        }}
      />,
    );
    expect(screen.getByTestId('immediate-action').textContent).toMatch(/3/);
    expect(screen.queryByTestId('immediate-action-profiles-label')).toBeNull();
  });
});
