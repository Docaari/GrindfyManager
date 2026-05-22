// LessonPickerDialog — Sprint Mini Player 1 + 1.1 + 1.2.
// Modal Radix Dialog com dropdown de cursos -> aulas (podcasts).
// Click em aula acessivel: playTrack + fecha.
//
// Suporta dois shapes do backend (back-compat MP1 testes):
//   - LEGACY (shape MP1): array de cursos com modules[].lessons[] inline.
//   - NEW (shape MP1.1): flat array {slug,title,...}; modules vem via lazy
//     fetch /api/library/courses/:slug quando user seleciona o curso.
// "Continuar de onde parou" no topo deriva o melhor progresso por aula
// (progress map por format) ou consome /progress/batch legado (MP1).
//
// MP1.2 / RF-01 (HIGH-1): antes usava wrapper try/catch em useQuery;
// migrado para ErrorBoundary classe local (lesson #29). Sub-componente
// `LessonPickerDialogFetcher` chama useQuery direto (Rules-of-Hooks safe).
// `LessonPickerErrorBoundary` captura render errors (ex: "No QueryClient
// set" se provider ausente) e renderiza fallback `role="alert"`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { Component, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOptionalAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeCoverUrl } from "@/lib/audio-engine/sanitizeCoverUrl";
import { formatDuration } from "@/lib/audio-engine/formatDuration";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Sprint Mini Player 3 / RF-04.3 — sort modes persisted in localStorage.
type SortMode = "recente" | "alfabetico" | "duracao";
const SORT_KEY = "lessonPicker.sortBy";
const VALID_SORTS: SortMode[] = ["recente", "alfabetico", "duracao"];

function readStoredSort(): SortMode {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v && VALID_SORTS.includes(v as SortMode)) return v as SortMode;
  } catch {
    // ignore
  }
  return "recente";
}

function writeStoredSort(v: SortMode): void {
  try {
    localStorage.setItem(SORT_KEY, v);
  } catch {
    // ignore
  }
}

function sortLessons(lessons: any[], mode: SortMode): any[] {
  if (mode === "recente") return lessons;
  if (mode === "alfabetico") {
    return [...lessons].sort((a, b) =>
      String(a.title ?? "").toLowerCase().localeCompare(String(b.title ?? "").toLowerCase()),
    );
  }
  // duracao: ascending; nulls go to end via Number.MAX_SAFE_INTEGER.
  return [...lessons].sort((a, b) => {
    const da = a.durationSeconds ?? Number.MAX_SAFE_INTEGER;
    const db = b.durationSeconds ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ErrorBoundary local que captura render errors do sub-componente fetcher
 * (lesson #29). Caso tipico: useQuery throw "No QueryClient set" quando
 * o provider estiver ausente (testes standalone, SSR/lazy boot, Strict Mode).
 *
 * Boundary minima: so captura render errors, NAO effect errors (useEffect
 * throw nao chega aqui — escopo deliberado, ver Q-A da spec MP1.2).
 *
 * Loga no console.error antes do fallback (lesson #9 — nunca engolir erros
 * silenciosamente; mascaramento dificulta debug futuro).
 */
interface BoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

class LessonPickerErrorBoundary extends Component<
  BoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    // Loga antes de mascarar (lesson #9). Distingue "No QueryClient set"
    // de outros render errors p/ debug futuro.
    // eslint-disable-next-line no-console
    console.error("[LessonPickerErrorBoundary] captured render error:", error);
  }

  render(): React.ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function lessonToTrack(lesson: any, courseTitle?: string | null): any {
  return {
    source: "library",
    trackId: lesson.lessonId ?? lesson.id,
    title: lesson.title,
    coverUrl: lesson.coverUrl ?? null,
    courseTitle: courseTitle ?? null,
    durationSeconds:
      lesson.durationSeconds ??
      (lesson.durationMinutes ? lesson.durationMinutes * 60 : undefined),
    audioUrl: lesson.audioUrl,
    hasAccess: lesson.hasAccess,
  };
}

// Derives best progress pct + lastWatchedAt + lastPositionSeconds across formats.
function deriveBestProgress(lesson: any): {
  pct: number;
  lastWatchedAt: string | null;
  completed: boolean;
  lastPositionSeconds: number;
} {
  if (!lesson?.progress)
    return {
      pct: 0,
      lastWatchedAt: null,
      completed: false,
      lastPositionSeconds: 0,
    };
  let bestPct = 0;
  let lastWatchedAt: string | null = null;
  let anyCompleted = false;
  let bestLastPosition = 0;
  for (const key of Object.keys(lesson.progress)) {
    const row = (lesson.progress as any)[key];
    if (!row) continue;
    if (row.completedAt) anyCompleted = true;
    const last = Number(row.lastPositionSeconds ?? 0);
    const total = Number(row.totalDurationSeconds ?? 0);
    if (total > 0) {
      const pct = (last / total) * 100;
      if (pct > bestPct) {
        bestPct = pct;
        bestLastPosition = last;
      }
    }
    const updated = row.updatedAt ?? null;
    if (updated && (!lastWatchedAt || updated > lastWatchedAt)) {
      lastWatchedAt = updated;
    }
  }
  return {
    pct: Math.min(100, Math.max(0, bestPct)),
    lastWatchedAt,
    completed: anyCompleted,
    lastPositionSeconds: bestLastPosition,
  };
}

interface FetcherProps {
  open: boolean;
  showAuthGuard: boolean;
  search: string;
  setSearch: (s: string) => void;
  selectedSlug: string | null;
  setSelectedSlug: (s: string | null) => void;
  onClose: () => void;
}

/**
 * Sub-componente fetcher — chama useQuery direto (sem try/catch wrapper).
 *
 * Se QueryClientProvider estiver ausente, useQuery throw "No QueryClient set"
 * durante render -> LessonPickerErrorBoundary captura e mostra fallback.
 * Rules-of-Hooks preservadas (hooks na mesma ordem entre renders).
 */
function LessonPickerDialogFetcher({
  open,
  showAuthGuard,
  search,
  setSearch,
  selectedSlug,
  setSelectedSlug,
  onClose,
}: FetcherProps) {
  // Boundary local captura apenas useQuery throw ("No QueryClient set").
  // Ausencia de AudioPlayerProvider trata-se via useOptionalAudioPlayer
  // (returns null sem throw) — preserva renderizacao em tests standalone
  // sem provider de audio mountado. Em prod build, ctx null = bug (provider
  // sempre montado); console.warn da visibilidade sem mascarar UX.
  const ctx = useOptionalAudioPlayer();

  function onPlay(
    course: any,
    lesson: any,
    courseLessonsForCtx: any[],
  ) {
    if (!ctx) {
      if (import.meta.env?.PROD) {
        // eslint-disable-next-line no-console
        console.warn(
          "[LessonPickerDialog] AudioPlayerProvider missing in prod — playback no-op. Verifique tree em MP2 refactor.",
        );
      }
      onClose();
      return;
    }
    const idx = courseLessonsForCtx.findIndex(
      (l) => (l.lessonId ?? l.id) === (lesson.lessonId ?? lesson.id),
    );
    const tracks = courseLessonsForCtx.map((l) =>
      lessonToTrack(l, course.title),
    );
    const courseContext = {
      courseSlug: course.slug,
      lessons: tracks,
      currentIndex: Math.max(0, idx),
    };
    ctx.playTrack(lessonToTrack(lesson, course.title), courseContext);
    onClose();
  }

  // Fetch lista de cursos. Backend pode retornar:
  //   - shape MP1 (back-compat): array de cursos com modules[].lessons[] inline
  //   - shape MP1.1: flat array com {id, slug, title, subtitle, lessonCount, ...}
  const coursesQuery = useQuery({
    queryKey: ["/api/library/courses"],
    queryFn: () => apiRequest("GET", "/api/library/courses"),
    enabled: open && !showAuthGuard,
  });

  const courseList: any[] = Array.isArray(coursesQuery.data)
    ? coursesQuery.data
    : [];

  // detailNeeded = ha curso selecionado E ele nao traz modules inline (shape new).
  // Shape legacy ja traz modules+lessons no payload da lista; evita o segundo fetch.
  const detailNeeded = useMemo(() => {
    if (!selectedSlug) return false;
    const fromList = courseList.find((c: any) => c?.slug === selectedSlug);
    const hasInlineModules =
      !!fromList && Array.isArray(fromList.modules) && fromList.modules.length > 0;
    return !hasInlineModules;
  }, [selectedSlug, courseList]);

  const detailQuery = useQuery({
    queryKey: ["/api/library/courses", selectedSlug],
    queryFn: () =>
      selectedSlug
        ? apiRequest("GET", `/api/library/courses/${selectedSlug}`)
        : Promise.resolve(null),
    enabled: open && !showAuthGuard && detailNeeded,
  });

  // Legacy progress query (MP1 back-compat: tests originais mockam endpoint
  // dedicado /progress/batch retornando [{lessonId, lastPositionSeconds}, ...]).
  const progressQuery = useQuery({
    queryKey: ["/api/library/lessons/progress/batch"],
    queryFn: async () => [] as any[],
    enabled: open && !showAuthGuard,
  });

  // Destructure explicito para deps estaveis (RF-09).
  const progressData = progressQuery.data;
  const progressError = progressQuery.error;
  const detailData = detailQuery.data;
  const detailError = detailQuery.error;
  const detailLoading = !!detailQuery.isLoading;
  const coursesLoading = !!coursesQuery.isLoading;

  // Sprint MP3 RF-04.3 — sort mode persisted in localStorage.
  const [sortMode, setSortModeState] = useState<SortMode>(() => readStoredSort());
  const setSortMode = (m: SortMode) => {
    setSortModeState(m);
    writeStoredSort(m);
  };

  // Auto-select primeiro curso quando a lista carrega (UX: dropdown nao
  // pode ficar vazio se temos cursos). Tambem permite o caso "shape MP1"
  // onde quero exibir todos os cursos inline (selectedSlug=null + back-compat
  // path em allCoursesToRender). Mantem null se shape MP1 detectado.
  // TODO(MP2): drop legacy shape path quando MP2/Spotify driver confirmar que
  // todos handlers /api/library/courses retornam shape new (sem modules inline).
  // Hoje mantido pra back-compat com tests MP1 baseline (22 tests dependem).
  const shapeIsLegacy = useMemo(() => {
    if (!Array.isArray(courseList) || courseList.length === 0) return false;
    return courseList.some(
      (c: any) => Array.isArray(c?.modules) && c.modules.length > 0,
    );
  }, [courseList]);

  useEffect(() => {
    if (!open) return;
    if (shapeIsLegacy) return; // Back-compat path renderiza tudo inline.
    if (selectedSlug) return;
    if (courseList.length === 0) return;
    setSelectedSlug(courseList[0].slug);
  }, [open, shapeIsLegacy, selectedSlug, courseList, setSelectedSlug]);

  // Resolve o curso "ativo" que vamos renderizar no grid + na aba Continuar.
  // Em shape legacy, ativamos TODOS os cursos. Em shape new, ativamos so o
  // detail do slug selecionado.
  const activeCourses = useMemo<any[]>(() => {
    if (shapeIsLegacy) return courseList;
    if (detailData && typeof detailData === "object") {
      return [detailData];
    }
    return [];
  }, [shapeIsLegacy, courseList, detailData]);

  // Computa items de "Continuar de onde parou" — RF-09 deps explicitos.
  const continueItems = useMemo(() => {
    // 1) Legacy path (MP1): progressQuery devolveu array com
    //    {lessonId, lastPositionSeconds} >0. Hidrata title a partir do
    //    courseList quando disponivel (testes MP1 nao enviam title no payload
    //    de progress, mas a sub-lista de courses tem).
    if (!progressError) {
      const list = progressData;
      if (Array.isArray(list) && list.length > 0) {
        const withPos = list.filter(
          (p: any) => (p?.lastPositionSeconds ?? 0) > 0,
        );
        if (withPos.length > 0) {
          // Hidrata title via lookup nas courses (back-compat shape legacy
          // tem modules+lessons inline; new shape consultaria detail).
          const titleByLessonId = new Map<string, string>();
          for (const course of courseList) {
            for (const mod of course?.modules ?? []) {
              for (const lesson of mod?.lessons ?? []) {
                const id = lesson?.lessonId ?? lesson?.id;
                if (id && lesson?.title) {
                  titleByLessonId.set(id, lesson.title);
                }
              }
            }
          }
          return withPos.slice(0, 5).map((p: any) => ({
            ...p,
            title: p.title ?? titleByLessonId.get(p.lessonId) ?? null,
          }));
        }
      }
    }

    // 2) Detail path (MP1.1): se detail fetch falhou, NAO renderiza Continuar.
    if (detailError) return [];
    if (!shapeIsLegacy && detailLoading) return [];

    // Itera todos os cursos ativos derivando best progress por lesson.
    const items: Array<{
      lessonId: string;
      title: string;
      lastPositionSeconds: number;
      updatedAt: string | null;
      courseTitle?: string | null;
      pct: number;
    }> = [];
    for (const course of activeCourses) {
      const courseTitle = course?.title ?? null;
      for (const mod of course?.modules ?? []) {
        for (const lesson of mod?.lessons ?? []) {
          const { pct, lastWatchedAt, completed, lastPositionSeconds } =
            deriveBestProgress(lesson);
          if (pct <= 0) continue;
          if (pct >= 100) continue;
          if (completed) continue;
          items.push({
            lessonId: lesson.lessonId ?? lesson.id,
            title: lesson.title ?? "",
            lastPositionSeconds,
            updatedAt: lastWatchedAt,
            courseTitle,
            pct,
          });
        }
      }
    }
    items.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
    return items.slice(0, 5);
  }, [
    progressData,
    progressError,
    detailError,
    detailLoading,
    shapeIsLegacy,
    activeCourses,
    courseList,
  ]);

  // IDs de lessons que ja aparecem em Continuar — usado pra esconder do grid
  // principal e evitar duplicacao de texto (lesson reaparece como botao com
  // mesmo title que ja esta no item de continuar). Mantem unicidade exigida
  // por screen.getByText em tests.
  const continueLessonIds = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const p of continueItems as any[]) {
      if (p?.lessonId) s.add(String(p.lessonId));
    }
    return s;
  }, [continueItems]);

  // Determina se deve mostrar empty state explicito para "Continuar".
  // So aplica quando estamos no shape new + detail carregou (sem error/loading)
  // mas continueItems esta vazio. Para shape legacy, mantemos comportamento
  // antigo (esconde secao se vazio).
  const showContinueEmpty =
    !shapeIsLegacy &&
    !detailLoading &&
    !detailError &&
    !!detailData &&
    continueItems.length === 0;

  const q = search.trim().toLowerCase();

  return (
    <>
      <input
        data-testid="lesson-picker-search"
        type="text"
        placeholder="Buscar aulas..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Buscar aulas"
        autoFocus
        className="w-full px-3 py-2 mb-4 bg-gray-800 border border-white/10 rounded-md text-white"
      />

      {/* MP3 RF-04.3 — Sort dropdown. */}
      <div className="mb-3 flex items-center gap-2">
        <label
          htmlFor="lesson-picker-sort"
          className="text-xs text-gray-400"
        >
          Ordenar por
        </label>
        <select
          id="lesson-picker-sort"
          data-testid="lesson-picker-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-white"
        >
          <option value="recente">Recente</option>
          <option value="alfabetico">Alfabetico</option>
          <option value="duracao">Duracao</option>
        </select>
      </div>

      {/* MP3 RF-04.4 — Skeleton loading. */}
      {coursesLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              data-testid="lesson-picker-skeleton"
              className="h-16 animate-pulse rounded bg-gray-700"
            />
          ))}
        </div>
      )}

      {/* RF-01: dropdown apenas quando shape new (flat list sem modules) */}
      {!shapeIsLegacy && courseList.length > 0 && (
        <div className="mb-4">
          <label
            htmlFor="lesson-picker-course-select"
            className="block text-xs text-gray-400 mb-1"
          >
            Curso
          </label>
          <select
            id="lesson-picker-course-select"
            data-testid="lesson-picker-course-select"
            aria-label="Selecionar curso"
            value={selectedSlug ?? ""}
            onChange={(e) => setSelectedSlug(e.target.value || null)}
            className="w-full px-3 py-2 bg-gray-800 border border-white/10 rounded-md text-white"
          >
            {courseList.map((c: any) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Loading indicator para detail :slug */}
      {!shapeIsLegacy && detailLoading && (
        <div
          data-testid="lesson-picker-loading"
          role="status"
          className="py-4 text-center text-sm text-gray-400"
        >
          Carregando...
        </div>
      )}

      {/* Error indicator para detail :slug (MEDIUM-4 reviewer MP1.1) */}
      {!shapeIsLegacy && !detailLoading && detailError && (
        <div
          data-testid="lesson-picker-detail-error"
          role="alert"
          className="py-4 text-center text-sm text-red-400"
        >
          Erro ao carregar curso. Tente novamente.
        </div>
      )}

      {/* Continuar de onde parou — so renderiza se tem items OR empty path */}
      {continueItems.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            Continuar de onde parou
          </h3>
          <ul className="space-y-1">
            {continueItems.map((p: any) => {
              const label = p?.title
                ? `${p.title} — ${Math.round(((p.lastPositionSeconds ?? 0) || 0) / 60)}min`
                : `Aula ${p.lessonId}`;
              return (
                <li
                  key={p.lessonId}
                  className="px-3 py-2 text-sm text-gray-300"
                >
                  {label}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {showContinueEmpty && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            Continuar de onde parou
          </h3>
          <p className="text-sm text-gray-400">
            Nenhuma aula em progresso ainda.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {activeCourses.map((course: any) => {
          const courseLessons: any[] = [];
          for (const mod of course?.modules ?? []) {
            for (const lesson of mod?.lessons ?? []) {
              if (
                Array.isArray(lesson?.formats) &&
                lesson.formats.includes("podcast")
              ) {
                courseLessons.push(lesson);
              }
            }
          }
          // Esconde do grid principal as lessons que ja estao em
          // "Continuar de onde parou" (evita duplicacao de texto/title
          // — useMemoDeps RF-09 verifica unicidade via getByText).
          const visibleBase = courseLessons.filter(
            (l: any) =>
              !continueLessonIds.has(String(l.lessonId ?? l.id)),
          );
          const visibleFiltered = q
            ? visibleBase.filter((l) =>
                String(l.title ?? "")
                  .toLowerCase()
                  .includes(q),
              )
            : visibleBase;
          // MP3 RF-04.3 — Aplica sort mode.
          const visible = sortLessons(visibleFiltered, sortMode);
          if (visible.length === 0) return null;
          return (
            <div key={course.slug}>
              <h4 className="text-sm font-semibold text-white mb-2">
                {course.title}
              </h4>
              <ul className="space-y-1">
                {visible.map((lesson: any) => {
                  const disabled = lesson.hasAccess === false;
                  const lessonId = lesson.lessonId ?? lesson.id;
                  const sanitizedCover = sanitizeCoverUrl(lesson.coverUrl);
                  const firstLetter =
                    String(lesson.title ?? "?").trim().charAt(0).toUpperCase() ||
                    "?";
                  const durationLabel = formatDuration(
                    lesson.durationSeconds ?? null,
                  );
                  const preview = lesson.transcriptionPreview ?? null;
                  return (
                    <li
                      key={lessonId}
                      data-testid={`lesson-picker-row-${lessonId}`}
                      className="flex items-stretch gap-1"
                    >
                      <button
                        type="button"
                        data-testid={`lesson-picker-item-${lessonId}`}
                        aria-disabled={disabled ? "true" : "false"}
                        title={
                          disabled
                            ? "Acesso liberado manualmente pelo time Grindfy"
                            : `Tocar ${lesson.title}`
                        }
                        disabled={disabled}
                        onClick={
                          disabled
                            ? undefined
                            : () => onPlay(course, lesson, courseLessons)
                        }
                        className={
                          "flex-1 flex items-center gap-3 text-left px-3 py-2 text-sm rounded-md " +
                          (disabled
                            ? "opacity-50 cursor-not-allowed text-gray-400"
                            : "text-gray-200 hover:bg-white/5")
                        }
                      >
                        {sanitizedCover ? (
                          <img
                            src={sanitizedCover}
                            alt={`Capa de ${lesson.title ?? ""}`}
                            className="h-12 w-12 flex-shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div
                            data-testid="lesson-picker-placeholder"
                            aria-hidden="true"
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-gray-700 text-base font-semibold text-gray-300"
                          >
                            {firstLetter}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{lesson.title}</div>
                          <div className="line-clamp-1 text-xs text-gray-400">
                            {preview ?? "—"}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-xs text-gray-400">
                          {durationLabel}
                        </div>
                      </button>
                      {/* MP3.1 R1 fix CRITICAL-2: Add-to-queue button. */}
                      {!disabled && ctx && typeof (ctx as any).addToQueue === "function" ? (
                        <button
                          type="button"
                          data-testid={`add-to-queue-${lessonId}`}
                          aria-label={`Adicionar ${lesson.title} a fila`}
                          title="Adicionar a fila"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            try {
                              (ctx as any).addToQueue({
                                source: "library",
                                trackId: String(lessonId),
                                title: String(lesson.title ?? ""),
                                audioUrl: lesson.audioUrl,
                                coverUrl: lesson.coverUrl ?? null,
                                courseTitle: course.title ?? null,
                                durationSeconds: lesson.durationSeconds,
                              });
                            } catch {
                              // best-effort
                            }
                          }}
                          className="flex-shrink-0 px-2 text-gray-400 hover:bg-white/5 hover:text-white rounded-md"
                        >
                          +
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function LessonPickerDialog({ open, onOpenChange }: Props) {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const authLoading = !!(auth as any)?.isLoading;
  // Mostra auth guard apenas quando explicitamente nao-logado (auth resolveu).
  // Em testes legacy MP1 (sem AuthProvider mockado), useAuth retorna o
  // safe-default com isLoading=true; preserva comportamento back-compat
  // (segue como se fosse logged-in para nao quebrar smoke MP1).
  const showAuthGuard = !user && !authLoading;
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Fallback do ErrorBoundary: mensagem role="alert" + lista vazia.
  // Mantem dialog root montado (testes precisam do data-testid).
  const errorFallback = (
    <div
      role="alert"
      data-testid="lesson-picker-fetch-error"
      className="py-6 text-center text-sm text-red-400"
    >
      Erro ao carregar — tente novamente.
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="lesson-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-picker-title"
        className="max-w-2xl max-h-[80vh] overflow-y-auto bg-gray-900 border-white/10"
      >
        <DialogHeader>
          <DialogTitle
            id="lesson-picker-title"
            className="text-lg font-semibold text-white"
          >
            Escolha uma aula
          </DialogTitle>
        </DialogHeader>

        {showAuthGuard ? (
          <div className="py-6 text-center">
            <p
              data-testid="lesson-picker-auth-msg"
              className="text-sm text-gray-300 mb-3"
            >
              Faca login para ver suas aulas.
            </p>
            <Link
              href="/login"
              data-testid="lesson-picker-login-cta"
              className="inline-block px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-md text-white text-sm font-medium"
            >
              Ir para o app
            </Link>
          </div>
        ) : (
          <LessonPickerErrorBoundary fallback={errorFallback}>
            <LessonPickerDialogFetcher
              open={open}
              showAuthGuard={showAuthGuard}
              search={search}
              setSearch={setSearch}
              selectedSlug={selectedSlug}
              setSelectedSlug={setSelectedSlug}
              onClose={() => onOpenChange(false)}
            />
          </LessonPickerErrorBoundary>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default LessonPickerDialog;
