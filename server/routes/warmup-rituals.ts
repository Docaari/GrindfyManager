/**
 * Warmup Rituals Routes — Sprint W-1 (RF-15 a RF-22)
 *
 * POST /api/warmup-rituals                            -> handleCreateWarmupRitual
 * GET  /api/warmup-rituals/latest                     -> handleGetLatestWarmupRitual
 * GET  /api/warmup-rituals                            -> handleListWarmupRituals
 * PUT  /api/user-settings/weekly-heuristics           -> handleUpdateWeeklyHeuristics
 *
 * Auth: requireAuth + requirePermission('mental_prep_access') em todos os endpoints.
 * Rate limit: 30/h por userId em POST /api/warmup-rituals (RNF-17).
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth";
import { warmupService } from "../services/warmupService";

// ============================================================================
// Helpers
// ============================================================================

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function userPermissions(req: any): string[] {
  return req?.user?.permissions ?? [];
}

function unauthorized(res: Response) {
  return res.status(401).json({ message: "Unauthorized" });
}

function forbidden(res: Response) {
  return res.status(403).json({ message: "Forbidden — falta permission mental_prep_access" });
}

function hasMentalPrepAccess(req: any): boolean {
  const perms = userPermissions(req);
  return perms.includes("mental_prep_access");
}

// ============================================================================
// Zod schemas (handler-level — defesa em profundidade contra payloads invalidos)
// ============================================================================

const sessionIntentionZod = z.object({
  focus: z.string().trim().min(1).max(200),
  tiltPlan: z.string().trim().min(1).max(200),
  stopCriteria: z.string().trim().min(1).max(200),
});

const blockSnapshotZod = z
  .object({
    blockId: z.number().int().min(1).max(5),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationSeconds: z.number().int().min(0),
  })
  .passthrough();

const createRitualBodySchema = z.object({
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60),
  version: z.enum(["full", "aborted"]),
  emotionalCheckScore: z.number().int().min(0).max(10).nullable().optional(),
  decisionToPlay: z.boolean().nullable().optional(),
  overrideUsed: z.boolean().optional().default(false),
  blocksCompleted: z.array(blockSnapshotZod).max(5).optional().default([]),
  sessionIntention: sessionIntentionZod.nullable().optional(),
});

const updateHeuristicsBodySchema = z.object({
  heuristics: z.tuple([
    z.string().trim().min(1).max(280),
    z.string().trim().min(1).max(280),
    z.string().trim().min(1).max(280),
  ]),
});

// ============================================================================
// Handlers
// ============================================================================

export async function handleCreateWarmupRitual(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);
  if (!hasMentalPrepAccess(req)) return forbidden(res);

  // Parse Zod first
  const parsed = createRitualBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({
      message: first?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
  }

  const data = parsed.data;

  // Cross-field validations (server-side, ADR-027)
  // Reform 2026-05-05 (ADR-120): sessionIntention agora opcional em version=full.
  // Demais regras mantidas.
  if (data.version === "full") {
    if (data.decisionToPlay == null) {
      return res.status(400).json({
        message: "decisionToPlay e obrigatorio quando version=full",
      });
    }
    if (data.emotionalCheckScore == null) {
      return res.status(400).json({
        message: "emotionalCheckScore e obrigatorio quando version=full",
      });
    }
  }

  // overrideUsed=true requer score < 6 E decisionToPlay=true
  if (data.overrideUsed === true) {
    if (data.emotionalCheckScore == null || data.emotionalCheckScore >= 6) {
      return res.status(400).json({
        message:
          "overrideUsed=true so e valido quando emotionalCheckScore < 6",
      });
    }
    if (data.decisionToPlay !== true) {
      return res.status(400).json({
        message: "overrideUsed=true so e valido quando decisionToPlay=true",
      });
    }
  }

  try {
    const ritual = await warmupService.createRitual(userId, {
      startedAt: data.startedAt,
      completedAt: data.completedAt ?? null,
      durationMinutes: data.durationMinutes,
      version: data.version,
      emotionalCheckScore: data.emotionalCheckScore ?? null,
      decisionToPlay: data.decisionToPlay ?? null,
      overrideUsed: data.overrideUsed ?? false,
      blocksCompleted: data.blocksCompleted ?? [],
      sessionIntention: data.sessionIntention ?? null,
    });
    return res.status(201).json(ritual);
  } catch (err: any) {
    console.error("POST /api/warmup-rituals failed:", err);
    return res
      .status(500)
      .json({ message: err?.message ?? "Erro ao criar ritual" });
  }
}

export async function handleGetLatestWarmupRitual(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);
  if (!hasMentalPrepAccess(req)) return forbidden(res);

  try {
    const ritual = await warmupService.getLatestRitual(userId);
    return res.status(200).json(ritual ?? null);
  } catch (err: any) {
    console.error("GET /api/warmup-rituals/latest failed:", err);
    return res
      .status(500)
      .json({ message: err?.message ?? "Erro ao carregar ritual" });
  }
}

export async function handleListWarmupRituals(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);
  if (!hasMentalPrepAccess(req)) return forbidden(res);

  const q = req.query ?? {};

  // Parse limit (default 14, max 100, clamp)
  let limit = 14;
  if (q.limit != null && q.limit !== "") {
    const n = parseInt(String(q.limit), 10);
    if (!Number.isNaN(n)) {
      limit = Math.min(Math.max(n, 1), 100);
    }
  }

  let offset = 0;
  if (q.offset != null && q.offset !== "") {
    const n = parseInt(String(q.offset), 10);
    if (!Number.isNaN(n)) {
      offset = Math.max(n, 0);
    }
  }

  // Parse from / to
  let from: Date | undefined;
  let to: Date | undefined;
  if (q.from) {
    const d = new Date(String(q.from));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ message: "from invalido (use ISO date)" });
    }
    from = d;
  }
  if (q.to) {
    const d = new Date(String(q.to));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ message: "to invalido (use ISO date)" });
    }
    to = d;
  }

  try {
    const result = await warmupService.listRituals({
      userId,
      from,
      to,
      limit,
      offset,
    });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("GET /api/warmup-rituals failed:", err);
    return res
      .status(500)
      .json({ message: err?.message ?? "Erro ao listar rituais" });
  }
}

export async function handleUpdateWeeklyHeuristics(req: any, res: Response) {
  const userId = userIdOf(req);
  if (!userId) return unauthorized(res);
  if (!hasMentalPrepAccess(req)) return forbidden(res);

  const body = req.body ?? {};
  // Reject arrays != 3 explicitly (z.tuple gives a generic message; we add a friendly one)
  if (
    body.heuristics &&
    Array.isArray(body.heuristics) &&
    body.heuristics.length !== 3
  ) {
    return res.status(400).json({
      message: "heuristics deve ter exatamente 3 strings",
    });
  }

  const parsed = updateHeuristicsBodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({
      message: first?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await warmupService.updateWeeklyHeuristics(
      userId,
      parsed.data.heuristics as [string, string, string],
    );
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("PUT /api/user-settings/weekly-heuristics failed:", err);
    return res
      .status(500)
      .json({ message: err?.message ?? "Erro ao atualizar heuristicas" });
  }
}

// ============================================================================
// Rate limit (RNF-17 — 30 req/h por userId em POST)
// ============================================================================

export const warmupCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 30,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas requisicoes de warm-up. Tente novamente em 1 hora.",
  },
});

// ============================================================================
// Express registration
// ============================================================================

export function registerWarmupRitualsRoutes(app: Express): void {
  app.post(
    "/api/warmup-rituals",
    requireAuth,
    requirePermission("mental_prep_access"),
    warmupCreateLimiter,
    (req: Request, res: Response) => handleCreateWarmupRitual(req, res),
  );
  app.get(
    "/api/warmup-rituals/latest",
    requireAuth,
    requirePermission("mental_prep_access"),
    (req: Request, res: Response) => handleGetLatestWarmupRitual(req, res),
  );
  app.get(
    "/api/warmup-rituals",
    requireAuth,
    requirePermission("mental_prep_access"),
    (req: Request, res: Response) => handleListWarmupRituals(req, res),
  );
  app.put(
    "/api/user-settings/weekly-heuristics",
    requireAuth,
    requirePermission("mental_prep_access"),
    (req: Request, res: Response) => handleUpdateWeeklyHeuristics(req, res),
  );
}
