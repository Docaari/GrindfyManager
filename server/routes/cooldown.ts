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
import { z } from "zod";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  insertCooldownLogSchema,
  updateCooldownLogSchema,
  insertStarredHandSchema,
  starredHandTypeSchema,
  abGameAnswersSchema,
  tiltSelfAssessmentSchema,
} from "../../shared/schema";
import { nextMorning } from "../services/sleepGateService";
import { spotImageStorage } from "../services/spotImageStorage";
// Magic bytes helper importado direto do submodulo. Test integration mocka apenas
// o barrel `../services/spotImageStorage`; mime helper precisa ficar real para que
// o handler classifique buffers corretamente (PNG/JPEG/WEBP) durante os tests.
import {
  detectMimeFromBuffer,
  extFromMime,
} from "../services/spotImageStorage/mime";

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
// POST /api/cooldown-logs/:id/finish — Sprint Cooldown-2 (Reviewer fix CRITICAL #1+#2)
//
// Endpoint unificado para conclusao do cool-down em mode='full' (Bloco 4).
// Resolve 2 problemas:
//   #1 Cliente chamava PATCH /api/grind-sessions/:id (endpoint nao existe).
//   #2 Cliente calculava nextMorning() local sempre adicionando 1 dia,
//      divergindo do server-side que retorna mesmo dia 08h se now < 08h.
//
// Body: { sleepIntent, planClosed, abGameAnswers?, tiltSelfAssessment? }
// Effects (em ordem):
//   - planClosed=true   -> storage.setSessionPlanClosed(sessionId, userId, true)
//   - sleepIntent=true  -> storage.setUserDashboardSnoozedUntil(userId, nextMorning(now))
//   - PATCH cooldown_log: completedAt=now, blocksCompleted (preserva existing),
//                          sleepIntent, tiltSelfAssessment, abGameAnswers (se vierem)
// Response: { id, completedAt, durationMinutes, dashboardSnoozedUntil }
// =============================================================================

const finishCooldownBodySchema = z.object({
  sleepIntent: z.boolean(),
  planClosed: z.boolean(),
  abGameAnswers: abGameAnswersSchema.optional(),
  tiltSelfAssessment: tiltSelfAssessmentSchema.optional(),
});

export async function handleFinishCooldownLog(req: any, res: Response): Promise<void> {
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

  const parsed = finishCooldownBodySchema.safeParse(req.body ?? {});
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

    const { sleepIntent, planClosed, abGameAnswers, tiltSelfAssessment } = parsed.data;

    // Side-effect 1: planClosed=true -> grind_sessions.planClosed=true
    if (planClosed === true) {
      try {
        await storage.setSessionPlanClosed(
          (existing as any).sessionId,
          userId,
          true,
        );
      } catch (err: any) {
        console.error(
          "POST /api/cooldown-logs/:id/finish setSessionPlanClosed failed:",
          err,
        );
      }
    }

    // Side-effect 2: sleepIntent=true -> users.dashboardSnoozedUntil = nextMorning(now)
    let dashboardSnoozedUntil: Date | null = null;
    if (sleepIntent === true) {
      const target = nextMorning(new Date());
      try {
        await storage.setUserDashboardSnoozedUntil(userId, target);
        dashboardSnoozedUntil = target;
      } catch (err: any) {
        console.error(
          "POST /api/cooldown-logs/:id/finish setUserDashboardSnoozedUntil failed:",
          err,
        );
      }
    }

    // PATCH cooldown_log — completedAt + sleepIntent + tilt + abc
    const completedAt = new Date();
    const startMs =
      existing.startedAt != null
        ? new Date((existing as any).startedAt).getTime()
        : NaN;
    const durationMinutes = Number.isFinite(startMs)
      ? Math.max(0, Math.round((completedAt.getTime() - startMs) / 60000))
      : undefined;

    // blocksCompleted: preserva existente + garante 4 blocos para mode='full'.
    const prevBlocks: string[] = Array.isArray((existing as any).blocksCompleted)
      ? ((existing as any).blocksCompleted as string[])
      : [];
    const expectedFullBlocks = ["hands", "abc", "tilt", "sleep"];
    const finalBlocks =
      (existing as any).mode === "full"
        ? Array.from(new Set([...prevBlocks, ...expectedFullBlocks]))
        : prevBlocks;

    const patch: any = {
      completedAt,
      blocksCompleted: finalBlocks,
      sleepIntent,
    };
    if (tiltSelfAssessment !== undefined) patch.tiltSelfAssessment = tiltSelfAssessment;
    if (abGameAnswers !== undefined) patch.abGameAnswers = abGameAnswers;
    if (durationMinutes !== undefined) patch.durationMinutes = durationMinutes;

    const updated = await storage.updateCooldownLog(id, userId, patch);
    if (!updated) {
      res.status(404).json({ message: "Cool-down nao encontrado" });
      return;
    }

    // Sprint B2 (M5): marca grind_session como completed (idempotente).
    // Skip se ja estava completed. Falha aqui nao deve quebrar o finish —
    // log + segue (warning client-side).
    const sessionId = (existing as any).sessionId;
    let sessionStatusUpdated = false;
    try {
      const session = await storage.getGrindSession(sessionId);
      if (session && session.userId === userId && session.status !== "completed") {
        await storage.updateGrindSession(sessionId, { status: "completed" } as any);
        sessionStatusUpdated = true;
      }
    } catch (err: any) {
      console.error(
        "POST /api/cooldown-logs/:id/finish updateGrindSession failed:",
        err,
      );
    }

    res.status(200).json({
      id: (updated as any).id,
      completedAt: (updated as any).completedAt,
      durationMinutes: (updated as any).durationMinutes ?? durationMinutes ?? null,
      dashboardSnoozedUntil:
        dashboardSnoozedUntil != null ? dashboardSnoozedUntil.toISOString() : null,
      sessionStatusUpdated,
    });
  } catch (err: any) {
    console.error("POST /api/cooldown-logs/:id/finish failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao concluir cool-down" });
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
// POST /api/starred-hands  — Sprint Spot-Screenshots
// =============================================================================
// Estende handler legado da Cooldown-1 com suporte a upload de imagem
// (multipart). Body sem file mantem fluxo legado intacto.
//
// Spec: Docs/specs/spot-screenshots.md (RF-01..05, RF-08)
// ADR : 057-spot-image-storage-abstraction.md
// =============================================================================

const SPOT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function isPathUnsafe(value: string): boolean {
  return (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\")
  );
}

export async function handleCreateStarredHand(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const file = req.file;
  const body = { ...(req.body ?? {}), userId };
  const parsed = insertStarredHandSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }

  // Defesa em profundidade: rejeita identifiers com path traversal antes de
  // chegar no storage layer (ADR-057 + lessons-learned #file-uploads).
  if (
    isPathUnsafe(parsed.data.sessionId) ||
    isPathUnsafe(parsed.data.sessionTournamentId)
  ) {
    res.status(400).json({
      code: "invalid_identifier",
      message: "Identificador contem caracteres invalidos",
    });
    return;
  }

  try {
    // Ownership da sessao + RF-08 (sessao concluida bloqueia novos spots)
    const session = await storage.getGrindSession(parsed.data.sessionId);
    if (!session || (session as any).userId !== userId) {
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }
    if ((session as any).status === "completed") {
      res.status(409).json({
        code: "session_completed",
        message: "Sessao ja concluida",
      });
      return;
    }

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

    // Cap 3 stars/torneio
    const cTour = await storage.countStarredHandsByTournament(
      parsed.data.sessionTournamentId,
      userId,
    );
    if (cTour >= 3) {
      res.status(400).json({
        code: "star_limit_reached",
        message: "Maximo 3 maos por torneio",
      });
      return;
    }

    // Cap 10 spots/sessao cross-tournament (Sprint Spot-Screenshots)
    const cSession = await storage.countStarredHandsBySession(
      userId,
      parsed.data.sessionId,
    );
    if (cSession >= 10) {
      res.status(400).json({
        code: "session_spot_limit_reached",
        message: "Cap de 10 spots por sessao atingido",
      });
      return;
    }

    // ---- Modo com imagem ----
    let savedKey: string | null = null;
    let imageMime: string | undefined;
    let imageSize: number | undefined;

    if (file) {
      const buffer: Buffer | undefined = file.buffer;
      const declaredSize: number = typeof file.size === "number" ? file.size : (buffer?.length ?? 0);

      if (declaredSize > SPOT_MAX_FILE_SIZE) {
        res.status(413).json({
          code: "file_too_large",
          message: "Imagem maior que 5MB",
        });
        return;
      }

      const realMime = detectMimeFromBuffer(buffer);
      if (!realMime) {
        res.status(400).json({
          code: "invalid_mime",
          message: "Formato nao suportado. Aceitos: PNG, JPEG, WEBP",
        });
        return;
      }

      const ext = extFromMime(realMime);
      try {
        const putResult = await spotImageStorage.put({
          userId,
          sessionId: parsed.data.sessionId,
          ext,
          buffer: buffer as Buffer,
          mime: realMime,
        });
        savedKey = putResult.key;
        imageMime = realMime;
        imageSize = putResult.size;
      } catch (err: any) {
        console.error("POST /api/starred-hands spotImageStorage.put failed:", err);
        res.status(500).json({ message: "Erro ao salvar imagem" });
        return;
      }
    }

    // capturedDuring: usa valor do body ou default 'cooldown' (D4 backfill).
    const capturedDuring = parsed.data.capturedDuring ?? "cooldown";

    try {
      const created = await storage.createStarredHand({
        ...parsed.data,
        userId,
        capturedDuring,
        ...(savedKey
          ? {
              imageKey: savedKey,
              imageMime,
              imageSize,
              imageWidth: null,
              imageHeight: null,
            }
          : {}),
      } as any);
      res.status(201).json(created);
    } catch (insertErr: any) {
      // D9 cleanup transacional: arquivo salvo mas INSERT falhou -> remove arquivo.
      console.error(
        "POST /api/starred-hands createStarredHand failed:",
        insertErr,
      );
      if (savedKey) {
        try {
          await spotImageStorage.delete(savedKey);
        } catch (cleanupErr: any) {
          // TECH-DEBT-F4-ORPHAN: arquivo orfao em private-uploads/spots/ quando
          // delete pos-INSERT-fail tambem falha (EACCES/EBUSY/EIO). Tag estruturada
          // permite alerta + futuro garbage collector reusando node-cron F2.
          console.error("[spot_orphan_alert] cleanup failed", {
            tag: "spot_orphan_alert",
            key: savedKey,
            errCode: cleanupErr?.code,
            errMessage: cleanupErr?.message,
          });
        }
      }
      res.status(500).json({ message: "Erro ao salvar spot" });
    }
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
// GET /api/starred-hands/:id/image — Sprint Spot-Screenshots (RF-10)
// =============================================================================

export async function handleGetStarredHandImage(req: any, res: Response): Promise<void> {
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
    const row = await storage.getStarredHand(id, userId);
    // 404 (NUNCA 403) — ADR-052/057: nao confirma existencia para outros users.
    if (!row || (row as any).userId !== userId) {
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }

    const imageKey = (row as any).imageKey as string | null | undefined;
    if (!imageKey) {
      res.status(404).json({ message: "Spot sem imagem associada" });
      return;
    }

    const imageMime = ((row as any).imageMime as string | undefined) ?? "application/octet-stream";
    const imageSize = (row as any).imageSize as number | undefined;

    let result: { buffer: Buffer; mime: string } | null;
    try {
      result = await spotImageStorage.get(imageKey);
    } catch (err: any) {
      console.error("GET /api/starred-hands/:id/image storage.get failed:", err);
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }

    if (!result) {
      // EC-09: FS sumiu mas row existe. Spec prefere degradacao graciosa (404)
      // sobre 500 — frontend renderiza placeholder via <img onError>.
      console.warn("GET /api/starred-hands/:id/image FS missing for row", {
        id,
        imageKey,
      });
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }

    res.setHeader("Content-Type", imageMime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    if (typeof imageSize === "number") {
      res.setHeader("Content-Length", String(imageSize));
    }
    res.status(200);
    res.end(result.buffer);
  } catch (err: any) {
    console.error("GET /api/starred-hands/:id/image failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao servir imagem" });
  }
}

// =============================================================================
// DELETE /api/starred-hands/:id
// =============================================================================
// Sprint Spot-Screenshots: estende para deletar arquivo via spotImageStorage
// quando a row tem imageKey. Idempotente — falha do storage (ENOENT) NAO bloqueia.
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

    const imageKey = (existing as any).imageKey as string | null | undefined;
    if (imageKey) {
      try {
        await spotImageStorage.delete(imageKey);
      } catch (err: any) {
        // Idempotente: ENOENT ou similar -> log warn, segue para deletar row.
        console.warn(
          "DELETE /api/starred-hands/:id spotImageStorage.delete soft-fail:",
          { id, imageKey, code: err?.code, message: err?.message },
        );
      }
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
// Multer middleware — Sprint Spot-Screenshots
// memoryStorage + 5MB cap. Magic bytes valida APOS chegar ao buffer (D8).
// =============================================================================

const spotMulterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SPOT_MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Aceita declared MIME image/*; magic bytes valida no handler (D2).
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else if (!file.mimetype) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

function spotMulterErrorHandler(req: any, res: Response, next: any): void {
  spotMulterUpload.single("file")(req, res, (err: any) => {
    if (err) {
      if (err?.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          code: "file_too_large",
          message: "Imagem maior que 5MB",
        });
        return;
      }
      console.error("[POST /api/starred-hands] multer error:", err);
      res.status(400).json({
        code: "upload_error",
        message: err?.message ?? "Erro de upload",
      });
      return;
    }
    next();
  });
}

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
  // Sprint Cooldown-2 — endpoint unificado de conclusao (CRITICAL #1+#2).
  app.post(
    "/api/cooldown-logs/:id/finish",
    requireAuth,
    cooldownLimiter,
    (req: Request, res: Response) => handleFinishCooldownLog(req, res),
  );
  // Note: GET /:sessionId vem antes de GET / para nao conflitar.
  app.get("/api/cooldown-logs/:sessionId", requireAuth, (req: Request, res: Response) =>
    handleGetCooldownLogBySession(req, res),
  );
  app.get("/api/cooldown-logs", requireAuth, (req: Request, res: Response) =>
    handleListCooldownLogs(req, res),
  );

  // Sprint Spot-Screenshots: POST aceita multipart com `file` opcional.
  app.post(
    "/api/starred-hands",
    requireAuth,
    cooldownLimiter,
    spotMulterErrorHandler,
    (req: Request, res: Response) => handleCreateStarredHand(req, res),
  );
  app.get("/api/starred-hands", requireAuth, (req: Request, res: Response) =>
    handleListStarredHands(req, res),
  );
  // Sprint Spot-Screenshots — GET /:id/image (RF-10) com spotImageStorage.
  app.get(
    "/api/starred-hands/:id/image",
    requireAuth,
    (req: Request, res: Response) => handleGetStarredHandImage(req, res),
  );
  app.delete("/api/starred-hands/:id", requireAuth, (req: Request, res: Response) =>
    handleDeleteStarredHand(req, res),
  );
}
