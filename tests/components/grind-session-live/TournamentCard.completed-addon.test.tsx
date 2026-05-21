/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint D / Grind Live + Tickets cluster
 *   RF-01.1 Add-on retroativo em CompletedCard
 *
 * Spec: Docs/specs/sprint-grind-live-cluster.md §Gap RF-01.1
 *
 * Cenarios cobertos:
 *   1) status=finished + allowsAddOn=true + addOnTaken=false + addOnCost>0
 *      -> botao "+ Add-on retroativo" visivel.
 *   2) Click no botao chama `onAddOnTaken(tournament.id, true)`.
 *   3) Quando `addOnTaken=true` no CompletedCard -> badge "+ Add-on pago"
 *      aparece e botao "Add-on retroativo" some.
 *   4) Sem `onAddOnTaken` (prop opcional ausente) -> botao NAO renderiza.
 *   5) Sem `allowsAddOn` -> nao renderiza botao.
 *
 * Lessons aplicadas:
 *   - #14 usar `await import(...)` em vez de `require()` no carregamento.
 *   - #28 `vi.mock` por path exato — sem mocks aqui pois testamos comportamento direto.
 *   - #11 default minimo — sem prop = sem render.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stub do helper de currency (depende de @shared/platform-currency runtime).
// Mantemos comportamento real do helpers/getAddOnButtonState; so estabilizamos
// formatBuyIn pra nao quebrar com `Number` arbitrarios.
vi.mock('@shared/platform-currency', async (orig) => {
  const real: any = await orig();
  return real;
});

function makeCompletedTournament(overrides: any = {}) {
  return {
    id: 'st-1',
    name: 'Sunday Million',
    site: 'PokerStars',
    status: 'finished',
    type: 'Vanilla',
    speed: 'Normal',
    time: '20:00',
    buyIn: '215',
    result: '0',
    rebuys: 0,
    allowsAddOn: true,
    addOnTaken: false,
    addOnCost: '50',
    addOnChips: 100000,
    allowsReentry: false,
    reentries: 0,
    ...overrides,
  };
}

const baseProps = {
  mode: 'completed' as const,
  onEdit: vi.fn(),
  onUnregister: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
};

describe('TournamentCard (mode=completed) — Add-on retroativo (RF-01.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cenario 1 — finished + allowsAddOn + !addOnTaken + onAddOnTaken -> botao visivel', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const onAddOnTaken = vi.fn();
    const t = makeCompletedTournament();

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
        onAddOnTaken={onAddOnTaken}
      />,
    );

    const btn = screen.getByTestId('btn-addon-retroativo');
    expect(btn).toBeInTheDocument();
  });

  it('cenario 2 — click chama onAddOnTaken(id, true)', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const onAddOnTaken = vi.fn();
    const t = makeCompletedTournament();
    const user = userEvent.setup();

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
        onAddOnTaken={onAddOnTaken}
      />,
    );

    await user.click(screen.getByTestId('btn-addon-retroativo'));

    expect(onAddOnTaken).toHaveBeenCalledTimes(1);
    expect(onAddOnTaken).toHaveBeenCalledWith('st-1', true);
  });

  it('cenario 3 — addOnTaken=true -> botao some + badge "+ Add-on pago"', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const onAddOnTaken = vi.fn();
    const t = makeCompletedTournament({ addOnTaken: true });

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
        onAddOnTaken={onAddOnTaken}
      />,
    );

    expect(screen.queryByTestId('btn-addon-retroativo')).not.toBeInTheDocument();
    // Badge ja existente no CompletedCard hoje (linha 727 do componente)
    expect(screen.getByText('+ Add-on pago')).toBeInTheDocument();
  });

  it('cenario 4 — sem onAddOnTaken -> botao NAO renderiza', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const t = makeCompletedTournament();

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
      />,
    );

    expect(screen.queryByTestId('btn-addon-retroativo')).not.toBeInTheDocument();
  });

  it('cenario 5 — sem allowsAddOn -> botao NAO renderiza', async () => {
    const TournamentCard = (await import('../../../client/src/components/grind-session-live/TournamentCard')).default;
    const onAddOnTaken = vi.fn();
    const t = makeCompletedTournament({ allowsAddOn: false });

    render(
      <TournamentCard
        {...(baseProps as any)}
        tournament={t}
        onAddOnTaken={onAddOnTaken}
      />,
    );

    expect(screen.queryByTestId('btn-addon-retroativo')).not.toBeInTheDocument();
  });
});
