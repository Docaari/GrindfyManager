/**
 * Bankroll Routes — Sprint 2 (RF-01 a RF-04)
 *
 * GET  /api/bankroll              -> estado atual (RF-01)
 * PUT  /api/bankroll              -> setup / mudanca de banca (RF-02)
 * POST /api/bankroll/snapshot     -> aporte / saque / ajuste manual (RF-03)
 * GET  /api/bankroll/history      -> historico + serie + summary (RF-04)
 *
 * Rate limit dedicado (spec Q10): 10 req/min por usuario em mutacoes (PUT/POST).
 * GET nao tem rate limit (leitura).
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth";
import { bankrollService, type BankrollReason } from "../services/bankrollService";
import { parseRule } from "../scoring/bankrollRules";

const VALID_REASONS_SNAPSHOT: BankrollReason[] = [
  "deposit",
  "withdrawal",
  "session_result",
  "manual_adjustment",
];

const VALID_REASONS_UPDATE: BankrollReason[] = [
  "initial",
  "deposit",
  "withdrawal",
  "manual_adjustment",
];

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function unauthorized(res: Response) {
  return res.status(401).json({ message: "Unauthorized" });
}

function mapErrorToStatus(err: any): number {
  if (err?.statusCode && typeof err.statusCode === "number") return err.statusCode;
  const msg = String(err?.message ?? "");
  if (/reason/i.test(msg)) return 400;
  if (/delta/i.test(msg)) return 400;
  if (/futuro|future/i.test(msg)) return 400;
  if (/rule/i.test(msg)) return 400;
  if (/configure.*banca/i.test(msg)) return 409;
  if (/from.*to|invalid.*(range|date)/i.test(msg)) return 400;
  if (/granularity/i.test(msg)) return 400;
  return 500;
}

// ============================================================================
// Handlers
// ============================================================================

export async function handleGetBankroll(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);
  try {
    const state = await bankrollService.getBankrollState(userId);
    return res.status(200).json(state);
  } catch (err: any) {
    console.error("GET /api/bankroll failed:", err);
    return res.status(mapErrorToStatus(err)).json({ message: err?.message ?? "Erro ao carregar banca" });
  }
}

export async function handlePutBankroll(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);

  const body = req.body ?? {};
  const amount = body.amount;
  const rule = body.rule;
  const reason = body.reason;
  const note = body.note;

  // Validacoes 400 antes de chamar service
  if (amount !== undefined && amount !== null) {
    if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({ message: "amount invalido (nao pode ser negativo)" });
    }
  }

  if (rule !== undefined) {
    const parsed = parseRule(rule);
    if (!parsed.valid) {
      return res.status(400).json({
        message: `Rule invalida: use "1pct", "2pct", "5pct" ou custom:<N> com N entre 0.1 e 20 (uma casa decimal).`,
      });
    }
  }

  if (reason !== undefined && reason !== null) {
    if (!VALID_REASONS_UPDATE.includes(reason)) {
      return res.status(400).json({ message: "reason invalido" });
    }
  }

  try {
    const state = await bankrollService.updateBankroll(userId, {
      amount,
      rule,
      reason,
      note,
    });
    return res.status(200).json(state);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    console.error("PUT /api/bankroll failed:", err);
    return res.status(status).json({ message: err?.message ?? "Erro ao atualizar banca" });
  }
}

export async function handlePostBankrollSnapshot(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);

  const body = req.body ?? {};
  const delta = body.delta;
  const reason = body.reason;
  const note = body.note;
  const occurredAt = body.occurredAt;

  if (typeof delta !== "number" || Number.isNaN(delta) || delta === 0) {
    return res.status(400).json({ message: "delta deve ser um numero diferente de zero" });
  }
  if (!VALID_REASONS_SNAPSHOT.includes(reason)) {
    return res.status(400).json({
      message: reason === "initial"
        ? "reason=initial so e permitido em PUT /api/bankroll (primeira configuracao)"
        : "reason invalido",
    });
  }
  if (occurredAt) {
    const d = new Date(occurredAt);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      return res.status(400).json({ message: "occurredAt nao pode ser no futuro" });
    }
  }

  try {
    const result = await bankrollService.recordSnapshot(userId, {
      delta,
      reason,
      note,
      occurredAt,
    });
    return res.status(201).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    console.error("POST /api/bankroll/snapshot failed:", err);
    return res.status(status).json({ message: err?.message ?? "Erro ao registrar movimento" });
  }
}

export async function handleGetBankrollHistory(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);

  const q = req.query ?? {};
  const granularity = q.granularity;
  if (granularity != null && !["day", "week", "month"].includes(String(granularity))) {
    return res.status(400).json({ message: "granularity invalida (use day, week ou month)" });
  }

  // clamp limit em 500
  let limit: number | undefined = undefined;
  if (q.limit != null && q.limit !== "") {
    const n = parseInt(String(q.limit), 10);
    if (!Number.isNaN(n)) limit = Math.min(Math.max(n, 1), 500);
  }

  let offset: number | undefined = undefined;
  if (q.offset != null && q.offset !== "") {
    const n = parseInt(String(q.offset), 10);
    if (!Number.isNaN(n)) offset = Math.max(n, 0);
  }

  const filters = {
    from: q.from ? String(q.from) : undefined,
    to: q.to ? String(q.to) : undefined,
    granularity: granularity ? (String(granularity) as any) : undefined,
    reason: q.reason ? String(q.reason) : undefined,
    limit,
    offset,
  };

  try {
    const result = await bankrollService.getBankrollHistory(userId, filters);
    return res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    console.error("GET /api/bankroll/history failed:", err);
    return res.status(status).json({ message: err?.message ?? "Erro ao carregar historico" });
  }
}

// ============================================================================
// Rate limit (Q10 — 10 req/min por userId em mutacoes)
// ============================================================================

export const bankrollLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas requisicoes de banca. Tente novamente em 1 minuto.",
  },
});

// ============================================================================
// Express registration
// ============================================================================

export function registerBankrollRoutes(app: Express): void {
  app.get("/api/bankroll", requireAuth, (req: Request, res: Response) =>
    handleGetBankroll(req, res),
  );
  app.put(
    "/api/bankroll",
    requireAuth,
    bankrollLimiter,
    (req: Request, res: Response) => handlePutBankroll(req, res),
  );
  app.post(
    "/api/bankroll/snapshot",
    requireAuth,
    bankrollLimiter,
    (req: Request, res: Response) => handlePostBankrollSnapshot(req, res),
  );
  app.get("/api/bankroll/history", requireAuth, (req: Request, res: Response) =>
    handleGetBankrollHistory(req, res),
  );
}
