// =============================================================================
// home-coach-recommendation routes — Sprint home-reform-4 / Item 4.
//
// Spec : Docs/specs/home-reform-4-item-4-coach-recommendation.md §RF-05/06/07
// ADRs : 111 (schema), 114 (consume tracking).
//
// Endpoints:
//   GET  /api/home/coach-recommendation
//   POST /api/home/coach-recommendation/:id/dismiss
//   POST /api/home/coach-recommendation/:id/consume
// =============================================================================

import type { Express, Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { getCurrentWeekStartBRT } from "../coach/weekHelper";

function weekStartIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ctaLabelFor(format: string | undefined, hasAccess: boolean): string {
  if (!hasAccess) return "Comprar acesso";
  if (format === "podcast") return "Ouvir agora";
  if (format === "article") return "Ler agora";
  return "Assistir agora";
}

function ctaTargetFor(
  recId: string,
  lessonId: string,
  hasAccess: boolean,
  courseSlug?: string | null,
  lessonSlug?: string | null,
): string {
  // Wouter so registra rotas /biblioteca/curso/:courseSlug/:lessonSlug[/play].
  // Quando temos os slugs, montamos o target real (rota /play eh o player do
  // LessonViewer onde o consume hook dispara). Quando faltarem (legacy/test),
  // fallback pra /biblioteca como fallback seguro mantendo recId/lessonId nos
  // params para auditoria do tracker.
  const params = `source=home-coach-rec&recId=${encodeURIComponent(recId)}&lessonId=${encodeURIComponent(lessonId)}`;
  let base: string;
  if (courseSlug && lessonSlug) {
    base = `/biblioteca/curso/${encodeURIComponent(courseSlug)}/${encodeURIComponent(lessonSlug)}/play?${params}`;
  } else {
    base = `/biblioteca?${params}`;
  }
  return hasAccess ? base : `${base}&intent=purchase`;
}

// =============================================================================
// GET /api/home/coach-recommendation
// =============================================================================

export async function handleGetCoachRecommendation(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    res.setHeader("Cache-Control", "private, max-age=60");

    const weekStart = getCurrentWeekStartBRT();
    const weekStartDate = weekStartIso(weekStart);

    const rec = await (storage as any).getCoachRecommendationByUserAndWeek(
      userId,
      weekStartDate,
    );

    if (!rec) {
      res.status(200).json({ recommendation: null, weekStartDate });
      return;
    }

    if (rec.dismissedAt) {
      res
        .status(200)
        .json({ recommendation: null, status: "dismissed", weekStartDate });
      return;
    }
    if (rec.consumedAt) {
      res
        .status(200)
        .json({ recommendation: null, status: "consumed", weekStartDate });
      return;
    }

    const lesson = await (storage as any).getLibraryLessonById(rec.lessonId);
    if (!lesson) {
      res.status(200).json({
        recommendation: null,
        status: "lesson_unavailable",
        weekStartDate,
      });
      return;
    }

    const hasAccess = !!(await (storage as any).hasLessonAccess(
      userId,
      rec.lessonId,
    ));

    const format = lesson.format ?? "video";
    const ctaTarget = ctaTargetFor(
      rec.id,
      rec.lessonId,
      hasAccess,
      lesson.courseSlug ?? null,
      lesson.lessonSlug ?? lesson.slug ?? null,
    );
    const ctaLabel = ctaLabelFor(format, hasAccess);

    res.status(200).json({
      recommendation: {
        id: rec.id,
        lessonId: rec.lessonId,
        lessonTitle: lesson.title ?? "",
        courseTitle: lesson.courseTitle ?? null,
        moduleTitle: lesson.moduleTitle ?? null,
        coverImageUrl: lesson.coverImageUrl ?? lesson.coverKey ?? null,
        format,
        durationSeconds: lesson.durationSeconds ?? null,
        category: lesson.categoryId ?? null,
        reason: rec.reason,
        source: rec.source,
        createdAt: rec.createdAt,
        dismissedAt: rec.dismissedAt ?? null,
        consumedAt: rec.consumedAt ?? null,
        hasAccess,
        ctaTarget,
        ctaLabel,
      },
      status: "active",
      weekStartDate,
    });
  } catch (err) {
    console.error("[handleGetCoachRecommendation] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// POST /api/home/coach-recommendation/:id/dismiss
// =============================================================================

export async function handleDismissCoachRecommendation(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const id = String(req?.params?.id ?? "");
    if (!id) {
      res.status(400).json({ message: "id required" });
      return;
    }

    const rec = await (storage as any).getCoachRecommendationById(id);
    if (!rec) {
      res.status(404).json({ message: "not_found" });
      return;
    }
    if (rec.userId !== userId) {
      res.status(403).json({ message: "forbidden" });
      return;
    }

    // Idempotente: ja dismissed/consumed -> 200 sem alterar.
    if (rec.dismissedAt || rec.consumedAt) {
      res.status(200).json({
        ok: true,
        dismissedAt: rec.dismissedAt ?? null,
        consumedAt: rec.consumedAt ?? null,
      });
      return;
    }

    await (storage as any).dismissCoachRecommendation(id);

    res.status(200).json({ ok: true, dismissedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[handleDismissCoachRecommendation] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// POST /api/home/coach-recommendation/:id/consume
// =============================================================================

export async function handleConsumeCoachRecommendation(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const id = String(req?.params?.id ?? "");
    if (!id) {
      res.status(400).json({ message: "id required" });
      return;
    }

    const rec = await (storage as any).getCoachRecommendationById(id);
    if (!rec) {
      res.status(404).json({ message: "not_found" });
      return;
    }
    if (rec.userId !== userId) {
      res.status(403).json({ message: "forbidden" });
      return;
    }

    if (rec.consumedAt) {
      res.status(200).json({ ok: true, consumedAt: rec.consumedAt });
      return;
    }

    await (storage as any).consumeCoachRecommendation(id);

    // library_events row com event_type 'coach_recommend' (RF-07).
    try {
      await (storage as any).insertLibraryEvent({
        userId,
        lessonId: rec.lessonId,
        eventType: "coach_recommend",
        metadata: {
          recId: rec.id,
          source: rec.source,
          weekStartDate: rec.weekStartDate,
          triggeredVia: req?.body?.triggeredVia ?? "auto",
        },
      });
    } catch (err) {
      // Falha aqui nao deve bloquear a resposta (idempotente).
      console.error("[handleConsumeCoachRecommendation] insertLibraryEvent error", err);
    }

    res.status(200).json({ ok: true, consumedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[handleConsumeCoachRecommendation] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// Router registration
// =============================================================================

export function registerHomeCoachRecRoutes(app: Express): void {
  app.get(
    "/api/home/coach-recommendation",
    requireAuth,
    handleGetCoachRecommendation,
  );
  app.post(
    "/api/home/coach-recommendation/:id/dismiss",
    requireAuth,
    handleDismissCoachRecommendation,
  );
  app.post(
    "/api/home/coach-recommendation/:id/consume",
    requireAuth,
    handleConsumeCoachRecommendation,
  );
}
