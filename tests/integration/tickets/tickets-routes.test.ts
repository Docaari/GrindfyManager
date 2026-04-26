import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: server/routes/tickets.ts (Sprint Tickets-1)
//
// Endpoints cobertos:
//  - POST   /api/tickets                    (criacao manual OU satellite_result)
//  - GET    /api/tickets                    (listar com filtros)
//  - GET    /api/tickets/:id                (detalhe)
//  - PATCH  /api/tickets/:id/cancel         (RF-04 botao "Cancelar")
//  - POST   /api/tickets/:id/use            (consumir; match server-side)
//  - GET    /api/tickets/match              (verificar tickets disponiveis para tournament)
//
// Estrategia: testamos handlers isoladamente com makeReq/makeRes,
// mockando server/services/ticketService. Padrao identico ao
// tests/integration/wallets/wallets-routes.test.ts.
//
// Defaults aprovados pelo dev incorporados:
//  - source=satellite_result com extraCashUSD>0 -> wallet credit na PRIMEIRA
//    wallet ativa (ordem por displayOrder, depois createdAt).
//  - Match server-side obrigatorio em /use (template OU name+site case-insensitive).
//  - cancelled e terminal; refund vira deposit manual (Sprint 2).
// =============================================================================

vi.mock('../../../server/services/ticketService', () => ({
  ticketService: {
    createTicket: vi.fn(),
    listTickets: vi.fn(),
    getTicket: vi.fn(),
    cancelTicket: vi.fn(),
    useTicket: vi.fn(),
    matchTickets: vi.fn(),
  },
}));

import {
  handlePostTicket,
  handleGetTickets,
  handleGetTicket,
  handlePatchCancelTicket,
  handlePostUseTicket,
  handleGetTicketMatch,
} from '../../../server/routes/tickets';
import { ticketService } from '../../../server/services/ticketService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

// ===========================================================================
// POST /api/tickets — criacao
// ===========================================================================

describe('POST /api/tickets - manual', () => {
  it('happy path 201 com ticket criado (manual + targetTemplateId)', async () => {
    (ticketService.createTicket as any).mockResolvedValue({
      ticket: {
        id: 'tkt-1',
        userId: 'USER-0001',
        ticketValueUSD: '215',
        targetTemplateId: 'tpl-1',
        status: 'available',
        source: 'manual',
      },
      walletTransaction: null,
    });

    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        targetTemplateId: 'tpl-1',
        ticketValueUSD: 215,
        source: 'manual',
      },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.ticket).toBeDefined();
    expect(res.body.ticket.status).toBe('available');
  });

  it('happy path 201 com ticket criado (manual + targetName + targetSite)', async () => {
    (ticketService.createTicket as any).mockResolvedValue({
      ticket: {
        id: 'tkt-2', ticketValueUSD: '109',
        targetName: 'Sunday Storm', targetSite: 'PokerStars',
        status: 'available', source: 'manual',
      },
      walletTransaction: null,
    });

    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        targetName: 'Sunday Storm',
        targetSite: 'PokerStars',
        ticketValueUSD: 109,
        source: 'manual',
      },
    }) as any, res);

    expect(res.statusCode).toBe(201);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      user: undefined,
      body: { targetName: 'X', ticketValueUSD: 50, source: 'manual' },
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('Zod: ticketValueUSD = 0 -> 400', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: { targetName: 'X', ticketValueUSD: 0, source: 'manual' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: ticketValueUSD negativo -> 400', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: { targetName: 'X', ticketValueUSD: -5, source: 'manual' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: nem targetTemplateId nem targetName preenchido -> 400', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: { ticketValueUSD: 100, source: 'manual' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: ambos targetTemplateId E targetName -> 400 (XOR)', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        targetTemplateId: 'tpl-1',
        targetName: 'X',
        ticketValueUSD: 100,
        source: 'manual',
      },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: source invalido -> 400', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: { targetName: 'X', ticketValueUSD: 50, source: 'foo' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: source=satellite_result sem sourceSessionTournamentId -> 400', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        targetName: 'X', ticketValueUSD: 50,
        source: 'satellite_result',
      },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: extraCashUSD negativo -> 400', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        targetName: 'X', ticketValueUSD: 50,
        source: 'manual', extraCashUSD: -10,
      },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: expiresAt antes de earnedAt -> 400', async () => {
    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        targetName: 'X', ticketValueUSD: 50, source: 'manual',
        earnedAt: '2026-05-08T00:00:00Z',
        expiresAt: '2026-05-01T00:00:00Z',
      },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/tickets - satellite_result com extraCashUSD', () => {
  it('extraCashUSD>0 cria wallet_transaction na PRIMEIRA wallet ativa do user (default aprovado)', async () => {
    (ticketService.createTicket as any).mockResolvedValue({
      ticket: { id: 'tkt-3', status: 'available', source: 'satellite_result' },
      walletTransaction: { id: 'wtx-1', direction: 'in', reason: 'session_result' },
    });

    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        sourceSessionTournamentId: 'st-1',
        targetName: 'WSOP ME', targetSite: 'GG',
        ticketValueUSD: 215, extraCashUSD: 30,
        source: 'satellite_result',
      },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.walletTransaction).toBeDefined();
    expect(res.body.walletTransaction.reason).toBe('session_result');

    // Service e o responsavel por escolher a primeira wallet ativa.
    // Garantimos que recebeu o body correto.
    const args = (ticketService.createTicket as any).mock.calls[0];
    expect(args[1]).toMatchObject({
      extraCashUSD: 30,
      source: 'satellite_result',
    });
  });

  it('extraCashUSD ausente / 0 nao cria wallet_transaction', async () => {
    (ticketService.createTicket as any).mockResolvedValue({
      ticket: { id: 'tkt-4', status: 'available', source: 'satellite_result' },
      walletTransaction: null,
    });

    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        sourceSessionTournamentId: 'st-1',
        targetName: 'WSOP ME', targetSite: 'GG',
        ticketValueUSD: 215,
        source: 'satellite_result',
      },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.walletTransaction).toBeNull();
  });

  it('source=satellite_result mas sourceSessionTournamentId NAO pertence ao user -> 422', async () => {
    (ticketService.createTicket as any).mockRejectedValue(
      Object.assign(new Error('sourceSessionTournamentId nao pertence ao user'), { statusCode: 422 }),
    );

    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        sourceSessionTournamentId: 'st-other-user',
        targetName: 'WSOP ME', ticketValueUSD: 215,
        source: 'satellite_result',
      },
    }) as any, res);

    expect(res.statusCode).toBe(422);
  });

  it('atomicidade: ticketService falha em wallet_tx -> rollback (sem ticket criado)', async () => {
    // Service rejeita com 500 quando a transacao falha
    (ticketService.createTicket as any).mockRejectedValue(
      Object.assign(new Error('atomic transaction failed'), { statusCode: 500 }),
    );

    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        sourceSessionTournamentId: 'st-1',
        targetName: 'WSOP ME', targetSite: 'GG',
        ticketValueUSD: 215, extraCashUSD: 30,
        source: 'satellite_result',
      },
    }) as any, res);

    expect(res.statusCode).toBe(500);
  });

  it('user sem wallet ativa quando extraCashUSD>0 -> 400 com mensagem clara', async () => {
    (ticketService.createTicket as any).mockRejectedValue(
      Object.assign(
        new Error('Nenhuma wallet ativa para creditar extra cash'),
        { statusCode: 400, code: 'errNoActiveWallet' },
      ),
    );

    const res = makeRes();
    await handlePostTicket(makeReq({
      body: {
        sourceSessionTournamentId: 'st-1',
        targetName: 'WSOP ME', ticketValueUSD: 215, extraCashUSD: 30,
        source: 'satellite_result',
      },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/wallet|carteira/i);
  });
});

// ===========================================================================
// GET /api/tickets — list
// ===========================================================================

describe('GET /api/tickets', () => {
  it('happy path 200 com array de tickets ativos por default', async () => {
    (ticketService.listTickets as any).mockResolvedValue([
      { id: 'tkt-1', status: 'available', ticketValueUSD: '215' },
      { id: 'tkt-2', status: 'available', ticketValueUSD: '109' },
    ]);

    const res = makeRes();
    await handleGetTickets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.tickets ?? res.body)).toBe(true);
  });

  it('default oculta status != available (passa filtro available para o service)', async () => {
    (ticketService.listTickets as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetTickets(makeReq() as any, res);

    const args = (ticketService.listTickets as any).mock.calls[0];
    const filters = args[1] ?? {};
    expect(filters.status ?? 'available').toBe('available');
  });

  it('?status=all retorna qualquer status', async () => {
    (ticketService.listTickets as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetTickets(makeReq({ query: { status: 'all' } }) as any, res);

    const args = (ticketService.listTickets as any).mock.calls[0];
    const filters = args[1] ?? {};
    expect(filters.status === 'all' || filters.status === undefined).toBe(true);
  });

  it('?status=used filtra usados', async () => {
    (ticketService.listTickets as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetTickets(makeReq({ query: { status: 'used' } }) as any, res);

    const args = (ticketService.listTickets as any).mock.calls[0];
    expect(args[1].status).toBe('used');
  });

  it('?expiringIn=7 propaga ao service', async () => {
    (ticketService.listTickets as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetTickets(makeReq({ query: { expiringIn: '7' } }) as any, res);

    const args = (ticketService.listTickets as any).mock.calls[0];
    expect(args[1].expiringIn).toBe(7);
  });

  it('?targetTemplateId=tpl-1 propaga ao service', async () => {
    (ticketService.listTickets as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetTickets(makeReq({ query: { targetTemplateId: 'tpl-1' } }) as any, res);

    const args = (ticketService.listTickets as any).mock.calls[0];
    expect(args[1].targetTemplateId).toBe('tpl-1');
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetTickets(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/tickets/:id — detail
// ===========================================================================

describe('GET /api/tickets/:id', () => {
  it('happy path 200 com ticket + populated source/used', async () => {
    (ticketService.getTicket as any).mockResolvedValue({
      ticket: { id: 'tkt-1', status: 'available' },
      source: { type: 'satellite_result', sourceSessionTournament: { id: 'st-1', name: 'Satelite WSOP' } },
      usedIn: null,
    });

    const res = makeRes();
    await handleGetTicket(makeReq({ params: { id: 'tkt-1' } }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ticket).toBeDefined();
  });

  it('ticket inexistente -> 404', async () => {
    (ticketService.getTicket as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetTicket(makeReq({ params: { id: 'tkt-x' } }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('ticket de outro user -> 404 (info leak)', async () => {
    (ticketService.getTicket as any).mockRejectedValue(
      Object.assign(new Error('Not found'), { statusCode: 404 }),
    );
    const res = makeRes();
    await handleGetTicket(makeReq({ params: { id: 'tkt-other' } }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetTicket(makeReq({ user: undefined, params: { id: 'tkt-1' } }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/tickets/:id/cancel — cancelar (RF-04)
// ===========================================================================

describe('PATCH /api/tickets/:id/cancel', () => {
  it('happy path 200 com ticket cancelado', async () => {
    (ticketService.cancelTicket as any).mockResolvedValue({
      id: 'tkt-1', status: 'cancelled',
      cancelledAt: '2026-04-26T15:00:00Z',
      note: 'Torneio cancelado pela rede',
    });

    const res = makeRes();
    await handlePatchCancelTicket(makeReq({
      params: { id: 'tkt-1' },
      body: { note: 'Torneio cancelado pela rede' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ticket?.status ?? res.body.status).toBe('cancelled');
  });

  it('body opcional (sem note) ainda aceito', async () => {
    (ticketService.cancelTicket as any).mockResolvedValue({
      id: 'tkt-1', status: 'cancelled',
    });

    const res = makeRes();
    await handlePatchCancelTicket(makeReq({
      params: { id: 'tkt-1' },
      body: {},
    }) as any, res);

    expect(res.statusCode).toBe(200);
  });

  it('ticket nao-available -> 409', async () => {
    (ticketService.cancelTicket as any).mockRejectedValue(
      Object.assign(new Error('Ticket nao esta disponivel'), { statusCode: 409 }),
    );

    const res = makeRes();
    await handlePatchCancelTicket(makeReq({
      params: { id: 'tkt-used' }, body: {},
    }) as any, res);
    expect(res.statusCode).toBe(409);
  });

  it('ticket inexistente -> 404', async () => {
    (ticketService.cancelTicket as any).mockRejectedValue(
      Object.assign(new Error('Not found'), { statusCode: 404 }),
    );

    const res = makeRes();
    await handlePatchCancelTicket(makeReq({
      params: { id: 'tkt-x' }, body: {},
    }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePatchCancelTicket(makeReq({
      user: undefined, params: { id: 'tkt-1' }, body: {},
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/tickets/:id/use — consumir + match server-side
// ===========================================================================

describe('POST /api/tickets/:id/use', () => {
  it('happy path 200 com ticket usado em tournament (kind=tournament)', async () => {
    (ticketService.useTicket as any).mockResolvedValue({
      ticket: { id: 'tkt-1', status: 'used', usedInTournamentId: 't-1' },
      tournament: { id: 't-1', enteredViaSatellite: true, consumedTicketId: 'tkt-1' },
    });

    const res = makeRes();
    await handlePostUseTicket(makeReq({
      params: { id: 'tkt-1' },
      body: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ticket?.status).toBe('used');
  });

  it('happy path 200 com ticket usado em session_tournament (kind=session_tournament)', async () => {
    (ticketService.useTicket as any).mockResolvedValue({
      ticket: { id: 'tkt-1', status: 'used', usedInSessionTournamentId: 'st-1' },
      sessionTournament: { id: 'st-1', enteredViaSatellite: true, consumedTicketId: 'tkt-1' },
    });

    const res = makeRes();
    await handlePostUseTicket(makeReq({
      params: { id: 'tkt-1' },
      body: { tournamentId: 'st-1', kind: 'session_tournament' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ticket?.usedInSessionTournamentId).toBe('st-1');
  });

  it('Zod: body sem tournamentId -> 400', async () => {
    const res = makeRes();
    await handlePostUseTicket(makeReq({
      params: { id: 'tkt-1' },
      body: { kind: 'tournament' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: kind invalido -> 400', async () => {
    const res = makeRes();
    await handlePostUseTicket(makeReq({
      params: { id: 'tkt-1' },
      body: { tournamentId: 't-1', kind: 'foo' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('match server-side falha -> 422', async () => {
    (ticketService.useTicket as any).mockRejectedValue(
      Object.assign(
        new Error('ticket nao casa com torneio alvo'),
        { statusCode: 422, code: 'errMatchFailed' },
      ),
    );

    const res = makeRes();
    await handlePostUseTicket(makeReq({
      params: { id: 'tkt-1' },
      body: { tournamentId: 't-other', kind: 'tournament' },
    }) as any, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/casa|match|torneio/i);
  });

  it('ticket ja usado -> 409', async () => {
    (ticketService.useTicket as any).mockRejectedValue(
      Object.assign(new Error('ticket nao esta available'), { statusCode: 409 }),
    );

    const res = makeRes();
    await handlePostUseTicket(makeReq({
      params: { id: 'tkt-used' },
      body: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);
    expect(res.statusCode).toBe(409);
  });

  it('ticket inexistente -> 404', async () => {
    (ticketService.useTicket as any).mockRejectedValue(
      Object.assign(new Error('Not found'), { statusCode: 404 }),
    );

    const res = makeRes();
    await handlePostUseTicket(makeReq({
      params: { id: 'tkt-x' },
      body: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostUseTicket(makeReq({
      user: undefined, params: { id: 'tkt-1' },
      body: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/tickets/match — verificar disponibilidade
// ===========================================================================

describe('GET /api/tickets/match', () => {
  it('happy path 200 com {available, count, oldestEarnedAt}', async () => {
    (ticketService.matchTickets as any).mockResolvedValue({
      available: true,
      count: 2,
      oldestEarnedAt: '2026-04-20T15:00:00Z',
    });

    const res = makeRes();
    await handleGetTicketMatch(makeReq({
      query: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.oldestEarnedAt).toBeDefined();
  });

  it('available=false quando count=0 (sem oldestEarnedAt)', async () => {
    (ticketService.matchTickets as any).mockResolvedValue({
      available: false,
      count: 0,
    });

    const res = makeRes();
    await handleGetTicketMatch(makeReq({
      query: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.count).toBe(0);
  });

  it('Zod: sem tournamentId -> 400', async () => {
    const res = makeRes();
    await handleGetTicketMatch(makeReq({
      query: { kind: 'tournament' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: kind invalido -> 400', async () => {
    const res = makeRes();
    await handleGetTicketMatch(makeReq({
      query: { tournamentId: 't-1', kind: 'foo' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetTicketMatch(makeReq({
      user: undefined,
      query: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('match logic case-insensitive em targetName e targetSite (delega ao service)', async () => {
    (ticketService.matchTickets as any).mockResolvedValue({ available: true, count: 1 });

    const res = makeRes();
    await handleGetTicketMatch(makeReq({
      query: { tournamentId: 't-1', kind: 'tournament' },
    }) as any, res);

    // Garantimos apenas que o handler delegou ao service com user e tournamentId.
    const args = (ticketService.matchTickets as any).mock.calls[0];
    expect(args[0]).toBe('USER-0001');
    expect(args[1]).toMatchObject({ tournamentId: 't-1', kind: 'tournament' });
  });
});
