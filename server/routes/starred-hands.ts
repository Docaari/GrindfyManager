/**
 * Starred Hands Routes — Sprint F2 — Print de Spots durante Grind
 *
 * Spec: Docs/specs/sprint-f2-spot-screenshots.md
 * ADRs: 051 (storage), 052 (ownership), 053 (cron)
 *
 * Endpoints novos (vivem em arquivo dedicado para nao colidir com cooldown.ts):
 *   POST   /api/starred-hands/screenshot      -> handleCreateSpotScreenshot
 *   PATCH  /api/starred-hands/:id/review      -> handleUpdateSpotReview
 *   GET    /api/starred-hands/pending         -> handleListPendingSpots
 *   DELETE /api/starred-hands/:id/discard     -> handleDiscardSpot (soft delete)
 *   GET    /api/starred-hands/:id/image       -> handleServeSpotImage (ownership)
 *
 * Notas arquiteturais:
 *   - DELETE /:id/discard usa rota distinta de /:id (Cooldown-1 hard delete)
 *     para evitar override por ordem de app.use (architect-flagged).
 *   - GET /:id/image abandona path direto (/uploads/...) a favor de ownership
 *     middleware custom (ADR-052).
 *   - Multer disk + 5MB + MIME filter (png/jpg/jpeg/webp; gif rejeitado).
 *   - Rollback Multer em qualquer 4xx pos-upload (architect-flagged).
 */

import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { spotStorage, resolveSpotPath } from "../lib/spotStorage";
import {
  updateSpotReviewSchema,
  starredHandSourceSchema,
} from "../../shared/schema";
import { nanoid } from "nanoid";
import { z } from "zod";

// Constantes locais espelham server/lib/spotStorage. Nao importadas porque
// `vi.mock("../lib/spotStorage")` nos testes nao re-exporta as constantes —
// importar quebra rollbackMulterUpload em test runtime. Manter sincronizado.
//
// CRITICAL pre-merge: SPOT_UPLOADS_DIR esta em `private-uploads/` (fora do
// static server `/uploads` montado por studies-v2.ts:639) para impedir
// download direto sem ownership check. URL prefix permanece `/uploads/...`
// como identificador logico; resolucao real eh via GET /:id/image (ADR-052).
const SPOT_UPLOADS_DIR = path.resolve("private-uploads/spot-screenshots");
const SPOT_URL_PREFIX = "/uploads/spot-screenshots";

// =============================================================================
// Multer config — disk storage, 5MB, MIME filter
// =============================================================================

const SPOT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SPOT_ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
]);

function spotExtFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

// Boot ja garante o diretorio via spotStorage.healthCheck(). Cache de bool
// evita custos repetidos de fs.mkdirSync em hot path; refaz se for removido.
let multerDirEnsured = false;
function ensureMulterDir(): void {
  if (multerDirEnsured) return;
  fs.mkdirSync(SPOT_UPLOADS_DIR, { recursive: true });
  multerDirEnsured = true;
}

const spotDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureMulterDir();
    cb(null, SPOT_UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = spotExtFromMime(file.mimetype);
    cb(null, `${nanoid(16)}.${ext}`);
  },
});

export const spotScreenshotUpload = multer({
  storage: spotDiskStorage,
  limits: { fileSize: SPOT_MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (SPOT_ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      // gif e outros — rejeitar antes de gravar.
      cb(new Error("invalid_mime"));
    }
  },
});

// =============================================================================
// Helpers
// =============================================================================

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function unauthorized(res: Response) {
  return res.status(401).json({ message: "Unauthorized" });
}

/**
 * Apaga o arquivo gravado pelo Multer apos uma falha de validacao/ownership/limit.
 * Use sempre antes de retornar 4xx ou 5xx pos-upload.
 *
 * Resolve a key relativa para chamar `spotStorage.delete()` (mesma abstracao
 * que o cron usa). Se nao houver req.file, no-op.
 */
async function rollbackMulterUpload(req: any): Promise<void> {
  const file = req?.file;
  if (!file) return;
  // Construir a key relativa: /uploads/spot-screenshots/<filename>
  const filename = file.filename ?? path.basename(file.path ?? "");
  if (!filename) return;
  const key = `${SPOT_URL_PREFIX}/${filename}`;
  try {
    await spotStorage.delete(key);
  } catch (err: any) {
    // ENOENT eh OK: arquivo ja foi removido por outra request concorrente.
    if (err?.code !== "ENOENT") {
      console.warn("rollbackMulterUpload failed", { filename, err: err?.message });
    }
  }
}

// =============================================================================
// POST /api/starred-hands/screenshot
// =============================================================================

const SPOT_LIMIT_PER_SESSION = 10;
const SPOT_EXPIRES_DAYS = 14;
const SPOT_EXPIRES_MS = SPOT_EXPIRES_DAYS * 24 * 60 * 60 * 1000;

// NAO strict: campos como userId enviados pelo cliente sao silenciosamente
// ignorados (handler usa req.user.userPlatformId como fonte de verdade).
const screenshotBodySchema = z.object({
  sessionId: z.string().min(1),
  sessionTournamentId: z.string().min(1).optional(),
  source: starredHandSourceSchema.optional(),
});

export async function handleCreateSpotScreenshot(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    await rollbackMulterUpload(req);
    unauthorized(res);
    return;
  }

  // Defensive MIME check (Multer fileFilter pode ja ter bloqueado, mas testes
  // injetam req.file diretamente, sem passar pelo middleware).
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: "screenshot file obrigatorio" });
    return;
  }
  if (!SPOT_ALLOWED_MIMES.has(file.mimetype)) {
    await rollbackMulterUpload(req);
    res.status(400).json({
      message: "Formato invalido. Aceitos: PNG, JPG, JPEG, WebP",
      code: "invalid_mime",
    });
    return;
  }
  if (typeof file.size === "number" && file.size > SPOT_MAX_FILE_SIZE) {
    await rollbackMulterUpload(req);
    res.status(413).json({
      message: "Imagem maior que 5MB",
      code: "file_too_large",
    });
    return;
  }

  const parsed = screenshotBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    await rollbackMulterUpload(req);
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  const { sessionId, sessionTournamentId: stExplicit } = parsed.data;
  const source = parsed.data.source ?? "paste";

  try {
    // Ownership da sessao
    const session = await storage.getGrindSession(sessionId);
    if (!session || (session as any).userId !== userId) {
      await rollbackMulterUpload(req);
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }

    // Counter de spots na sessao (com SELECT FOR UPDATE no storage layer)
    const count = await storage.countSpotsBySession(sessionId);
    if (typeof count === "number" && count >= SPOT_LIMIT_PER_SESSION) {
      await rollbackMulterUpload(req);
      res.status(409).json({
        code: "spot_limit_reached",
        limit: SPOT_LIMIT_PER_SESSION,
      });
      return;
    }

    // Resolver sessionTournamentId se nao foi passado.
    let sessionTournamentId = stExplicit;
    if (!sessionTournamentId) {
      const resolved = await storage.resolveTournamentInSession(sessionId);
      if (!resolved) {
        await rollbackMulterUpload(req);
        res.status(422).json({
          code: "no_tournament_in_session",
          message: "Sessao nao tem nenhum torneio para anexar o print",
        });
        return;
      }
      sessionTournamentId = resolved;
    }

    // Construir imageUrl a partir do filename gravado pelo Multer.
    const filename = file.filename ?? path.basename(file.path ?? "");
    const imageUrl = `${SPOT_URL_PREFIX}/${filename}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SPOT_EXPIRES_MS);

    const created = await storage.createStarredHand({
      userId,
      sessionId,
      sessionTournamentId,
      type: "spot_screenshot",
      spot: "screenshot_pending",
      imageUrl,
      pastedAt: now,
      expiresAt,
      status: "pending",
      source,
    });

    res.status(201).json({
      id: created.id,
      imageUrl,
      expiresAt,
      sessionTournamentId,
      pastedAt: now,
    });
  } catch (err: any) {
    console.error("POST /api/starred-hands/screenshot failed:", err);
    await rollbackMulterUpload(req);
    res.status(500).json({ message: err?.message ?? "Erro ao criar print" });
  }
}

// =============================================================================
// PATCH /api/starred-hands/:id/review
// =============================================================================

export async function handleUpdateSpotReview(req: any, res: Response): Promise<void> {
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

  const parsed = updateSpotReviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const existing = await storage.getStarredHandById(id);
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ message: "Mao estrelada nao encontrada" });
      return;
    }

    const body = parsed.data;
    const patch: Record<string, any> = {};

    if (body.sessionTournamentId !== undefined) {
      const ok = await storage.assertTournamentInSession(
        body.sessionTournamentId,
        existing.sessionId,
        userId,
      );
      if (!ok) {
        res.status(422).json({
          code: "tournament_session_mismatch",
          message: "Torneio nao pertence a sessao do print",
        });
        return;
      }
      patch.sessionTournamentId = body.sessionTournamentId;
    }

    // type/spot/notes — sao persistidos quando vierem (jogador classifica).
    if (body.type !== undefined) patch.type = body.type;
    if (body.spot !== undefined) patch.spot = body.spot;
    if (body.notes !== undefined) patch.notes = body.notes;

    // reviewLater eh persistido independente. conclusion eh sempre persistida
    // se enviada (jogador nao perde texto digitado). reviewedAt+status='reviewed'
    // SO sao marcados quando NAO eh revisar-depois (review-pre-merge MED-1).
    if (body.reviewLater !== undefined) {
      patch.reviewLater = body.reviewLater;
    }
    if (body.conclusion !== undefined) {
      patch.conclusion = body.conclusion;
      if (body.reviewLater !== true) {
        patch.reviewedAt = new Date();
        patch.status = "reviewed";
      }
    }

    const updated = await storage.updateStarredHand(id, patch);
    if (!updated) {
      res.status(404).json({ message: "Mao estrelada nao encontrada" });
      return;
    }
    res.status(200).json(updated);
  } catch (err: any) {
    console.error("PATCH /api/starred-hands/:id/review failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao revisar print" });
  }
}

// =============================================================================
// GET /api/starred-hands/pending
// =============================================================================

export async function handleListPendingSpots(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const q = req.query ?? {};
  let limit = 50;
  let offset = 0;
  if (q.limit != null && q.limit !== "") {
    const n = parseInt(String(q.limit), 10);
    if (!Number.isNaN(n) && n > 0) limit = Math.min(200, n);
  }
  if (q.offset != null && q.offset !== "") {
    const n = parseInt(String(q.offset), 10);
    if (!Number.isNaN(n) && n >= 0) offset = n;
  }

  const filter: Record<string, any> = { limit, offset };
  if (typeof q.reviewLater === "string" && q.reviewLater.length > 0) {
    filter.reviewLater = q.reviewLater;
  }
  if (typeof q.sessionId === "string" && q.sessionId.length > 0) {
    filter.sessionId = q.sessionId;
  }

  try {
    const result = await storage.listPendingSpots(userId, filter);
    res.status(200).json(result);
  } catch (err: any) {
    console.error("GET /api/starred-hands/pending failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao listar prints pendentes" });
  }
}

// =============================================================================
// DELETE /api/starred-hands/:id/discard — soft delete (Sprint F2)
// =============================================================================
// Rota DISTINTA do hard delete /:id da Cooldown-1 (architect-flagged).
// =============================================================================

export async function handleDiscardSpot(req: any, res: Response): Promise<void> {
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
    const existing = await storage.getStarredHandById(id);
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ message: "Mao estrelada nao encontrada" });
      return;
    }

    // Idempotente: re-discard em row ja discarded eh no-op (ainda 204).
    await storage.softDeleteStarredHand(id);
    res.status(204).end();
  } catch (err: any) {
    console.error("DELETE /api/starred-hands/:id/discard failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao descartar print" });
  }
}

// =============================================================================
// GET /api/starred-hands/:id/image — ownership middleware (ADR-052)
// =============================================================================

export async function handleServeSpotImage(req: any, res: Response): Promise<void> {
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
    const row = await storage.getStarredHandById(id);
    // 404 (nao 403) para nao confirmar existencia (ADR-052).
    if (!row || row.userId !== userId) {
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }
    if (!row.imageUrl) {
      res.status(404).json({ message: "Print sem imagem associada" });
      return;
    }

    const absolutePath = resolveSpotPath(row.imageUrl);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.sendFile(absolutePath);
  } catch (err: any) {
    console.error("GET /api/starred-hands/:id/image failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao servir imagem" });
  }
}

// =============================================================================
// Rate limit
// =============================================================================

export const screenshotUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 30, // paste burst razoavel
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitos uploads de print. Tente novamente em alguns minutos." },
});

export const spotImageServeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 100, // ADR-052: defesa contra fetch loop
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisicoes de imagem." },
});

// =============================================================================
// Express registration
// =============================================================================

/**
 * Wrapper que captura erros do Multer (limit, fileFilter) e converte em
 * resposta HTTP apropriada antes de chamar o handler.
 */
function multerErrorHandler(
  upload: multer.Multer,
  field: string,
): (req: Request, res: Response, next: any) => void {
  return (req, res, next) => {
    upload.single(field)(req as any, res as any, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({
            message: "Imagem maior que 5MB",
            code: "file_too_large",
          });
          return;
        }
        if (err.message === "invalid_mime") {
          res.status(400).json({
            message: "Formato invalido. Aceitos: PNG, JPG, JPEG, WebP",
            code: "invalid_mime",
          });
          return;
        }
        console.error("Multer error", err);
        res.status(400).json({ message: err?.message ?? "Erro de upload" });
        return;
      }
      next();
    });
  };
}

export function registerStarredHandsRoutes(app: Express): void {
  app.post(
    "/api/starred-hands/screenshot",
    requireAuth,
    screenshotUploadLimiter,
    multerErrorHandler(spotScreenshotUpload, "screenshot"),
    (req: Request, res: Response) => handleCreateSpotScreenshot(req, res),
  );

  app.patch(
    "/api/starred-hands/:id/review",
    requireAuth,
    (req: Request, res: Response) => handleUpdateSpotReview(req, res),
  );

  app.get(
    "/api/starred-hands/pending",
    requireAuth,
    (req: Request, res: Response) => handleListPendingSpots(req, res),
  );

  app.delete(
    "/api/starred-hands/:id/discard",
    requireAuth,
    (req: Request, res: Response) => handleDiscardSpot(req, res),
  );

  app.get(
    "/api/starred-hands/:id/image",
    requireAuth,
    spotImageServeLimiter,
    (req: Request, res: Response) => handleServeSpotImage(req, res),
  );
}
