// =============================================================================
// LessonHeroPage - Sprint Bloco-A-Polish / RF-02 + RF-03 + RF-05 + RF-06 + RF-09
//
// Wrapper de pagina para o hero (rota /biblioteca/curso/:slug/:lesson).
// Responsibilities:
//   1. Fetch lesson via apiRequest('GET', /api/library/lessons/by-slug/...)
//   2. Loading + error states (404/401/500)
//   3. Check localStorage flag hero-seen — se true, redirect imediato pra /play
//      (RF-03 + D9)
//   4. Apos 1s de mount sem flag: write flag + emit prologue_viewed (RF-09)
//   5. Click "Iniciar aula" -> exit transition + setLocation('/play')
//   6. Click "Pular intro" -> emit prologue_skipped + setLocation('/play')
//   7. Audio concorrente: passa isOtherAudioPlaying + otherAudioLabel pro hero
//      (RF-06 + D12)
//
// Lessons aplicadas:
//   #1  hooks-first
//   #2  data-testid: lesson-hero-page-root, -loading, -error, +data-state
//   #11 default minimo (sem actions extras nao pedidos pelo spec)
//   #12 estado de "exiting" via local state — debounce de duplo-click
//   #13 apiRequest retorna JSON parseado; mocks recebem JSON puro
// =============================================================================

import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useOptionalAudioPlayer } from "@/contexts/AudioPlayerContext";
import { LessonHero, type LessonHeroLesson } from "@/components/biblioteca/LessonHero";
import { LessonHeroBelowFold } from "@/components/biblioteca/LessonHeroBelowFold";
import {
  readHeroSeenFlag,
  writeHeroSeenFlag,
} from "@/lib/library-hero-storage";

interface LessonHeroPageProps {
  courseSlug: string;
  lessonSlug: string;
}

interface LessonResponse extends LessonHeroLesson {
  // Campos extras opcionais usados pra below-fold + episode label.
  displayLabel?: string | null;
  displayOrder?: number | null;
  blockLabel?: string | null;
  courseTitle?: string | null;
}

function deriveEpisodeNumber(lesson: LessonResponse): number {
  // Prefer displayOrder explicito
  if (typeof lesson.displayOrder === "number" && lesson.displayOrder > 0) {
    return lesson.displayOrder;
  }
  // Fallback: parse de slug (ex: "a1-mentalidade" -> 1)
  const match = lesson.slug?.match(/^[a-zA-Z](\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

function deriveBlockLabel(lesson: LessonResponse): string {
  if (lesson.blockLabel) return lesson.blockLabel;
  if (lesson.courseTitle) return `Bloco A · ${lesson.courseTitle}`;
  return "Bloco A · Antes das Cartas";
}

export function LessonHeroPage({
  courseSlug,
  lessonSlug,
}: LessonHeroPageProps) {
  // ---- HOOKS FIRST (lesson #1) -------------------------------------------
  const [, setLocation] = useLocation();
  const audioCtx = useOptionalAudioPlayer();
  const [isExiting, setIsExiting] = useState(false);
  const exitDispatchedRef = useRef(false);
  const flagWriteRef = useRef(false);
  const viewedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lessonQuery = useQuery<LessonResponse>({
    queryKey: ["library-lesson", `${courseSlug}/${lessonSlug}`],
    queryFn: async () => {
      return await apiRequest(
        "GET",
        `/api/library/lessons/by-slug/${courseSlug}/${lessonSlug}`,
        undefined,
        { silentMode: true },
      );
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const lesson = lessonQuery.data;
  const lessonId = lesson?.id;

  useEffect(() => {
    if (!lesson) return;
    const flag = readHeroSeenFlag(lesson.id);
    if (flag === "true") {
      setLocation(
        `/biblioteca/curso/${lesson.courseSlug}/${lesson.slug}/play`,
        { replace: true },
      );
      return;
    }
    if (flagWriteRef.current) return;
    viewedTimerRef.current = setTimeout(() => {
      if (flagWriteRef.current) return;
      flagWriteRef.current = true;
      writeHeroSeenFlag(lesson.id);
      apiRequest(
        "POST",
        "/api/library/events",
        { lessonId: lesson.id, eventType: "prologue_viewed" },
        { silentMode: true },
      ).catch((err) => {
        console.warn("[LessonHeroPage] prologue_viewed telemetry failed", err);
      });
    }, 1000);
    return () => {
      if (viewedTimerRef.current) clearTimeout(viewedTimerRef.current);
    };
  }, [lesson, setLocation]);

  // ---- Computed values ---------------------------------------------------
  const isOtherAudioPlaying =
    !!audioCtx?.isPlaying &&
    !!audioCtx?.current &&
    audioCtx.current.lessonId !== lessonId;
  const otherAudioLabel =
    isOtherAudioPlaying && audioCtx?.current?.title
      ? audioCtx.current.title
      : undefined;

  // ---- Handlers ----------------------------------------------------------
  function navigateToPlay() {
    if (!lesson) return;
    setLocation(
      `/biblioteca/curso/${lesson.courseSlug}/${lesson.slug}/play`,
    );
  }

  function exitToPlay(eventType?: "prologue_skipped") {
    if (!lesson) return;
    if (exitDispatchedRef.current) return;
    exitDispatchedRef.current = true;
    if (viewedTimerRef.current) {
      clearTimeout(viewedTimerRef.current);
      viewedTimerRef.current = null;
    }
    flagWriteRef.current = true;
    writeHeroSeenFlag(lesson.id);
    if (eventType) {
      apiRequest(
        "POST",
        "/api/library/events",
        { lessonId: lesson.id, eventType },
        { silentMode: true },
      ).catch((err) => {
        console.warn("[LessonHeroPage] prologue_skipped telemetry failed", err);
      });
    }
    setIsExiting(true);
    navigateToPlay();
  }

  function handleStart() {
    exitToPlay();
  }

  function handleSkipIntro() {
    exitToPlay("prologue_skipped");
  }

  // ---- Early returns AFTER hooks (lesson #1) -----------------------------
  if (lessonQuery.isLoading) {
    return (
      <div
        data-testid="lesson-hero-page-loading"
        className="min-h-screen bg-black flex items-center justify-center"
      >
        <div className="h-12 w-12 rounded-full border-2 border-green-500/30 border-t-green-500 animate-spin" />
      </div>
    );
  }

  if (lessonQuery.isError || !lesson) {
    const err: any = lessonQuery.error;
    const status: number | undefined = err?.response?.status;
    let title: string;
    let body: string;
    if (status === 401 || status === 403) {
      title = "Acesso bloqueado";
      body =
        "Esta aula esta restrita ao seu plano atual. Fale com o suporte para liberar.";
    } else if (status === 404) {
      title = "Aula nao encontrada";
      body = "A aula solicitada nao existe ou foi movida.";
    } else {
      title = "Erro ao carregar aula";
      body =
        "Tivemos um problema ao buscar este conteudo. Tente novamente.";
    }
    return (
      <div
        data-testid="lesson-hero-page-error"
        data-status={String(status ?? "")}
        className="min-h-screen bg-black flex flex-col items-center justify-center text-center space-y-3 px-6"
      >
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-gray-400 max-w-lg">{body}</p>
        <a
          href={`/biblioteca/curso/${courseSlug}`}
          className="px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-500"
        >
          Voltar ao curso
        </a>
      </div>
    );
  }

  const episodeNumber = deriveEpisodeNumber(lesson);
  const blockLabel = deriveBlockLabel(lesson);

  return (
    <div
      data-testid="lesson-hero-page-root"
      data-state={isExiting ? "exiting" : "active"}
      data-exiting={isExiting ? "true" : "false"}
      className="bg-black min-h-screen text-white"
    >
      <LessonHero
        lesson={lesson}
        episodeNumber={episodeNumber}
        blockLabel={blockLabel}
        onStart={handleStart}
        onSkipIntro={handleSkipIntro}
        isOtherAudioPlaying={isOtherAudioPlaying}
        otherAudioLabel={otherAudioLabel}
      />
      <LessonHeroBelowFold
        learningObjectives={lesson.learningObjectives ?? []}
        keyConcepts={lesson.tags ?? []}
        scientificBasis={[]}
      />
    </div>
  );
}

export default LessonHeroPage;
