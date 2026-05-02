// =============================================================================
// LessonRow - Sprint Biblioteca-1 / RF-07 + D7 + UX Round Implementer.
//
// Linha de aula no detalhe do curso. Clicavel se hasAccess=true (link para
// viewer). Bloqueada com "Em breve" se hasAccess=false (D7).
//
// UX Round Implementer:
//   F12 - lesson progress indicator (radio dot empty / half / check) + bar
//   F20 - displayNumber/displayLabel badge a esquerda do titulo
// =============================================================================

import React from "react";
import { Link } from "wouter";
import {
  Check,
  Circle,
  CircleDashed,
  FileText,
  Headphones,
  PlayCircle,
} from "lucide-react";

export interface LessonRowProps {
  lesson: {
    id: string;
    slug: string;
    title: string;
    subtitle?: string | null;
    coverUrl?: string | null;
    durationMinutes?: number;
    formats: Array<"video" | "podcast" | "article">;
    hasAccess: boolean;
    /** F20: pre-computed display label like "01" / "A1" */
    displayLabel?: string;
    displayOrder?: number;
    /** F12: rolled-up progress aggregate (max across formats) */
    userProgress?: {
      maxFormatPositionSeconds?: number;
      maxFormatTotalSeconds?: number;
      completedAny?: boolean;
    };
  };
  courseSlug: string;
}

function formatLessonNumber(label?: string, order?: number): string | null {
  if (label && label.trim().length > 0) return label;
  if (typeof order === "number" && order > 0) {
    return order.toString().padStart(2, "0");
  }
  return null;
}

function progressPercent(p?: LessonRowProps["lesson"]["userProgress"]): number {
  if (!p || !p.maxFormatTotalSeconds || p.maxFormatTotalSeconds <= 0) return 0;
  const pct = ((p.maxFormatPositionSeconds ?? 0) / p.maxFormatTotalSeconds) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function LessonRow({ lesson, courseSlug }: LessonRowProps) {
  const testId = `library-lesson-row-${lesson.slug}`;
  const linkTestId = `${testId}-link`;
  const href = `/biblioteca/curso/${courseSlug}/${lesson.slug}`;

  const numberLabel = formatLessonNumber(lesson.displayLabel, lesson.displayOrder);
  const pct = progressPercent(lesson.userProgress);
  const completed = !!lesson.userProgress?.completedAny;
  const inProgress = !completed && pct > 0;

  // F12: progress icon
  let progressIcon: React.ReactNode;
  if (completed) {
    progressIcon = (
      <Check
        size={16}
        className="text-green-400"
        aria-label="Aula concluida"
      />
    );
  } else if (inProgress) {
    progressIcon = (
      <CircleDashed
        size={16}
        className="text-amber-300"
        aria-label="Em progresso"
      />
    );
  } else {
    progressIcon = (
      <Circle
        size={16}
        className="text-gray-600"
        aria-label="Nao iniciada"
      />
    );
  }

  const content = (
    <div className="relative flex items-start gap-4 p-4 rounded-lg bg-gray-900/40 border border-gray-800">
      <div
        className="flex-shrink-0 mt-1"
        data-testid={`${testId}-progress-icon`}
      >
        {progressIcon}
      </div>
      {numberLabel && (
        <span
          data-testid={`${testId}-number`}
          className="flex-shrink-0 inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded bg-gray-800 text-gray-400 text-xs font-mono font-semibold"
        >
          {numberLabel}
        </span>
      )}
      <div className="w-32 aspect-video rounded-md overflow-hidden bg-gray-800 flex-shrink-0">
        {lesson.coverUrl && (
          <img
            src={lesson.coverUrl}
            // Existing test asserts no alt requirement; keeping title for context
            // (tests do not assert empty alt). Decorative because title text is
            // adjacent.
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-base font-medium text-white truncate">{lesson.title}</h4>
        {lesson.subtitle && (
          <p className="text-sm text-gray-400 line-clamp-2">{lesson.subtitle}</p>
        )}
        {/* F-A10.3: gray-500 -> gray-400 for AAA contrast on dark bg */}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {lesson.durationMinutes !== undefined && <span>{lesson.durationMinutes} min</span>}
          {lesson.formats.map((f) => {
            // F-A3.4: icon + text label (text remains for a11y).
            const Icon =
              f === "video"
                ? PlayCircle
                : f === "podcast"
                  ? Headphones
                  : FileText;
            const label =
              f === "video" ? "Video" : f === "podcast" ? "Podcast" : "Artigo";
            return (
              <span
                key={f}
                className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 inline-flex items-center gap-1"
              >
                <Icon size={12} aria-hidden className="opacity-80" />
                {label}
              </span>
            );
          })}
          {!lesson.hasAccess && (
            <span className="ml-auto text-amber-300">Em breve</span>
          )}
        </div>
      </div>
      {/* F12: progress bar at bottom */}
      {(inProgress || completed) && (
        <div
          data-testid={`${testId}-progress-bar`}
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800 rounded-b-lg overflow-hidden"
        >
          <div
            className={completed ? "h-full bg-green-500" : "h-full bg-amber-400"}
            style={{ width: `${completed ? 100 : pct}%` }}
          />
        </div>
      )}
    </div>
  );

  if (lesson.hasAccess) {
    return (
      <Link
        href={href}
        data-testid={linkTestId}
        className="block"
      >
        <div data-testid={testId}>{content}</div>
      </Link>
    );
  }

  return (
    <div
      data-testid={testId}
      className="cursor-not-allowed opacity-70"
      title="Em breve"
    >
      {content}
    </div>
  );
}

export default LessonRow;
