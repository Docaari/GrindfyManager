// =============================================================================
// Coach Tool: recommend_lesson
// Sprint Biblioteca-1 / RF-10 (ADR-075).
//
// Detecta leak no chat -> recomenda ate 3 aulas Grindfy alinhadas.
//
// Input:  { leakTopic: enum library-categories, urgency: low|medium|high, maxResults<=3 }
// Output: ToolResult { lessons: [{id, slug, courseSlug, title, courseTitle,
//          coverUrl, durationMinutes, categoryId, hasAccess, url}] }
//
// Ranking (D14):
//   1. Match exato categoryId == leakTopic
//   2. Fallback: tags[] contendo leakTopic
//   3. Sort: nao-iniciada > iniciada > completa (via libraryLessonProgressLookup)
//
// Side-effect: grava 1 evento `coach_recommend` por lesson recomendada
// (best-effort, lesson #9 — log antes de fallback). Tier gating: Pro+.
// =============================================================================

import { z } from "zod";
import { storage } from "../storage";
import {
  LIBRARY_CATEGORY_IDS,
  type LibraryCategoryId,
} from "../../shared/library-categories";
import {
  assetUrl,
  durationMinutesFromLesson,
} from "../../shared/library-format-helpers";

const inputSchema = z.object({
  leakTopic: z.enum(LIBRARY_CATEGORY_IDS as readonly [LibraryCategoryId, ...LibraryCategoryId[]]),
  urgency: z.enum(["low", "medium", "high"]).optional().default("medium"),
  maxResults: z.number().int().min(1).max(3).optional().default(3),
});

interface LessonRow {
  id: string;
  slug: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  title: string;
  coverKey?: string | null;
  videoDurationSeconds?: number | null;
  audioDurationSeconds?: number | null;
  categoryId: string;
  tags: string[];
  displayOrder: number;
}

/**
 * Sprint Biblioteca-2 / RF-01: storage.findLibraryLessonsByCategory + ByTag
 * agora retornam shape nested `{ lesson, course, module, ... }`. Adapter
 * achata para o LessonRow usado por este caller (mantem retro-compat de UI).
 */
function flattenLessonResult(item: any): LessonRow {
  // Suporta tanto shape nested novo (Sprint Biblioteca-2 RF-01) quanto
  // shape achatada legacy (Spec 1 mocks). Achatado wins.
  if (item?.lesson && item?.course) {
    const l = item.lesson;
    return {
      id: l.id,
      slug: l.slug,
      courseId: item.course.id ?? l.courseId,
      courseSlug: item.course.slug ?? "",
      courseTitle: item.course.title ?? "",
      title: l.title,
      coverKey: l.coverKey ?? null,
      videoDurationSeconds: l.videoDurationSeconds ?? null,
      audioDurationSeconds: l.audioDurationSeconds ?? null,
      categoryId: l.categoryId,
      tags: l.tags ?? [],
      displayOrder: l.displayOrder ?? 0,
    };
  }
  return item as LessonRow;
}

function progressRank(progress: Map<string, any>, lesson: LessonRow): number {
  const p = progress.get(lesson.id);
  if (!p) return 0; // nao-iniciada
  if (p.completedAt) return 2; // completa
  // F8: lastPositionSeconds=0 (linha existe por motivo administrativo, ex:
  // pre-lookup) e equivalente a "nao-iniciada" — nao deve preceder lessons
  // sem row alguma. Apenas trata como iniciada quando ha posicao real >0.
  if ((p.lastPositionSeconds ?? 0) <= 0) return 0;
  return 1; // iniciada
}

function durationMinutes(lesson: LessonRow): number {
  return durationMinutesFromLesson(lesson);
}

const ALLOWED_TIERS = ["pro", "premium", "admin"] as const;
type AllowedTier = (typeof ALLOWED_TIERS)[number];

async function recommendLessonHandler(rawInput: unknown, ctx: any) {
  // Defense in depth: framework already gates by tier (see gateByTier below),
  // but verify here too in case ctx is forged. Skip when ctx.userTier is
  // unset (legacy callers / tests that do not provide tier) — framework
  // remains source of truth.
  if (ctx?.userTier !== undefined && !(ALLOWED_TIERS as readonly string[]).includes(ctx.userTier)) {
    return {
      __type: "ToolResult",
      tool: "recommend_lesson",
      ok: false,
      code: "tier_locked",
      message: "Recomendacao requer Pro+",
    };
  }
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      __type: "ToolResult",
      tool: "recommend_lesson",
      ok: false,
      code: "tool_error",
      message: "invalid_input",
      details: parsed.error.format(),
    };
  }
  const { leakTopic, urgency, maxResults } = parsed.data;
  const userId = ctx?.userPlatformId ?? ctx?.userId;

  // 1. Match exato categoria
  const rawCat = (await storage.findLibraryLessonsByCategory(
    leakTopic,
    { limit: maxResults * 3 },
  )) ?? [];
  let lessons: LessonRow[] = (rawCat as any[]).map(flattenLessonResult);

  // 2. Fallback: tags (excludeIds suportado em call site mas filtrado client-side
  // se storage backend nao implementar — Sprint Biblioteca-2 RF-01).
  if (lessons.length < maxResults) {
    const rawTag = (await storage.findLibraryLessonsByTag(
      leakTopic,
      {
        limit: maxResults - lessons.length,
      } as any,
    )) ?? [];
    const seen = new Set(lessons.map((l) => l.id));
    const tagged: LessonRow[] = (rawTag as any[])
      .map(flattenLessonResult)
      .filter((l) => !seen.has(l.id));
    lessons = [...lessons, ...tagged];
  }

  // 3. Progress lookup ANTES do sort (precisamos do rank pra ordenar).
  // F7: access lookup eh consultado APOS o cap pra evitar lookups
  // desperdicados em lessons que serao descartadas.
  const preCapIds = lessons.map((l) => l.id);
  const progress: Map<string, any> =
    preCapIds.length > 0
      ? await storage.libraryLessonProgressLookup(userId, preCapIds)
      : new Map();
  lessons.sort((a, b) => progressRank(progress, a) - progressRank(progress, b));

  // Cap final
  lessons = lessons.slice(0, maxResults);

  // F7: access lookup so para o subset capped (reduz N de DB lookups).
  const cappedIds = lessons.map((l) => l.id);
  const access: Map<string, boolean> =
    cappedIds.length > 0
      ? await storage.libraryLessonAccessLookup(userId, cappedIds)
      : new Map();

  // 5. Side-effect: events coach_recommend (best-effort)
  if (lessons.length > 0) {
    try {
      await storage.recordLibraryEvents(
        lessons.map((l) => ({
          userId,
          lessonId: l.id,
          eventType: "coach_recommend",
          metadata: { leakTopic, urgency },
        })),
      );
    } catch (err) {
      // Lesson #9: log antes de fallback. Nao quebra resposta.
      console.error("[recommend_lesson] recordLibraryEvents failed", err);
    }
  }

  return {
    __type: "ToolResult",
    tool: "recommend_lesson",
    ok: true,
    data: {
      lessons: lessons.map((l) => ({
        id: l.id,
        slug: l.slug,
        courseSlug: l.courseSlug,
        title: l.title,
        courseTitle: l.courseTitle,
        coverUrl: assetUrl(l.coverKey),
        durationMinutes: durationMinutes(l),
        categoryId: l.categoryId,
        hasAccess: access.get(l.id) ?? false,
        url: `/biblioteca/curso/${l.courseSlug}/${l.slug}`,
      })),
    },
  };
}

export const recommendLessonTool = {
  name: "recommend_lesson" as const,
  description:
    "Recomenda ate 3 aulas da Biblioteca Grindfy alinhadas a um leak/topico " +
    "detectado. Use quando o usuario expressar duvida ou comportamento que " +
    "case com uma das categorias de aprendizado.",
  inputSchema,
  requiresConfirmation: false,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler: recommendLessonHandler,
};

export default recommendLessonTool;
