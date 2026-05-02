// =============================================================================
// server/routes/library.ts — Sprint Biblioteca-1 / RF-05 + RF-06.
//
// Handlers HTTP para endpoints publicos da Biblioteca:
//   GET  /api/library/courses
//   GET  /api/library/courses/:slug
//   GET  /api/library/lessons/:id
//   GET  /api/library/lessons/:id/progress
//   PATCH /api/library/lessons/:id/progress
//   POST /api/library/events
//
// Handlers exportados como funcoes para que tests chamem direto sem precisar
// montar Express. Routing real e wireado em server/routes/index.ts (TODO).
// =============================================================================

import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  assetUrl,
  durationMinutesFromLesson,
  computeStartPositionForFormatSwitch as sharedComputeStartPositionForFormatSwitch,
} from "../../shared/library-format-helpers";

function deriveFormats(lesson: any): Array<"video" | "podcast" | "article"> {
  const f: Array<"video" | "podcast" | "article"> = [];
  if (lesson?.videoMuxPlaybackId) f.push("video");
  if (lesson?.audioKey) f.push("podcast");
  if (lesson?.articleHtml) f.push("article");
  return f;
}

// -----------------------------------------------------------------------------
// GET /api/library/courses
// -----------------------------------------------------------------------------

export async function handleListLibraryCourses(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userPlatformId;
    const courses = await storage.listLibraryCourses({
      userId,
      onlyPublished: true,
    });
    const out = (courses ?? []).map((c: any) => {
      // F17: forward totalDurationMinutes + primaryCategory when storage
      // pre-computes them. When absent (current Sprint Biblioteca-1 stub
      // mocks), we omit them rather than guess.
      const base: any = {
        id: c.id,
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle ?? null,
        coverUrl: assetUrl(c.coverKey),
        lessonCount: c.lessonCount ?? 0,
        hasAnyAccess: !!c.hasAnyAccess,
        accessibleLessonsCount: c.accessibleLessonsCount ?? 0,
        displayOrder: c.displayOrder ?? 0,
      };
      if (typeof c.totalDurationMinutes === "number") {
        base.totalDurationMinutes = c.totalDurationMinutes;
      }
      if (typeof c.primaryCategory === "string" && c.primaryCategory.length > 0) {
        base.primaryCategory = c.primaryCategory;
      }
      return base;
    });
    res.status(200).json(out);
  } catch (err) {
    console.error("[handleListLibraryCourses] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// GET /api/library/courses/:slug
// -----------------------------------------------------------------------------

export async function handleGetLibraryCourse(req: Request, res: Response) {
  try {
    const slug = req.params?.slug;
    if (!slug) return res.status(400).json({ message: "slug_required" });
    const course = await storage.getLibraryCourseBySlug(slug);
    if (!course) return res.status(404).json({ message: "course_not_found" });

    const userId = (req as any).user?.userPlatformId;
    const allLessonIds: string[] = [];
    for (const m of course.modules ?? []) {
      for (const l of m.lessons ?? []) {
        allLessonIds.push(l.id);
      }
    }
    const accessMap: Map<string, boolean> = allLessonIds.length > 0
      ? await storage.lessonAccessLookup(userId, allLessonIds)
      : new Map();

    const out = {
      id: course.id,
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle ?? null,
      description: course.description ?? null,
      coverUrl: assetUrl(course.coverKey),
      isPublished: !!course.isPublished,
      modules: (course.modules ?? []).map((m: any) => ({
        id: m.id,
        slug: m.slug,
        title: m.title,
        description: m.description ?? null,
        coverUrl: assetUrl(m.coverKey),
        lessons: (m.lessons ?? []).map((l: any) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          subtitle: l.subtitle ?? null,
          coverUrl: assetUrl(l.coverKey),
          durationMinutes: durationMinutesFromLesson(l),
          formats: deriveFormats(l),
          hasAccess: !!accessMap.get(l.id),
          displayOrder: l.displayOrder ?? 0,
        })),
      })),
    };
    res.status(200).json(out);
  } catch (err) {
    console.error("[handleGetLibraryCourse] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// GET /api/library/lessons/:id
// -----------------------------------------------------------------------------

function buildLessonPayload(lesson: any) {
  const formats: any = {};
  if (lesson.videoMuxPlaybackId) {
    formats.video = {
      mux: { playbackId: lesson.videoMuxPlaybackId },
      durationSeconds: lesson.videoDurationSeconds ?? null,
    };
  }
  if (lesson.audioKey) {
    formats.podcast = {
      audioUrl: `/api/library/lessons/${lesson.id}/audio`,
      durationSeconds: lesson.audioDurationSeconds ?? null,
      mimeType: lesson.audioMimeType ?? "audio/mp4",
    };
  }
  if (lesson.articleHtml) {
    formats.article = {
      html: lesson.articleHtml,
      wordCount: lesson.articleWordCount ?? 0,
    };
  }
  return {
    id: lesson.id,
    slug: lesson.slug,
    courseSlug: lesson.courseSlug ?? null,
    courseId: lesson.courseId ?? null,
    title: lesson.title,
    subtitle: lesson.subtitle ?? null,
    categoryId: lesson.categoryId,
    tags: lesson.tags ?? [],
    coverUrl: assetUrl(lesson.coverKey),
    formats,
  };
}

export async function handleGetLibraryLesson(req: Request, res: Response) {
  try {
    const id = req.params?.id;
    if (!id) return res.status(400).json({ message: "id_required" });
    const lesson = await storage.getLibraryLesson(id);
    if (!lesson) return res.status(404).json({ message: "lesson_not_found" });

    const userId = (req as any).user?.userPlatformId;
    const access = await storage.findLessonAccess({ userId, lessonId: id });
    if (!access) return res.status(401).json({ message: "access_denied" });

    res.status(200).json(buildLessonPayload(lesson));
  } catch (err) {
    console.error("[handleGetLibraryLesson] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// GET /api/library/lessons/by-slug/:courseSlug/:lessonSlug — F2 fix
// -----------------------------------------------------------------------------

export async function handleGetLibraryLessonBySlug(req: Request, res: Response) {
  try {
    const courseSlug = req.params?.courseSlug;
    const lessonSlug = req.params?.lessonSlug;
    if (!courseSlug || !lessonSlug) {
      return res.status(400).json({ message: "slug_required" });
    }
    const lesson = await storage.getLibraryLessonBySlug(courseSlug, lessonSlug);
    if (!lesson) return res.status(404).json({ message: "lesson_not_found" });

    const userId = (req as any).user?.userPlatformId;
    const access = await storage.findLessonAccess({ userId, lessonId: lesson.id });
    if (!access) return res.status(401).json({ message: "access_denied" });

    res.status(200).json(buildLessonPayload(lesson));
  } catch (err) {
    console.error("[handleGetLibraryLessonBySlug] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// POST /api/library/events  (RF-06 + D11)
// -----------------------------------------------------------------------------

const eventSchema = z.object({
  lessonId: z.string().min(1),
  eventType: z.enum([
    "view",
    "play",
    "pause",
    "seek",
    "complete",
    "note_create",
    "coach_recommend",
    "access_blocked",
  ]),
  format: z.enum(["video", "podcast", "article"]).optional(),
  positionSeconds: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const RATE_LIMIT_PER_MINUTE = 60;

export async function handleCreateLibraryEvent(req: Request, res: Response) {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid_input", errors: parsed.error.format() });
    }
    const { lessonId, eventType, format, positionSeconds, metadata } = parsed.data;
    const userId = (req as any).user?.userPlatformId;

    // F3c: 'access_blocked' eh telemetria de tentativa de acesso negado —
    // exigir access check aqui criaria 401 sobre 401 e o evento nunca seria
    // gravado. Skip access check para esse evento especifico; rate limit
    // continua aplicado para evitar flood. Outros eventos seguem com
    // access check normal.
    const isAccessBlockedEvent = eventType === "access_blocked";

    // F16: parallelize independent reads (access lookup + rate counter).
    const [access, recent] = await Promise.all([
      isAccessBlockedEvent
        ? Promise.resolve(true)
        : storage.findLessonAccess({ userId, lessonId }),
      storage.countLibraryEventsForUserInWindow({ userId, windowSeconds: 60 }),
    ]);
    if (!access) return res.status(401).json({ message: "access_denied" });
    if (typeof recent === "number" && recent >= RATE_LIMIT_PER_MINUTE) {
      return res.status(429).json({ message: "rate_limited" });
    }

    await storage.createLibraryEvent({
      userId,
      lessonId,
      eventType,
      format: format ?? null,
      positionSeconds: positionSeconds ?? null,
      metadata: metadata ?? {},
      eventTimestamp: new Date(),
    });

    res.status(202).json({});
  } catch (err) {
    console.error("[handleCreateLibraryEvent] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// GET /api/library/lessons/:id/progress  (RF-06)
// -----------------------------------------------------------------------------

export async function handleGetLibraryProgress(req: Request, res: Response) {
  try {
    const id = req.params?.id;
    if (!id) return res.status(400).json({ message: "id_required" });
    const userId = (req as any).user?.userPlatformId;

    const access = await storage.findLessonAccess({ userId, lessonId: id });
    if (!access) return res.status(401).json({ message: "access_denied" });

    const rows = (await storage.getLibraryProgressForLesson({
      userId,
      lessonId: id,
    })) ?? [];

    const out: any = {};
    for (const r of rows) {
      out[r.format] = {
        lastPositionSeconds: r.lastPositionSeconds ?? 0,
        totalDurationSeconds: r.totalDurationSeconds ?? null,
        completedAt: r.completedAt ?? null,
      };
    }
    res.status(200).json(out);
  } catch (err) {
    console.error("[handleGetLibraryProgress] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// PATCH /api/library/lessons/:id/progress (RF-06 + D12)
// -----------------------------------------------------------------------------

const progressPatchSchema = z.object({
  format: z.enum(["video", "podcast", "article"]),
  lastPositionSeconds: z.number().int().min(0),
  totalDurationSeconds: z.number().int().min(0).optional(),
});

export async function handlePatchLibraryProgress(req: Request, res: Response) {
  try {
    const id = req.params?.id;
    if (!id) return res.status(400).json({ message: "id_required" });
    const userId = (req as any).user?.userPlatformId;

    // Auth check ANTES da validacao do body (RF-06: 401 sem grant precede 400).
    const access = await storage.findLessonAccess({ userId, lessonId: id });
    if (!access) return res.status(401).json({ message: "access_denied" });

    const parsed = progressPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid_input", errors: parsed.error.format() });
    }
    const { format, lastPositionSeconds, totalDurationSeconds } = parsed.data;

    const result = await storage.upsertLibraryProgress({
      userId,
      lessonId: id,
      format,
      lastPositionSeconds,
      totalDurationSeconds,
    });

    if (result?.throttled) {
      const retry = String(result.retryAfterSeconds ?? 5);
      // Test mocks `res.set` expecting object form — use that overload.
      res.set({ "Retry-After": retry });
      return res.status(429).json({ message: "throttled" });
    }

    res.status(200).json({
      updated: !!result?.updated,
      completed: !!result?.completed,
    });
  } catch (err) {
    console.error("[handlePatchLibraryProgress] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// computeStartPositionForFormatSwitch — re-export from shared helpers.
// -----------------------------------------------------------------------------

export const computeStartPositionForFormatSwitch = sharedComputeStartPositionForFormatSwitch;
