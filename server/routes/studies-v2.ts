import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { studyThemes, studyTabs, studySessions } from "@shared/schema";
import { eq, and, desc, asc, gte, sql, count, or, ilike } from "drizzle-orm";
import { nanoid } from "nanoid";
import multer from "multer";
import path from "path";
import fs from "fs";
import { detectLeaks } from "../coachLeakDetection";
import { STAT_INDEX_BY_ID } from "@shared/hud-stat-catalog";
import { detectMimeFromBuffer, extFromMime } from "../services/spotImageStorage/mime";

// HIGH-6 reviewer: rate limiter para PATCH /api/study-themes/:id.
// 30 req/min por IP — protege contra abuso (cada PATCH faz validacao + cache invalidation).
const patchStudyThemeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas requisicoes a /api/study-themes. Tente em instantes.",
  },
});

// Rate limit para criacao de tema/tab (cada POST de tema insere 1 tema + 4 tabs).
// Chaveado por usuario (requireAuth roda antes) para nao penalizar NAT/IP
// compartilhado; cai pro IP se userPlatformId ausente.
const createStudyThemeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId ?? req.ip,
  message: {
    message: "Muitas criacoes em /api/study-themes. Tente em instantes.",
  },
});

// Default themes seeded on first access
const DEFAULT_THEMES = [
  { name: "IP vs BB", emoji: "\uD83C\uDFAF", color: "#16a34a" },
  { name: "BB vs IP", emoji: "\uD83D\uDEE1\uFE0F", color: "#16a34a" },
  { name: "SB vs BB - BW", emoji: "\u2694\uFE0F", color: "#16a34a" },
  { name: "BB vs SB BW", emoji: "\uD83D\uDD04", color: "#16a34a" },
  { name: "3bet Pot IP", emoji: "\uD83D\uDE80", color: "#16a34a" },
  { name: "3bet Pot OOP", emoji: "\uD83E\uDDCA", color: "#16a34a" },
  { name: "ICM", emoji: "\uD83D\uDCB0", color: "#16a34a" },
];

const DEFAULT_TAB_NAMES = ["Flop", "Turn", "River", "Tendencias"];

function createDefaultTabs(themeId: string) {
  return DEFAULT_TAB_NAMES.map((name, index) => ({
    id: nanoid(),
    themeId,
    name,
    content: [],
    isDefault: true,
    sortOrder: index,
  }));
}

// Multer config for study images.
// Seguranca: memory storage + validacao por magic-bytes (detectMimeFromBuffer)
// em vez de confiar no Content-Type (spoofavel) ou na extensao do originalname
// (controlada pelo cliente). O arquivo so toca o disco depois de validado, com
// extensao DERIVADA do MIME real — fecha o vetor de stored-XSS via .svg/.html
// servido por express.static. Whitelist: PNG/JPEG/WebP (mesma dos uploads de
// copyright MDA/stat-analysis).
const uploadsDir = path.resolve("uploads/study-images");

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Detecta o tipo da imagem do EDITOR de notas por magic-bytes e retorna a
// extensao a persistir. Reusa o detector estrito do ADR-057 (PNG/JPEG/WebP) e
// ADICIONA GIF — que e seguro neste caminho PUBLICO servido por express.static
// (raster, nao executa script, ao contrario de SVG/HTML). O shared mime.ts
// continua estrito de proposito (uploads de copyright MDA/stat-analysis).
function detectEditorImageExt(buffer: Buffer): "png" | "jpeg" | "webp" | "gif" | null {
  const strict = detectMimeFromBuffer(buffer);
  if (strict) return extFromMime(strict);
  // GIF: "GIF8" + "7a"|"9a"
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "gif";
  }
  return null;
}

// Mapping from leak type to study topic (same as client-side helper)
function mapLeakToStudyTopic(leak: { type: string; data?: any }): string {
  if (leak.type === 'roi_by_format') {
    const speed = leak.data?.speed;
    const category = leak.data?.category;
    if (speed === 'Turbo' || speed === 'Hyper') return 'ICM e Push/Fold em Turbo';
    if (category === 'PKO') return 'Estrategia PKO e Bounty';
    return 'Game Selection e Analise de Formato';
  }
  if (leak.type === 'weak_site') return 'Adaptacao Multi-Site';
  if (leak.type === 'early_bust') return 'Jogo Early Game e Sobrevivencia';
  if (leak.type === 'low_ft_conversion') return 'Final Table Play e ICM';
  if (leak.type === 'declining_trend') return 'Revisao de Estrategia e Volume';
  if (leak.type === 'insufficient_volume') return 'Disciplina de Volume e Grind';
  if (leak.type === 'no_study') return 'Rotina de Estudo e Evolucao';
  return 'Estudo Geral de Poker';
}

export function registerStudiesV2Routes(app: Express): void {
  // FP-16 RF-01: Study suggestions based on leaks
  app.get("/api/study/suggestions", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Fetch analytics data for leak detection (reuse same queries as coachContext)
      const [dashboardStats, analyticsByCategory, analyticsBySite, analyticsByMonth] = await Promise.all([
        storage.getDashboardStats(userId, 'all'),
        storage.getAnalyticsByCategory(userId, 'all'),
        storage.getAnalyticsBySite(userId, 'all'),
        storage.getAnalyticsByMonth(userId, 'all'),
      ]);

      const totalTournaments = (dashboardStats as any)?.count || 0;

      if (totalTournaments === 0) {
        return res.json([]);
      }

      // Check last study session for no_study leak
      let lastStudySessionDays: number | undefined;
      try {
        const [lastSession] = await db.select({ date: studySessions.date })
          .from(studySessions)
          .where(eq(studySessions.userId, userId))
          .orderBy(desc(studySessions.date))
          .limit(1);
        if (lastSession) {
          const daysDiff = Math.floor((Date.now() - new Date(lastSession.date).getTime()) / (1000 * 60 * 60 * 24));
          lastStudySessionDays = daysDiff;
        } else {
          lastStudySessionDays = 999; // Never studied
        }
      } catch { /* graceful */ }

      const leaks = detectLeaks({
        analyticsByCategory: analyticsByCategory || [],
        analyticsBySite: analyticsBySite || [],
        overallRoi: (dashboardStats as any)?.roi || 0,
        earlyFinishRate: (dashboardStats as any)?.earlyFinishRate || 0,
        finalTables: (dashboardStats as any)?.finalTables || 0,
        cravadas: (dashboardStats as any)?.firstPlaceCount || 0,
        analyticsByMonth: analyticsByMonth || [],
        totalTournaments,
        lastStudySessionDays,
      });

      // Return top 3 leaks with mapped study topic
      const suggestions = leaks.slice(0, 3).map(leak => ({
        type: leak.type,
        description: leak.description,
        severity: leak.severity,
        suggestedTopic: mapLeakToStudyTopic(leak),
      }));

      res.json(suggestions);
    } catch (error) {
      console.error("Failed to fetch study suggestions:", error);
      res.status(500).json({ message: "Failed to fetch study suggestions" });
    }
  });

  // FP-17 RF-07: Study stats (mini-dashboard)
  app.get("/api/study/stats", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Hours this month
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthSessions = await db.select({ duration: studySessions.duration, date: studySessions.date })
        .from(studySessions)
        .where(and(
          eq(studySessions.userId, userId),
          gte(studySessions.date, monthStart)
        ));

      const totalMinutes = monthSessions.reduce((acc, s) => acc + (s.duration || 0), 0);
      const hoursThisMonth = Math.round((totalMinutes / 60) * 10) / 10;

      // Themes in progress (progress 1-99)
      const themes = await db.select({ progress: studyThemes.progress })
        .from(studyThemes)
        .where(eq(studyThemes.userId, userId));
      const themesInProgress = themes.filter(t => (t.progress || 0) >= 1 && (t.progress || 0) <= 99).length;

      // Streak calculation
      const allSessions = await db.select({ date: studySessions.date })
        .from(studySessions)
        .where(eq(studySessions.userId, userId))
        .orderBy(desc(studySessions.date));

      // Get unique dates
      const datesSet = new Set<string>();
      for (const s of allSessions) {
        const d = new Date(s.date);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        datesSet.add(key);
      }

      // Check if today has a session
      const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
      let streakDays = 0;
      if (datesSet.has(todayKey)) {
        const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        while (true) {
          const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
          if (!datesSet.has(key)) break;
          streakDays++;
          current.setUTCDate(current.getUTCDate() - 1);
        }
      }

      res.json({ hoursThisMonth, themesInProgress, streakDays });
    } catch (error) {
      console.error("Failed to fetch study stats:", error);
      res.status(500).json({ message: "Failed to fetch study stats" });
    }
  });

  // GET /api/study-themes - List all themes for user (seed defaults if empty)
  // Sprint Estudos-Habito-1 (HIGH-2 fix): chama ensureCuratedThemesForUser
  // antes do SELECT para garantir que curated themes (ADR-127) estejam seeded
  // de forma idempotente. Inclui slug, isCurated, category, linkedStats,
  // linkedLessons no SELECT.
  app.get("/api/study-themes", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Lazy seed curated themes (idempotente).
      try {
        await (storage as any).ensureCuratedThemesForUser(userId);
      } catch (err) {
        console.error("ensureCuratedThemesForUser failed", err);
        // Nao falha a request — proceed mesmo se seed falhar.
      }

      let themes = await db
        .select({
          id: studyThemes.id,
          userId: studyThemes.userId,
          name: studyThemes.name,
          color: studyThemes.color,
          emoji: studyThemes.emoji,
          isFavorite: studyThemes.isFavorite,
          sortOrder: studyThemes.sortOrder,
          progress: studyThemes.progress,
          slug: studyThemes.slug,
          isCurated: studyThemes.isCurated,
          category: studyThemes.category,
          linkedStats: studyThemes.linkedStats,
          linkedLessons: studyThemes.linkedLessons,
          createdAt: studyThemes.createdAt,
          updatedAt: studyThemes.updatedAt,
          tabCount: sql<number>`cast((select count(*) from study_tabs where study_tabs.theme_id = ${studyThemes.id}) as integer)`,
        })
        .from(studyThemes)
        .where(eq(studyThemes.userId, userId))
        .orderBy(desc(studyThemes.isFavorite), asc(studyThemes.sortOrder));

      // Seed default themes on first access (custom defaults legacy)
      if (themes.length === 0) {
        for (let i = 0; i < DEFAULT_THEMES.length; i++) {
          const def = DEFAULT_THEMES[i];
          const themeId = nanoid();
          await db.insert(studyThemes).values({
            id: themeId,
            userId,
            name: def.name,
            color: def.color,
            emoji: def.emoji,
            isFavorite: false,
            sortOrder: i,
          });

          const tabs = createDefaultTabs(themeId);
          for (const tab of tabs) {
            await db.insert(studyTabs).values(tab);
          }
        }

        // Re-fetch after seeding
        themes = await db
          .select({
            id: studyThemes.id,
            userId: studyThemes.userId,
            name: studyThemes.name,
            color: studyThemes.color,
            emoji: studyThemes.emoji,
            isFavorite: studyThemes.isFavorite,
            sortOrder: studyThemes.sortOrder,
            progress: studyThemes.progress,
            slug: studyThemes.slug,
            isCurated: studyThemes.isCurated,
            category: studyThemes.category,
            linkedStats: studyThemes.linkedStats,
            linkedLessons: studyThemes.linkedLessons,
            createdAt: studyThemes.createdAt,
            updatedAt: studyThemes.updatedAt,
            tabCount: sql<number>`cast((select count(*) from study_tabs where study_tabs.theme_id = ${studyThemes.id}) as integer)`,
          })
          .from(studyThemes)
          .where(eq(studyThemes.userId, userId))
          .orderBy(desc(studyThemes.isFavorite), asc(studyThemes.sortOrder));
      }

      res.json(themes);
    } catch (error: any) {
      console.error("Failed to fetch study themes:", error?.message || error);
      res.status(500).json({ message: "Failed to fetch study themes" });
    }
  });

  // POST /api/study-themes - Create a new theme with default tabs
  app.post("/api/study-themes", requireAuth, createStudyThemeRateLimiter, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { name, color, emoji } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }
      if (name.length > 50) {
        return res.status(400).json({ message: "Nome deve ter no máximo 50 caracteres" });
      }

      // Get max sortOrder for user
      const maxOrder = await db
        .select({ max: sql<number>`coalesce(max(${studyThemes.sortOrder}), -1)` })
        .from(studyThemes)
        .where(eq(studyThemes.userId, userId));

      const themeId = nanoid();
      const [theme] = await db
        .insert(studyThemes)
        .values({
          id: themeId,
          userId,
          name: name.trim(),
          color: color || "#16a34a",
          emoji: emoji || "",
          sortOrder: (maxOrder[0]?.max ?? -1) + 1,
        })
        .returning();

      // Create 4 default tabs
      const tabs = createDefaultTabs(themeId);
      for (const tab of tabs) {
        await db.insert(studyTabs).values(tab);
      }

      res.json({ ...theme, tabCount: 4 });
    } catch (error) {
      res.status(500).json({ message: "Failed to create study theme" });
    }
  });

  // PUT /api/study-themes/:id - Update a theme
  app.put("/api/study-themes/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;
      const { name, color, emoji, isFavorite, sortOrder, progress } = req.body;

      // Verify ownership
      const existing = await db
        .select()
        .from(studyThemes)
        .where(and(eq(studyThemes.id, id), eq(studyThemes.userId, userId)));

      if (existing.length === 0) {
        return res.status(404).json({ message: "Tema não encontrado" });
      }

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ message: "Nome é obrigatório" });
        }
        if (name.length > 50) {
          return res.status(400).json({ message: "Nome deve ter no máximo 50 caracteres" });
        }
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name.trim();
      if (color !== undefined) updateData.color = color;
      if (emoji !== undefined) updateData.emoji = emoji;
      if (isFavorite !== undefined) updateData.isFavorite = isFavorite;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (progress !== undefined) updateData.progress = Math.max(0, Math.min(100, Number(progress) || 0));

      const [updated] = await db
        .update(studyThemes)
        .set(updateData)
        .where(eq(studyThemes.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update study theme" });
    }
  });

  // DELETE /api/study-themes/:id - Delete theme (cascade deletes tabs)
  app.delete("/api/study-themes/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;

      // Verify ownership
      const existing = await db
        .select()
        .from(studyThemes)
        .where(and(eq(studyThemes.id, id), eq(studyThemes.userId, userId)));

      if (existing.length === 0) {
        return res.status(404).json({ message: "Tema não encontrado" });
      }

      await db.delete(studyThemes).where(eq(studyThemes.id, id));

      // MDA-1 (ADR-230 / D-4): cleanup de tags orfas na junction N:N (sem FK).
      // Escopado por theme_id + user_id (ownership ja validado acima) — sem isso
      // mda_read_themes ficaria apontando para um tema inexistente. Usa raw sql
      // (espelha deleteStudyTheme) p/ o predicado ser inspecionavel.
      await db.execute(
        sql`DELETE FROM mda_read_themes WHERE theme_id = ${id} AND user_id = ${userId}` as any,
      );

      res.json({ message: "Tema deletado com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete study theme" });
    }
  });

  // GET /api/study-themes/:themeId/tabs - List tabs for a theme
  app.get("/api/study-themes/:themeId/tabs", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { themeId } = req.params;

      // Verify theme ownership
      const theme = await db
        .select()
        .from(studyThemes)
        .where(and(eq(studyThemes.id, themeId), eq(studyThemes.userId, userId)));

      if (theme.length === 0) {
        return res.status(404).json({ message: "Tema não encontrado" });
      }

      const tabs = await db
        .select()
        .from(studyTabs)
        .where(eq(studyTabs.themeId, themeId))
        .orderBy(asc(studyTabs.sortOrder));

      res.json(tabs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study tabs" });
    }
  });

  // POST /api/study-themes/:themeId/tabs - Create a new tab
  app.post("/api/study-themes/:themeId/tabs", requireAuth, createStudyThemeRateLimiter, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { themeId } = req.params;
      const { name } = req.body;

      // Verify theme ownership
      const theme = await db
        .select()
        .from(studyThemes)
        .where(and(eq(studyThemes.id, themeId), eq(studyThemes.userId, userId)));

      if (theme.length === 0) {
        return res.status(404).json({ message: "Tema não encontrado" });
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }
      if (name.length > 30) {
        return res.status(400).json({ message: "Nome deve ter no máximo 30 caracteres" });
      }

      // Get max sortOrder for this theme
      const maxOrder = await db
        .select({ max: sql<number>`coalesce(max(${studyTabs.sortOrder}), -1)` })
        .from(studyTabs)
        .where(eq(studyTabs.themeId, themeId));

      const [tab] = await db
        .insert(studyTabs)
        .values({
          id: nanoid(),
          themeId,
          name: name.trim(),
          content: [],
          isDefault: false,
          sortOrder: (maxOrder[0]?.max ?? -1) + 1,
        })
        .returning();

      res.json(tab);
    } catch (error) {
      res.status(500).json({ message: "Failed to create study tab" });
    }
  });

  // PUT /api/study-tabs/:id - Update a tab (name, content, sortOrder)
  app.put("/api/study-tabs/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;
      const { name, content, sortOrder, boards, ranges, handNotes, tags } = req.body;

      // Get tab and verify ownership via theme
      const tabRows = await db.select().from(studyTabs).where(eq(studyTabs.id, id));
      if (tabRows.length === 0) {
        return res.status(404).json({ message: "Aba não encontrada" });
      }

      const tab = tabRows[0];
      const theme = await db
        .select()
        .from(studyThemes)
        .where(and(eq(studyThemes.id, tab.themeId), eq(studyThemes.userId, userId)));

      if (theme.length === 0) {
        return res.status(404).json({ message: "Aba não encontrada" });
      }

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ message: "Nome é obrigatório" });
        }
        if (name.length > 30) {
          return res.status(400).json({ message: "Nome deve ter no máximo 30 caracteres" });
        }
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name.trim();
      if (content !== undefined) updateData.content = content;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (boards !== undefined) updateData.boards = boards;
      if (ranges !== undefined) updateData.ranges = ranges;
      if (handNotes !== undefined) updateData.handNotes = handNotes;
      if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.filter((t: any) => typeof t === "string" && t.trim().length > 0).map((t: string) => t.trim()) : [];

      const [updated] = await db
        .update(studyTabs)
        .set(updateData)
        .where(eq(studyTabs.id, id))
        .returning();

      // Also update parent theme's updatedAt
      await db
        .update(studyThemes)
        .set({ updatedAt: new Date() })
        .where(eq(studyThemes.id, tab.themeId));

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update study tab" });
    }
  });

  // DELETE /api/study-tabs/:id - Delete a tab (only non-default)
  app.delete("/api/study-tabs/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;

      // Get tab and verify ownership via theme
      const tabRows = await db.select().from(studyTabs).where(eq(studyTabs.id, id));
      if (tabRows.length === 0) {
        return res.status(404).json({ message: "Aba não encontrada" });
      }

      const tab = tabRows[0];
      const theme = await db
        .select()
        .from(studyThemes)
        .where(and(eq(studyThemes.id, tab.themeId), eq(studyThemes.userId, userId)));

      if (theme.length === 0) {
        return res.status(404).json({ message: "Aba não encontrada" });
      }

      if (tab.isDefault) {
        return res.status(400).json({ message: "Abas padrão não podem ser deletadas" });
      }

      await db.delete(studyTabs).where(eq(studyTabs.id, id));

      res.json({ message: "Aba deletada com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete study tab" });
    }
  });

  // GET /api/study-themes/search - Global search across all themes and tabs
  app.get("/api/study-themes/search", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const q = (req.query.q as string || "").trim();

      if (!q || q.length < 2) {
        return res.json([]);
      }

      const results = await db
        .select({
          tabId: studyTabs.id,
          tabName: studyTabs.name,
          tabTags: studyTabs.tags,
          themeId: studyThemes.id,
          themeName: studyThemes.name,
          themeEmoji: studyThemes.emoji,
          themeColor: studyThemes.color,
        })
        .from(studyTabs)
        .innerJoin(studyThemes, eq(studyTabs.themeId, studyThemes.id))
        .where(
          and(
            eq(studyThemes.userId, userId),
            or(
              ilike(studyTabs.name, `%${q}%`),
              sql`${studyTabs.content}::text ILIKE ${"%" + q + "%"}`,
              sql`array_to_string(${studyTabs.tags}, ',') ILIKE ${"%" + q + "%"}`
            )
          )
        );

      res.json(results);
    } catch (error: any) {
      console.error("Failed to search study themes:", error?.message || error);
      res.status(500).json({ message: "Failed to search study themes" });
    }
  });

  // POST /api/study-images - Upload an image for the study editor
  app.post(
    "/api/study-images",
    requireAuth,
    (req: any, res: any, next: any) => {
      imageUpload.single("image")(req, res, (err: any) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: "Imagem deve ter no máximo 5MB" });
          }
          return res.status(400).json({ message: err.message });
        }
        if (err) {
          return res.status(400).json({ message: err.message });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        if (!req.file?.buffer) {
          return res.status(400).json({ message: "Nenhuma imagem enviada" });
        }
        // Source of truth: magic-bytes, NAO o Content-Type nem a extensao.
        const detectedExt = detectEditorImageExt(req.file.buffer);
        if (!detectedExt) {
          return res
            .status(400)
            .json({ message: "Formato de imagem invalido. Aceitos: PNG, JPG, WebP, GIF" });
        }
        // Async I/O — nao bloqueia o event-loop em uploads concorrentes de ate 5MB.
        await fs.promises.mkdir(uploadsDir, { recursive: true });
        const filename = `${nanoid()}.${detectedExt}`;
        await fs.promises.writeFile(path.join(uploadsDir, filename), req.file.buffer);

        const url = `/uploads/study-images/${filename}`;
        res.json({ url });
      } catch (error) {
        res.status(500).json({ message: "Failed to upload image" });
      }
    }
  );

  // Sprint stats-themes-linking-1 (RF-01) — PATCH /api/study-themes/:id com linkedStats
  // HIGH-6 reviewer: rate limit 30 req/min/user para mutations sensiveis.
  app.patch(
    "/api/study-themes/:id",
    requireAuth,
    patchStudyThemeRateLimiter,
    handlePatchStudyTheme,
  );

  // Sprint stats-themes-linking-1 (CRITICAL-1 reviewer) — GET stats summary do tema.
  // Permite que ThemeDetailView mostre cards de stats foco com dados reais
  // (currentValue + sparkline 30d + targetMin/Max). Reutiliza logica do
  // coach tool readThemeWithLinkedStatsAndSpots.
  app.get(
    "/api/themes/:id/stats-summary",
    requireAuth,
    handleGetThemeStatsSummary,
  );

  // Static file serving for uploaded study images
  app.use("/uploads", express.static(path.resolve("uploads")));
}

// =============================================================================
// Sprint stats-themes-linking-1 (RF-01) — handlePatchStudyTheme
//
// PATCH parcial: aceita linkedStats (cap Zod 30) + outros campos opcionais.
// Validacao:
//   - Ownership do tema (404/403).
//   - Cada statId deve existir em STAT_INDEX_BY_ID OU em hudLayouts.fieldsJson
//     do user (custom_*).
//   - Dedup automatico (preserva ordem da primeira ocorrencia).
//   - Cache reverse lookup invalidado para union(previous, next) pos-commit.
// =============================================================================

const patchStudyThemeBodySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().optional(),
  emoji: z.string().optional(),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  // Hard cap 30 (ADR-141 §2.3).
  linkedStats: z.array(z.string()).max(30).optional(),
});

export async function handlePatchStudyTheme(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  const userId = user?.userPlatformId;
  if (!userId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  const themeId = req.params.id;

  // Zod validation FIRST (cap rejection antes de DB).
  let parsed: z.infer<typeof patchStudyThemeBodySchema>;
  try {
    parsed = patchStudyThemeBodySchema.parse(req.body);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Body invalido.", issues: err?.issues });
  }

  // Ownership.
  let theme: any = null;
  try {
    if (typeof (storage as any).getStudyTheme === "function") {
      theme = await (storage as any).getStudyTheme(themeId);
    }
  } catch (err) {
    console.error("[studies-v2] getStudyTheme failed", { themeId, err });
    return res.status(500).json({ message: "Falha ao carregar tema." });
  }
  if (!theme) {
    return res.status(404).json({ message: "Tema nao encontrado." });
  }
  if (theme.userId && theme.userId !== userId) {
    return res.status(403).json({ message: "Tema de outro usuario." });
  }

  const previousLinkedStats: string[] = Array.isArray(theme.linkedStats)
    ? theme.linkedStats
    : [];

  // Validacao de IDs (catalog OU custom do user).
  let nextLinkedStats: string[] | undefined;
  if (parsed.linkedStats !== undefined) {
    // Dedup preservando ordem.
    const seen = new Set<string>();
    const dedup: string[] = [];
    for (const s of parsed.linkedStats) {
      if (typeof s !== "string" || !s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      dedup.push(s);
    }

    // Coleta IDs invalidos: NAO em catalog E NAO em custom do user.
    let userCustomIds: Set<string> | null = null;
    const invalidIds: string[] = [];
    for (const s of dedup) {
      if (STAT_INDEX_BY_ID.has(s)) continue;
      if (userCustomIds === null) {
        userCustomIds = new Set<string>();
        try {
          const layouts = (await (storage as any).getHudLayouts(userId)) || [];
          for (const layout of layouts) {
            const fields = Array.isArray(layout?.fieldsJson)
              ? layout.fieldsJson
              : Array.isArray(layout?.fields_json)
                ? layout.fields_json
                : [];
            for (const f of fields) {
              if (f?.isCustom && typeof f?.id === "string") {
                userCustomIds.add(f.id);
              }
            }
          }
        } catch {
          // sem layouts disponiveis -> set fica vazio.
        }
      }
      if (!userCustomIds.has(s)) {
        invalidIds.push(s);
      }
    }

    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: "IDs invalidos.",
        invalidIds,
      });
    }
    nextLinkedStats = dedup;
  }

  // Build patch (apenas campos enviados).
  const patch: Record<string, any> = {};
  if (parsed.name !== undefined) patch.name = parsed.name;
  if (parsed.color !== undefined) patch.color = parsed.color;
  if (parsed.emoji !== undefined) patch.emoji = parsed.emoji;
  if (parsed.isFavorite !== undefined) patch.isFavorite = parsed.isFavorite;
  if (parsed.sortOrder !== undefined) patch.sortOrder = parsed.sortOrder;
  if (parsed.progress !== undefined) patch.progress = parsed.progress;
  if (nextLinkedStats !== undefined) patch.linkedStats = nextLinkedStats;

  if (Object.keys(patch).length === 0) {
    return res.json(theme);
  }

  try {
    const updated = await (storage as any).updateStudyTheme(themeId, patch);

    // RF-01.4 cache invalidation pos-commit.
    if (nextLinkedStats !== undefined) {
      const union = new Set<string>([
        ...previousLinkedStats,
        ...nextLinkedStats,
      ]);
      try {
        const svc = await import("../services/statsLinkedThemesService");
        for (const statId of union) {
          svc.invalidateStatsLinkedThemesCache(userId, statId);
        }
      } catch {
        // svc nao disponivel — no-op.
      }
    }

    return res.json(updated ?? theme);
  } catch (err) {
    console.error("[studies-v2] handlePatchStudyTheme failed", err);
    return res.status(500).json({ message: "Falha ao atualizar tema." });
  }
}

// =============================================================================
// CRITICAL-1 reviewer — handleGetThemeStatsSummary
//
// GET /api/themes/:id/stats-summary
// Retorna stats foco do tema com currentValue, sparkline30d, targetMin/Max
// para popular ThemeStatsFocoSection no detalhe do tema.
//
// Reusa a logica de readThemeWithLinkedStatsAndSpots (Coach tool, ADR-142)
// e retorna apenas o array `stats` — endpoint simples e leve.
//
// Comportamento:
//   - 401 sem auth (padrao requireAuth).
//   - 404 se tema nao existir.
//   - 403 se tema de outro user.
//   - 200 com array de StatPayloadEntry (mesmo shape do coach tool).
// =============================================================================
export async function handleGetThemeStatsSummary(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  const userId = user?.userPlatformId;
  if (!userId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  const themeId = req.params.id;
  try {
    const mod = await import("../coachTools/readThemeWithLinkedStatsAndSpots");
    const fn = mod.readThemeWithLinkedStatsAndSpots ?? mod.default;
    const result = await fn(
      { theme_id: themeId },
      { userPlatformId: userId },
    );
    // Resposta canonica: apenas o array `stats` (CTA principal do consumer).
    return res.json({
      themeId,
      stats: Array.isArray(result?.stats) ? result.stats : [],
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (/nao encontrado/i.test(msg)) {
      return res.status(404).json({ message: "Tema nao encontrado." });
    }
    if (/Acesso negado|outro usuario/i.test(msg)) {
      return res.status(403).json({ message: "Tema de outro usuario." });
    }
    console.error("[studies-v2] handleGetThemeStatsSummary failed", err);
    return res.status(500).json({ message: "Falha ao carregar stats." });
  }
}
