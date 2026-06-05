// server/storage/themeLessonNotesStorage.ts — Sprint theme-lesson-notes.
//
// CRUD de notas por aula vinculada ao tema (theme_lesson_notes).
// Attach-pattern: importado por server/storage.ts que chama
// attachThemeLessonNotesStorage(storage).
//
// Upsert: ON CONFLICT (user_id, theme_id, lesson_id) UPDATE content+title+updated_at.
// List: enrichment com titulo da aula via subquery simples (2 queries, mais robusto
// que join complexo em storage).
// Delete: verifica ownership (userId + themeId) antes de deletar.

import { db } from "../db";
import { nanoid } from "nanoid";
import { and, desc, eq, inArray } from "drizzle-orm";
import { themeLessonNotes, libraryLessons, libraryCourses } from "@shared/schema";

interface ThemeLessonNoteInput {
  userId: string;
  themeId: string;
  lessonId: string;
  title: string;
  content: any[];
}

interface ThemeLessonNoteView {
  id: string;
  lessonId: string;
  title: string;
  content: any[];
  lessonTitle: string;
  courseTitle: string;
  createdAt: string;
  updatedAt: string;
}

// Attach pattern — ver mdaStorage.ts para documentacao completa.
export function attachThemeLessonNotesStorage(storage: any): void {
  // ---------------------------------------------------------------------------
  // createOrUpdateThemeLessonNote — upsert 1 nota por (user, theme, lesson).
  // ---------------------------------------------------------------------------
  storage.createOrUpdateThemeLessonNote = async function createOrUpdateThemeLessonNote(
    userId: string,
    themeId: string,
    payload: Omit<ThemeLessonNoteInput, "userId" | "themeId">,
  ): Promise<{ id: string; createdAt: string; updatedAt: string }> {
    const now = new Date();

    // Try upsert: INSERT ON CONFLICT DO UPDATE.
    const row = await db
      .insert(themeLessonNotes)
      .values({
        id: `tln_${nanoid(14)}`,
        userId,
        themeId,
        lessonId: payload.lessonId,
        title: payload.title,
        content: payload.content ?? [],
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [themeLessonNotes.userId, themeLessonNotes.themeId, themeLessonNotes.lessonId],
        set: {
          title: payload.title,
          content: payload.content ?? [],
          updatedAt: now,
        },
      })
      .returning({ id: themeLessonNotes.id, createdAt: themeLessonNotes.createdAt, updatedAt: themeLessonNotes.updatedAt });

    const first = Array.isArray(row) ? row[0] : row;
    return {
      id: first?.id ?? "",
      createdAt: first?.createdAt ? new Date(first.createdAt).toISOString() : now.toISOString(),
      updatedAt: now.toISOString(),
    };
  };

  // ---------------------------------------------------------------------------
  // getThemeLessonNotes — lista notas com enriquecimento de aula/curso.
  // ---------------------------------------------------------------------------
  storage.getThemeLessonNotes = async function getThemeLessonNotes(
    userId: string,
    themeId: string,
  ): Promise<ThemeLessonNoteView[]> {
    try {
      // Passo 1: busca notas brutas.
      const notes = await db
        .select()
        .from(themeLessonNotes)
        .where(and(
          eq(themeLessonNotes.userId, userId),
          eq(themeLessonNotes.themeId, themeId),
        ))
        .orderBy(desc(themeLessonNotes.updatedAt));

      if (!Array.isArray(notes) || notes.length === 0) return [];

      // Passo 2: collect lessonIds + lookup em batch.
      const lessonIds = notes.map((n: any) => n.lessonId).filter(Boolean);
      const lessonMap = new Map<string, { lessonTitle: string; courseTitle: string }>();

      if (lessonIds.length > 0) {
        const lessons = await db
          .select({
            id: libraryLessons.id,
            title: libraryLessons.title,
            courseTitle: libraryCourses.title,
          })
          .from(libraryLessons)
          .leftJoin(libraryCourses, eq(libraryCourses.id, libraryLessons.courseId))
          .where(inArray(libraryLessons.id, lessonIds));

        for (const l of lessons) {
          lessonMap.set(l.id, {
            lessonTitle: l.title ?? "",
            courseTitle: l.courseTitle ?? "",
          });
        }
      }

      // Passo 3: monta view enriquecida.
      return notes.map((n: any) => {
        const info = lessonMap.get(n.lessonId) ?? { lessonTitle: n.title, courseTitle: "" };
        return {
          id: n.id,
          lessonId: n.lessonId,
          title: n.title,
          content: n.content ?? [],
          lessonTitle: info.lessonTitle,
          courseTitle: info.courseTitle,
          createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : "",
          updatedAt: n.updatedAt ? new Date(n.updatedAt).toISOString() : "",
        };
      });
    } catch (err) {
      console.error("storage.getThemeLessonNotes.error", { err });
      return [];
    }
  };

  // ---------------------------------------------------------------------------
  // deleteThemeLessonNote — remove nota (ownership verificado).
  // ---------------------------------------------------------------------------
  storage.deleteThemeLessonNote = async function deleteThemeLessonNote(
    userId: string,
    themeId: string,
    noteId: string,
  ): Promise<void> {
    await db
      .delete(themeLessonNotes)
      .where(and(
        eq(themeLessonNotes.id, noteId),
        eq(themeLessonNotes.userId, userId),
        eq(themeLessonNotes.themeId, themeId),
      ));
  };
}