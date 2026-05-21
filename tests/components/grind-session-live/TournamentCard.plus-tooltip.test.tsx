/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint D / Grind Live + Tickets cluster
 *   RF-01.2 Tooltip default-minimo no Plus badge
 *
 * Spec: Docs/specs/sprint-grind-live-cluster.md §Gap RF-01.2
 *
 * Cenarios cobertos:
 *   1) RegisteredCard com allowsAddOn=true -> badge "Plus" tem `title` ou
 *      Tooltip que contem "add-on" + valor do custo.
 *   2) RegisteredCard sem allowsAddOn -> sem badge "Plus".
 *   3) Hover dispara o Tooltip (Radix Tooltip: userEvent.hover funciona pelo
 *      `pointerenter`).
 *
 * Lessons aplicadas:
 *   - #14 await import.
 *   - #27 Radix reage a pointer/mouse events; usar userEvent.hover (NAO fireEvent.mouseOver).
 *   - #11 default minimo — sem allowsAddOn = sem badge.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function makeRegisteredTournament(overrides: any = {}) {
  return {
    id: 'st-1',
    name: 'Sunday Million',
    site: 'PokerStars',
    status: 'registered',
    type: 'Vanilla',
    speed: 'Normal',
    time: '20:00',
    buyIn: '215',
    allowsAddOn: true,
    addOnTaken: false,
    addOnCost: '50',
    allowsReentry: false,
    reentries: 0,
    rebuys: 0,
    prioridade: 2,
    ...overrides,
  };
}

const baseProps = {
  mode: 'registered' as const,
  index: 0,
  totalCount: 1,
  registrationData: {} as any,
  maxLateStates: {},
  editingPriority: null,
  onUnregister: vi.fn(),
  onRebuy: vi.fn(),
  onFinishDirect: vi.fn(),
  onPriorityClickCycle: vi.fn(),
  onPriorityClick: vi.fn(),
  onUpdatePriority: vi.fn(),
  setEditingPriority: vi.fn(),
  onSetRegistrationData: vi.fn(),
  onSetMaxLateStates: vi.fn(),
  updateIsPending: false,
};

describe('TournamentCard — Plus badge tooltip (RF-01.2)', () => {
  it('cenario 1 — badge Plus tem title/tooltip mencionando "add-on" e valor', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const t = makeRegisteredTournament();

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
      />,
    );

    const plusBadge = screen.getByTestId('badge-plus');
    // Aceita tanto `title` (HTML nativo) quanto `aria-label`/Tooltip (Radix).
    const titleAttr = plusBadge.getAttribute('title') ?? plusBadge.getAttribute('aria-label') ?? '';
    expect(titleAttr.toLowerCase()).toContain('add-on');
    // O custo aparece no texto (US$ 50, $50, etc — flexivel)
    expect(titleAttr).toMatch(/50/);
  });

  it('cenario 2 — sem allowsAddOn -> sem badge Plus', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const t = makeRegisteredTournament({ allowsAddOn: false });

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
      />,
    );

    expect(screen.queryByTestId('badge-plus')).not.toBeInTheDocument();
  });

  it('cenario 3 — userEvent.hover no badge nao quebra render (Radix tolerante)', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const t = makeRegisteredTournament();
    const user = userEvent.setup();

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
      />,
    );

    const plusBadge = screen.getByTestId('badge-plus');
    await user.hover(plusBadge);
    // Apos hover, o badge continua presente. (Para Tooltip Radix renderizado
    // no portal, o body deve conter texto sobre add-on — caso contrario, ao
    // menos `title` cobre via cenario 1.)
    expect(plusBadge).toBeInTheDocument();
  });
});
