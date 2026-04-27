/**
 * Cool-down Routes — Sprint Cooldown-1 (MVP)
 *
 * Spec: Docs/specs/cooldown-refactor-plan.md (RF-04)
 * ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
 * Sequence: Docs/architecture/flows/grind/sequence-cooldown-flow.mermaid
 *
 * Endpoints:
 *   POST   /api/cooldown-logs               -> handleCreateCooldownLog
 *   PATCH  /api/cooldown-logs/:id           -> handleUpdateCooldownLog
 *   GET    /api/cooldown-logs/:sessionId    -> handleGetCooldownLogBySession
 *   GET    /api/cooldown-logs               -> handleListCooldownLogs
 *   POST   /api/starred-hands               -> handleCreateStarredHand
 *   GET    /api/starred-hands               -> handleListStarredHands
 *   DELETE /api/starred-hands/:id           -> handleDeleteStarredHand
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  insertCooldownLogSchema,
  updateCooldownLogSchema,
  insertStarredHandSchema,
  starredHandTypeSchema,
} from "../../shared/schema";

// =============================================================================
// Helpers
// =============================================================================

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function unauthorized(res: Response) {
  return res.status(401).json({ message: "Unauthorized" });
}

// =============================================================================
// POST /api/cooldown-logs
// =============================================================================

export async function handleCreateCooldownLog(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  // Valida body — ignora userId enviado pelo client; usa o autenticado.
  const body = { ...(req.body ?? {}), userId };
  const parsed = insertCooldownLogSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    // Ownership da sessao
    const session = await storage.getGrindSession(parsed.data.sessionId);
    if (!session || session.userId !== userId) {
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }

    // Idempotencia (UNIQUE preflight)
    const existing = await storage.getCooldownLogBySession(parsed.data.sessionId, userId);
    if (existing) {
      res.status(409).json({
        code: "cooldown_already_exists",
        logId: existing.id,
        message: "Cool-down ja iniciado para esta sessao",
      });
      return;
    }

    const created = await storage.createCooldownLog({
      ...parsed.data,
      userId,
    } as any);
    res.status(201).json(created);
  } catch (err: any) {
    console.error("POST /api/cooldown-logs failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao criar cool-down" });
  }
}

// =============================================================================
// PATCH /api/cooldown-logs/:id
// =============================================================================

const IMMUTABLE_PATCH_FIELDS = ["id", "userId", "sessionId", "mode", "createdAt", "startedAt"];

export async function handleUpdateCooldownLog(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const id = req.params?.id;
  if (!id) {
    res.status(400).json({ message: "id obrigatorio" });
    return;
  }

  const body = req.body ?? {};

  // Detectar campos imutaveis antes de validar shape — mensagem clara.
  for (const k of IMMUTABLE_PATCH_FIELDS) {
    if (k in body) {
      res.status(400).json({
        message: `Campo ${k} e imutavel`,
        code: "immutable_field",
      });
      return;
    }
  }

  const parsed = updateCooldownLogSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const existing = await storage.getCooldownLog(id, userId);
    if (!existing || (existing as any).userId !== userId) {
      res.status(404).json({ message: "Cool-down nao encontrado" });
      return;
    }

    const patch: any = { ...parsed.data };

    // Se completedAt esta sendo setado, calcula durationMinutes a partir de startedAt
    if (patch.completedAt && existing.startedAt) {
      const start = new Date((existing as any).startedAt).getTime();
      const end =
        typeof patch.completedAt === "string"
          ? new Date(patch.completedAt).getTime()
          : (patch.completedAt as Date).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        const minutes = Math.round((end - start) / 60000);
        if (patch.durationMinutes === undefined) {
          patch.durationMinutes = minutes;
        }
      }
    }

    const updated = await storage.updateCooldownLog(id, userId, patch);
    if (!updated) {
      res.status(404).json({ message: "Cool-down nao encontrado" });
      return;
    }
    res.status(200).json(updated);
  } catch (err: any) {
    console.error("PATCH /api/cooldown-logs/:id failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao atualizar cool-down" });
  }
}

// =============================================================================
// GET /api/cooldown-logs/:sessionId
// =============================================================================

export async function handleGetCooldownLogBySession(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const sessionId = req.params?.sessionId;
  if (!sessionId) {
    res.status(400).json({ message: "sessionId obrigatorio" });
    return;
  }

  try {
    const session = await storage.getGrindSession(sessionId);
    if (!session || session.userId !== userId) {
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }

    const log = await storage.getCooldownLogBySession(sessionId, userId);
    if (!log) {
      res.status(404).json({ message: "Cool-down nao encontrado" });
      return;
    }
    res.status(200).json({
      ...log,
      isDraft: (log as any).completedAt == null,
    });
  } catch (err: any) {
    console.error("GET /api/cooldown-logs/:sessionId failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao buscar cool-down" });
  }
}

// =============================================================================
// GET /api/cooldown-logs (paginado)
// =============================================================================

export async function handleListCooldownLogs(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const q = req.query ?? {};
  let page = 1;
  let pageSize = 20;
  if (q.page != null && q.page !== "") {
    const n = parseInt(String(q.page), 10);
    if (!Number.isNaN(n) && n > 0) page = n;
  }
  if (q.pageSize != null && q.pageSize !== "") {
    const n = parseInt(String(q.pageSize), 10);
    if (!Number.isNaN(n) && n > 0) pageSize = Math.min(100, n);
  }

  try {
    const result = await storage.listCooldownLogs(userId, { page, pageSize });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("GET /api/cooldown-logs failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao listar cool-downs" });
  }
}

// =============================================================================
// POST /api/starred-hands
// =============================================================================

export async function handleCreateStarredHand(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const body = { ...(req.body ?? {}), userId };
  const parsed = insertStarredHandSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    // Ownership do session_tournament + FK consistency
    const st = await storage.getSessionTournament(parsed.data.sessionTournamentId);
    if (!st || (st as any).userId !== userId) {
      res.status(404).json({ message: "Torneio nao encontrado" });
      return;
    }
    if ((st as any).sessionId !== parsed.data.sessionId) {
      res.status(400).json({
        code: "invalid_session_tournament",
        message: "Torneio nao pertence a esta sessao",
      });
      return;
    }

    // Limite 3 stars por torneio
    const c = await storage.countStarredHandsByTournament(
      parsed.data.sessionTournamentId,
      userId,
    );
    if (c >= 3) {
      res.status(400).json({
        code: "star_limit_reached",
        message: "Maximo 3 maos por torneio",
      });
      return;
    }

    const created = await storage.createStarredHand({
      ...parsed.data,
      userId,
    } as any);
    res.status(201).json(created);
  } catch (err: any) {
    console.error("POST /api/starred-hands failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao estrelar mao" });
  }
}

// =============================================================================
// GET /api/starred-hands
// =============================================================================

export async function handleListStarredHands(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const q = req.query ?? {};
  const filter: any = {};
  if (typeof q.sessionId === "string" && q.sessionId.length > 0) {
    filter.sessionId = q.sessionId;
  }
  if (typeof q.type === "string" && q.type.length > 0) {
    const r = starredHandTypeSchema.safeParse(q.type);
    if (r.success) filter.type = r.data;
  }
  if (typeof q.period === "string" && (q.period === "7d" || q.period === "30d" || q.period === "all")) {
    filter.period = q.period;
  }

  try {
    const items = await storage.listStarredHands(userId, filter);
    res.status(200).json(items);
  } catch (err: any) {
    console.error("GET /api/starred-hands failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao listar maos estreladas" });
  }
}

// =============================================================================
// DELETE /api/starred-hands/:id
// =============================================================================

export async function handleDeleteStarredHand(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }
  const id = req.params?.id;
  if (!id) {
    res.status(400).json({ message: "id obrigatorio" });
    return;
  }

  try {
    const existing = await storage.getStarredHand(id, userId);
    if (!existing || (existing as any).userId !== userId) {
      res.status(404).json({ message: "Mao estrelada nao encontrada" });
      return;
    }
    await storage.deleteStarredHand(id, userId);
    res.status(200).json({ ok: true, id });
  } catch (err: any) {
    console.error("DELETE /api/starred-hands/:id failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao remover mao" });
  }
}

// =============================================================================
// Rate limit
// =============================================================================

export const cooldownLimiter = rateLimit({
  windowMs: 60_000,
  max: 30, // PATCH autosave + POST starred hands podem ser frequentes
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisicoes de cool-down. Tente novamente em 1 minuto." },
});

export const cooldownCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas criacoes de cool-down." },
});

// =============================================================================
// Express registration
// =============================================================================

export function registerCooldownRoutes(app: Express): void {
  app.post("/api/cooldown-logs", requireAuth, cooldownCreateLimiter, (req: Request, res: Response) =>
    handleCreateCooldownLog(req, res),
  );
  app.patch("/api/cooldown-logs/:id", requireAuth, cooldownLimiter, (req: Request, res: Response) =>
    handleUpdateCooldownLog(req, res),
  );
  // Note: GET /:sessionId vem antes de GET / para nao conflitar.
  app.get("/api/cooldown-logs/:sessionId", requireAuth, (req: Request, res: Response) =>
    handleGetCooldownLogBySession(req, res),
  );
  app.get("/api/cooldown-logs", requireAuth, (req: Request, res: Response) =>
    handleListCooldownLogs(req, res),
  );

  app.post("/api/starred-hands", requireAuth, cooldownLimiter, (req: Request, res: Response) =>
    handleCreateStarredHand(req, res),
  );
  app.get("/api/starred-hands", requireAuth, (req: Request, res: Response) =>
    handleListStarredHands(req, res),
  );
  app.delete("/api/starred-hands/:id", requireAuth, (req: Request, res: Response) =>
    handleDeleteStarredHand(req, res),
  );
}
