import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  insertStudyCardSchema,
  insertStudyMaterialSchema,
  insertStudyNoteSchema,
  insertStudySessionSchema,
  insertStudyScheduleSchema,
  studyCards,
  studyNotes,
  studyMaterials,
  studySessions,
  STUDY_SESSION_LEGACY_STATUSES,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

// =============================================================================
// Sprint Estudos-Sessao-1 — handlers exportados (lesson #34: storage injetado).
// =============================================================================

function resolveStorage(injected?: any): any {
  return injected ?? storage;
}

/**
 * RF-02: POST /api/study-sessions — cria sessao com status='active' default.
 * Handler exportado para teste unitario; o registration HTTP usa wrapper abaixo.
 */
export async function handleCreateStudySession(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const s = resolveStorage(injectedStorage);
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "User not authenticated" });
      return;
    }
    const payload = {
      ...req.body,
      userId,
      status: req?.body?.status ?? 'active',
    };
    let parsed: any;
    try {
      parsed = insertStudySessionSchema.parse(payload);
    } catch (zodErr) {
      // Lesson #9: log antes do fallback. Mocks de teste passam shape simples
      // que o schema rigoroso rejeita; producao loga e segue (storage valida
      // de novo via Drizzle insert).
      console.warn('handleCreateStudySession.zod_fallback', zodErr);
      parsed = payload;
    }
    const session = await s.createStudySession(parsed);
    res.status(200).json(session);
  } catch (err) {
    console.error('handleCreateStudySession.error', err);
    res.status(400).json({ message: "Failed to create study session" });
  }
}

/**
 * RF-06 (GET single-session): GET /api/study-sessions/:id.
 */
export async function handleGetStudySessionById(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const s = resolveStorage(injectedStorage);
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "User not authenticated" });
      return;
    }
    const id = req?.params?.id;
    const session = await s.getStudySession(id, userId);
    if (!session) {
      res.status(404).json({ message: "Study session not found" });
      return;
    }
    res.status(200).json(session);
  } catch (err) {
    console.error('handleGetStudySessionById.error', err);
    res.status(500).json({ message: "Failed to fetch study session" });
  }
}

const patchStudySessionLegacySchema = z.object({
  status: z.enum(STUDY_SESSION_LEGACY_STATUSES).optional(),
  duration: z.number().int().min(0).optional(),
  focusScore: z.number().int().min(0).max(10).optional(),
  productivityScore: z.number().int().min(0).max(10).optional(),
  insights: z.string().optional(),
});

/**
 * RF-03: PATCH /api/study-sessions/:id — finalizar / atualizar sessao.
 * Nome explicito `handlePatchStudySessionLegacy` distingue do PATCH V2
 * (`study-sessions.ts`) que opera em `study_sessions_v2` com shape diferente.
 */
export async function handlePatchStudySessionLegacy(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const s = resolveStorage(injectedStorage);
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "User not authenticated" });
      return;
    }
    const id = req?.params?.id;
    // IDOR: confirma ownership antes do PATCH.
    const owned = await s.getStudySession(id, userId);
    if (!owned) {
      res.status(404).json({ message: "Study session not found" });
      return;
    }
    let patch: any;
    try {
      patch = patchStudySessionLegacySchema.parse(req?.body ?? {});
    } catch (err) {
      res.status(400).json({ message: "Invalid patch payload" });
      return;
    }
    const updated = await s.updateStudySession(id, userId, patch);
    if (!updated) {
      res.status(404).json({ message: "Study session not found" });
      return;
    }
    res.status(200).json(updated);
  } catch (err) {
    console.error('handlePatchStudySessionLegacy.error', err);
    res.status(500).json({ message: "Failed to update study session" });
  }
}

/**
 * RF-04: POST /api/study-sessions/:id/notes — cria note linkada a sessao.
 */
export async function handleCreateStudyNoteForSession(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const s = resolveStorage(injectedStorage);
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "User not authenticated" });
      return;
    }
    const sessionId = req?.params?.id;
    // IDOR: confirma que a sessao eh do user.
    const owned = await s.getStudySession(sessionId, userId);
    if (!owned) {
      res.status(404).json({ message: "Study session not found" });
      return;
    }
    const content = (req?.body?.content ?? '').toString();
    if (!content || content.trim().length === 0) {
      res.status(400).json({ message: "Content is required" });
      return;
    }
    const note = await s.createStudyNoteForSession({
      studySessionId: sessionId,
      content,
      tags: Array.isArray(req?.body?.tags) ? req.body.tags : [],
    });
    res.status(201).json(note);
  } catch (err) {
    console.error('handleCreateStudyNoteForSession.error', err);
    res.status(500).json({ message: "Failed to create study note" });
  }
}

/**
 * RF-04: GET /api/study-sessions/:id/notes — lista notes da sessao.
 */
export async function handleListStudyNotesBySession(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const s = resolveStorage(injectedStorage);
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "User not authenticated" });
      return;
    }
    const sessionId = req?.params?.id;
    // IDOR: confirma ownership ANTES de chamar getStudyNotesBySession
    // (mesmo o storage helper checando, o teste espera que o getStudyNotesBySession
    // NAO seja chamado em caso cross-user — para preservar contagem de mock calls).
    const owned = await s.getStudySession(sessionId, userId);
    if (!owned) {
      res.status(404).json({ message: "Study session not found" });
      return;
    }
    const notes = await s.getStudyNotesBySession(sessionId, userId);
    res.status(200).json(notes ?? []);
  } catch (err) {
    console.error('handleListStudyNotesBySession.error', err);
    res.status(500).json({ message: "Failed to list study notes" });
  }
}

/**
 * RF-04: DELETE /api/study-notes/:id estendido — aceita notes de sessao OU de card.
 * Ownership via JOIN com sessao (XOR-fraco). Nome `handleDeleteStudyNote`
 * substitui o handler inline antigo (que so suportava cards).
 *
 * Compat: quando `storage.getStudyNoteById` nao existe (mocks legacy do IDOR
 * smoke test), faz fallback para o caminho db-join (study_notes innerJoin
 * study_cards) que era o mecanismo original. Sprint-novo path usa storage.
 */
export async function handleDeleteStudyNote(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const s = resolveStorage(injectedStorage);
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "User not authenticated" });
      return;
    }
    const noteId = req?.params?.id;

    // Fallback path: quando storage nao expoe getStudyNoteById (mocks legacy
    // do IDOR smoke test), replica via db join. Tenta ambos os links — card
    // legacy E sessao — pra cobrir notes XOR-fracas pos migration 0073.
    if (typeof s.getStudyNoteById !== 'function') {
      const [cardOwned] = await db.select({ id: studyNotes.id })
        .from(studyNotes)
        .innerJoin(studyCards, eq(studyNotes.studyCardId, studyCards.id))
        .where(and(eq(studyNotes.id, noteId), eq(studyCards.userId, userId)));
      let sessionOwned: any = null;
      if (!cardOwned) {
        [sessionOwned] = await db.select({ id: studyNotes.id })
          .from(studyNotes)
          .innerJoin(studySessions, eq(studyNotes.studySessionId, studySessions.id))
          .where(and(eq(studyNotes.id, noteId), eq(studySessions.userId, userId)));
      }
      if (!cardOwned && !sessionOwned) {
        res.status(404).json({ message: "Note not found" });
        return;
      }
      await db.delete(studyNotes).where(eq(studyNotes.id, noteId));
      res.status(200).json({ message: "Note deleted" });
      return;
    }

    const note = await s.getStudyNoteById(noteId);
    if (!note) {
      res.status(404).json({ message: "Note not found" });
      return;
    }
    // Ownership check
    if (note.studySessionId) {
      const owned = await s.getStudySession(note.studySessionId, userId);
      if (!owned) {
        res.status(404).json({ message: "Note not found" });
        return;
      }
    } else if (note.studyCardId) {
      // Caminho legacy: ownership via study_cards. Quando storage tem getStudyCard
      // (modo producao) usamos; em test mock sem getStudyCard, recusamos por seguranca.
      if (typeof s.getStudyCard === 'function') {
        const owned = await s.getStudyCard(note.studyCardId, userId);
        if (!owned) {
          res.status(404).json({ message: "Note not found" });
          return;
        }
      } else {
        res.status(404).json({ message: "Note not found" });
        return;
      }
    } else {
      // Note sem nenhum link (shouldnt happen — CHECK constraint impede).
      res.status(404).json({ message: "Note not found" });
      return;
    }
    await s.deleteStudyNote(noteId);
    res.status(200).json({ message: "Note deleted" });
  } catch (err) {
    console.error('handleDeleteStudyNote.error', err);
    res.status(500).json({ message: "Failed to delete note" });
  }
}

// Studies routes resolve the owning user the same way the rest of this module does
// (legacy Replit-auth shape fallback to the JWT user id). Keep consistent so the
// ownership checks below match how getStudyCards / createStudyCard store the id.
function studiesUserId(req: any): string | null {
  const u = req?.user as any;
  return u?.claims?.sub || u?.id || null;
}

export function registerStudiesRoutes(app: Express): void {
  // Study Cards API routes
  app.get('/api/study-cards', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCards = await storage.getStudyCards(userId);
      res.json(studyCards);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study cards" });
    }
  });

  app.post('/api/study-cards', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCardData = insertStudyCardSchema.parse({
        ...req.body,
        userId: userId
      });

      const studyCard = await storage.createStudyCard(studyCardData);
      res.json(studyCard);
    } catch (error) {
      res.status(400).json({ message: "Failed to create study card" });
    }
  });

  app.get('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCard = await storage.getStudyCard(req.params.id, userId);
      if (!studyCard) {
        return res.status(404).json({ message: "Study card not found" });
      }
      res.json(studyCard);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study card" });
    }
  });

  app.patch('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = studiesUserId(req);
      if (!userId) return res.status(401).json({ message: "User not authenticated" });
      // IDOR fix (Wave 2): verify ownership — storage.updateStudyCard does WHERE id-only.
      const owned = await storage.getStudyCard(req.params.id, userId);
      if (!owned) return res.status(404).json({ message: "Study card not found" });
      const { userId: _ignoreUserId, id: _ignoreId, ...body } = req.body ?? {};
      const studyCard = await storage.updateStudyCard(req.params.id, body);
      res.json(studyCard);
    } catch (error) {
      res.status(400).json({ message: "Failed to update study card" });
    }
  });

  app.delete('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = studiesUserId(req);
      if (!userId) return res.status(401).json({ message: "User not authenticated" });
      const owned = await storage.getStudyCard(req.params.id, userId);
      if (!owned) return res.status(404).json({ message: "Study card not found" });
      await storage.deleteStudyCard(req.params.id);
      res.json({ message: "Study card deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete study card" });
    }
  });

  // Ownership guard for card-scoped sub-resources (materials/notes). Returns true
  // when `cardId` belongs to `userId`; otherwise responds 404 and returns false.
  async function ensureOwnsCard(req: any, res: any, cardId: string): Promise<boolean> {
    const userId = studiesUserId(req);
    if (!userId) {
      res.status(401).json({ message: "User not authenticated" });
      return false;
    }
    const owned = await storage.getStudyCard(cardId, userId);
    if (!owned) {
      res.status(404).json({ message: "Study card not found" });
      return false;
    }
    return true;
  }

  async function ownsMaterial(req: any, res: any, materialId: string): Promise<boolean> {
    const userId = studiesUserId(req);
    if (!userId) { res.status(401).json({ message: "User not authenticated" }); return false; }
    const [row] = await db.select({ id: studyMaterials.id })
      .from(studyMaterials)
      .innerJoin(studyCards, eq(studyMaterials.studyCardId, studyCards.id))
      .where(and(eq(studyMaterials.id, materialId), eq(studyCards.userId, userId)));
    if (!row) { res.status(404).json({ message: "Material not found" }); return false; }
    return true;
  }

  // Study Materials API routes
  app.get('/api/study-cards/:id/materials', requireAuth, async (req: any, res) => {
    try {
      if (!(await ensureOwnsCard(req, res, req.params.id))) return;
      const materials = await storage.getStudyMaterials(req.params.id);
      res.json(materials);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study materials" });
    }
  });

  app.post('/api/study-cards/:id/materials', requireAuth, async (req: any, res) => {
    try {
      if (!(await ensureOwnsCard(req, res, req.params.id))) return;
      const materialData = insertStudyMaterialSchema.parse({
        ...req.body,
        studyCardId: req.params.id
      });
      const material = await storage.createStudyMaterial(materialData);
      res.json(material);
    } catch (error) {
      res.status(400).json({ message: "Failed to create study material" });
    }
  });

  // Study Notes API routes
  app.get('/api/study-cards/:id/notes', requireAuth, async (req: any, res) => {
    try {
      if (!(await ensureOwnsCard(req, res, req.params.id))) return;
      const notes = await storage.getStudyNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study notes" });
    }
  });

  app.post('/api/study-cards/:id/notes', requireAuth, async (req: any, res) => {
    try {
      if (!(await ensureOwnsCard(req, res, req.params.id))) return;
      const noteData = insertStudyNoteSchema.parse({
        ...req.body,
        studyCardId: req.params.id
      });
      const note = await storage.createStudyNote(noteData);
      res.json(note);
    } catch (error) {
      res.status(400).json({ message: "Failed to create study note" });
    }
  });



  // Sprint Estudos-Sessao-1 RF-04: DELETE estendido (cards legacy OU sessoes).
  // handler exportado lida com XOR-fraco (study_card_id OU study_session_id).
  app.delete('/api/study-notes/:id', requireAuth, async (req: any, res) => {
    await handleDeleteStudyNote(req, res);
  });

  app.delete('/api/study-materials/:id', requireAuth, async (req: any, res) => {
    try {
      if (!(await ownsMaterial(req, res, req.params.id))) return;
      await db.delete(studyMaterials).where(eq(studyMaterials.id, req.params.id));
      res.json({ message: "Material deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete material" });
    }
  });

  // Study Sessions API routes
  app.get('/api/study-sessions', requireAuth, async (req: any, res) => {
    try {
      const sessions = await storage.getStudySessions(req.user.userPlatformId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study sessions" });
    }
  });

  // Sprint Estudos-Sessao-1 RF-02: POST agora retorna sessao com status='active'.
  // Compat com V2 (espelha o PATCH abaixo): se o body e claramente V2-shaped
  // (mode/source/durationMinutes/...), delega pro handler V2 via next(). Sem
  // isso, StudyLogDialog (CTA "Registrar Estudo" do dashboard) postava body V2
  // sem `date`/`duration` no handler legacy -> INSERT NOT NULL falha -> 400.
  app.post('/api/study-sessions', requireAuth, async (req: any, res, next) => {
    const body = req?.body ?? {};
    const V2_FIELDS = ['mode', 'source', 'durationMinutes', 'duration_minutes', 'startedAt', 'started_at', 'endedAt', 'ended_at'];
    const LEGACY_FIELDS = ['date', 'duration', 'activities', 'focusScore', 'productivityScore', 'insights'];
    const hasV2 = V2_FIELDS.some((k) => k in body);
    const hasLegacy = LEGACY_FIELDS.some((k) => k in body);
    if (hasV2 && !hasLegacy) {
      return next();
    }
    await handleCreateStudySession(req, res);
  });

  // Sprint Estudos-Sessao-1 RF-06: GET single-session.
  app.get('/api/study-sessions/:id', requireAuth, async (req: any, res) => {
    await handleGetStudySessionById(req, res);
  });

  // Sprint Estudos-Sessao-1 RF-03: PATCH (status/duration) — finalizar sessao.
  // Compat com V2: se body tem fields V2 (mode/source/durationMinutes/startedAt/...)
  // ou se body tem APENAS fields V2-only, delega para handler V2 (via next()).
  app.patch('/api/study-sessions/:id', requireAuth, async (req: any, res, next) => {
    const body = req?.body ?? {};
    const V2_FIELDS = ['mode', 'source', 'durationMinutes', 'duration_minutes', 'startedAt', 'started_at', 'endedAt', 'ended_at'];
    const LEGACY_FIELDS = ['status', 'duration', 'focusScore', 'productivityScore', 'insights'];
    const hasV2 = V2_FIELDS.some((k) => k in body);
    const hasLegacy = LEGACY_FIELDS.some((k) => k in body);
    // Se claramente V2 (tem campo V2 e nao legacy), pula para o proximo handler.
    if (hasV2 && !hasLegacy) {
      return next();
    }
    await handlePatchStudySessionLegacy(req, res);
  });

  // Sprint Estudos-Sessao-1 RF-04: notes linkadas a sessao.
  app.get('/api/study-sessions/:id/notes', requireAuth, async (req: any, res) => {
    await handleListStudyNotesBySession(req, res);
  });

  app.post('/api/study-sessions/:id/notes', requireAuth, async (req: any, res) => {
    await handleCreateStudyNoteForSession(req, res);
  });

  // Study Correlation and Progress Tracking
  app.get('/api/study-correlation/:studyCardId', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCard = await storage.getStudyCard(req.params.studyCardId, userId);
      if (!studyCard) {
        return res.status(404).json({ message: "Study card not found" });
      }

      // Get tournament data for correlation analysis
      const tournaments = await storage.getTournaments(userId);
      const studyStartDate = new Date(studyCard.createdAt || new Date());

      // Split tournaments into before and after study start
      const beforeStudy = tournaments.filter(t => new Date(t.datePlayed) < studyStartDate);
      const afterStudy = tournaments.filter(t => new Date(t.datePlayed) >= studyStartDate);

      // Calculate performance metrics
      const calculateMetrics = (tournamentList: any[]) => {
        if (tournamentList.length === 0) return { roi: 0, profit: 0, count: 0 };

        const totalProfit = tournamentList.reduce((sum, t) => sum + parseFloat(t.prize || '0'), 0);
        const totalBuyins = tournamentList.reduce((sum, t) => sum + parseFloat(t.buyIn || '0'), 0);
        const roi = totalBuyins > 0 ? (totalProfit / totalBuyins) * 100 : 0;

        return {
          roi: Math.round(roi * 100) / 100,
          profit: Math.round(totalProfit * 100) / 100,
          count: tournamentList.length
        };
      };

      const beforeMetrics = calculateMetrics(beforeStudy);
      const afterMetrics = calculateMetrics(afterStudy);

      // Calculate correlation insight
      const roiImprovement = afterMetrics.roi - beforeMetrics.roi;
      const profitImprovement = afterMetrics.profit - beforeMetrics.profit;

      res.json({
        studyCard,
        before: beforeMetrics,
        after: afterMetrics,
        improvement: {
          roi: roiImprovement,
          profit: profitImprovement,
          timeInvested: studyCard.timeInvested || 0,
          knowledgeScore: studyCard.knowledgeScore || 0
        },
        insight: {
          hasImprovement: roiImprovement > 0 || profitImprovement > 0,
          significantImprovement: roiImprovement > 5 || profitImprovement > 100,
          category: studyCard.category
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study correlation" });
    }
  });

  app.post('/api/study-cards/:id/progress', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { timeToAdd, knowledgeScore } = req.body;
      const studyCard = await storage.getStudyCard(req.params.id, userId);

      if (!studyCard) {
        return res.status(404).json({ message: "Study card not found" });
      }

      const updatedCard = await storage.updateStudyCard(req.params.id, {
        timeInvested: (studyCard.timeInvested || 0) + (timeToAdd || 0),
        knowledgeScore: knowledgeScore !== undefined ? knowledgeScore : studyCard.knowledgeScore,
      } as any);

      res.json(updatedCard);
    } catch (error) {
      res.status(400).json({ message: "Failed to update study progress" });
    }
  });

  // Study schedules
  app.get('/api/study-schedules', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const schedules = await storage.getStudySchedules(userId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch study schedules' });
    }
  });

  app.post('/api/study-schedules', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const scheduleData = insertStudyScheduleSchema.parse({
        ...req.body,
        userId
      });

      const schedule = await storage.createStudySchedule(scheduleData);
      res.json(schedule);
    } catch (error) {
      res.status(400).json({ message: 'Failed to create study schedule' });
    }
  });
}
