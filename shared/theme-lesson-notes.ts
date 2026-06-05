// =============================================================================
// shared/theme-lesson-notes.ts — Sprint ThemeLessonNotes
//
// Tipos + Zod compartilhados das anotacoes por aula vinculada ao tema.
// Fonte unica de verdade do shape do content (BlockNote JSONB) + dos request
// schemas dos endpoints.
// =============================================================================

import { z } from "zod";

// --- BlockNote block (mesmo formato de stat_analysis_entries) ---------------
// O content eh um array de blocos BlockNote. Nao validamos estrutura interna
// do BlockNote (varia conforme versao do editor) — apenas que eh um array valido.
export type BlockNoteBlock = Record<string, unknown>;

export const blockNoteContentSchema = z.array(z.record(z.unknown())).default([]);

// --- upsertThemeLessonNoteSchema (POST body) -------------------------------
export const upsertThemeLessonNoteSchema = z.object({
  lessonId: z.string().min(1).max(32),
  title: z.string().min(1).max(120),
  content: blockNoteContentSchema,
});

export type UpsertThemeLessonNoteInput = z.infer<typeof upsertThemeLessonNoteSchema>;

// --- ThemeLessonNote enriched response (GET list) --------------------------
export interface ThemeLessonNoteResponse {
  id: string;
  lessonId: string;
  title: string;
  content: BlockNoteBlock[];
  lessonTitle: string;       // nome da aula (library_lessons.title)
  courseTitle: string;       // nome do curso (library_courses.title)
  createdAt: string;        // ISO string
  updatedAt: string;         // ISO string
}