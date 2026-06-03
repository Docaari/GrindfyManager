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

import type { Express, Response, Request } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { bumpStudyStreak, getStudyHabit } from "../services/studyStreak";
import {
  STUDY_SESSION_MODES,
  STUDY_SESSION_SOURCES,
  STUDY_SESSION_STATUSES,
  statAnalysisEntrySchema,
} from "@shared/schema";
import { isValidStatId } from "../coach/statId";
import { detectMimeFromBuffer, extFromMime } from "../services/spotImageStorage/mime";
import { statImageStorage } from "../services/statAnalysisImageStorage";

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
  statId: z.string().max(64).nullable().optional(),
  statAnalysisEntries: z.array(statAnalysisEntrySchema).max(10).nullable().optional(),
  handsSolvedCount: z.number().int().min(0).max(1000).nullable().optional(),
  filtersAnalyzedCount: z.number().int().min(0).max(1000).nullable().optional(),
  lessonInsights: z.string().max(2000).nullable().optional(),
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
  notes: z.string().max(2000).nullable().optional(),
  attachments: z.array(z.object({
    key: z.string(),
    url: z.string(),
  })).max(5).nullable().optional(),
  wasProductive: z.boolean().nullable().optional(),
});

// PATCH so aceita campos editaveis (RF-1: NAO permite mudar mode/source/duration).
// Sprint EST-3 (ADR-222 / D-4): statId imutavel (checado fora do parse) + campos B.
const patchBodySchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  themeId: z.string().nullable().optional(),
  wasProductive: z.boolean().nullable().optional(),
  attachments: z.array(z.object({
    key: z.string(),
    url: z.string(),
  })).max(5).nullable().optional(),
  handsSolvedCount: z.number().int().min(0).max(1000).nullable().optional(),
  filtersAnalyzedCount: z.number().int().min(0).max(1000).nullable().optional(),
  lessonInsights: z.string().max(2000).nullable().optional(),
  statAnalysisEntries: z.array(statAnalysisEntrySchema).max(10).nullable().optional(),
}).strict();

// Sprint EST-3 (ADR-222 / RF-01) — valida statId: catalog id OU custom_*.
// MDA-1 (D-5 / MEDIUM-1): validacao compartilhada via ../coach/statId
// (isValidStatId), evitando divergencia entre MDA + study-sessions.

const STAT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (D-3)

const finalizeBodySchema = z.object({
  endedAt: z.coerce.date(),
  durationMinutes: z.number().int().min(1).max(1440),
  wasProductive: z.boolean().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
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
  // Sprint Estudos-Flow-Review (C1): `other` eh o catch-all — NAO exige tema.
  // Forcar themeId aqui fazia o modo default do form (other) dar 400 silencioso
  // quando o jogador so queria registrar um estudo avulso. themeId continua
  // opcional/aceito; o ownership check (THEME_FORBIDDEN) ainda roda quando enviado.
  // Sprint EST-3 (ADR-222 / RF-01) — stat_analysis exige themeId + statId valido.
  if (mode === "stat_analysis") {
    if (!themeId) {
      return { ok: false, code: "MISSING_THEME", message: "stat_analysis exige themeId" };
    }
    if (!(body as any).statId) {
      return { ok: false, code: "MISSING_STAT", message: "stat_analysis exige statId" };
    }
    if (!isValidStatId((body as any).statId)) {
      return { ok: false, code: "INVALID_STAT_ID", message: "statId invalido" };
    }
  }
  return { ok: true };
}

// ============================================================================
// Handlers
// ============================================================================

export async function handleCreateStudySession(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const rawBody = req.body ?? {};
    // Sprint EST-3 (ADR-222) — checks que devem produzir codigos especificos
    // ANTES do parse zod (.max(10) geraria INVALID_BODY generico).
    if (rawBody.statAnalysisEntries !== undefined) {
      if (rawBody.mode !== "stat_analysis") {
        res.status(400).json({
          error: "STAT_ENTRIES_WRONG_MODE",
          message: "statAnalysisEntries so em mode stat_analysis",
        });
        return;
      }
      if (Array.isArray(rawBody.statAnalysisEntries) && rawBody.statAnalysisEntries.length > 10) {
        res.status(400).json({ error: "TOO_MANY_ENTRIES", message: "Maximo de 10 jogadas" });
        return;
      }
    }
    const parsed = createBodyBaseSchema.safeParse(rawBody);
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
      body.themeId ? store.getStudyThemeById(body.themeId) : Promise.resolve(null),
      body.lessonId ? store.getLibraryLessonById(body.lessonId) : Promise.resolve(null),
      body.tournamentId ? store.getTournament(body.tournamentId) : Promise.resolve(null),
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
      created = await store.createStudySessionV2({
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
        // Sprint EST-3 (ADR-222) — statId so para stat_analysis; demais modos null.
        statId: body.mode === "stat_analysis" ? (body as any).statId ?? null : null,
        statAnalysisEntries: (body as any).statAnalysisEntries ?? null,
        handsSolvedCount: (body as any).handsSolvedCount ?? null,
        filtersAnalyzedCount: (body as any).filtersAnalyzedCount ?? null,
        lessonInsights: (body as any).lessonInsights ?? null,
      });
    } catch (err: any) {
      if (err?.code === "SESSION_ALREADY_RUNNING") {
        res.status(409).json({
          error: "SESSION_ALREADY_RUNNING",
          message: "Voce ja tem uma sessao de estudo cronometrada em andamento",
        });
        return;
      }
      if (err?.code === "TOO_MANY_ENTRIES") {
        res.status(400).json({ error: "TOO_MANY_ENTRIES", message: "Maximo de 10 jogadas" });
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

export async function handleUpdateStudySession(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
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
    // Sprint EST-3 (ADR-222 / D-4) — statId imutavel.
    const body = req.body ?? {};
    const forbidden = ["mode", "source", "durationMinutes", "duration_minutes", "startedAt", "started_at", "endedAt", "ended_at", "statId", "stat_id"];
    for (const k of forbidden) {
      if (k in body) {
        res.status(400).json({ error: "IMMUTABLE_FIELD", message: `Campo ${k} nao pode ser editado` });
        return;
      }
    }
    // Sprint EST-3 — cap 10 antes do parse (.max(10) geraria INVALID_BODY).
    if (
      body.statAnalysisEntries !== undefined &&
      Array.isArray(body.statAnalysisEntries) &&
      body.statAnalysisEntries.length > 10
    ) {
      res.status(400).json({ error: "TOO_MANY_ENTRIES", message: "Maximo de 10 jogadas" });
      return;
    }
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }
    const existing = await store.getStudySessionV2ById(id, userId);
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    // Sprint EST-3 — so se pode editar entries de uma sessao stat_analysis.
    if (parsed.data.statAnalysisEntries !== undefined && existing.mode !== "stat_analysis") {
      res.status(400).json({
        error: "STAT_ENTRIES_WRONG_MODE",
        message: "statAnalysisEntries so em mode stat_analysis",
      });
      return;
    }
    let updated: any;
    try {
      updated = await store.updateStudySessionV2(id, userId, parsed.data);
    } catch (err: any) {
      if (err?.code === "TOO_MANY_ENTRIES") {
        res.status(400).json({ error: "TOO_MANY_ENTRIES", message: "Maximo de 10 jogadas" });
        return;
      }
      throw err;
    }
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

// ============================================================================
// Sprint EST-3 (ADR-222) — stat_analysis handlers
// ============================================================================

// Monta a URL servivel de uma imagem de entry (RF-05/RF-07). null quando o slot
// nao tem imagem. NUNCA expoe a key crua.
function statImageUrl(
  sessionId: string,
  entryId: string,
  slot: "play" | "solution",
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return `/api/study-sessions/${sessionId}/stat-analysis/entries/${entryId}/image/${slot}`;
}

// Mapeia as entries de uma sessao substituindo keys cruas por URLs servíveis.
function mapEntriesToUrls(sessionId: string, entries: any[]): any[] {
  return (Array.isArray(entries) ? entries : []).map((e) => {
    const { playImageKey, solutionImageKey, ...rest } = e ?? {};
    return {
      ...rest,
      playImageUrl: statImageUrl(sessionId, e?.id, "play", playImageKey),
      solutionImageUrl: statImageUrl(sessionId, e?.id, "solution", solutionImageKey),
    };
  });
}

// GET /api/study-sessions/:id (D-7) — ownership via getStudySessionV2ById.
export async function handleGetStudySession(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
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
    const session = await store.getStudySessionV2ById(id, userId);
    // 404 (nao 403) — nao confirma existencia.
    if (!session) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    // Para stat_analysis, mapeia keys -> URLs servíveis (RF-05/RF-07).
    if (session.mode === "stat_analysis" && Array.isArray((session as any).statAnalysisEntries)) {
      const payload = {
        ...session,
        statAnalysisEntries: mapEntriesToUrls(id, (session as any).statAnalysisEntries),
      };
      res.status(200).json(payload);
      return;
    }
    res.status(200).json(session);
  } catch (err) {
    console.error("[handleGetStudySession] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// GET /api/study-sessions/stat-analysis?themeId=&statId= (RF-07 / D-1).
export async function handleListStatAnalysisByTheme(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const themeId = typeof req?.query?.themeId === "string" ? req.query.themeId : "";
    const statId = typeof req?.query?.statId === "string" ? req.query.statId : undefined;
    if (!themeId) {
      res.status(400).json({ error: "MISSING_THEME", message: "themeId obrigatorio" });
      return;
    }
    // Ownership do tema antes de retornar entries (404 — nao vaza).
    const theme = await store.getStudyThemeById(themeId);
    if (!theme || theme.userId !== userId) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    const groups = await store.getStatAnalysisEntries(userId, themeId, statId);
    // Monta URLs servíveis nas entries (handler — storage devolve keys cruas).
    const withUrls = (Array.isArray(groups) ? groups : []).map((g: any) => ({
      ...g,
      sessions: (Array.isArray(g.sessions) ? g.sessions : []).map((s: any) => ({
        ...s,
        entries: mapEntriesToUrls(s.sessionId, s.entries),
      })),
    }));
    res.status(200).json(withUrls);
  } catch (err) {
    console.error("[handleListStatAnalysisByTheme] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// POST /api/study-sessions/:id/stat-analysis/entries/:entryId/image (RF-04).
export async function handleUploadStatEntryImage(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const sessionId = String(req?.params?.id ?? "");
    const entryId = String(req?.params?.entryId ?? "");
    const slot = req?.body?.slot ?? req?.query?.slot;
    if (slot !== "play" && slot !== "solution") {
      res.status(400).json({ error: "INVALID_SLOT", message: "slot deve ser play ou solution" });
      return;
    }
    const file = req?.file;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      res.status(400).json({ code: "invalid_mime", message: "Arquivo obrigatorio" });
      return;
    }
    if (typeof file.size === "number" && file.size > STAT_MAX_FILE_SIZE) {
      res.status(413).json({ code: "file_too_large", message: "Imagem maior que 5MB" });
      return;
    }
    // MIME por magic bytes (source of truth — ignora Content-Type).
    const detectedMime = detectMimeFromBuffer(file.buffer);
    if (!detectedMime) {
      res.status(400).json({ code: "invalid_mime", message: "Formato invalido. Aceitos: PNG, JPEG, WebP" });
      return;
    }

    // Ownership da sessao (404 — nao confirma existencia, NAO 403).
    const session = await store.getStudySessionV2ById(sessionId, userId);
    if (!session) {
      res.status(404).json({ error: "NOT_FOUND", message: "Sessao nao encontrada" });
      return;
    }
    if (session.mode !== "stat_analysis") {
      res.status(409).json({ error: "STAT_ENTRIES_WRONG_MODE", message: "Sessao nao eh stat_analysis" });
      return;
    }
    const entries = Array.isArray((session as any).statAnalysisEntries)
      ? (session as any).statAnalysisEntries
      : [];
    if (!entries.some((e: any) => e?.id === entryId)) {
      res.status(404).json({ error: "ENTRY_NOT_FOUND", message: "Entry nao encontrada na sessao" });
      return;
    }

    // Persiste imagem (root dedicado). Layout <userId>/<sessionId>/<nanoid>.<ext>.
    const ext = extFromMime(detectedMime);
    let putResult: { key: string; size: number };
    try {
      putResult = await statImageStorage.put({
        userId,
        sessionId,
        ext,
        buffer: file.buffer,
        mime: detectedMime,
      });
    } catch (err: any) {
      console.error("[handleUploadStatEntryImage] put failed", err);
      res.status(500).json({ message: "Erro ao salvar imagem" });
      return;
    }

    // Atualiza a entry no DB; em falha, rollback da key orfa (D-3).
    let oldKey: string | null = null;
    try {
      const result = await store.updateStatEntryImage(sessionId, userId, entryId, slot, putResult.key);
      oldKey = result?.oldKey ?? null;
    } catch (err: any) {
      // Rollback da key orfa, best-effort (D-3). Chamada direta ao storage de
      // imagem (idempotente em ENOENT).
      try {
        await statImageStorage.delete(putResult.key);
      } catch (delErr: any) {
        if (delErr?.code !== "ENOENT") {
          console.warn("[handleUploadStatEntryImage] rollback delete failed", { key: putResult.key, err: delErr?.message });
        }
      }
      console.error("[handleUploadStatEntryImage] updateStatEntryImage failed", err);
      res.status(500).json({ message: "Erro ao registrar imagem" });
      return;
    }

    // Re-upload no mesmo slot: deleta a key antiga, best-effort (D-6.1).
    if (oldKey && oldKey !== putResult.key) {
      try {
        await statImageStorage.delete(oldKey);
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          console.warn("[handleUploadStatEntryImage] delete oldKey failed", { oldKey, err: err?.message });
        }
      }
    }

    res.status(201).json({
      slot,
      imageUrl: statImageUrl(sessionId, entryId, slot, putResult.key),
    });
  } catch (err) {
    console.error("[handleUploadStatEntryImage] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// GET /api/study-sessions/:id/stat-analysis/entries/:entryId/image/:slot (RF-05).
export async function handleServeStatEntryImage(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const sessionId = String(req?.params?.id ?? "");
    const entryId = String(req?.params?.entryId ?? "");
    const slot = req?.params?.slot;
    if (slot !== "play" && slot !== "solution") {
      res.status(400).json({ error: "INVALID_SLOT" });
      return;
    }
    const key = await store.getStatEntryImageKey(sessionId, userId, entryId, slot);
    // 404 (nao 403) — cobre cross-user (sessao nao do user devolve null) + slot vazio.
    if (!key) {
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }
    const result = await statImageStorage.get(key);
    if (!result) {
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.end(result.buffer);
  } catch (err) {
    console.error("[handleServeStatEntryImage] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// Multer memory storage para upload de imagem de entry (RF-04).
const statEntryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STAT_MAX_FILE_SIZE },
});

const statEntryUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

// HIGH-3 fix: sem este wrapper, multer `limits.fileSize` aborta o stream e
// chama next(MulterError) ANTES do handler — o error handler global devolveria
// 500 em vez do 413 `file_too_large` que o RF-04 exige. Espelha o pattern de
// starred-hands.ts:multerErrorHandler (nao exportado la).
function statMulterErrorHandler(
  upload: multer.Multer,
  field: string,
): (req: any, res: Response, next: any) => void {
  return (req, res, next) => {
    upload.single(field)(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ code: "file_too_large", message: "Imagem maior que 5MB" });
          return;
        }
        res.status(400).json({ code: "invalid_mime", message: err?.message ?? "Erro de upload" });
        return;
      }
      next();
    });
  };
}

export function registerStudySessionsRoutes(app: Express): void {
  // HIGH-3 fix: rate limits aplicados apos requireAuth para que keyGenerator
  // use userPlatformId quando disponivel.
  // Wrapper (req,res)=>... em handlers com 3o arg `injectedStorage`: sem ele o
  // `next` do Express vaza como injectedStorage (store=next) e o endpoint 500a
  // em producao (lesson #34). EST-3 estendeu create/patch p/ aceitar injectedStorage.
  app.post("/api/study-sessions", requireAuth, createSessionLimit, (req: Request, res: Response) => handleCreateStudySession(req, res));
  app.get("/api/study-sessions", requireAuth, handleListStudySessions);
  // Sprint EST-3 (ADR-222 / D-3) — listagem de revisao por tema/stat.
  // Sub-path de 2 segmentos DEDICADO: o GET /api/study-sessions/:id (1 segmento)
  // pertence ao legado studies.ts, registrado ANTES em routes/index.ts. Um path
  // de 1 segmento (`/stat-analysis`) seria shadowado por aquele :id (=> 404).
  // `/stat-analysis/by-theme` (2 seg) nao casa com nenhuma rota legada.
  // Wrapper (req,res)=>... impede que o `next` do Express vaze como o 3o arg
  // `injectedStorage` do handler (lesson #34).
  app.get("/api/study-sessions/stat-analysis/by-theme", requireAuth, (req: Request, res: Response) => handleListStatAnalysisByTheme(req, res));
  // Sprint Estudos-UX (founder) — lista das sessoes REGISTRADAS (v2, todos os
  // modos) pra SessionsView. A GET /api/study-sessions "crua" (linha acima) eh
  // shadowada pela legacy studies.ts (study_sessions V1). Sub-path 2-segmentos
  // dedicado evita a colisao com o GET /:id legado (1 seg) — mesmo motivo do
  // /stat-analysis/by-theme. Reusa handleListStudySessions -> { items: [] }.
  app.get("/api/study-sessions/registered/list", requireAuth, handleListStudySessions);
  // Sub-paths fixos de imagem registrados antes do PATCH /:id generico.
  app.post(
    "/api/study-sessions/:id/stat-analysis/entries/:entryId/image",
    requireAuth,
    statEntryUploadLimiter,
    statMulterErrorHandler(statEntryUpload, "file"),
    (req: Request, res: Response) => handleUploadStatEntryImage(req, res),
  );
  app.get(
    "/api/study-sessions/:id/stat-analysis/entries/:entryId/image/:slot",
    requireAuth,
    (req: Request, res: Response) => handleServeStatEntryImage(req, res),
  );
  // Sprint EST-3 (ADR-222 / D-7) — detalhe v2 (entries + counts) servido em
  // sub-path DEDICADO. A rota generica GET /:id ja eh dona da `studies.ts`
  // (legado: timer/notes, registrada antes em routes/index.ts), entao usar /:id
  // aqui seria codigo morto. /:id/detail evita a colisao e o shape v2 fica
  // acessivel pra SessaoDetailPage (/estudos/analise/:id).
  app.get("/api/study-sessions/:id/detail", requireAuth, (req: Request, res: Response) => handleGetStudySession(req, res));
  app.patch("/api/study-sessions/:id", requireAuth, mutateSessionLimit, (req: Request, res: Response) => handleUpdateStudySession(req, res));
  app.delete("/api/study-sessions/:id", requireAuth, mutateSessionLimit, handleDeleteStudySession);
  app.post("/api/study-sessions/:id/finalize", requireAuth, finalizeSessionLimit, handleFinalizeStudySession);
  app.get("/api/users/me/study-habit", requireAuth, handleGetStudyHabit);
  app.patch("/api/users/me/daily-study-goal", requireAuth, updateGoalLimit, handleUpdateDailyGoal);
}
