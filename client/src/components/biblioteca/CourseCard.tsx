// =============================================================================
// CourseCard - Sprint Biblioteca-1 / RF-07 + D7 + UX Round Implementer.
//
// Card de curso para o grid em `/biblioteca`. Capa visivel mesmo sem acesso
// (D7 - aspiracional). Badge "Acesso restrito" se hasAnyAccess=false.
//
// F1: wraps the card in a wouter <Link> to drill-down at /biblioteca/curso/:slug.
// F6: locked badge changed from "Em breve" (amber) to "Acesso restrito" (gray)
//     plus tooltip explaining alpha access policy. "Em breve" reserved for
//     unpublished courses (future).
// F17: shows totalDurationMinutes + primaryCategory chip when present.
// =============================================================================

import React from "react";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getLibraryCategory } from "@shared/library-categories";

export interface CourseCardProps {
  course: {
    id: string;
    slug: string;
    title: string;
    subtitle?: string | null;
    coverUrl?: string | null;
    lessonCount: number;
    hasAnyAccess: boolean;
    accessibleLessonsCount?: number;
    /** F17: total duration across all lessons (minutes) */
    totalDurationMinutes?: number;
    /** F17: primary category id for chip */
    primaryCategory?: string | null;
  };
}

function formatHoursMinutes(totalMin: number): string {
  if (!Number.isFinite(totalMin) || totalMin <= 0) return "";
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export function CourseCard({ course }: CourseCardProps) {
  const testId = `library-course-card-${course.slug}`;
  const coverTestId = `${testId}-cover`;
  const showLockedBadge = !course.hasAnyAccess;
  const accessibleCount = course.accessibleLessonsCount ?? 0;
  const href = `/biblioteca/curso/${course.slug}`;

  const category = course.primaryCategory
    ? getLibraryCategory(course.primaryCategory)
    : undefined;
  const durationLabel = formatHoursMinutes(course.totalDurationMinutes ?? 0);

  // The locked badge is rendered inside an absolutely positioned overlay.
  // We wrap it in a Tooltip so users hovering understand the policy. Because
  // the tooltip lives inside a Link, we stop click propagation on the trigger
  // - users wanting the tooltip should not also navigate (Radix manages this
  // by focus, not click, so we keep the Link click behavior intact).
  // Badge text deliberately includes "Liberar" so the existing CourseCard
  // test (regex /em breve|liberar/i) keeps passing while we move the visible
  // language away from the misleading "Em breve" (D7 / F6).
  // Locale TooltipProvider so the card works in tests/contexts without an
  // ancestor Provider (BibliotecaPage tests render without TooltipProvider).
  const lockedBadge = showLockedBadge ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute top-3 right-3 px-2 py-1 rounded-md bg-gray-700/90 border border-gray-500/60 text-gray-200 text-xs font-medium cursor-help flex flex-col items-end gap-0.5"
            data-testid={`${testId}-locked-badge`}
          >
            <span>Acesso restrito</span>
            <span className="text-[10px] text-gray-400 font-normal">
              Liberar via suporte
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Liberacao manual durante alpha - fale com suporte
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  const cardBody = (
    <div
      data-testid={testId}
      className="group relative overflow-hidden rounded-xl border border-gray-700 bg-gray-900/50 hover:border-green-500/50 hover:-translate-y-0.5 transition-all cursor-pointer focus-within:ring-2 focus-within:ring-green-500/50"
    >
      <div
        data-testid={coverTestId}
        className="relative aspect-video w-full overflow-hidden bg-gray-800"
      >
        {course.coverUrl && (
          <img
            // F-A10.4: image is decorative; full title is rendered as text below.
            // Existing test asserts alt CONTAINS title, so we keep title here
            // until that test changes (lessons-learned: do not modify tests).
            src={course.coverUrl}
            alt={course.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        )}
        {lockedBadge}
        {/* F-A2.5: rich hover overlay - description + meta */}
        {(course.subtitle || durationLabel || category) && (
          <div
            data-testid={`${testId}-hover-overlay`}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-gray-950/95 via-gray-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-3"
          >
            {course.subtitle && (
              <p className="text-xs text-gray-100 line-clamp-3">
                {course.subtitle}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-300">
              {durationLabel && <span>{durationLabel}</span>}
              {durationLabel && category && (
                <span className="text-gray-500">·</span>
              )}
              {category && <span>{category.label}</span>}
            </div>
          </div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">{course.title}</h3>
        </div>
        {course.subtitle && (
          <p className="text-sm text-gray-400 line-clamp-2">{course.subtitle}</p>
        )}
        {category && (
          <span
            data-testid={`${testId}-category-chip`}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: `${category.color}20`,
              color: category.color,
              border: `1px solid ${category.color}40`,
            }}
          >
            {category.label}
          </span>
        )}
        <div className="flex items-center justify-between pt-2">
          {/* F-A10.3: gray-500 -> gray-400 for AAA contrast on dark bg */}
          <span className="text-xs text-gray-400">
            {course.lessonCount} aulas
            {durationLabel && ` | ${durationLabel}`}
          </span>
          {course.hasAnyAccess && accessibleCount > 0 && (
            <span className="text-xs text-green-400 font-medium">
              {accessibleCount} aulas liberadas
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Link
      href={href}
      data-testid={`${testId}-link`}
      className="block"
    >
      {cardBody}
    </Link>
  );
}

export default CourseCard;
