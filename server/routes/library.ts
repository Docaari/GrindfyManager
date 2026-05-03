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
import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { createMediaStorage } from "../services/mediaStorage";
import { STORAGE_SCOPES } from "../../shared/library-storage-scopes";
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
      bundleUrl: `/api/library/lessons/${lesson.id}/article-bundle`,
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
    const userId = (req as any).user?.userPlatformId;

    const [lesson, access] = await Promise.all([
      storage.getLibraryLesson(id),
      storage.findLessonAccess({ userId, lessonId: id }),
    ]);
    if (!lesson) return res.status(404).json({ message: "lesson_not_found" });
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
    const userId = (req as any).user?.userPlatformId;
    const lesson = await storage.getLibraryLessonBySlug(courseSlug, lessonSlug);
    if (!lesson) return res.status(404).json({ message: "lesson_not_found" });

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
    // Sprint Bloco-A-Polish / RF-09 + ADR-097
    "prologue_viewed",
    "prologue_skipped",
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

    // Sprint Biblioteca-2: storage.upsertLibraryProgress (RF-01) retorna
    // { row, completed, updated }. Tests legacy mockam { throttled, retryAfterSeconds }
    // pra simular throttle 5s server-side (Spec 1 RF-06 D12). Cast `any` mantem
    // ambos os contracts ate refactor da Spec 3.
    const result: any = await storage.upsertLibraryProgress({
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

// =============================================================================
// Sprint Biblioteca-2 / RF-03 + RF-04 + RF-11
// =============================================================================

const STATIC_CSS_KEY = `${STORAGE_SCOPES.LIBRARY_STATIC}/article-styles.css`;
const STATIC_JS_KEY = `${STORAGE_SCOPES.LIBRARY_STATIC}/article-scripts.js`;

const ASSET_CACHE_TTL_MS = 5 * 60 * 1000;
type CachedAsset = { buffer: Buffer; mime: string; hash: string; expiresAt: number };
const _assetCache = new Map<string, CachedAsset>();

async function loadStaticAsset(key: string): Promise<CachedAsset | null> {
  const cached = _assetCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const ms = createMediaStorage();
  const got = await ms.get(key).catch(() => null);
  if (!got) {
    _assetCache.delete(key);
    return null;
  }
  const entry: CachedAsset = {
    buffer: got.buffer,
    mime: got.mime,
    hash: createHash("sha256").update(got.buffer).digest("hex"),
    expiresAt: Date.now() + ASSET_CACHE_TTL_MS,
  };
  _assetCache.set(key, entry);
  return entry;
}

async function computeStaticAssetHash(key: string): Promise<string | null> {
  const entry = await loadStaticAsset(key);
  return entry ? entry.hash : null;
}

export function _clearStaticAssetHashCache() {
  _assetCache.clear();
}

// -----------------------------------------------------------------------------
// RF-04: GET /api/library/lessons/:id/article-bundle
// -----------------------------------------------------------------------------

export async function handleGetArticleBundle(req: Request, res: Response) {
  try {
    const lessonId = req.params?.id;
    if (!lessonId) {
      return res.status(400).json({ message: "id_required" });
    }
    const userId = (req as any).user?.userPlatformId;

    // Auth gate: lesson access check ANTES de tudo.
    const access = await storage.findLessonAccess({ userId, lessonId });
    if (!access) {
      return res.status(401).json({ message: "access_denied" });
    }

    const lesson = await storage.getLibraryLesson(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "lesson_not_found" });
    }
    if (!lesson.articleHtml) {
      return res.status(404).json({ message: "article_not_available" });
    }

    const [cssHash, jsHash] = await Promise.all([
      computeStaticAssetHash(STATIC_CSS_KEY),
      computeStaticAssetHash(STATIC_JS_KEY),
    ]);
    if (!cssHash || !jsHash) {
      return res.status(503).json({ message: "static_assets_not_uploaded" });
    }

    const cssV = cssHash.slice(0, 12);
    const jsV = jsHash.slice(0, 12);
    const stylesUrl = `/api/library/static/article-styles.css?v=${cssV}`;
    const scriptsUrl = `/api/library/static/article-scripts.js?v=${jsV}`;
    const version = createHash("sha256").update(cssHash + jsHash).digest("hex").slice(0, 16);

    return res.status(200).json({
      html: lesson.articleHtml,
      stylesUrl,
      scriptsUrl,
      version,
      meta: {
        title: lesson.title,
        learningObjectives: (lesson as any).learningObjectives ?? [],
      },
    });
  } catch (err) {
    console.error("[handleGetArticleBundle] error", err);
    return res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// RF-03: GET /api/library/static/article-styles.css
// -----------------------------------------------------------------------------

async function serveStaticAsset(
  req: Request,
  res: Response,
  key: string,
  contentType: string,
) {
  try {
    const entry = await loadStaticAsset(key);
    if (!entry) {
      return res.status(503).json({ message: "asset_not_uploaded" });
    }
    const etag = `"${entry.hash.slice(0, 12)}"`;

    const inm = req.headers?.["if-none-match"];
    if (typeof inm === "string" && inm === etag) {
      res.setHeader("etag", etag);
      res.setHeader("cache-control", "public, max-age=2592000, immutable");
      res.setHeader("cross-origin-resource-policy", "cross-origin");
      return res.status(304).end();
    }

    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "public, max-age=2592000, immutable");
    res.setHeader("etag", etag);
    res.setHeader("vary", "Accept-Encoding");
    // Iframe sandbox no allow-same-origin tem origin null;
    // CORP padrao 'same-origin' bloqueia. Liberar pra cross-origin.
    res.setHeader("cross-origin-resource-policy", "cross-origin");
    res.status(200);
    return res.send(entry.buffer);
  } catch (err) {
    console.error("[serveStaticAsset] error", err);
    return res.status(500).json({ message: "internal_error" });
  }
}

export async function handleGetArticleStyles(req: Request, res: Response) {
  return serveStaticAsset(req, res, STATIC_CSS_KEY, "text/css; charset=utf-8");
}

export async function handleGetArticleScripts(req: Request, res: Response) {
  return serveStaticAsset(
    req,
    res,
    STATIC_JS_KEY,
    "application/javascript; charset=utf-8",
  );
}

const accessRequestBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  reason: z.string().trim().min(20).max(1000),
});

export async function handleCreateLibraryAccessRequest(
  req: Request,
  res: Response,
) {
  try {
    const user = (req as any).user;
    if (!user || !user.userPlatformId) {
      return res.status(401).json({ message: "auth_required" });
    }

    const parsed = accessRequestBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: "validation_error",
        errors: parsed.error.format(),
      });
    }

    const existing = await storage.findPendingLibraryAccessRequest(
      user.userPlatformId,
    );
    if (existing) {
      return res.status(409).json({
        message: "request_already_pending",
        existingId: existing.id,
      });
    }

    const subscriptionPlanSnapshot = String(user.subscriptionPlan ?? "trial");

    try {
      const created = await storage.createLibraryAccessRequest({
        userId: user.userPlatformId,
        name: parsed.data.name,
        reason: parsed.data.reason,
        subscriptionPlanSnapshot,
      });
      return res.status(201).json({
        id: created.id,
        status: created.status,
        createdAt: created.createdAt,
      });
    } catch (insertErr: any) {
      // UNIQUE INDEX parcial WHERE status='pending' rejeita 2o pedido em
      // analise. Convertemos 23505 em 409 com id do pedido vencedor.
      const isUniqueViolation =
        insertErr?.code === "23505" ||
        /uniq_library_access_requests_user_pending/.test(
          String(insertErr?.constraint ?? insertErr?.message ?? ""),
        );
      if (isUniqueViolation) {
        let existingId: string | undefined;
        try {
          const found = await storage.findPendingLibraryAccessRequest(
            user.userPlatformId,
          );
          existingId = found?.id;
        } catch {
          // ignore
        }
        return res.status(409).json({
          message: "request_already_pending",
          ...(existingId ? { existingId } : {}),
        });
      }
      console.error("[handleCreateLibraryAccessRequest] insert failed", insertErr);
      return res.status(500).json({ message: "internal_error" });
    }
  } catch (err) {
    console.error("[handleCreateLibraryAccessRequest] error", err);
    return res.status(500).json({ message: "internal_error" });
  }
}

export async function handleGetMyLibraryAccessRequest(
  req: Request,
  res: Response,
) {
  try {
    const user = (req as any).user;
    if (!user || !user.userPlatformId) {
      return res.status(401).json({ message: "auth_required" });
    }
    const latest = await storage.getLatestLibraryAccessRequestForUser(
      user.userPlatformId,
    );
    return res.status(200).json(latest);
  } catch (err) {
    console.error("[handleGetMyLibraryAccessRequest] error", err);
    return res.status(500).json({ message: "internal_error" });
  }
}

// -----------------------------------------------------------------------------
// RF-11: POST /api/admin/library/static-asset
// -----------------------------------------------------------------------------

export async function handleAdminUploadStaticAsset(req: Request, res: Response) {
  try {
    const kind = String((req.body as any)?.kind ?? "");
    if (kind !== "styles" && kind !== "scripts") {
      return res.status(400).json({ message: "invalid_kind" });
    }
    const file = (req as any).file as
      | { buffer: Buffer; mimetype: string }
      | undefined;
    if (!file || !file.buffer) {
      return res.status(400).json({ message: "file_required" });
    }
    const key = kind === "styles" ? STATIC_CSS_KEY : STATIC_JS_KEY;
    const mime =
      kind === "styles"
        ? file.mimetype || "text/css"
        : file.mimetype || "application/javascript";

    const ms = createMediaStorage();
    const result = await ms.putAtFixedKey(key, file.buffer, mime);

    // Invalida cache: proximo bundle/static request reflete novo conteudo.
    _clearStaticAssetHashCache();

    return res.status(200).json({
      kind,
      key,
      size: result.size,
      sha256: result.sha256,
    });
  } catch (err) {
    console.error("[handleAdminUploadStaticAsset] error", err);
    return res.status(500).json({ message: "internal_error" });
  }
}
