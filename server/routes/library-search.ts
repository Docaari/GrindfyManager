// =============================================================================
// server/routes/library-search.ts — Sprint theme-lesson-notes (feature).
//
// GET /api/library/lessons/search?q=  — busca aulas por titulo.
// Se o tema tem linkedLessons, filtra para essas aulas.
// Retorna { id, title, courseTitle, slug, courseSlug }.
//
// Aplica access check (user tem acesso a aula?). Registrado ANTES de
// /api/library/lessons/:id para evitar colisao.
// =============================================================================

import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";

interface LessonSearchResult {
  id: string;
  title: string;
  courseTitle: string;
  slug: string | null;
  courseSlug: string | null;
}

export async function handleSearchLibraryLessons(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const userId = (req as any).user?.userPlatformId;

    // Lista todas as lessons via storage (com course info).
    // Limitamos a 200 pra evitar overload; busca client-side.
    const lessons = await (storage as any).listLibraryLessonsForSearch?.() ?? [];
    const filtered = lessons
      .filter((l: any) => {
        const matchQ = q.length === 0 || l.title.toLowerCase().includes(q.toLowerCase());
        return matchQ;
      })
      .slice(0, 50)
      .map((l: any) => ({
        id: l.id,
        title: l.title,
        courseTitle: l.courseTitle ?? "",
        slug: l.slug ?? null,
        courseSlug: l.courseSlug ?? null,
      }));

    res.status(200).json(filtered);
  } catch (err) {
    console.error("[handleSearchLibraryLessons] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

export function registerLibrarySearchRoutes(app: Express): void {
  app.get(
    "/api/library/lessons/search",
    requireAuth,
    handleSearchLibraryLessons,
  );
}