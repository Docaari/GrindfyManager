// =============================================================================
// LessonHero - Sprint Bloco-A-Polish / RF-01 + RF-04 + RF-06 + RF-10
//
// Hero full-bleed cinematic com Ken Burns + entry stagger sequencial.
// Componente presentational — pai (LessonHeroPage) ja resolveu a lesson via
// useQuery. Aceita dados crus + handlers e renderiza:
//
//   - Cover image com Ken Burns subtle (scale 1.05 -> 1, 1200ms)
//   - Stagger entry: cover -> label -> title -> subtitle -> chips -> CTAs
//   - Skip button "Pular intro" apos 3s (RF-04)
//   - CTA primario "Iniciar aula" + secundario "Adicionar lista" (disabled, D7)
//   - Audio concorrente: CTA muda + chip "Tocando agora" (RF-06 + D12)
//   - prefers-reduced-motion respeitado (D11 + WCAG 2.3.3)
//
// Lessons aplicadas:
//   #1  hooks-first (early return depois)
//   #2  data-testid estaveis (lesson-hero, -cover, -title, -subtitle,
//       -cta-start, -cta-add-list, -skip-button, -other-audio-chip,
//       -fallback-gradient, -episode-label)
//   #11 default minimo (CTA secundario sempre disabled, sem fallback de acao)
// =============================================================================

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface LessonHeroLesson {
  id: string;
  slug: string;
  courseSlug: string;
  title: string;
  subtitle?: string | null;
  coverKey?: string | null;
  durationMinutes?: number;
  formats?: Array<"video" | "podcast" | "article">;
  learningObjectives?: string[];
  tags?: string[];
}

export interface LessonHeroProps {
  lesson: LessonHeroLesson;
  episodeNumber: number;
  blockLabel: string;
  onStart: () => void;
  /** RF-04: skip apos 3s — opcional, default = onStart */
  onSkipIntro?: () => void;
  /** D12: outra lesson tocando audio agora? */
  isOtherAudioPlaying?: boolean;
  /** D12: label da lesson tocando — exibido em chip */
  otherAudioLabel?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Hash deterministico de lessonId para fallback gradient (D2).
 * Soma de char codes, modulo 360.
 */
function hashLessonIdToHue(lessonId: string): number {
  return (
    Array.from(lessonId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360
  );
}

/**
 * Resolve URL final do cover. coverKey vazio/null/undefined -> null (fallback).
 */
function resolveCoverUrl(coverKey: string | null | undefined): string | null {
  if (!coverKey) return null;
  // Suporta absolute URL ja definida (s3 cdn) ou key relativa (assets/local).
  if (/^https?:\/\//i.test(coverKey)) return coverKey;
  // Fallback simples — assume coverKey eh path relativo a /assets/biblioteca/.
  return `/assets/biblioteca/${coverKey}`;
}

// =============================================================================
// Componente
// =============================================================================

export function LessonHero({
  lesson,
  episodeNumber,
  blockLabel,
  onStart,
  onSkipIntro,
  isOtherAudioPlaying = false,
  otherAudioLabel,
}: LessonHeroProps) {
  // ---- HOOKS FIRST (lesson #1) -------------------------------------------
  const prefersReducedMotion = useReducedMotion();
  const [showSkip, setShowSkip] = useState(false);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // RF-04: skip button aparece apos 3000ms (delay eh UX, nao animation —
  // mantem mesmo com reduced motion).
  useEffect(() => {
    skipTimerRef.current = setTimeout(() => setShowSkip(true), 3000);
    return () => {
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    };
  }, []);

  // ---- Computed values ---------------------------------------------------
  const coverUrl = resolveCoverUrl(lesson.coverKey);
  const useFallbackGradient = coverUrl === null;
  const fallbackHue = hashLessonIdToHue(lesson.id);
  const fallbackStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, hsl(${fallbackHue}, 60%, 25%), hsl(${
      (fallbackHue + 30) % 360
    }, 60%, 15%))`,
  };

  const ctaPrimaryText = isOtherAudioPlaying
    ? "Trocar pra esta aula"
    : "Iniciar aula";

  const reducedMotionAttr = prefersReducedMotion ? "true" : "false";

  const DELAY_LABEL = prefersReducedMotion ? 0 : 100;
  const DELAY_TITLE = prefersReducedMotion ? 0 : 200;
  const DELAY_SUBTITLE = prefersReducedMotion ? 0 : 350;
  const DELAY_CHIPS = prefersReducedMotion ? 0 : 500;
  const DELAY_CTA_PRIMARY = prefersReducedMotion ? 0 : 750;

  // Animation helpers — quando reduced motion, mounting eh instantaneo.
  const animProps = (delayMs: number, fromY: number, duration: number) =>
    prefersReducedMotion
      ? {
          initial: { opacity: 1, y: 0 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0 },
        }
      : {
          initial: { opacity: 0, y: fromY },
          animate: { opacity: 1, y: 0 },
          transition: { duration: duration / 1000, delay: delayMs / 1000 },
        };

  return (
    <div
      data-testid="lesson-hero"
      data-reduced-motion={reducedMotionAttr}
      className="relative w-full min-h-[100vh] bg-black text-white overflow-hidden"
    >
      {/* Cover layer (full-bleed) */}
      <div className="absolute inset-0 z-0">
        {useFallbackGradient ? (
          <motion.div
            data-testid="lesson-hero-fallback-gradient"
            initial={
              prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.05 }
            }
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 1.2 }}
            style={fallbackStyle}
            className="absolute inset-0"
          />
        ) : (
          <motion.img
            data-testid="lesson-hero-cover"
            src={coverUrl ?? undefined}
            alt={lesson.title}
            initial={
              prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.05 }
            }
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 1.2 }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* Gradient overlay top-to-bottom — escurece para texto legivel */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/30 to-black/85"
        />
      </div>

      {/* Skip button - canto superior direito, aparece apos 3s (RF-04) */}
      {showSkip && (
        <motion.button
          type="button"
          data-testid="lesson-hero-skip-button"
          aria-label="Pular intro"
          onClick={() => {
            if (onSkipIntro) onSkipIntro();
            else onStart();
          }}
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
          className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded text-xs font-medium bg-black/40 hover:bg-black/60 border border-white/20 text-white backdrop-blur-sm"
        >
          Pular intro
        </motion.button>
      )}

      {/* Content layer (bottom-left) */}
      <div className="relative z-10 flex flex-col justify-end min-h-[100vh] px-6 sm:px-8 pb-10 sm:pb-12 max-w-3xl">
        {/* Episode label */}
        <motion.div
          data-testid="lesson-hero-episode-label"
          data-animation-delay={DELAY_LABEL}
          {...animProps(DELAY_LABEL, 10, 350)}
          className="text-[12px] font-mono tracking-wider text-green-400 uppercase mb-3"
        >
          EPISODIO {episodeNumber} · {blockLabel}
        </motion.div>

        {/* Title */}
        <motion.h1
          data-testid="lesson-hero-title"
          data-animation-delay={DELAY_TITLE}
          {...animProps(DELAY_TITLE, 20, 400)}
          className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight mb-3 sm:mb-4 line-clamp-3"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          {lesson.title}
        </motion.h1>

        {/* Subtitle */}
        {lesson.subtitle && (
          <motion.p
            data-testid="lesson-hero-subtitle"
            data-animation-delay={DELAY_SUBTITLE}
            {...animProps(DELAY_SUBTITLE, 15, 400)}
            className="text-base sm:text-lg text-gray-300 mb-5 sm:mb-6 max-w-2xl line-clamp-3"
          >
            {lesson.subtitle}
          </motion.p>
        )}

        {/* Chips meta */}
        <motion.div
          data-testid="lesson-hero-chips"
          data-animation-delay={DELAY_CHIPS}
          {...animProps(DELAY_CHIPS, 10, 300)}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-300 mb-6"
        >
          {typeof lesson.durationMinutes === "number" && (
            <span data-testid="lesson-hero-chip-duration">
              {lesson.durationMinutes} min
            </span>
          )}
          {lesson.formats && lesson.formats.length > 0 && (
            <>
              <span aria-hidden className="text-gray-600">
                ·
              </span>
              <span data-testid="lesson-hero-chip-formats">
                {lesson.formats
                  .map((f) =>
                    f === "video"
                      ? "Video"
                      : f === "podcast"
                        ? "Audio podcast"
                        : "Leitura",
                  )
                  .join(" + ")}
              </span>
            </>
          )}
        </motion.div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-3">
          <motion.button
            type="button"
            data-testid="lesson-hero-cta-start"
            data-animation-delay={DELAY_CTA_PRIMARY}
            onClick={onStart}
            initial={
              prefersReducedMotion
                ? { opacity: 1, scale: 1 }
                : { opacity: 0, scale: 0.95 }
            }
            animate={{ opacity: 1, scale: 1 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : {
                    duration: 0.35,
                    delay: DELAY_CTA_PRIMARY / 1000,
                    type: "spring",
                    stiffness: 300,
                  }
            }
            className="px-6 py-3 rounded-md bg-green-500 hover:bg-green-400 text-black text-base font-semibold inline-flex items-center justify-center gap-2 shadow-lg"
          >
            <span aria-hidden>{">"}</span>
            {ctaPrimaryText}
          </motion.button>

        </div>

        {/* Audio concorrente — chip "Tocando agora" (RF-06 + D12) */}
        {isOtherAudioPlaying && otherAudioLabel && (
          <div
            data-testid="lesson-hero-other-audio-chip"
            role="region"
            aria-label="Audio podcast em background"
            className="text-[12px] text-gray-400 inline-flex items-center gap-1"
          >
            Tocando agora: {otherAudioLabel}
          </div>
        )}
      </div>
    </div>
  );
}

export default LessonHero;
