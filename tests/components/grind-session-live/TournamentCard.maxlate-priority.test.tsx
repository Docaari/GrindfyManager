/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint grind-live-detail-parity
 *
 * Spec: Docs/specs/sprint-grind-live-detail-parity.md
 *   RF-01 prioridade no topo do card (Flame "Alta" + border-l-red-500; Baixa opacity/gray)
 *   RF-02 chip Max Late (Hourglass amber) em Upcoming + Registered
 *   RF-03 toggle/picker Max Late (Upcoming)
 *   RF-06 toggle/picker Max Late (Registered — rebuy)
 * ADR-214 D8 (sub-render compartilhado de prioridade + chip Max Late).
 *
 * --- CONTRATO DE CALLBACK ESCOLHIDO PELO TEST-WRITER ---------------------------
 *   O card recebe a prop  `onMaxLateChange(id: string, value: string | null): void`.
 *     - ON + picker confirmado com HH:MM valido -> onMaxLateChange(id, "HH:MM").
 *     - OFF                                       -> onMaxLateChange(id, null).
 *     - HH:MM invalido ("99:99" / "abc")          -> NAO chama; erro inline.
 *   O implementer liga essa prop a mutation otimistic + replaceMaxLateAlert no
 *   GrindSessionLive (D6/D4). O componente em si so valida o input e dispara o
 *   callback — a resolucao de endpoint/alerta NAO e responsabilidade do card.
 * -------------------------------------------------------------------------------
 *
 * Estes data-testid / props AINDA NAO EXISTEM no TournamentCard — o implementer
 * vai adiciona-los. Red phase: falham por elemento/prop ausente.
 *
 * Lessons aplicadas:
 *   - #14/#26 await import (nao require) ao carregar o componente.
 *   - #2 data-testid estaveis (live-tournament-priority-badge-{id}, etc.) — nao DOM heuristics.
 *   - #27 toggle/picker sao botoes/inputs NATIVOS -> fireEvent.click/change ok.
 *   - #1 hooks-first (validado indiretamente: render nao deve quebrar por hook order).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const CARD = '../../../client/src/components/grind-session-live/TournamentCard';

function loadCard() {
  return import(CARD).then((m) => m.default);
}

// UpcomingCard usa useTicketMatchesForTournament (useQuery interno) — precisa de
// QueryClientProvider (lesson #29). Envolvemos todos os renders num provider real
// com retry off para que os testes falhem pela feature ausente, NAO por infra.
function renderCard(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ---- props base por modo ------------------------------------------------------

function makeUpcoming(overrides: any = {}) {
  return {
    id: 'up-1',
    name: 'Bounty Builder',
    site: 'PokerStars',
    status: 'upcoming',
    type: 'Vanilla',
    speed: 'Normal',
    time: '20:00',
    buyIn: '109',
    prioridade: 2,
    registrationTime: null,
    ...overrides,
  };
}

function makeRegistered(overrides: any = {}) {
  return {
    id: 'st-1',
    name: 'Sunday Million',
    site: 'PokerStars',
    status: 'registered',
    type: 'Vanilla',
    speed: 'Normal',
    time: '20:00',
    buyIn: '215',
    prioridade: 2,
    rebuys: 0,
    reentries: 0,
    registrationTime: null,
    ...overrides,
  };
}

const upcomingBaseProps = {
  mode: 'upcoming' as const,
  registered: [],
  onRegister: vi.fn(),
  onRegisterWithTicket: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  queryClient: {} as any,
  onOpenTournamentAlert: vi.fn(),
};

const registeredBaseProps = {
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

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// RF-01 — prioridade no topo
// =============================================================================

describe('TournamentCard RF-01 — prioridade no topo (Upcoming)', () => {
  it('prioridade=1 renderiza badge live-tournament-priority-badge-{id} com "Alta"', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ prioridade: 1 });
    renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={t} />);

    const badge = screen.getByTestId('live-tournament-priority-badge-up-1');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/Alta/i);
  });

  it('prioridade=1 renderiza icone Flame dentro do badge de prioridade', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ prioridade: 1 });
    const { container } = renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={t} />);

    const badge = screen.getByTestId('live-tournament-priority-badge-up-1');
    // lucide-react Flame renderiza <svg class="lucide-flame ..."> OU data atributo.
    const flame = badge.querySelector('svg');
    expect(flame).toBeTruthy();
    // O card como um todo deve conter um Flame (classe lucide-flame).
    expect(container.querySelector('.lucide-flame, [class*="flame"]')).toBeTruthy();
  });

  it('prioridade=1 aplica border-l-red-500 no card', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ prioridade: 1 });
    const { container } = renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={t} />);

    expect(container.querySelector('[class*="border-l-red-500"]')).toBeTruthy();
  });

  it('prioridade=3 aplica opacity-90 e nome em text-gray-400', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ prioridade: 3 });
    const { container } = renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={t} />);

    expect(container.querySelector('[class*="opacity-90"]')).toBeTruthy();
    expect(container.querySelector('[class*="text-gray-400"]')).toBeTruthy();
  });

  it('prioridade=2 (Media) NAO renderiza badge de prioridade inline no topo', async () => {
    const TournamentCard = await loadCard();
    // Card Alta (controle positivo) DEVE ter o badge — garante que o testid e o
    // correto e que a impl existe; sem isso a asserção de ausência (Media)
    // passaria vacuamente na red phase.
    const alta = makeUpcoming({ id: 'ctrl-alta', prioridade: 1 });
    renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={alta} />);
    expect(screen.getByTestId('live-tournament-priority-badge-ctrl-alta')).toBeInTheDocument();

    // Card Media — sem badge inline.
    const media = makeUpcoming({ id: 'ctrl-media', prioridade: 2 });
    renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={media} />);
    expect(screen.queryByTestId('live-tournament-priority-badge-ctrl-media')).not.toBeInTheDocument();
  });
});

describe('TournamentCard RF-01 — prioridade no topo (Registered)', () => {
  it('prioridade=1 renderiza badge live-tournament-priority-badge-{id} com "Alta" + border vermelha', async () => {
    const TournamentCard = await loadCard();
    const t = makeRegistered({ prioridade: 1 });
    const { container } = renderCard(<TournamentCard {...(registeredBaseProps as any)} tournament={t} />);

    const badge = screen.getByTestId('live-tournament-priority-badge-st-1');
    expect(badge.textContent).toMatch(/Alta/i);
    expect(container.querySelector('[class*="border-l-red-500"]')).toBeTruthy();
  });
});

// =============================================================================
// RF-02 — chip Max Late
// =============================================================================

describe('TournamentCard RF-02 — chip Max Late', () => {
  it('Upcoming com registrationTime "23:45" exibe live-tournament-maxlate-{id} com "23:45"', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ registrationTime: '23:45' });
    renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={t} />);

    const chip = screen.getByTestId('live-tournament-maxlate-up-1');
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toContain('23:45');
  });

  it('Upcoming chip Max Late contem icone Hourglass', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ registrationTime: '23:45' });
    renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={t} />);

    const chip = screen.getByTestId('live-tournament-maxlate-up-1');
    expect(chip.querySelector('.lucide-hourglass, [class*="hourglass"], svg')).toBeTruthy();
  });

  it('Registered com registrationTime "22:10" exibe chip Max Late', async () => {
    const TournamentCard = await loadCard();
    const t = makeRegistered({ registrationTime: '22:10' });
    renderCard(<TournamentCard {...(registeredBaseProps as any)} tournament={t} />);

    const chip = screen.getByTestId('live-tournament-maxlate-st-1');
    expect(chip.textContent).toContain('22:10');
  });

  it('registrationTime null -> chip ausente, mas toggle presente (Upcoming)', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ registrationTime: null });
    renderCard(<TournamentCard {...(upcomingBaseProps as any)} tournament={t} onMaxLateChange={vi.fn()} />);

    // Controle positivo: o toggle Max Late DEVE existir (requer impl). Sem este
    // controle, a asserção de ausência passaria vacuamente na red phase.
    expect(screen.getByTestId('live-maxlate-toggle-up-1')).toBeInTheDocument();
    // Sem registrationTime -> chip read-only ausente.
    expect(screen.queryByTestId('live-tournament-maxlate-up-1')).not.toBeInTheDocument();
  });

  it('registrationTime "" (vazio) -> chip ausente, mas toggle presente (Registered)', async () => {
    const TournamentCard = await loadCard();
    const t = makeRegistered({ registrationTime: '' });
    renderCard(<TournamentCard {...(registeredBaseProps as any)} tournament={t} onMaxLateChange={vi.fn()} />);

    // Controle positivo (requer impl) — evita passe vacuo na red phase.
    expect(screen.getByTestId('live-maxlate-toggle-st-1')).toBeInTheDocument();
    expect(screen.queryByTestId('live-tournament-maxlate-st-1')).not.toBeInTheDocument();
  });
});

// =============================================================================
// RF-03 / RF-06 — toggle + picker Max Late
// =============================================================================

describe('TournamentCard RF-03/RF-06 — toggle Max Late presente', () => {
  it('Upcoming renderiza live-maxlate-toggle-{id}', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming();
    renderCard(
      <TournamentCard {...(upcomingBaseProps as any)} tournament={t} onMaxLateChange={vi.fn()} />,
    );

    expect(screen.getByTestId('live-maxlate-toggle-up-1')).toBeInTheDocument();
  });

  it('Registered renderiza live-maxlate-toggle-{id} (RF-06 rebuy)', async () => {
    const TournamentCard = await loadCard();
    const t = makeRegistered();
    renderCard(
      <TournamentCard {...(registeredBaseProps as any)} tournament={t} onMaxLateChange={vi.fn()} />,
    );

    expect(screen.getByTestId('live-maxlate-toggle-st-1')).toBeInTheDocument();
  });
});

describe('TournamentCard RF-03 — picker + validacao + callback', () => {
  it('toggle ON em card sem registrationTime exibe picker (input time)', async () => {
    const TournamentCard = await loadCard();
    const t = makeUpcoming({ registrationTime: null });
    renderCard(
      <TournamentCard {...(upcomingBaseProps as any)} tournament={t} onMaxLateChange={vi.fn()} />,
    );

    // estado inicial sem picker
    expect(screen.queryByTestId('live-maxlate-picker-up-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('live-maxlate-toggle-up-1'));

    const picker = screen.getByTestId('live-maxlate-picker-up-1');
    expect(picker).toBeInTheDocument();
  });

  it('confirmar "22:30" chama onMaxLateChange(id, "22:30")', async () => {
    const TournamentCard = await loadCard();
    const onMaxLateChange = vi.fn();
    const t = makeUpcoming({ registrationTime: null });
    renderCard(
      <TournamentCard {...(upcomingBaseProps as any)} tournament={t} onMaxLateChange={onMaxLateChange} />,
    );

    fireEvent.click(screen.getByTestId('live-maxlate-toggle-up-1'));
    const picker = screen.getByTestId('live-maxlate-picker-up-1');
    fireEvent.change(picker, { target: { value: '22:30' } });
    fireEvent.click(screen.getByTestId('live-maxlate-confirm-up-1'));

    expect(onMaxLateChange).toHaveBeenCalledWith('up-1', '22:30');
  });

  it('toggle OFF (card JA com registrationTime) chama onMaxLateChange(id, null)', async () => {
    const TournamentCard = await loadCard();
    const onMaxLateChange = vi.fn();
    const t = makeUpcoming({ registrationTime: '22:30' });
    renderCard(
      <TournamentCard {...(upcomingBaseProps as any)} tournament={t} onMaxLateChange={onMaxLateChange} />,
    );

    // Toggle quando ja ativo -> OFF -> callback com null.
    fireEvent.click(screen.getByTestId('live-maxlate-toggle-up-1'));

    expect(onMaxLateChange).toHaveBeenCalledWith('up-1', null);
  });

  it('picker invalido "99:99" -> NAO chama onMaxLateChange + erro inline', async () => {
    const TournamentCard = await loadCard();
    const onMaxLateChange = vi.fn();
    const t = makeUpcoming({ registrationTime: null });
    renderCard(
      <TournamentCard {...(upcomingBaseProps as any)} tournament={t} onMaxLateChange={onMaxLateChange} />,
    );

    fireEvent.click(screen.getByTestId('live-maxlate-toggle-up-1'));
    fireEvent.change(screen.getByTestId('live-maxlate-picker-up-1'), { target: { value: '99:99' } });
    fireEvent.click(screen.getByTestId('live-maxlate-confirm-up-1'));

    expect(onMaxLateChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-maxlate-error-up-1')).toBeInTheDocument();
  });

  it('picker invalido "abc" -> NAO chama onMaxLateChange + erro inline', async () => {
    const TournamentCard = await loadCard();
    const onMaxLateChange = vi.fn();
    const t = makeUpcoming({ registrationTime: null });
    renderCard(
      <TournamentCard {...(upcomingBaseProps as any)} tournament={t} onMaxLateChange={onMaxLateChange} />,
    );

    fireEvent.click(screen.getByTestId('live-maxlate-toggle-up-1'));
    fireEvent.change(screen.getByTestId('live-maxlate-picker-up-1'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('live-maxlate-confirm-up-1'));

    expect(onMaxLateChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-maxlate-error-up-1')).toBeInTheDocument();
  });
});

describe('TournamentCard RF-06 — picker/save em Registered (rebuy)', () => {
  it('confirmar "21:45" em Registered chama onMaxLateChange(id, "21:45")', async () => {
    const TournamentCard = await loadCard();
    const onMaxLateChange = vi.fn();
    const t = makeRegistered({ registrationTime: null });
    renderCard(
      <TournamentCard {...(registeredBaseProps as any)} tournament={t} onMaxLateChange={onMaxLateChange} />,
    );

    fireEvent.click(screen.getByTestId('live-maxlate-toggle-st-1'));
    fireEvent.change(screen.getByTestId('live-maxlate-picker-st-1'), { target: { value: '21:45' } });
    fireEvent.click(screen.getByTestId('live-maxlate-confirm-st-1'));

    expect(onMaxLateChange).toHaveBeenCalledWith('st-1', '21:45');
  });

  it('toggle OFF em Registered com registrationTime chama onMaxLateChange(id, null)', async () => {
    const TournamentCard = await loadCard();
    const onMaxLateChange = vi.fn();
    const t = makeRegistered({ registrationTime: '21:45' });
    renderCard(
      <TournamentCard {...(registeredBaseProps as any)} tournament={t} onMaxLateChange={onMaxLateChange} />,
    );

    fireEvent.click(screen.getByTestId('live-maxlate-toggle-st-1'));

    expect(onMaxLateChange).toHaveBeenCalledWith('st-1', null);
  });
});
