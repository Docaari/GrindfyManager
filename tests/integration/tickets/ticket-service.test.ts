import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: server/services/ticketService.ts (Sprint Tickets-1)
//
// Valida:
//  - createTicket: atomicidade INSERT ticket + INSERT wallet_transaction
//    (extraCashUSD>0). Wallet de destino = primeira ativa por displayOrder.
//  - useTicket: SELECT FOR UPDATE + match server-side + UPDATEs em transacao.
//  - cancelTicket: 409 quando nao-available; idempotencia para already-cancelled.
//  - matchTickets: ordena por expiresAt ASC NULLS LAST + earnedAt ASC.
//
// Fontes:
//  - docs/specs/satellite-tickets-management.md (RF-01 a RF-05)
//  - docs/architecture/feature-flows/ticket-lifecycle.md (concorrencia)
//  - Defaults aprovados pelo dev (extraCash USD -> primeira wallet ativa).
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    transaction: vi.fn(),
    createTicket: vi.fn(),
    getTicketById: vi.fn(),
    getActiveTicketsByUser: vi.fn(),
    getTicketsByUser: vi.fn(),
    useTicket: vi.fn(),
    cancelTicket: vi.fn(),
    listWalletsByUser: vi.fn(),
    createWalletTransaction: vi.fn(),
    getSessionTournamentById: vi.fn(),
    getTournamentById: vi.fn(),
    findMatchingTickets: vi.fn(),
  },
}));

import { ticketService } from '../../../server/services/ticketService';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

describe('ticketService.createTicket - manual sem extraCash', () => {
  it('insere ticket sem wallet_transaction', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        createTicket: vi.fn().mockResolvedValue({
          id: 'tkt-1', userId: 'USER-0001',
          ticketValueUSD: '215', status: 'available', source: 'manual',
        }),
        listWalletsByUser: vi.fn(),
        createWalletTransaction: vi.fn(),
      });
    });

    const r = await ticketService.createTicket('USER-0001', {
      targetTemplateId: 'tpl-1',
      ticketValueUSD: 215,
      source: 'manual',
    });

    expect(r.ticket.id).toBe('tkt-1');
    expect(r.walletTransaction).toBeNull();
  });
});

describe('ticketService.createTicket - satellite_result com extraCashUSD', () => {
  it('insere ticket + wallet_transaction (reason=session_result) na PRIMEIRA wallet ativa', async () => {
    const txCalls: string[] = [];
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      const txStorage = {
        createTicket: vi.fn().mockImplementation(async (data: any) => {
          txCalls.push('createTicket');
          return { id: 'tkt-1', ...data, status: 'available' };
        }),
        listWalletsByUser: vi.fn().mockImplementation(async () => {
          txCalls.push('listWalletsByUser');
          return [
            { id: 'wlt-1', name: 'GG', status: 'active', displayOrder: 0, nativeCurrency: 'USD',
              createdAt: new Date('2026-01-01') },
            { id: 'wlt-2', name: 'Stars', status: 'active', displayOrder: 1, nativeCurrency: 'USD',
              createdAt: new Date('2026-02-01') },
          ];
        }),
        createWalletTransaction: vi.fn().mockImplementation(async (data: any) => {
          txCalls.push('createWalletTransaction');
          return { id: 'wtx-1', walletId: data.walletId, reason: data.reason, direction: data.direction };
        }),
      };
      return fn(txStorage);
    });
    (storage.getSessionTournamentById as any).mockResolvedValue({
      id: 'st-1', userId: 'USER-0001',
    });

    const r = await ticketService.createTicket('USER-0001', {
      sourceSessionTournamentId: 'st-1',
      targetName: 'WSOP ME', targetSite: 'GG',
      ticketValueUSD: 215, extraCashUSD: 30,
      source: 'satellite_result',
    });

    expect(r.walletTransaction).toBeDefined();
    expect(r.walletTransaction!.walletId).toBe('wlt-1'); // primeira por displayOrder
    expect(r.walletTransaction!.reason).toBe('session_result');
    expect(r.walletTransaction!.direction).toBe('in');
    // Atomicidade: ambos dentro da mesma transacao
    expect(txCalls).toContain('createTicket');
    expect(txCalls).toContain('createWalletTransaction');
  });

  it('quando ha wallets com mesmo displayOrder, tie-break por createdAt ASC (mais antiga)', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        createTicket: vi.fn().mockResolvedValue({ id: 'tkt-1', status: 'available' }),
        listWalletsByUser: vi.fn().mockResolvedValue([
          { id: 'wlt-newer', name: 'X', status: 'active', displayOrder: 0,
            nativeCurrency: 'USD', createdAt: new Date('2026-04-01') },
          { id: 'wlt-older', name: 'Y', status: 'active', displayOrder: 0,
            nativeCurrency: 'USD', createdAt: new Date('2026-01-01') },
        ]),
        createWalletTransaction: vi.fn().mockImplementation(async (d: any) => ({
          id: 'wtx-1', walletId: d.walletId, reason: d.reason, direction: d.direction,
        })),
      });
    });
    (storage.getSessionTournamentById as any).mockResolvedValue({
      id: 'st-1', userId: 'USER-0001',
    });

    const r = await ticketService.createTicket('USER-0001', {
      sourceSessionTournamentId: 'st-1', targetName: 'WSOP ME',
      ticketValueUSD: 215, extraCashUSD: 50,
      source: 'satellite_result',
    });

    expect(r.walletTransaction!.walletId).toBe('wlt-older');
  });

  it('user sem wallet ativa quando extraCashUSD>0 -> erro 400 errNoActiveWallet', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        createTicket: vi.fn(),
        listWalletsByUser: vi.fn().mockResolvedValue([
          { id: 'wlt-archived', status: 'archived', displayOrder: 0 },
        ]),
        createWalletTransaction: vi.fn(),
      });
    });
    (storage.getSessionTournamentById as any).mockResolvedValue({
      id: 'st-1', userId: 'USER-0001',
    });

    await expect(
      ticketService.createTicket('USER-0001', {
        sourceSessionTournamentId: 'st-1', targetName: 'WSOP',
        ticketValueUSD: 215, extraCashUSD: 30,
        source: 'satellite_result',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'errNoActiveWallet' });
  });

  it('sourceSessionTournamentId nao pertence ao user -> 422', async () => {
    (storage.getSessionTournamentById as any).mockResolvedValue({
      id: 'st-1', userId: 'USER-OTHER',
    });

    await expect(
      ticketService.createTicket('USER-0001', {
        sourceSessionTournamentId: 'st-1', targetName: 'WSOP',
        ticketValueUSD: 215, source: 'satellite_result',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('sourceSessionTournamentId inexistente -> 422', async () => {
    (storage.getSessionTournamentById as any).mockResolvedValue(null);

    await expect(
      ticketService.createTicket('USER-0001', {
        sourceSessionTournamentId: 'st-x', targetName: 'WSOP',
        ticketValueUSD: 215, source: 'satellite_result',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

// ---------------------------------------------------------------------------
// useTicket — SELECT FOR UPDATE + match server-side
// ---------------------------------------------------------------------------

describe('ticketService.useTicket - match server-side', () => {
  it('match forte: ticket.targetTemplateId === tournament.templateId -> sucesso', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      const txStorage = {
        getTicketById: vi.fn().mockResolvedValue({
          id: 'tkt-1', userId: 'USER-0001', status: 'available',
          targetTemplateId: 'tpl-WSOP', targetName: null, targetSite: null,
        }),
        getTournamentById: vi.fn().mockResolvedValue({
          id: 't-1', userId: 'USER-0001',
          templateId: 'tpl-WSOP', name: 'WSOP ME', site: 'GG',
        }),
        getSessionTournamentById: vi.fn(),
        useTicket: vi.fn().mockResolvedValue({
          ticket: { id: 'tkt-1', status: 'used', usedInTournamentId: 't-1' },
          tournament: { id: 't-1', enteredViaSatellite: true, consumedTicketId: 'tkt-1' },
        }),
      };
      return fn(txStorage);
    });

    const r = await ticketService.useTicket('USER-0001', 'tkt-1', {
      tournamentId: 't-1', kind: 'tournament',
    });
    expect((r as any).ticket.status).toBe('used');
  });

  it('match medio: targetName + targetSite case-insensitive -> sucesso', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        getTicketById: vi.fn().mockResolvedValue({
          id: 'tkt-1', userId: 'USER-0001', status: 'available',
          targetTemplateId: null,
          targetName: 'wsop main event online', // lowercase no ticket
          targetSite: 'gg',
        }),
        getTournamentById: vi.fn().mockResolvedValue({
          id: 't-1', userId: 'USER-0001',
          templateId: null,
          name: 'WSOP Main Event Online', // diferente case
          site: 'GG',
        }),
        getSessionTournamentById: vi.fn(),
        useTicket: vi.fn().mockResolvedValue({
          ticket: { id: 'tkt-1', status: 'used' },
          tournament: { id: 't-1' },
        }),
      });
    });

    const r = await ticketService.useTicket('USER-0001', 'tkt-1', {
      tournamentId: 't-1', kind: 'tournament',
    });
    expect((r as any).ticket).toBeDefined();
  });

  it('match medio falha: name diferente -> 422', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        getTicketById: vi.fn().mockResolvedValue({
          id: 'tkt-1', userId: 'USER-0001', status: 'available',
          targetTemplateId: null, targetName: 'WSOP', targetSite: 'GG',
        }),
        getTournamentById: vi.fn().mockResolvedValue({
          id: 't-1', userId: 'USER-0001',
          templateId: null, name: 'Sunday Storm', site: 'GG',
        }),
        getSessionTournamentById: vi.fn(),
        useTicket: vi.fn(),
      });
    });

    await expect(
      ticketService.useTicket('USER-0001', 'tkt-1', {
        tournamentId: 't-1', kind: 'tournament',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('match medio falha: site diferente -> 422', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        getTicketById: vi.fn().mockResolvedValue({
          id: 'tkt-1', userId: 'USER-0001', status: 'available',
          targetTemplateId: null, targetName: 'WSOP', targetSite: 'GG',
        }),
        getTournamentById: vi.fn().mockResolvedValue({
          id: 't-1', userId: 'USER-0001',
          templateId: null, name: 'WSOP', site: 'PokerStars',
        }),
        getSessionTournamentById: vi.fn(),
        useTicket: vi.fn(),
      });
    });

    await expect(
      ticketService.useTicket('USER-0001', 'tkt-1', {
        tournamentId: 't-1', kind: 'tournament',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('ticket nao-available -> 409 (transicao terminal preserva o motivo)', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        getTicketById: vi.fn().mockResolvedValue({
          id: 'tkt-1', userId: 'USER-0001', status: 'used',
        }),
        getTournamentById: vi.fn(),
        getSessionTournamentById: vi.fn(),
        useTicket: vi.fn(),
      });
    });

    await expect(
      ticketService.useTicket('USER-0001', 'tkt-1', {
        tournamentId: 't-1', kind: 'tournament',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('ticket de outro user -> 404 (info leak)', async () => {
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      return fn({
        getTicketById: vi.fn().mockResolvedValue({
          id: 'tkt-1', userId: 'USER-OTHER', status: 'available',
        }),
        getTournamentById: vi.fn(),
        getSessionTournamentById: vi.fn(),
        useTicket: vi.fn(),
      });
    });

    await expect(
      ticketService.useTicket('USER-0001', 'tkt-1', {
        tournamentId: 't-1', kind: 'tournament',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// useTicket — concorrencia (SELECT FOR UPDATE)
// ---------------------------------------------------------------------------

describe('ticketService.useTicket - concorrencia (SELECT FOR UPDATE)', () => {
  it('2 chamadas paralelas para o mesmo ticket: 1 sucesso, 1 retorna 409', async () => {
    let firstWon = false;
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      // O storage.useTicket interno valida status via SELECT FOR UPDATE.
      const txStorage = {
        getTicketById: vi.fn().mockImplementation(async () => {
          // Simula serializacao FOR UPDATE: a 1a leitura ve available;
          // a 2a (depois do COMMIT da 1a) ve used.
          if (!firstWon) {
            return {
              id: 'tkt-1', userId: 'USER-0001', status: 'available',
              targetName: 'WSOP', targetSite: 'GG', targetTemplateId: null,
            };
          }
          return {
            id: 'tkt-1', userId: 'USER-0001', status: 'used',
            targetName: 'WSOP', targetSite: 'GG', targetTemplateId: null,
          };
        }),
        getTournamentById: vi.fn().mockResolvedValue({
          id: 't-1', userId: 'USER-0001',
          templateId: null, name: 'WSOP', site: 'GG',
        }),
        getSessionTournamentById: vi.fn(),
        useTicket: vi.fn().mockImplementation(async () => {
          firstWon = true;
          return {
            ticket: { id: 'tkt-1', status: 'used' },
            tournament: { id: 't-1', enteredViaSatellite: true, consumedTicketId: 'tkt-1' },
          };
        }),
      };
      return fn(txStorage);
    });

    const ok = await ticketService.useTicket('USER-0001', 'tkt-1', {
      tournamentId: 't-1', kind: 'tournament',
    });
    expect((ok as any).ticket.status).toBe('used');

    await expect(
      ticketService.useTicket('USER-0001', 'tkt-1', {
        tournamentId: 't-1', kind: 'tournament',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it.todo('rodar contra DB real: 2 transacoes paralelas serializadas via SELECT FOR UPDATE');
});

// ---------------------------------------------------------------------------
// cancelTicket
// ---------------------------------------------------------------------------

describe('ticketService.cancelTicket', () => {
  it('happy path: marca ticket available como cancelled', async () => {
    (storage.cancelTicket as any).mockResolvedValue({
      id: 'tkt-1', status: 'cancelled',
      cancelledAt: new Date('2026-04-26T15:00:00Z'),
    });

    const r = await ticketService.cancelTicket('USER-0001', 'tkt-1');
    expect((r as any).status).toBe('cancelled');
  });

  it('rejeita cancelar ticket nao-available -> 409', async () => {
    (storage.cancelTicket as any).mockRejectedValue(
      Object.assign(new Error('Ticket nao esta disponivel'), { statusCode: 409 }),
    );

    await expect(
      ticketService.cancelTicket('USER-0001', 'tkt-used'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('cancelled e terminal: notifiedExpiringAt nao e resetado (Sprint 2 cron usa esta invariante)', async () => {
    (storage.cancelTicket as any).mockResolvedValue({
      id: 'tkt-1', status: 'cancelled',
      cancelledAt: new Date('2026-04-26T15:00:00Z'),
      notifiedExpiringAt: new Date('2026-04-25T03:00:00Z'), // preserved
    });

    const r = await ticketService.cancelTicket('USER-0001', 'tkt-1');
    expect((r as any).notifiedExpiringAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// matchTickets — FIFO + ordering
// ---------------------------------------------------------------------------

describe('ticketService.matchTickets', () => {
  it('count > 1 e oldestEarnedAt = ticket de earned mais antigo (FIFO)', async () => {
    (storage.findMatchingTickets as any).mockResolvedValue([
      { id: 'tkt-2', earnedAt: new Date('2026-04-20T00:00:00Z'), expiresAt: new Date('2026-05-01T00:00:00Z') },
      { id: 'tkt-1', earnedAt: new Date('2026-04-10T00:00:00Z'), expiresAt: new Date('2026-05-15T00:00:00Z') },
    ]);
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001', templateId: 'tpl-1', name: 'WSOP', site: 'GG',
    });

    const r = await ticketService.matchTickets('USER-0001', {
      tournamentId: 't-1', kind: 'tournament',
    });
    expect(r.available).toBe(true);
    expect(r.count).toBe(2);
    // FIFO entre os com mesmo expiresAt nao matters; oldestEarnedAt e o min(earnedAt).
    expect(new Date(r.oldestEarnedAt!).getTime()).toBeLessThanOrEqual(
      new Date('2026-04-10T00:00:00Z').getTime() + 1,
    );
  });

  it('count = 0 -> available=false sem oldestEarnedAt', async () => {
    (storage.findMatchingTickets as any).mockResolvedValue([]);
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001', templateId: null, name: 'X', site: 'GG',
    });

    const r = await ticketService.matchTickets('USER-0001', {
      tournamentId: 't-1', kind: 'tournament',
    });
    expect(r.available).toBe(false);
    expect(r.count).toBe(0);
  });

  it('tournament inexistente -> retorna available=false sem erro fatal', async () => {
    (storage.getTournamentById as any).mockResolvedValue(null);
    (storage.getSessionTournamentById as any).mockResolvedValue(null);

    const r = await ticketService.matchTickets('USER-0001', {
      tournamentId: 't-x', kind: 'tournament',
    });
    expect(r.available).toBe(false);
    expect(r.count).toBe(0);
  });
});
