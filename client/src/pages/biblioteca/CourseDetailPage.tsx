// =============================================================================
// CourseDetailPage - Sprint Biblioteca-1 / RF-07 + UX Round Implementer F2.
//
// Drill-down `/biblioteca/curso/:slug`. Consume GET /api/library/courses/:slug
// (existing endpoint - server/routes/library.ts:handleGetLibraryCourse).
//
// Layout:
//   Breadcrumb     "Biblioteca / {courseTitle}"
//   Header         capa 21:9 + title + subtitle + duracao + # aulas
//   "Continuar..." quick CTA when progress exists
//   Accordion      modulos -> LessonRow[] inside
//   Empty/Error    states
//
// Lessons aplicadas:
//   #1 hooks first (todos useQuery/useMemo antes de qualquer return)
//   #2 data-testid estavel
//   #11 default minimo (sem CTA decorativo se nao houver progresso real)
// =============================================================================

import React, { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { apiRequest } from "@/lib/queryClient";
import { LessonRow } from "@/components/biblioteca/LessonRow";

interface LessonItem {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  durationMinutes?: number;
  formats: Array<"video" | "podcast" | "article">;
  hasAccess: boolean;
  displayOrder?: number;
  displayLabel?: string;
  userProgress?: {
    maxFormatPositionSeconds?: number;
    maxFormatTotalSeconds?: number;
    completedAny?: boolean;
  };
}

interface ModuleItem {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  lessons: LessonItem[];
}

interface CourseDetail {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  isPublished: boolean;
  modules: ModuleItem[];
}

interface CourseDetailPageProps {
  courseSlug: string;
}

function formatHoursMinutes(totalMin: number): string {
  if (!Number.isFinite(totalMin) || totalMin <= 0) return "";
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export function CourseDetailPage({ courseSlug }: CourseDetailPageProps) {
  // ---- HOOKS FIRST (lesson #1) -------------------------------------------
  const courseQuery = useQuery<CourseDetail>({
    queryKey: ["library-course-detail", courseSlug],
    queryFn: async () => {
      return await apiRequest(
        "GET",
        `/api/library/courses/${courseSlug}`,
        undefined,
        { silentMode: true },
      );
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const course = courseQuery.data;

  const stats = useMemo(() => {
    if (!course) return { totalLessons: 0, totalMinutes: 0 };
    let totalLessons = 0;
    let totalMinutes = 0;
    for (const m of course.modules ?? []) {
      for (const l of m.lessons ?? []) {
        totalLessons += 1;
        if (typeof l.durationMinutes === "number") {
          totalMinutes += l.durationMinutes;
        }
      }
    }
    return { totalLessons, totalMinutes };
  }, [course]);

  const continueLesson = useMemo(() => {
    if (!course) return null;
    // Find the lesson with highest non-completed progress that user has access.
    for (const m of course.modules ?? []) {
      for (const l of m.lessons ?? []) {
        if (!l.hasAccess) continue;
        const p = l.userProgress;
        if (
          p &&
          p.maxFormatPositionSeconds &&
          p.maxFormatPositionSeconds > 0 &&
          !p.completedAny
        ) {
          return l;
        }
      }
    }
    return null;
  }, [course]);

  // ---- Early returns AFTER hooks ----------------------------------------
  if (courseQuery.isLoading) {
    return (
      <div
        data-testid="course-detail-loading"
        className="p-6 max-w-5xl mx-auto"
      >
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 bg-gray-800 rounded" />
          <div className="aspect-[21/9] w-full bg-gray-800 rounded-xl" />
          <div className="h-8 w-3/4 bg-gray-800 rounded" />
          <div className="h-4 w-1/2 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (courseQuery.isError || !course) {
    const err: any = courseQuery.error;
    const status = err?.response?.status;
    const isNotFound = status === 404;
    return (
      <div
        data-testid="course-detail-error"
        className="p-6 max-w-3xl mx-auto text-center space-y-3"
      >
        <h2 className="text-xl font-semibold text-white">
          {isNotFound ? "Curso nao encontrado" : "Erro ao carregar curso"}
        </h2>
        <p className="text-gray-400">
          {isNotFound
            ? "O curso solicitado nao existe ou foi removido."
            : "Tivemos um problema ao buscar este curso. Tente novamente em instantes."}
        </p>
        <Link
          href="/biblioteca"
          data-testid="course-detail-back-link"
          className="inline-block mt-2 px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-500"
        >
          Voltar para a Biblioteca
        </Link>
      </div>
    );
  }

  const durationLabel = formatHoursMinutes(stats.totalMinutes);

  return (
    <div
      data-testid="course-detail-page"
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      {/* Breadcrumb */}
      <nav
        data-testid="course-detail-breadcrumb"
        aria-label="Breadcrumb"
        className="text-sm text-gray-400"
      >
        <Link href="/biblioteca" className="hover:text-green-400">
          Biblioteca
        </Link>
        <span className="mx-2 text-gray-600">/</span>
        <span className="text-gray-200">{course.title}</span>
      </nav>

      {/* Header with 21:9 cover */}
      <header
        data-testid="course-detail-header"
        className="space-y-4"
      >
        <div className="relative w-full overflow-hidden rounded-xl bg-gray-800" style={{ aspectRatio: "21/9" }}>
          {course.coverUrl && (
            <img
              src={course.coverUrl}
              alt={course.title}
              loading="eager"
              decoding="async"
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">{course.title}</h1>
          {course.subtitle && (
            <p className="text-gray-400">{course.subtitle}</p>
          )}
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span data-testid="course-detail-lesson-count">
              {stats.totalLessons} aulas
            </span>
            {durationLabel && (
              <span data-testid="course-detail-total-duration">
                {durationLabel}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Continue from where you left off */}
      {continueLesson && (
        <Link
          href={`/biblioteca/curso/${course.slug}/${continueLesson.slug}`}
          data-testid="course-detail-continue-cta"
          className="block p-4 rounded-lg bg-green-600/15 border border-green-600/30 hover:bg-green-600/25 transition-colors"
        >
          <p className="text-sm text-green-300 font-medium">
            Continuar de onde parou
          </p>
          <p className="text-base text-white mt-1">{continueLesson.title}</p>
        </Link>
      )}

      {/* Modules accordion */}
      {course.modules.length === 0 ? (
        <div
          data-testid="course-detail-empty-modules"
          className="text-center py-12 space-y-3"
        >
          <p className="text-gray-400">
            Modulos sendo preparados - em breve!
          </p>
          <Link
            href="/biblioteca"
            data-testid="course-detail-empty-back"
            className="inline-block text-sm text-green-400 hover:text-green-300"
          >
            Voltar para a Biblioteca
          </Link>
        </div>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={course.modules.map((m) => m.id)}
          data-testid="course-detail-modules"
          className="space-y-2"
        >
          {course.modules.map((m) => (
            <AccordionItem
              key={m.id}
              value={m.id}
              data-testid={`course-detail-module-${m.slug}`}
              className="border border-gray-800 rounded-lg overflow-hidden bg-gray-900/40"
            >
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full text-left">
                  <span className="text-base font-semibold text-white">
                    {m.title}
                  </span>
                  <span className="text-xs text-gray-500 mr-2">
                    {m.lessons.length} aulas
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                {m.lessons.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">
                    Sem aulas disponiveis.
                  </p>
                ) : (
                  m.lessons.map((l) => (
                    <LessonRow
                      key={l.id}
                      lesson={l}
                      courseSlug={course.slug}
                    />
                  ))
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

export default CourseDetailPage;
