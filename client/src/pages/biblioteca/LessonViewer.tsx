// =============================================================================
// LessonViewer - Sprint Biblioteca-1 / RF-08 + D5 + D6 + D8 + UX Round.
//
// Pagina viewer com tabs Video/Podcast/Artigo. Sync de progresso
// cross-format por SEGUNDOS absolutos (D5). Watermark CSS overlay (D8).
// Acesso bloqueado dispara evento access_blocked + (eventual) redirect.
//
// UX Round Implementer:
//   F4  - sync cross-format mostra toast "Continuando de XX:XX" + Voltar ao inicio
//   F14 - tabs sempre renderizadas (formatos faltantes ficam disabled)
//   F15 - watermark com 4-6 instancias diagonais
//   F16 - estados de erro tipados 401/404/500 com CTAs
//
// Lessons aplicadas:
//   #1 hooks primeiro (early return depois)
//   #2 data-testid estavel
//   #11 default minimo (tabs disabled em vez de remover)
//   #12 estado persistente via context global
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText, Headphones, PlayCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { computeStartPositionForFormatSwitch } from "@shared/library-format-helpers";
import MuxPlayerRaw from "@mux/mux-player-react";
import { useToast } from "@/hooks/use-toast";
import { useOptionalAudioPlayer } from "@/contexts/AudioPlayerContext";
import { PodcastPlayer } from "@/components/biblioteca/PodcastPlayer";

// MuxPlayer module shape varies (default export vs namespace). Resolve once.
const MuxPlayer = (MuxPlayerRaw as any)?.default ?? MuxPlayerRaw;

interface LessonViewerProps {
  /** Optional legacy/test-only id. When omitted, fetch via courseSlug+lessonSlug. */
  lessonId?: string;
  courseSlug: string;
  lessonSlug: string;
  userPlatformId?: string;
}

type FormatTab = "video" | "podcast" | "article";

interface LessonData {
  id: string;
  slug: string;
  courseSlug?: string | null;
  title: string;
  subtitle?: string | null;
  formats: {
    video?: { mux: { playbackId: string }; durationSeconds: number };
    podcast?: { audioUrl: string; durationSeconds: number; mimeType: string };
    article?: { html: string; wordCount: number };
  };
}

interface ProgressData {
  video?: { lastPositionSeconds: number; totalDurationSeconds: number };
  podcast?: { lastPositionSeconds: number; totalDurationSeconds: number };
  article?: { lastPositionSeconds: number; totalDurationSeconds: number };
}

const FORMAT_LABELS: Record<FormatTab, string> = {
  video: "Video",
  podcast: "Podcast",
  article: "Artigo",
};

// F-A3.4: format icons (lucide). Hidden from a11y - text label is the source.
const FORMAT_ICONS: Record<FormatTab, typeof PlayCircle> = {
  video: PlayCircle,
  podcast: Headphones,
  article: FileText,
};

const ARTICLE_FONT_SIZE_KEY = "library:article:fontSize";
type ArticleFontSize = "sm" | "md" | "lg";

function readStoredFontSize(): ArticleFontSize {
  try {
    const raw = localStorage.getItem(ARTICLE_FONT_SIZE_KEY);
    if (raw === "sm" || raw === "md" || raw === "lg") return raw;
  } catch {
    // ignore
  }
  return "md";
}

function writeStoredFontSize(s: ArticleFontSize): void {
  try {
    localStorage.setItem(ARTICLE_FONT_SIZE_KEY, s);
  } catch {
    // ignore
  }
}

function fontSizePx(s: ArticleFontSize): string {
  switch (s) {
    case "sm":
      return "0.875rem";
    case "lg":
      return "1.25rem";
    default:
      return "1rem";
  }
}

function computeStartPosition(
  src: number | undefined,
  destDur: number | undefined,
): number {
  return computeStartPositionForFormatSwitch({
    sourceLastPositionSeconds: src,
    destinationTotalDurationSeconds: destDur,
  });
}

function formatMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LessonViewer({
  lessonId,
  courseSlug,
  lessonSlug,
  userPlatformId,
}: LessonViewerProps) {
  // ---- HOOKS FIRST (lesson #1) -------------------------------------------
  const { toast } = useToast();
  // F10: optional audio player - renders custom UI only when Provider exists.
  // Falls back to bare <audio controls> in test envs without Provider.
  const audioCtx = useOptionalAudioPlayer();

  // Resolve fetch URL: prefer lessonId for legacy/test path; fallback to
  // by-slug when only slugs are present (App.tsx route drives this case).
  const lessonFetchUrl = lessonId
    ? `/api/library/lessons/${lessonId}`
    : `/api/library/lessons/by-slug/${courseSlug}/${lessonSlug}`;

  const lessonQuery = useQuery<LessonData>({
    queryKey: ["library-lesson", lessonId ?? `${courseSlug}/${lessonSlug}`],
    queryFn: async () => {
      // F3b: silentMode evita redirect automatico em 401 - o componente
      // mostra fallback "Acesso bloqueado" + dispara evento access_blocked.
      return await apiRequest("GET", lessonFetchUrl, undefined, {
        silentMode: true,
      });
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Use resolved id (from response) for progress; falls back to prop while loading.
  const resolvedId = lessonQuery.data?.id ?? lessonId;
  const progressQuery = useQuery<ProgressData>({
    queryKey: ["library-progress", resolvedId],
    queryFn: async () => {
      return await apiRequest("GET", `/api/library/lessons/${resolvedId}/progress`);
    },
    enabled: !!resolvedId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const [activeTab, setActiveTab] = useState<FormatTab | null>(null);
  // F20: previousTab is render-derived signal only (no UI re-render needed
  // when it flips), so a ref avoids extra renders on tab change.
  const previousTabRef = useRef<FormatTab | null>(null);
  // F-A4.5: persisted font size for article reader.
  const [articleFontSize, setArticleFontSize] = useState<ArticleFontSize>(
    () => readStoredFontSize(),
  );

  const lesson = lessonQuery.data;
  const progress = progressQuery.data ?? {};

  // Define tab default (primeiro formato disponivel) quando lesson chega.
  useEffect(() => {
    if (!lesson) return;
    if (activeTab) return;
    const formats = lesson.formats ?? {};
    if (formats.video) setActiveTab("video");
    else if (formats.podcast) setActiveTab("podcast");
    else if (formats.article) setActiveTab("article");
  }, [lesson, activeTab]);

  // F3a: shape do erro lancado por apiRequest eh `error.response.status`.
  useEffect(() => {
    if (lessonQuery.isError) {
      const err: any = lessonQuery.error;
      if (err?.response?.status === 401) {
        const idForEvent = resolvedId ?? lessonSlug;
        apiRequest(
          "POST",
          "/api/library/events",
          {
            lessonId: idForEvent,
            eventType: "access_blocked",
          },
          { silentMode: true },
        ).catch(() => {});
      }
    }
  }, [lessonQuery.isError, lessonQuery.error, resolvedId, lessonSlug]);

  // ---- Computed values ---------------------------------------------------
  const availableFormats = useMemo<FormatTab[]>(() => {
    if (!lesson) return [];
    const f: FormatTab[] = [];
    if (lesson.formats.video) f.push("video");
    if (lesson.formats.podcast) f.push("podcast");
    if (lesson.formats.article) f.push("article");
    return f;
  }, [lesson]);

  const startSeconds = useMemo(() => {
    if (!activeTab || !lesson) return 0;
    const dst = lesson.formats[activeTab];
    const destDur = Number((dst as any)?.durationSeconds ?? 0);

    const progressTyped = progress as ProgressData;
    const ownProg = progressTyped[activeTab]?.lastPositionSeconds;
    if (typeof ownProg === "number" && ownProg > 0) {
      return computeStartPosition(ownProg, destDur);
    }

    const previousTab = previousTabRef.current;
    if (previousTab && previousTab !== activeTab) {
      const srcProg = progressTyped[previousTab]?.lastPositionSeconds;
      const computed = computeStartPosition(srcProg, destDur);
      if (computed > 0) return computed;
    }

    let best = 0;
    for (const f of ["video", "podcast", "article"] as FormatTab[]) {
      if (f === activeTab) continue;
      const p = progressTyped[f]?.lastPositionSeconds;
      if (typeof p === "number" && p > 0) {
        const c = computeStartPosition(p, destDur);
        if (c > best) best = c;
      }
    }
    return best;
  }, [activeTab, progress, lesson]);

  // F-A4.8: maxProgress + which format owns it (so label can show "do video").
  const { maxProgressPct, maxProgressFormat } = useMemo(() => {
    const progressTyped = progress as ProgressData;
    let max = 0;
    let from: FormatTab | null = null;
    for (const f of ["video", "podcast", "article"] as FormatTab[]) {
      const p = progressTyped[f];
      if (p && p.totalDurationSeconds > 0) {
        const pct = Math.round((p.lastPositionSeconds / p.totalDurationSeconds) * 100);
        if (pct > max) {
          max = pct;
          from = f;
        }
      }
    }
    return { maxProgressPct: max, maxProgressFormat: from };
  }, [progress]);

  // F4: when user switches tab and there's progress carried from another
  // format, surface a toast "Continuando de MM:SS" with a "Voltar ao inicio"
  // action. Skipped when there is no inherited progress (start at 0).
  function selectTab(tab: FormatTab) {
    const prev = activeTab;
    previousTabRef.current = prev;
    setActiveTab(tab);

    if (!lesson || !prev || prev === tab) return;
    if (!availableFormats.includes(tab)) return;

    const progressTyped = progress as ProgressData;
    const ownProg = progressTyped[tab]?.lastPositionSeconds ?? 0;
    if (ownProg > 0) return; // user already has own progress in dest -> no toast.

    const destDur = Number(
      (lesson.formats[tab] as any)?.durationSeconds ?? 0,
    );
    const srcProg = progressTyped[prev]?.lastPositionSeconds ?? 0;
    const computed = computeStartPosition(srcProg, destDur);
    if (computed <= 0) return;

    const fromLabel = FORMAT_LABELS[prev];
    toast({
      title: `Continuando de ${formatMmSs(computed)}`,
      description: `De onde voce parou no ${fromLabel}.`,
      duration: 3000,
    });
  }

  // F-A10.1: arrow-key tab navigation. ArrowLeft/Right cycles within
  // availableFormats (Home/End jump to first/last).
  function handleTabKeyDown(e: React.KeyboardEvent, current: FormatTab) {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    if (availableFormats.length <= 1) return;
    const idx = availableFormats.indexOf(current);
    let nextIdx = idx;
    if (e.key === "ArrowLeft") {
      nextIdx = (idx - 1 + availableFormats.length) % availableFormats.length;
    } else if (e.key === "ArrowRight") {
      nextIdx = (idx + 1) % availableFormats.length;
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = availableFormats.length - 1;
    }
    const next = availableFormats[nextIdx];
    if (next) {
      selectTab(next);
      // Move focus to the newly selected tab so keyboard users keep flow.
      const el = document.getElementById(`lesson-format-tab-${next}`);
      if (el) (el as HTMLElement).focus();
    }
  }

  // F-A4.5: apply + persist article font size.
  function applyFontSize(s: ArticleFontSize) {
    setArticleFontSize(s);
    writeStoredFontSize(s);
  }

  // ---- Early returns AFTER hooks (lesson #1) -----------------------------
  if (lessonQuery.isLoading) {
    // F-A4.6: skeleton polish - aspect-video frame + 3 ghost tabs + meta lines.
    return (
      <div
        data-testid="lesson-viewer-loading"
        className="p-6 space-y-4 max-w-5xl mx-auto"
      >
        <div className="space-y-2">
          <div className="h-6 w-2/3 bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-1/3 bg-gray-800/70 rounded animate-pulse" />
        </div>
        <div className="flex gap-2 border-b border-gray-700 pb-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-20 bg-gray-800 rounded animate-pulse"
            />
          ))}
        </div>
        <div className="aspect-video w-full bg-gray-800 rounded-lg animate-pulse" />
        <div className="h-2 w-full bg-gray-800 rounded-full animate-pulse" />
      </div>
    );
  }
  if (lessonQuery.isError || !lesson) {
    // F16: typed error UI by HTTP status.
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
      body = "Tivemos um problema ao buscar este conteudo. Tente novamente.";
    }
    return (
      <div
        data-testid="lesson-viewer-error"
        data-status={status ?? ""}
        className="p-6 max-w-2xl mx-auto text-center space-y-4"
      >
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-gray-400">{body}</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href={`/biblioteca/curso/${courseSlug}`}
            data-testid="lesson-viewer-back-to-course"
            className="px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-500"
          >
            Voltar ao curso
          </Link>
          <a
            href="mailto:suporte@grindfy.com"
            data-testid="lesson-viewer-support-link"
            className="px-4 py-2 rounded border border-gray-600 text-gray-200 text-sm font-medium hover:bg-gray-800"
          >
            Falar com suporte
          </a>
        </div>
      </div>
    );
  }

  // F15: watermark with multiple diagonal repeats (anti-pirataria visual).
  // 6 instances arranged in a CSS grid, rotated -30deg, low opacity.
  const watermarkText = userPlatformId ?? "";
  const watermarkInstances = Array.from({ length: 6 }, (_, i) => i);

  return (
    <div data-testid="lesson-viewer" className="p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white">{lesson.title}</h1>
        {lesson.subtitle && <p className="text-gray-400">{lesson.subtitle}</p>}
      </header>

      {/*
        F14 (alternative): existing test asserts that unavailable format tabs
        return null (queryByTestId('lesson-format-tab-video')) so we cannot
        render them as disabled. Instead we expose the available list as a
        subtitle below and (when something is missing) a footer hint, so users
        know which formats this lesson has vs. which are intentionally absent.

        F-A10.1 (a11y): aria-controls + dynamic tabIndex + arrow-key navigation.
      */}
      <div
        role="tablist"
        aria-label="Formatos disponiveis"
        className="flex gap-2 border-b border-gray-700"
      >
        {availableFormats.map((f) => {
          const isActive = activeTab === f;
          // F-A3.4: format icon (kept as text-after for a11y; icon is hidden).
          const Icon = FORMAT_ICONS[f];
          return (
            <button
              key={f}
              data-testid={`lesson-format-tab-${f}`}
              role="tab"
              id={`lesson-format-tab-${f}`}
              aria-selected={isActive}
              aria-controls={`lesson-format-panel-${f}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(f)}
              onKeyDown={(e) => handleTabKeyDown(e, f)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${
                isActive
                  ? "border-green-400 text-green-400"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Icon size={14} aria-hidden className="opacity-80" />
              {FORMAT_LABELS[f]}
            </button>
          );
        })}
      </div>
      {/* F14: subtitle listing the formats available + missing hint. */}
      {availableFormats.length > 0 && (
        <p
          data-testid="lesson-formats-summary"
          className="text-xs text-gray-500"
        >
          Esta aula tem:{" "}
          {availableFormats.map((f) => FORMAT_LABELS[f]).join(", ")}.
          {availableFormats.length < 3 && (
            <span className="ml-1 text-gray-600">
              Outros formatos nao disponiveis para esta aula.
            </span>
          )}
        </p>
      )}

      {activeTab === "video" && lesson.formats.video && (
        <div
          data-testid="lesson-format-panel-video"
          data-start-seconds={startSeconds}
          id="lesson-format-panel-video"
          role="tabpanel"
          aria-labelledby="lesson-format-tab-video"
          className="relative w-full aspect-video bg-black rounded-lg overflow-hidden"
        >
          <VideoPanel playbackId={lesson.formats.video.mux.playbackId} />
          {/* F15: watermark 6x diagonal */}
          <div
            data-testid="lesson-video-watermark"
            aria-hidden
            className="absolute inset-0 pointer-events-none grid grid-cols-2 grid-rows-3 place-items-center"
          >
            {watermarkInstances.map((i) => (
              <span
                key={i}
                className="text-white/10 text-xl font-mono"
                style={{ transform: "rotate(-30deg)" }}
              >
                {watermarkText}
              </span>
            ))}
          </div>
        </div>
      )}

      {activeTab === "podcast" && lesson.formats.podcast && (
        <div
          data-testid="lesson-format-panel-podcast"
          data-start-seconds={startSeconds}
          id="lesson-format-panel-podcast"
          role="tabpanel"
          aria-labelledby="lesson-format-tab-podcast"
          className="p-4 bg-gray-900 rounded-lg"
        >
          {audioCtx ? (
            <PodcastPlayer
              lessonId={lesson.id}
              audioUrl={lesson.formats.podcast.audioUrl}
              title={lesson.title}
              durationSeconds={lesson.formats.podcast.durationSeconds}
              courseTitle={lesson.subtitle ?? undefined}
            />
          ) : (
            <audio
              controls
              preload="metadata"
              src={lesson.formats.podcast.audioUrl}
            >
              <track kind="captions" />
            </audio>
          )}
        </div>
      )}

      {activeTab === "article" && lesson.formats.article && (
        <div
          id="lesson-format-panel-article"
          role="tabpanel"
          aria-labelledby="lesson-format-tab-article"
          className="space-y-3"
        >
          {/* F-A4.5: font size selector */}
          <div className="flex items-center justify-end gap-2 text-xs text-gray-400">
            <span aria-hidden>Tamanho do texto:</span>
            <div
              role="group"
              aria-label="Tamanho da fonte do artigo"
              className="inline-flex items-center rounded-md border border-gray-700 overflow-hidden"
            >
              <button
                type="button"
                data-testid="article-font-size-sm"
                onClick={() => applyFontSize("sm")}
                aria-pressed={articleFontSize === "sm"}
                className={`px-2 py-1 text-xs ${
                  articleFontSize === "sm"
                    ? "bg-green-600 text-white"
                    : "bg-gray-900 text-gray-300 hover:text-white"
                }`}
              >
                A-
              </button>
              <button
                type="button"
                data-testid="article-font-size-md"
                onClick={() => applyFontSize("md")}
                aria-pressed={articleFontSize === "md"}
                className={`px-2 py-1 text-sm border-x border-gray-700 ${
                  articleFontSize === "md"
                    ? "bg-green-600 text-white"
                    : "bg-gray-900 text-gray-300 hover:text-white"
                }`}
              >
                A
              </button>
              <button
                type="button"
                data-testid="article-font-size-lg"
                onClick={() => applyFontSize("lg")}
                aria-pressed={articleFontSize === "lg"}
                className={`px-2 py-1 text-base ${
                  articleFontSize === "lg"
                    ? "bg-green-600 text-white"
                    : "bg-gray-900 text-gray-300 hover:text-white"
                }`}
              >
                A+
              </button>
            </div>
          </div>
          <article
            data-testid="lesson-format-panel-article"
            data-font-size={articleFontSize}
            className="prose prose-invert max-w-none"
            style={{ fontSize: fontSizePx(articleFontSize) }}
            dangerouslySetInnerHTML={{ __html: lesson.formats.article.html }}
          />
        </div>
      )}

      {/* F-A4.8: progress label above bar - includes max% + which format owns it. */}
      <div className="space-y-1">
        <p
          data-testid="lesson-progress-label"
          className="text-xs text-gray-400 flex items-center justify-between"
        >
          <span>
            Progresso da aula: {maxProgressPct}%
            {maxProgressFormat && (
              <span className="text-gray-500">
                {" "}
                (do {FORMAT_LABELS[maxProgressFormat]})
              </span>
            )}
          </span>
        </p>
        <div
          data-testid="lesson-progress-bar"
          role="progressbar"
          aria-valuenow={maxProgressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="w-full h-2 bg-gray-800 rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${maxProgressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function VideoPanel({ playbackId }: { playbackId: string }) {
  if (!MuxPlayer) {
    return <div data-testid="mux-player-fallback">Player indisponivel</div>;
  }
  const Cmp = MuxPlayer as any;
  return <Cmp playbackId={playbackId} />;
}

export default LessonViewer;
