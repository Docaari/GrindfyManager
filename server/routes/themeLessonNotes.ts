// =============================================================================
// server/routes/themeLessonNotes.ts — Sprint theme-lesson-notes.
//
// GET    /api/study-themes/:themeId/lesson-notes
// POST   /api/study-themes/:themeId/lesson-notes
// DELETE /api/study-themes/:themeId/lesson-notes/:id
//
// Registrado ANTES de registerStudiesRoutes para evitar colisao com /:id generico.
// Auth em todas. 404 se themeId nao pertence ao usuario.
// =============================================================================

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { storage } from "../storage";

const upsertNoteSchema = z.object({
  lessonId: z.string().min(1, "lessonId required"),
  title: z.string().min(1, "title required").max(120),
  content: z.array(z.any()).default([]),
});

async function verifyThemeOwnership(
  req: Request,
  res: Response,
  themeId: string,
): Promise<boolean> {
  const userId = (req as any).user?.userPlatformId;
  try {
    const themes = await (storage as any).getStudyThemes(userId);
    const found = (themes ?? []).some((t: any) => t.id === themeId);
    if (!found) {
      res.status(404).json({ message: "theme_not_found" });
      return false;
    }
    return true;
  } catch {
    res.status(500).json({ message: "internal_error" });
    return false;
  }
}

export async function handleGetThemeLessonNotes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const themeId = req.params.themeId;
    if (!themeId) {
      res.status(400).json({ message: "themeId required" });
      return;
    }
    const userId = (req as any).user?.userPlatformId;
    const notes = await (storage as any).getThemeLessonNotes(userId, themeId);
    res.status(200).json(notes ?? []);
  } catch (err) {
    console.error("[handleGetThemeLessonNotes] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

export async function handlePostThemeLessonNotes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const themeId = req.params.themeId;
    if (!themeId) {
      res.status(400).json({ message: "themeId required" });
      return;
    }

    const parsed = upsertNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "invalid_input", errors: parsed.error.format() });
      return;
    }

    const userId = (req as any).user?.userPlatformId;
    const result = await (storage as any).createOrUpdateThemeLessonNote(userId, themeId, {
      lessonId: parsed.data.lessonId,
      title: parsed.data.title,
      content: parsed.data.content,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("[handlePostThemeLessonNotes] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

export async function handleDeleteThemeLessonNote(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { themeId, id } = req.params;
    if (!themeId || !id) {
      res.status(400).json({ message: "themeId and id required" });
      return;
    }
    const userId = (req as any).user?.userPlatformId;
    await (storage as any).deleteThemeLessonNote(userId, themeId, id);
    res.status(204).send();
  } catch (err) {
    console.error("[handleDeleteThemeLessonNote] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

export function registerThemeLessonNotesRoutes(app: Express): void {
  app.get(
    "/api/study-themes/:themeId/lesson-notes",
    requireAuth,
    handleGetThemeLessonNotes,
  );
  app.post(
    "/api/study-themes/:themeId/lesson-notes",
    requireAuth,
    handlePostThemeLessonNotes,
  );
  app.delete(
    "/api/study-themes/:themeId/lesson-notes/:id",
    requireAuth,
    handleDeleteThemeLessonNote,
  );
}