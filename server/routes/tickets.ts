/**
 * Tickets Routes — Sprint Tickets-1 (Foundation)
 *
 * Spec: docs/specs/satellite-tickets-management.md (RF-01 a RF-05)
 *
 * Endpoints:
 *   POST   /api/tickets                    -> criar (manual ou satellite_result)
 *   GET    /api/tickets                    -> listar (filtros)
 *   GET    /api/tickets/:id                -> detalhe
 *   PATCH  /api/tickets/:id/cancel         -> cancelar
 *   POST   /api/tickets/:id/use            -> consumir (match server-side)
 *   GET    /api/tickets/match              -> verificar disponibilidade
 *
 * Auth: JWT em todos.
 * Rate limit: 10/min em mutacoes (POST/PATCH).
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../auth";
import { ticketService } from "../services/ticketService";

// =============================================================================
// Helpers
// =============================================================================

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function unauthorized(res: Response): void {
  res.status(401).json({ message: "Unauthorized" });
}

function mapErrorToStatus(err: any): number {
  if (err?.statusCode && typeof err.statusCode === "number") return err.statusCode;
  return 500;
}

// =============================================================================
// Zod schemas
// =============================================================================

const createTicketBody = z.object({
  // XOR estrito: targetTemplateId XOR targetName (mas pelo menos um obrigatorio)
  targetTemplateId: z.string().min(1).optional(),
  targetName: z.string().min(1).optional(),
  targetSite: z.string().nullable().optional(),
  ticketValueUSD: z.union([z.number(), z.string()]).refine((v) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) && n > 0;
  }, { message: "ticketValueUSD deve ser maior que 0" }),
  extraCashUSD: z.union([z.number(), z.string()]).nullable().optional()
    .refine((v) => {
      if (v == null) return true;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) && n >= 0;
    }, { message: "extraCashUSD nao pode ser negativo" }),
  expiresAt: z.union([z.string(), z.date()]).nullable().optional(),
  earnedAt: z.union([z.string(), z.date()]).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  source: z.enum(["manual", "satellite_result"]),
  sourceSessionTournamentId: z.string().min(1).optional(),
  sourceTournamentId: z.string().min(1).optional(),
})
  .refine((data) => !!data.targetTemplateId || !!data.targetName, {
    message: "Informe pelo menos targetTemplateId ou targetName",
    path: ["targetName"],
  })
  // XOR estrito (rota): nao pode passar AMBOS
  .refine((data) => !(data.targetTemplateId && data.targetName), {
    message: "Use apenas targetTemplateId OU targetName, nao ambos",
    path: ["targetTemplateId"],
  })
  // expiresAt > earnedAt
  .refine((data) => {
    if (!data.expiresAt) return true;
    const exp = data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt);
    if (Number.isNaN(exp.getTime())) return false;
    const earned = data.earnedAt
      ? (data.earnedAt instanceof Date ? data.earnedAt : new Date(data.earnedAt))
      : new Date();
    return exp.getTime() > earned.getTime();
  }, { message: "expiresAt deve ser maior que earnedAt", path: ["expiresAt"] })
  // source=satellite_result exige um source id
  .refine((data) => {
    if (data.source !== "satellite_result") return true;
    return !!data.sourceSessionTournamentId || !!data.sourceTournamentId;
  }, {
    message: "source=satellite_result exige sourceSessionTournamentId ou sourceTournamentId",
    path: ["sourceSessionTournamentId"],
  })
  // source=manual nao pode ter source ids
  .refine((data) => {
    if (data.source !== "manual") return true;
    return !data.sourceSessionTournamentId && !data.sourceTournamentId;
  }, {
    message: "source=manual nao aceita sourceSessionTournamentId nem sourceTournamentId",
    path: ["source"],
  });

const useTicketBody = z.object({
  tournamentId: z.string().min(1, "tournamentId obrigatorio"),
  kind: z.enum(["tournament", "session_tournament"]),
});

const matchQuery = z.object({
  tournamentId: z.string().min(1, "tournamentId obrigatorio"),
  kind: z.enum(["tournament", "session_tournament"]),
});

// =============================================================================
// Handlers
// =============================================================================

export async function handlePostTicket(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }

  const parsed = createTicketBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await ticketService.createTicket(userId, parsed.data as any);
    res.status(201).json({
      ticket: result.ticket,
      walletTransaction: result.walletTransaction ?? null,
    });
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("POST /api/tickets failed:", err);
    res.status(status).json({
      message: err?.message ?? "Erro ao criar ticket",
      code: err?.code,
    });
  }
}

export async function handleGetTickets(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }

  const q = req.query ?? {};
  const filters: any = {};
  if (q.status === "all") {
    // sem filtro (todos)
  } else if (typeof q.status === "string" && q.status) {
    filters.status = q.status;
  } else {
    filters.status = "available";
  }
  if (q.targetTemplateId) filters.targetTemplateId = String(q.targetTemplateId);
  if (q.expiringIn != null && q.expiringIn !== "") {
    const n = parseInt(String(q.expiringIn), 10);
    if (!Number.isNaN(n)) filters.expiringIn = n;
  }

  try {
    const tickets = await ticketService.listTickets(userId, filters);
    res.status(200).json({ tickets });
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("GET /api/tickets failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao listar tickets" });
  }
}

export async function handleGetTicket(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }

  try {
    const result = await ticketService.getTicket(userId, id);
    if (!result) {
      res.status(404).json({ message: "Ticket nao encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("GET /api/tickets/:id failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao buscar ticket" });
  }
}

export async function handlePatchCancelTicket(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }

  const note = typeof req.body?.note === "string" ? req.body.note : undefined;

  try {
    const ticket = await ticketService.cancelTicket(userId, id, note);
    res.status(200).json({ ticket });
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("PATCH /api/tickets/:id/cancel failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao cancelar ticket" });
  }
}

export async function handlePostUseTicket(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }

  const parsed = useTicketBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await ticketService.useTicket(userId, id, parsed.data);
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("POST /api/tickets/:id/use failed:", err);
    res.status(status).json({
      message: err?.message ?? "Erro ao consumir ticket",
      code: err?.code,
    });
  }
}

export async function handleGetTicketMatch(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }

  const parsed = matchQuery.safeParse(req.query ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Query invalida",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await ticketService.matchTickets(userId, parsed.data);
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("GET /api/tickets/match failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao verificar tickets" });
  }
}

// =============================================================================
// Rate limit
// =============================================================================

const ticketLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisicoes de tickets. Tente novamente em 1 minuto." },
});

// =============================================================================
// Express registration
// =============================================================================

export function registerTicketRoutes(app: Express): void {
  // Match endpoint vem antes de :id para nao conflitar
  app.get("/api/tickets/match", requireAuth, (req: Request, res: Response) =>
    handleGetTicketMatch(req as any, res),
  );
  app.get("/api/tickets", requireAuth, (req: Request, res: Response) =>
    handleGetTickets(req as any, res),
  );
  app.post("/api/tickets", requireAuth, ticketLimiter, (req: Request, res: Response) =>
    handlePostTicket(req as any, res),
  );
  app.get("/api/tickets/:id", requireAuth, (req: Request, res: Response) =>
    handleGetTicket(req as any, res),
  );
  app.patch("/api/tickets/:id/cancel", requireAuth, ticketLimiter, (req: Request, res: Response) =>
    handlePatchCancelTicket(req as any, res),
  );
  app.post("/api/tickets/:id/use", requireAuth, ticketLimiter, (req: Request, res: Response) =>
    handlePostUseTicket(req as any, res),
  );
}
