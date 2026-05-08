/**
 * /api/study-sessions — Sprint Estudos-Habito-1 (RF-1).
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-1
 * ADRs : 126 (study_sessions_v2) + 128 (streak) + 130 (auto_lesson)
 *
 * Endpoints:
 *   POST   /api/study-sessions             cria session (post-hoc/live)
 *   GET    /api/study-sessions             list paginada
 *   PATCH  /api/study-sessions/:id         editar fields editaveis
 *   DELETE /api/study-sessions/:id         soft delete (24h gate)
 *   POST   /api/study-sessions/:id/finalize finalizar live -> completed
 *   GET    /api/users/me/study-habit       streak + goal + freezes status
 */

import type { Express, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { bumpStudyStreak, getStudyHabit } from "../services/studyStreak";
import {
  STUDY_SESSION_MODES,
  STUDY_SESSION_SOURCES,
  STUDY_SESSION_STATUSES,
} from "@shared/schema";

// HIGH-3 fix: rate limits per spec Estudos-Habito-1.
// keyGenerator usa userPlatformId (auth) com fallback para IP.
const createSessionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

const mutateSessionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

const finalizeSessionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

const updateGoalLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

// ============================================================================
// Validacao Zod
// ============================================================================

const createBodyBaseSchema = z.object({
  mode: z.enum(STUDY_SESSION_MODES),
  source: z.enum(STUDY_SESSION_SOURCES),
  status: z.enum(STUDY_SESSION_STATUSES).optional(),
  themeId: z.string().nullable().optional(),
  tournamentId: z.string().nullable().optional(),
  lessonId: z.string().nullable().optional(),
  starredHandIds: z.array(z.string()).nullable().optional(),
  drillPlatform: z.string().max(32).nullable().optional(),
  drillAccuracy: z.number().int().min(0).max(100).nullable().optional(),
  difficultSpots: z.array(z.object({
    context: z.string().max(200),
    note: z.string().max(500),
  })).max(5).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(1440),
  startedAt: z.coerce.date().nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  idlePeriods: z.array(z.object({
    start: z.string(),
    end: z.string(),
  })).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  attachments: z.array(z.object({
    key: z.string(),
    url: z.string(),
  })).max(5).nullable().optional(),
  wasProductive: z.boolean().nullable().optional(),
});

// PATCH so aceita campos editaveis (RF-1: NAO permite mudar mode/source/duration).
const patchBodySchema = z.object({
  notes: z.string().max(500).nullable().optional(),
  themeId: z.string().nullable().optional(),
  wasProductive: z.boolean().nullable().optional(),
  attachments: z.array(z.object({
    key: z.string(),
    url: z.string(),
  })).max(5).nullable().optional(),
}).strict();

const finalizeBodySchema = z.object({
  endedAt: z.coerce.date(),
  durationMinutes: z.number().int().min(1).max(1440),
  wasProductive: z.boolean().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  idlePeriods: z.array(z.object({
    start: z.string(),
    end: z.string(),
  })).nullable().optional(),
});

// ============================================================================
// Validacoes mode-based (discriminator).
// ============================================================================

function validateModeRequirements(body: z.infer<typeof createBodyBaseSchema>): {
  ok: true;
} | { ok: false; code: string; message: string } {
  const { mode, themeId, lessonId, starredHandIds } = body;
  if (mode === "drill_gto" && !themeId) {
    return { ok: false, code: "MISSING_THEME", message: "drill_gto exige themeId" };
  }
  if (mode === "lesson" && !lessonId) {
    return { ok: false, code: "MISSING_LESSON", message: "lesson exige lessonId" };
  }
  if (mode === "hand_review" && (!Array.isArray(starredHandIds) || starredHandIds.length === 0)) {
    return { ok: false, code: "MISSING_HAND_IDS", message: "hand_review exige >=1 starredHandId" };
  }
  if (mode === "other" && !themeId) {
    return { ok: false, code: "MISSING_THEME", message: "other exige themeId" };
  }
  return { ok: true };
}

// ============================================================================
// Handlers
// ============================================================================

export async function handleCreateStudySession(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const parsed = createBodyBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }
    const body = parsed.data;
    const modeCheck = validateModeRequirements(body);
    if (!modeCheck.ok) {
      res.status(400).json({ error: modeCheck.code, message: modeCheck.message });
      return;
    }

    // P0 #6: parallel ownership lookups (theme + lesson + tournament).
    // Reduz N round-trips DB para 1 quando body tem multiplos IDs.
    const [theme, lesson, tour] = await Promise.all([
      body.themeId ? (storage as any).getStudyThemeById(body.themeId) : Promise.resolve(null),
      body.lessonId ? (storage as any).getLibraryLessonById(body.lessonId) : Promise.resolve(null),
      body.tournamentId ? (storage as any).getTournament(body.tournamentId) : Promise.resolve(null),
    ]);

    if (body.themeId) {
      if (!theme || theme.userId !== userId) {
        res.status(403).json({ error: "THEME_FORBIDDEN", message: "Tema nao pertence ao user" });
        return;
      }
    }
    if (body.lessonId) {
      if (!lesson) {
        res.status(400).json({ error: "LESSON_NOT_FOUND", message: "Aula nao encontrada" });
        return;
      }
      if (lesson.isPublished === false) {
        res.status(400).json({ error: "LESSON_NOT_PUBLISHED", message: "Aula nao publicada" });
        return;
      }
    }
    if (body.tournamentId) {
      if (!tour || tour.userId !== userId) {
        res.status(403).json({ error: "TOURNAMENT_FORBIDDEN", message: "Tournament nao pertence ao user" });
        return;
      }
      if (tour.grindSessionId) {
        res.status(400).json({
          error: "TOURNAMENT_FROM_GRIND_SESSION",
          message: "Tournament eh de grind-live; use historico (grindSessionId NULL)",
        });
        return;
      }
    }

    // Determinar status: live -> running, post-hoc -> completed.
    const status = body.status ?? (body.source === "manual_live" ? "running" : "completed");

    // Cria session.
    let created: any;
    try {
      created = await (storage as any).createStudySessionV2({
        userId,
        mode: body.mode,
        source: body.source,
        status,
        themeId: body.themeId ?? null,
        tournamentId: body.tournamentId ?? null,
        lessonId: body.lessonId ?? null,
        starredHandIds: body.starredHandIds ?? null,
        drillPlatform: body.drillPlatform ?? null,
        drillAccuracy: body.drillAccuracy ?? null,
        difficultSpots: body.difficultSpots ?? null,
        durationMinutes: body.durationMinutes,
        startedAt: body.startedAt ?? null,
        endedAt: body.endedAt ?? null,
        idlePeriods: body.idlePeriods ?? null,
        notes: body.notes ?? null,
        attachments: body.attachments ?? null,
        wasProductive: body.wasProductive ?? null,
      });
    } catch (err: any) {
      if (err?.code === "SESSION_ALREADY_RUNNING") {
        res.status(409).json({
          error: "SESSION_ALREADY_RUNNING",
          message: "Voce ja tem uma sessao de estudo cronometrada em andamento",
        });
        return;
      }
      throw err;
    }

    // Bump streak somente para sessoes completed.
    if (status === "completed") {
      try {
        await bumpStudyStreak({
          userId,
          sessionStartedAt: created?.startedAt ?? created?.registeredAt ?? new Date(),
        });
      } catch (err) {
        console.error("[study-sessions] bumpStudyStreak failed", err);
        // Nao falha a request — streak eh acessorio.
      }
    }

    res.status(201).json(created);
  } catch (err) {
    console.error("[handleCreateStudySession] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handleListStudySessions(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const mode = typeof req?.query?.mode === "string" ? req.query.mode : undefined;
    const fromStr = typeof req?.query?.from === "string" ? req.query.from : undefined;
    const toStr = typeof req?.query?.to === "string" ? req.query.to : undefined;
    const limit = req?.query?.limit ? Number(req.query.limit) : 30;
    const offset = req?.query?.offset ? Number(req.query.offset) : 0;
    const filter: any = { limit, offset };
    if (mode) filter.mode = mode;
    if (fromStr) filter.from = new Date(fromStr);
    if (toStr) filter.to = new Date(toStr);
    const items = await (storage as any).getStudySessionsV2(userId, filter);
    res.status(200).json({ items: Array.isArray(items) ? items : [] });
  } catch (err) {
    console.error("[handleListStudySessions] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handleUpdateStudySession(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const id = String(req?.params?.id ?? "");
    if (!id) {
      res.status(400).json({ error: "INVALID_ID" });
      return;
    }
    // Reject mudanca em campos imutaveis ANTES do parse strict.
    const body = req.body ?? {};
    const forbidden = ["mode", "source", "durationMinutes", "duration_minutes", "startedAt", "started_at", "endedAt", "ended_at"];
    for (const k of forbidden) {
      if (k in body) {
        res.status(400).json({ error: "IMMUTABLE_FIELD", message: `Campo ${k} nao pode ser editado` });
        return;
      }
    }
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }
    const existing = await (storage as any).getStudySessionV2ById(id, userId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    const updated = await (storage as any).updateStudySessionV2(id, userId, parsed.data);
    if (!updated) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    res.status(200).json(updated);
  } catch (err) {
    console.error("[handleUpdateStudySession] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handleDeleteStudySession(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const id = String(req?.params?.id ?? "");
    if (!id) {
      res.status(400).json({ error: "INVALID_ID" });
      return;
    }
    const existing = await (storage as any).getStudySessionV2ById(id, userId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    // 24h gate.
    const createdAt = existing.createdAt ?? existing.created_at;
    if (createdAt) {
      const ageMs = Date.now() - new Date(createdAt).getTime();
      if (ageMs > 1000 * 60 * 60 * 24) {
        res.status(403).json({
          error: "DELETE_GATE_EXPIRED",
          message: "Apenas sessoes criadas nas ultimas 24h podem ser deletadas",
        });
        return;
      }
    }
    const ok = await (storage as any).deleteStudySessionV2(id, userId);
    if (!ok) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[handleDeleteStudySession] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handleFinalizeStudySession(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const id = String(req?.params?.id ?? "");
    if (!id) {
      res.status(400).json({ error: "INVALID_ID" });
      return;
    }
    const parsed = finalizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }
    const existing = await (storage as any).getStudySessionV2ById(id, userId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (existing.status !== "running") {
      res.status(409).json({
        error: "INVALID_STATE",
        message: "Sessao nao esta em execucao (status != running)",
      });
      return;
    }
    const finalized = await (storage as any).finalizeStudySessionV2(id, userId, {
      endedAt: parsed.data.endedAt,
      durationMinutes: parsed.data.durationMinutes,
      wasProductive: parsed.data.wasProductive ?? null,
      notes: parsed.data.notes ?? null,
      idlePeriods: parsed.data.idlePeriods ?? null,
    });
    if (!finalized) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    // Bump streak ao finalizar.
    try {
      await bumpStudyStreak({
        userId,
        sessionStartedAt: existing.startedAt ?? new Date(),
      });
    } catch (err) {
      console.error("[study-sessions] bumpStudyStreak finalize failed", err);
    }
    res.status(200).json(finalized);
  } catch (err) {
    console.error("[handleFinalizeStudySession] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handleGetStudyHabit(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const habit = await getStudyHabit(userId);
    res.status(200).json(habit);
  } catch (err) {
    console.error("[handleGetStudyHabit] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handleUpdateDailyGoal(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const minutes = Number(req?.body?.dailyStudyGoalMinutes ?? req?.body?.minutes);
    try {
      const updated = await (storage as any).updateDailyGoal(userId, minutes);
      res.status(200).json(updated);
    } catch (err: any) {
      if (err?.code === "INVALID_GOAL_VALUE") {
        res.status(400).json({ error: "INVALID_GOAL_VALUE", message: "Valor invalido (use 0/15/30/45/60/90/120)" });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error("[handleUpdateDailyGoal] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export function registerStudySessionsRoutes(app: Express): void {
  // HIGH-3 fix: rate limits aplicados apos requireAuth para que keyGenerator
  // use userPlatformId quando disponivel.
  app.post("/api/study-sessions", requireAuth, createSessionLimit, handleCreateStudySession);
  app.get("/api/study-sessions", requireAuth, handleListStudySessions);
  app.patch("/api/study-sessions/:id", requireAuth, mutateSessionLimit, handleUpdateStudySession);
  app.delete("/api/study-sessions/:id", requireAuth, mutateSessionLimit, handleDeleteStudySession);
  app.post("/api/study-sessions/:id/finalize", requireAuth, finalizeSessionLimit, handleFinalizeStudySession);
  app.get("/api/users/me/study-habit", requireAuth, handleGetStudyHabit);
  app.patch("/api/users/me/daily-study-goal", requireAuth, updateGoalLimit, handleUpdateDailyGoal);
}
