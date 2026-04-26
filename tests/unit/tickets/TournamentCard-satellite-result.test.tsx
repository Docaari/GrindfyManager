import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: extensao de TournamentCard.tsx ResultDialog para tipo Satellite (RF-02)
//
// Fontes:
//  - docs/specs/satellite-tickets-management.md (RF-02)
//  - docs/architecture/feature-flows/satellite-result.md
//
// Contrato:
//  - Quando tournament.type === 'Satellite', dialog mostra 3 botoes em vez do
//    formulario atual: "Ganhei ticket" / "Ganhei cash" / "Nao passei".
//  - "Ganhei ticket" dispara PUT session-tournament + POST /api/tickets em paralelo.
//  - "Ganhei cash" comporta-se como Vanilla atual.
//  - "Nao passei" finaliza com prize=0.
//  - satelliteRewardType=ticket -> "Ganhei cash" desabilitado.
//  - Race recovery: PUT ok + POST 500 -> toast com CTA pre-preenchido.
//
// Estrategia: importamos TournamentCard com props minimos. Testes de seletor
// usam data-testid estaveis para evitar heuristicas DOM.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { TournamentCard } from '../../../client/src/components/grind-session-live/TournamentCard';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers — minimal mocks para o componente
// ---------------------------------------------------------------------------

function makeSatelliteTournament(overrides: Partial<any> = {}) {
  return {
    id: 'st-1',
    sessionId: 'sess-1',
    userId: 'USER-0001',
    name: 'Satelite WSOP $11',
    site: 'GG',
    type: 'Satellite',
    speed: 'Normal',
    buyIn: '11',
    prize: '0',
    bounty: '0',
    status: 'registered',
    satelliteRewardType: 'ticket',
    satelliteTicketValue: '215',
    satelliteTargetTemplateId: null,
    satelliteTargetName: 'WSOP Main Event Online',
    satelliteExtraCash: null,
    ...overrides,
  };
}

const baseProps = {
  registered: true as boolean,
  index: 0,
  totalCount: 1,
  registrationData: {} as any,
  onSetRegistrationData: () => {},
  onFinishDirect: vi.fn(),
  onUnregister: vi.fn(),
  onBust: vi.fn(),
  onLateReg: vi.fn(),
  onEdit: vi.fn(),
  onEditTime: vi.fn(),
  onDelete: vi.fn(),
  onRegister: vi.fn(),
  isSelected: false,
  onToggleSelect: vi.fn(),
  onCreateLateRegAlert: vi.fn(),
  hasAlertForTournament: () => false,
  queryClient: { invalidateQueries: vi.fn() },
};

// ---------------------------------------------------------------------------
// Render: 3 botoes para Satellite
// ---------------------------------------------------------------------------

describe('TournamentCard ResultDialog - Satellite render', () => {
  it('quando type=Satellite, dialog mostra 3 outcome buttons', async () => {
    const tournament = makeSatelliteTournament();

    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    // Abrir dialog clicando em "Resultado"
    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));

    await waitFor(() => {
      expect(screen.getByTestId('satellite-outcome-ticket')).toBeTruthy();
      expect(screen.getByTestId('satellite-outcome-cash')).toBeTruthy();
      expect(screen.getByTestId('satellite-outcome-nopass')).toBeTruthy();
    });
  });

  it('quando type=Vanilla, NAO mostra outcome buttons (comportamento atual preservado)', async () => {
    const tournament = makeSatelliteTournament({ type: 'Vanilla', satelliteRewardType: null });

    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));

    await waitFor(() => {
      expect(screen.queryByTestId('satellite-outcome-ticket')).toBeNull();
      expect(screen.queryByTestId('satellite-outcome-cash')).toBeNull();
      expect(screen.queryByTestId('satellite-outcome-nopass')).toBeNull();
    });
  });

  it('satelliteRewardType=ticket -> "Ganhei cash" desabilitado', async () => {
    const tournament = makeSatelliteTournament({ satelliteRewardType: 'ticket' });

    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));

    await waitFor(() => {
      const cashBtn = screen.getByTestId('satellite-outcome-cash') as HTMLButtonElement;
      expect(cashBtn.disabled).toBe(true);
    });
  });

  it('satelliteRewardType=cash -> "Ganhei ticket" desabilitado', async () => {
    const tournament = makeSatelliteTournament({ satelliteRewardType: 'cash' });

    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));

    await waitFor(() => {
      const ticketBtn = screen.getByTestId('satellite-outcome-ticket') as HTMLButtonElement;
      expect(ticketBtn.disabled).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Outcome "Ganhei ticket"
// ---------------------------------------------------------------------------

describe('TournamentCard ResultDialog - Satellite "Ganhei ticket"', () => {
  it('clique em "Ganhei ticket" + submit dispara PUT session + POST tickets', async () => {
    (apiRequest as any).mockImplementation((method: string, url: string) => {
      if (url.includes('/api/session-tournaments/')) return Promise.resolve({ ok: true });
      if (url.includes('/api/tickets')) {
        return Promise.resolve({
          ticket: { id: 'tkt-1', status: 'available' },
          walletTransaction: null,
        });
      }
      return Promise.resolve({});
    });

    const tournament = makeSatelliteTournament();
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));

    await waitFor(() => {
      expect(screen.getByTestId('satellite-outcome-ticket')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('satellite-outcome-ticket'));

    // Esperamos um campo de valor pre-preenchido com satelliteTicketValue
    await waitFor(() => {
      const valueInput = screen.getByTestId('satellite-ticket-value-input') as HTMLInputElement;
      expect(valueInput.value).toMatch(/215/);
    });

    fireEvent.click(screen.getByTestId('satellite-result-submit'));

    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const urls = calls.map((c: any) => c[1] ?? c[0]);
      expect(urls.some((u: string) => u.includes('/api/session-tournaments/'))).toBe(true);
      expect(urls.some((u: string) => u.includes('/api/tickets'))).toBe(true);
    });
  });

  it('"Ganhei ticket" envia POST /api/tickets com source=satellite_result e sourceSessionTournamentId', async () => {
    (apiRequest as any).mockResolvedValue({
      ticket: { id: 'tkt-1', status: 'available' },
      walletTransaction: null,
    });

    const tournament = makeSatelliteTournament({ id: 'st-A' });
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));
    await waitFor(() => {
      expect(screen.getByTestId('satellite-outcome-ticket')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('satellite-outcome-ticket'));
    await waitFor(() => {
      expect(screen.getByTestId('satellite-ticket-value-input')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('satellite-result-submit'));

    await waitFor(() => {
      const ticketCall = (apiRequest as any).mock.calls.find((c: any) =>
        (c[1] ?? c[0]).includes('/api/tickets'),
      );
      expect(ticketCall).toBeDefined();
      const body = ticketCall[2];
      expect(body.source).toBe('satellite_result');
      expect(body.sourceSessionTournamentId).toBe('st-A');
      expect(Number(body.ticketValueUSD)).toBe(215);
    });
  });

  it('"Ganhei ticket" sem ticketValueUSD valido -> erro inline, NAO submete', async () => {
    const tournament = makeSatelliteTournament({ satelliteTicketValue: null });
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));
    await waitFor(() => screen.getByTestId('satellite-outcome-ticket'));
    fireEvent.click(screen.getByTestId('satellite-outcome-ticket'));

    await waitFor(() => {
      const input = screen.getByTestId('satellite-ticket-value-input') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    fireEvent.click(screen.getByTestId('satellite-result-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('satellite-ticket-value-error')).toBeTruthy();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Outcome "Ganhei cash"
// ---------------------------------------------------------------------------

describe('TournamentCard ResultDialog - Satellite "Ganhei cash"', () => {
  it('clique em "Ganhei cash" mostra fluxo Vanilla atual (campos prize/position)', async () => {
    const tournament = makeSatelliteTournament({ satelliteRewardType: 'mixed' });
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));
    await waitFor(() => screen.getByTestId('satellite-outcome-cash'));
    fireEvent.click(screen.getByTestId('satellite-outcome-cash'));

    await waitFor(() => {
      expect(screen.getByTestId('satellite-cash-prize-input')).toBeTruthy();
    });
  });

  it('"Ganhei cash" submit nao cria ticket (POST /api/tickets nao chamado)', async () => {
    (apiRequest as any).mockResolvedValue({});

    const tournament = makeSatelliteTournament({ satelliteRewardType: 'mixed' });
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));
    await waitFor(() => screen.getByTestId('satellite-outcome-cash'));
    fireEvent.click(screen.getByTestId('satellite-outcome-cash'));
    await waitFor(() => screen.getByTestId('satellite-cash-prize-input'));

    fireEvent.change(screen.getByTestId('satellite-cash-prize-input'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByTestId('satellite-result-submit'));

    await waitFor(() => {
      const ticketCall = (apiRequest as any).mock.calls.find((c: any) =>
        (c[1] ?? c[0]).includes('/api/tickets'),
      );
      expect(ticketCall).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Outcome "Nao passei"
// ---------------------------------------------------------------------------

describe('TournamentCard ResultDialog - Satellite "Nao passei"', () => {
  it('"Nao passei" finaliza com prize=0, sem criar ticket', async () => {
    (apiRequest as any).mockResolvedValue({});

    const tournament = makeSatelliteTournament({ id: 'st-bust' });
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));
    await waitFor(() => screen.getByTestId('satellite-outcome-nopass'));
    fireEvent.click(screen.getByTestId('satellite-outcome-nopass'));

    fireEvent.click(screen.getByTestId('satellite-result-submit'));

    await waitFor(() => {
      const sessionCall = (apiRequest as any).mock.calls.find((c: any) =>
        (c[1] ?? c[0]).includes('/api/session-tournaments/'),
      );
      expect(sessionCall).toBeDefined();
      const body = sessionCall[2];
      expect(Number(body.prize ?? 0)).toBe(0);

      const ticketCall = (apiRequest as any).mock.calls.find((c: any) =>
        (c[1] ?? c[0]).includes('/api/tickets'),
      );
      expect(ticketCall).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Race recovery: PUT ok + POST tickets falha
// ---------------------------------------------------------------------------

describe('TournamentCard ResultDialog - Satellite race recovery', () => {
  it('PUT session ok + POST /api/tickets 500 -> mostra toast com CTA "Registrar manualmente"', async () => {
    (apiRequest as any).mockImplementation((method: string, url: string) => {
      if (url.includes('/api/session-tournaments/')) return Promise.resolve({ ok: true });
      if (url.includes('/api/tickets')) {
        return Promise.reject(Object.assign(new Error('Server error'), { statusCode: 500 }));
      }
      return Promise.resolve({});
    });

    const tournament = makeSatelliteTournament();
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));
    await waitFor(() => screen.getByTestId('satellite-outcome-ticket'));
    fireEvent.click(screen.getByTestId('satellite-outcome-ticket'));
    await waitFor(() => screen.getByTestId('satellite-ticket-value-input'));

    fireEvent.click(screen.getByTestId('satellite-result-submit'));

    await waitFor(() => {
      // Toast/banner com CTA aparece
      expect(screen.getByTestId('satellite-ticket-recovery-toast')).toBeTruthy();
      expect(screen.getByTestId('satellite-ticket-recovery-cta')).toBeTruthy();
    });
  });

  it('PUT session falha (500) -> NAO chama POST /api/tickets', async () => {
    (apiRequest as any).mockImplementation((method: string, url: string) => {
      if (url.includes('/api/session-tournaments/')) {
        return Promise.reject(Object.assign(new Error('PUT failed'), { statusCode: 500 }));
      }
      return Promise.resolve({});
    });

    const tournament = makeSatelliteTournament();
    render(withClient(
      <TournamentCard {...baseProps} tournament={tournament} />
    ));

    fireEvent.click(screen.getByTestId(`tournament-card-result-button-${tournament.id}`));
    await waitFor(() => screen.getByTestId('satellite-outcome-ticket'));
    fireEvent.click(screen.getByTestId('satellite-outcome-ticket'));
    await waitFor(() => screen.getByTestId('satellite-ticket-value-input'));

    fireEvent.click(screen.getByTestId('satellite-result-submit'));

    await waitFor(() => {
      const ticketCall = (apiRequest as any).mock.calls.find((c: any) =>
        (c[1] ?? c[0]).includes('/api/tickets'),
      );
      expect(ticketCall).toBeUndefined();
    });
  });
});
