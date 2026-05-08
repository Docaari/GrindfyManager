/**
 * Sprint Spot-Anki-Reentry-3 — RF-2.4 + RF-5
 *
 * Aggregates SRS endpoints under /api/reentry:
 *
 *   GET  /api/reentry/queue                       — handleGetReentryQueue
 *   POST /api/reentry/:cardId/grade               — handlePostReentryGrade
 *   POST /api/reentry/:cardId/skip                — handlePostReentrySkip
 *   GET  /api/reentry/stats                       — handleGetReentryStats
 *   POST /api/reentry/bulk-from-session           — handlePostReentryBulkFromSession
 */

import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import {
  applyGrade,
  computeInitialState,
  type SrsGrade,
} from "../services/spotReentry/srsAlgorithm";
import { invalidateSrsStatsCache } from "../services/spotReentry/srsStatsCache";
import { getSrsStatsCached } from "../services/spotReentry/srsStatsService";

// =============================================================================
// Rate limiters (HIGH-1 audit fix)
//
// Pattern: keyGenerator = userPlatformId, fallback IP. Caps:
//   - GET queue/stats: alto (300/min) — leitura idempotente
//   - POST grade/skip: 60/min/user — atalhos teclado podem disparar burst
//   - POST bulk-from-session: 10/min/user — operacao pesada (multi-spot)
// =============================================================================

const reentryReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisicoes ao reentry. Aguarde 1 minuto." },
});

const reentryGradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitos grades em curto periodo. Aguarde 1 minuto." },
});

const reentryBulkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitos bulk-from-session. Aguarde 1 minuto." },
});

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

// =============================================================================
// GET /api/reentry/queue
// =============================================================================

export async function handleGetReentryQueue(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  let limit = 5;
  if (req.query?.limit != null && req.query.limit !== "") {
    const n = parseInt(String(req.query.limit), 10);
    if (!Number.isNaN(n) && n > 0) {
      limit = Math.min(20, n);
    }
  }
  try {
    const result = await (storage as any).getReentryQueue(
      userId,
      new Date(),
      limit,
    );
    res.status(200).json(result);
  } catch (err: any) {
    console.error("GET /api/reentry/queue failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao carregar fila" });
  }
}

// =============================================================================
// POST /api/reentry/:cardId/grade
// =============================================================================

const gradeBodySchema = z
  .object({
    grade: z.enum(["again", "hard", "good", "easy"]),
  })
  .strict();

export async function handlePostReentryGrade(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const cardId = req.params?.cardId;
  if (!cardId) {
    res.status(400).json({ message: "cardId obrigatorio" });
    return;
  }
  const parsed = gradeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
    });
    return;
  }
  const grade: SrsGrade = parsed.data.grade;

  try {
    const card = await (storage as any).getReentryCardById(cardId, userId);
    if (!card) {
      res.status(404).json({ message: "Card nao encontrado" });
      return;
    }
    if (card.archivedAt) {
      res.status(410).json({ message: "Card arquivado" });
      return;
    }

    const sm2 = applyGrade(
      {
        intervalDays: Number(card.intervalDays),
        easeFactor: Number(card.easeFactor),
      },
      grade,
    );
    // HIGH-2 audit fix: optimistic concurrency. Passa updatedAt lido para
    // o storage; se outro request grade-ou em paralelo, returning eh [] e
    // retornamos 409 para o cliente refetch + retry.
    const updated = await (storage as any).updateReentryCardAfterGrade(
      cardId,
      userId,
      {
        intervalDays: sm2.nextIntervalDays,
        easeFactor: sm2.newEaseFactor,
        nextReviewAt: sm2.nextReviewAt,
        lastGrade: grade,
        incrementCorrect: grade !== "again",
      },
      card.updatedAt ?? null,
    );
    if (!updated) {
      // Pode ser stale (concurrent grade) ou falha real do DB.
      // Quando temos snapshot updatedAt, assumimos stale -> 409.
      if (card.updatedAt) {
        res.status(409).json({
          message: "CARD_STALE",
          code: "CARD_STALE",
        });
        return;
      }
      res.status(500).json({ message: "Erro ao aplicar grade" });
      return;
    }

    // Invalidate stats cache (lesson #21).
    try {
      invalidateSrsStatsCache(userId);
    } catch {
      // ignore
    }

    // Fetch next pending card.
    let nextCard: any = null;
    try {
      const queue = await (storage as any).getReentryQueue(
        userId,
        new Date(),
        1,
      );
      nextCard = queue?.items?.[0] ?? null;
    } catch {
      nextCard = null;
    }

    res.status(200).json({
      card: updated,
      nextReviewAt: sm2.nextReviewAt,
      intervalDays: sm2.nextIntervalDays,
      nextCard,
    });
  } catch (err: any) {
    console.error("POST /api/reentry/:cardId/grade failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao aplicar grade" });
  }
}

// =============================================================================
// POST /api/reentry/:cardId/skip
// =============================================================================

export async function handlePostReentrySkip(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const cardId = req.params?.cardId;
  if (!cardId) {
    res.status(400).json({ message: "cardId obrigatorio" });
    return;
  }
  try {
    const updated = await (storage as any).updateReentryCardSkip(
      cardId,
      userId,
    );
    if (!updated) {
      res.status(404).json({ message: "Card nao encontrado" });
      return;
    }
    try {
      invalidateSrsStatsCache(userId);
    } catch {
      // ignore
    }
    res.status(200).json({ card: updated });
  } catch (err: any) {
    console.error("POST /api/reentry/:cardId/skip failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao pular card" });
  }
}

// =============================================================================
// GET /api/reentry/stats
// =============================================================================

export async function handleGetReentryStats(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const stats = await getSrsStatsCached(userId);
    res.status(200).json(stats);
  } catch (err: any) {
    console.error("GET /api/reentry/stats failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao buscar stats" });
  }
}

// =============================================================================
// POST /api/reentry/bulk-from-session
// =============================================================================

const bulkBodySchema = z
  .object({
    sessionId: z.string().min(1),
    spotIds: z.array(z.string().min(1)).min(1).max(20),
  })
  .strict();

export async function handlePostReentryBulkFromSession(
  req: any,
  res: Response,
): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const parsed = bulkBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
    });
    return;
  }
  const { sessionId, spotIds } = parsed.data;

  try {
    // Ownership: session belongs to user.
    const session =
      (await (storage as any).getGrindSessionById?.(sessionId)) ??
      (await (storage as any).getGrindSession?.(sessionId));
    if (!session) {
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }
    if (session.userId !== userId) {
      res.status(403).json({ message: "Sem permissao na sessao" });
      return;
    }

    // Ownership: each spot belongs to user.
    const spots = await (storage as any).getStarredHandsByIds(spotIds);
    if (!Array.isArray(spots)) {
      res.status(500).json({ message: "Erro ao carregar spots" });
      return;
    }
    const allOwned = spots.every((s: any) => s.userId === userId);
    if (!allOwned) {
      res.status(403).json({ message: "Spot nao pertence ao user" });
      return;
    }

    // Build items with initial state per spot (ADR-139).
    const items = spots.map((s: any) => {
      const initial = computeInitialState({
        source: "coach_session_insight",
        decisionCorrect: s.decisionCorrect ?? null,
        confidenceLevel: s.confidenceLevel ?? null,
      });
      return {
        spotId: s.id,
        source: "coach_session_insight" as const,
        intervalDays: initial.intervalDays,
        easeFactor: initial.easeFactor,
        nextReviewAt: initial.nextReviewAt,
      };
    });

    const result = await (storage as any).bulkCreateReentryCards(userId, items);
    try {
      invalidateSrsStatsCache(userId);
    } catch {
      // ignore
    }
    res.status(201).json(result);
  } catch (err: any) {
    console.error("POST /api/reentry/bulk-from-session failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro no bulk-from-session" });
  }
}

// =============================================================================
// Express registration
// =============================================================================

export function registerReentryRoutes(app: Express): void {
  app.get(
    "/api/reentry/queue",
    requireAuth,
    reentryReadLimiter,
    (req: any, res: Response) => handleGetReentryQueue(req, res),
  );
  app.post(
    "/api/reentry/:cardId/grade",
    requireAuth,
    reentryGradeLimiter,
    (req: any, res: Response) => handlePostReentryGrade(req, res),
  );
  app.post(
    "/api/reentry/:cardId/skip",
    requireAuth,
    reentryGradeLimiter,
    (req: any, res: Response) => handlePostReentrySkip(req, res),
  );
  app.get(
    "/api/reentry/stats",
    requireAuth,
    reentryReadLimiter,
    (req: any, res: Response) => handleGetReentryStats(req, res),
  );
  app.post(
    "/api/reentry/bulk-from-session",
    requireAuth,
    reentryBulkLimiter,
    (req: any, res: Response) => handlePostReentryBulkFromSession(req, res),
  );
}
