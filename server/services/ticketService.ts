/**
 * Ticket Service — Sprint Tickets-1 (Foundation)
 *
 * Spec: docs/specs/satellite-tickets-management.md (RF-01 a RF-05)
 * Data model: docs/architecture/data-model/tickets.md
 * Lifecycle: docs/architecture/feature-flows/ticket-lifecycle.md
 *
 * Public API (ticketService):
 *   createTicket(userId, input)             -> { ticket, walletTransaction }
 *   listTickets(userId, filters)            -> Ticket[]
 *   getTicket(userId, ticketId)             -> { ticket, source, usedIn } | null
 *   cancelTicket(userId, ticketId, note?)   -> Ticket
 *   useTicket(userId, ticketId, body)       -> { ticket, tournament?, sessionTournament? }
 *   matchTickets(userId, params)            -> { available, count, oldestEarnedAt? }
 *
 * Defaults aprovados pelo dev:
 *   - extraCashUSD com source=satellite_result -> credita PRIMEIRA wallet ativa
 *     (ordenacao: displayOrder ASC, depois createdAt ASC).
 *   - Match server-side obrigatorio em useTicket (template OU name+site case-insensitive).
 *   - cancelled e terminal; refund vira deposit manual (Sprint 2).
 */

import { storage } from "../storage";

// =============================================================================
// Helpers
// =============================================================================

function makeError(message: string, statusCode: number, code?: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function pickFirstActiveWallet(wallets: any[]): any | null {
  if (!wallets || wallets.length === 0) return null;
  const active = wallets.filter((w: any) => w.status === "active");
  if (active.length === 0) return null;
  // Ordenar por displayOrder ASC, depois createdAt ASC.
  active.sort((a: any, b: any) => {
    const ao = a.displayOrder ?? 0;
    const bo = b.displayOrder ?? 0;
    if (ao !== bo) return ao - bo;
    const at = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt ?? 0).getTime();
    const bt = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt ?? 0).getTime();
    return at - bt;
  });
  return active[0];
}

function matchTicketToTournament(ticket: any, t: any): boolean {
  if (!ticket || !t) return false;
  if (ticket.targetTemplateId && t.templateId && ticket.targetTemplateId === t.templateId) {
    return true;
  }
  if (ticket.targetName && t.name) {
    const sameName = String(ticket.targetName).trim().toLowerCase()
                  === String(t.name).trim().toLowerCase();
    if (!sameName) return false;
    if (ticket.targetSite || t.site) {
      const sameSite = String(ticket.targetSite ?? "").trim().toLowerCase()
                    === String(t.site ?? "").trim().toLowerCase();
      return sameSite;
    }
    return true;
  }
  return false;
}

// =============================================================================
// createTicket
// =============================================================================

export interface CreateTicketInput {
  sourceTournamentId?: string | null;
  sourceSessionTournamentId?: string | null;
  targetTemplateId?: string | null;
  targetName?: string | null;
  targetSite?: string | null;
  ticketValueUSD: number | string;
  extraCashUSD?: number | string | null;
  expiresAt?: string | Date | null;
  earnedAt?: string | Date | null;
  note?: string | null;
  source: "manual" | "satellite_result";
}

async function createTicket(
  userId: string,
  input: CreateTicketInput,
): Promise<{ ticket: any; walletTransaction: any }> {
  // Validacao de ownership do source (satellite_result)
  if (input.source === "satellite_result") {
    if (input.sourceSessionTournamentId) {
      const st = await (storage as any).getSessionTournamentById(
        input.sourceSessionTournamentId,
      );
      if (!st) {
        throw makeError("sourceSessionTournamentId nao existe", 422, "errSourceNotFound");
      }
      if (st.userId !== userId) {
        throw makeError("sourceSessionTournamentId nao pertence ao user", 422, "errSourceOwnership");
      }
    }
    if (input.sourceTournamentId) {
      const t = await (storage as any).getTournamentById(input.sourceTournamentId);
      if (!t) {
        throw makeError("sourceTournamentId nao existe", 422, "errSourceNotFound");
      }
      if (t.userId !== userId) {
        throw makeError("sourceTournamentId nao pertence ao user", 422, "errSourceOwnership");
      }
    }
  }

  const extraCash = input.extraCashUSD != null && input.extraCashUSD !== ""
    ? parseFloat(String(input.extraCashUSD))
    : 0;

  const result = await storage.transaction(async (tx: any) => {
    let walletTx: any = null;

    if (extraCash > 0) {
      const wallets = await tx.listWalletsByUser(userId, { includeArchived: false });
      const target = pickFirstActiveWallet(wallets);
      if (!target) {
        throw makeError(
          "Nenhuma wallet ativa para creditar extra cash",
          400,
          "errNoActiveWallet",
        );
      }
      const reason = input.source === "satellite_result" ? "session_result" : "deposit";
      walletTx = await tx.createWalletTransaction({
        walletId: target.id,
        userId,
        direction: "in",
        nativeAmount: String(extraCash),
        nativeCurrency: target.nativeCurrency ?? "USD",
        fxRateUSDPerNative: "1",
        usdAmount: String(extraCash),
        previousNativeBalance: "0",
        newNativeBalance: String(extraCash),
        reason,
        note: input.note ?? null,
        source: "manual",
        occurredAt: new Date(),
        effectiveAt: new Date(),
      });
    }

    const ticket = await tx.createTicket({
      userId,
      sourceTournamentId: input.sourceTournamentId ?? null,
      sourceSessionTournamentId: input.sourceSessionTournamentId ?? null,
      targetTemplateId: input.targetTemplateId ?? null,
      targetName: input.targetName ?? null,
      targetSite: input.targetSite ?? null,
      ticketValueUSD: String(input.ticketValueUSD),
      extraCashUSD: input.extraCashUSD == null ? null : String(input.extraCashUSD),
      status: "available",
      earnedAt: input.earnedAt ? new Date(input.earnedAt as any) : new Date(),
      expiresAt: input.expiresAt ? new Date(input.expiresAt as any) : null,
      note: input.note ?? null,
      source: input.source,
    });

    return { ticket, walletTransaction: walletTx };
  });

  return result;
}

// =============================================================================
// listTickets / getTicket / cancelTicket
// =============================================================================

async function listTickets(userId: string, filters?: any): Promise<any[]> {
  return await (storage as any).getTicketsByUser(userId, filters ?? {});
}

async function getTicket(userId: string, ticketId: string): Promise<any | null> {
  const ticket = await (storage as any).getTicketById(ticketId, userId);
  if (!ticket) return null;
  return {
    ticket,
    source: ticket.sourceSessionTournamentId
      ? { type: "satellite_result", sourceSessionTournamentId: ticket.sourceSessionTournamentId }
      : ticket.sourceTournamentId
      ? { type: "satellite_result", sourceTournamentId: ticket.sourceTournamentId }
      : { type: "manual" },
    usedIn: ticket.usedInTournamentId
      ? { type: "tournament", id: ticket.usedInTournamentId }
      : ticket.usedInSessionTournamentId
      ? { type: "session_tournament", id: ticket.usedInSessionTournamentId }
      : null,
  };
}

async function cancelTicketSvc(
  userId: string,
  ticketId: string,
  note?: string,
): Promise<any> {
  return await (storage as any).cancelTicket(ticketId, userId, note);
}

// =============================================================================
// useTicket (transacao com SELECT FOR UPDATE + match server-side)
// =============================================================================

async function useTicket(
  userId: string,
  ticketId: string,
  body: { tournamentId: string; kind: "tournament" | "session_tournament" },
): Promise<{ ticket: any; tournament?: any; sessionTournament?: any }> {
  const result = await storage.transaction(async (tx: any) => {
    // SELECT FOR UPDATE — lock primeiro.
    // Em producao, getTicketByIdForUpdate aplica `FOR UPDATE`. Em mocks de teste
    // que so expoem getTicketById, fazemos fallback para nao quebrar a interface.
    const lockFn = tx.getTicketByIdForUpdate ?? tx.getTicketById;
    const ticket = await lockFn(ticketId, userId);
    if (!ticket) {
      throw makeError("Ticket nao encontrado", 404, "errNotFound");
    }
    if (ticket.userId !== userId) {
      throw makeError("Ticket nao encontrado", 404, "errNotFound");
    }
    if (ticket.status !== "available") {
      throw makeError(
        `Ticket nao esta available (status=${ticket.status})`,
        409,
        "errNotAvailable",
      );
    }

    // Buscar torneio alvo (depende do kind)
    let target: any = null;
    if (body.kind === "tournament") {
      target = await tx.getTournamentById(body.tournamentId);
    } else {
      target = await tx.getSessionTournamentById(body.tournamentId);
    }
    if (!target) {
      throw makeError("Torneio alvo nao encontrado", 404, "errTargetNotFound");
    }
    if (target.userId !== userId) {
      throw makeError("Torneio alvo nao pertence ao user", 404, "errTargetOwnership");
    }

    // Match server-side
    if (!matchTicketToTournament(ticket, target)) {
      throw makeError(
        "Ticket nao casa com torneio alvo (match falhou)",
        422,
        "errMatchFailed",
      );
    }

    // UPDATE ticket + UPDATE tournament em sequencia (mesma transacao)
    const out = await tx.useTicket({
      ticketId,
      userId,
      targetId: body.tournamentId,
      kind: body.kind,
    });
    return out;
  });

  return result;
}

// =============================================================================
// matchTickets
// =============================================================================

async function matchTickets(
  userId: string,
  params: { tournamentId: string; kind: "tournament" | "session_tournament" },
): Promise<{ available: boolean; count: number; oldestEarnedAt?: string; tickets?: any[] }> {
  // Resolver torneio alvo
  let target: any = null;
  if (params.kind === "tournament") {
    target = await (storage as any).getTournamentById(params.tournamentId);
  } else {
    target = await (storage as any).getSessionTournamentById(params.tournamentId);
  }
  if (!target) {
    return { available: false, count: 0 };
  }
  if (target.userId && target.userId !== userId) {
    return { available: false, count: 0 };
  }

  const tickets = await (storage as any).findMatchingTickets(userId, params);
  if (!tickets || tickets.length === 0) {
    return { available: false, count: 0 };
  }
  // oldestEarnedAt = min(earnedAt)
  let oldest: number = Infinity;
  for (const t of tickets) {
    const e = t.earnedAt instanceof Date ? t.earnedAt.getTime() : new Date(t.earnedAt).getTime();
    if (Number.isFinite(e) && e < oldest) oldest = e;
  }
  // RF-12: ordenar expiresAt ASC NULLS LAST, earnedAt ASC (FIFO)
  const sorted = [...tickets].sort((a: any, b: any) => {
    const ax = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
    const bx = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
    if (ax !== bx) return ax - bx;
    const ae = a.earnedAt ? new Date(a.earnedAt).getTime() : 0;
    const be = b.earnedAt ? new Date(b.earnedAt).getTime() : 0;
    return ae - be;
  });
  // Lightweight projection para UI (nao expor campos sensiveis)
  const projected = sorted.map((t: any) => ({
    id: t.id,
    ticketValueUSD: t.ticketValueUSD,
    targetTemplateId: t.targetTemplateId ?? null,
    targetName: t.targetName ?? null,
    targetSite: t.targetSite ?? null,
    earnedAt: t.earnedAt instanceof Date ? t.earnedAt.toISOString() : t.earnedAt,
    expiresAt: t.expiresAt
      ? (t.expiresAt instanceof Date ? t.expiresAt.toISOString() : t.expiresAt)
      : null,
    note: t.note ?? null,
  }));
  return {
    available: true,
    count: tickets.length,
    oldestEarnedAt: oldest === Infinity ? undefined : new Date(oldest).toISOString(),
    tickets: projected,
  };
}

// =============================================================================
// Export
// =============================================================================

export const ticketService = {
  createTicket,
  listTickets,
  getTicket,
  cancelTicket: cancelTicketSvc,
  useTicket,
  matchTickets,
};
