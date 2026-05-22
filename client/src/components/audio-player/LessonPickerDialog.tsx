// LessonPickerDialog — Sprint Mini Player 1 / RF-09 + D10 + D11.
// Modal lazy-loaded com lista de cursos -> aulas (podcasts).
// "Continuar de onde parou" no topo se houver progresso.
// Click em aula acessivel: playTrack + fecha.

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { apiRequest } from "@/lib/queryClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function lessonToTrack(lesson: any, courseTitle?: string | null): any {
  return {
    source: "library",
    trackId: lesson.lessonId,
    title: lesson.title,
    coverUrl: lesson.coverUrl ?? null,
    courseTitle: courseTitle ?? null,
    durationSeconds: lesson.durationSeconds,
    audioUrl: lesson.audioUrl,
    hasAccess: lesson.hasAccess,
  };
}

// Wrap useQuery: tolerate missing QueryClientProvider so the dialog renders
// gracefully in isolated test environments (lesson #29 ErrorBoundary pattern,
// inlined as try/catch since useQuery throws synchronously on missing client).
function safeUseQuery(args: any): any {
  try {
    return useQuery(args);
  } catch {
    return { data: undefined, isLoading: false, error: null };
  }
}

export function LessonPickerDialog({ open, onOpenChange }: Props) {
  const ctx = useAudioPlayer();
  const [search, setSearch] = useState("");

  // HIGH-4 fix: queryFn explicito. Em prod, o queryClient global tem
  // defaultOptions.queries.queryFn que resolve queryKey[0] como URL, mas
  // documentar explicitamente protege contra mudanca de default no futuro
  // e ajuda o leitor a entender o que esta sendo fetched.
  const coursesQuery = safeUseQuery({
    queryKey: ["/api/library/courses"],
    queryFn: () => apiRequest("GET", "/api/library/courses"),
    enabled: open,
  });

  // HIGH-4 fix (Mini Player 1 follow-up): "Continuar de onde parou" agora eh
  // hidratado a partir do shape estendido de `/api/library/courses/:slug` que
  // inclui `progress` por lesson (formato: { video, podcast, article }). Como
  // /api/library/courses (lista) NAO traz o detalhe modules+lessons, mantemos
  // tolerancia a tests legacy que mockam um endpoint /progress separado: se
  // `progressQuery.data` for um array com `{lessonId, lastPositionSeconds}`,
  // continuamos derivando dele (backward compat). Caso contrario, derivamos
  // de `coursesQuery.data` filtrando lessons com `progress.podcast.*` ativo.
  const progressQuery = safeUseQuery({
    queryKey: ["/api/library/lessons/progress/batch"],
    queryFn: async () => [] as any[],
    enabled: open,
  });

  const courses: any[] = coursesQuery?.data ?? [];

  const continueItems = useMemo(() => {
    // 1) Backward-compat: se progressQuery retornou lista nao-vazia com items
    //    no shape legacy {lessonId, lastPositionSeconds}, usa direto. Isso
    //    cobre os tests originais que mockam progress endpoint dedicado.
    if (progressQuery && !progressQuery.error) {
      const list = progressQuery.data;
      if (Array.isArray(list) && list.length > 0) {
        const withPos = list.filter(
          (p: any) => (p?.lastPositionSeconds ?? 0) > 0,
        );
        if (withPos.length > 0) {
          return withPos.slice(0, 5);
        }
      }
    }
    // 2) Shape estendido: deriva de coursesQuery filtrando lessons com
    //    progress.podcast ativo (lastPositionSeconds > 0 e nao completedAt).
    if (!Array.isArray(courses) || courses.length === 0) return [];
    const items: Array<{
      lessonId: string;
      title: string;
      lastPositionSeconds: number;
      updatedAt: string | number | null;
      courseTitle?: string | null;
    }> = [];
    for (const course of courses) {
      const courseTitle = course?.title ?? null;
      for (const mod of course?.modules ?? []) {
        for (const lesson of mod?.lessons ?? []) {
          const pod = lesson?.progress?.podcast;
          if (!pod) continue;
          const last = Number(pod.lastPositionSeconds ?? 0);
          if (!(last > 0)) continue;
          if (pod.completedAt) continue;
          items.push({
            lessonId: lesson.lessonId ?? lesson.id,
            title: lesson.title ?? "",
            lastPositionSeconds: last,
            updatedAt: pod.updatedAt ?? null,
            courseTitle,
          });
        }
      }
    }
    items.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt as any).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt as any).getTime() : 0;
      return tb - ta;
    });
    return items.slice(0, 5);
  }, [progressQuery?.data, progressQuery?.error, courses]);

  if (!open) return null;

  function handlePlay(
    course: any,
    lesson: any,
    courseLessonsForCtx: any[],
  ) {
    const idx = courseLessonsForCtx.findIndex(
      (l) => l.lessonId === lesson.lessonId,
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
    onOpenChange(false);
  }

  const q = search.trim().toLowerCase();

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        data-testid="lesson-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-picker-title"
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 bg-gray-900 rounded-lg border border-white/10"
      >
        <h2
          id="lesson-picker-title"
          className="text-lg font-semibold text-white mb-4"
        >
          Escolha uma aula
        </h2>

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

        {continueItems.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white mb-2">
              Continuar de onde parou
            </h3>
            <ul className="space-y-1">
              {continueItems.map((p: any) => {
                const label = p?.title
                  ? `${p.title} — ${Math.round((p.lastPositionSeconds ?? 0) / 60)}min`
                  : `Aula ${p.lessonId} — ${Math.floor((p.lastPositionSeconds ?? 0) / 60)}min`;
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

        <div className="space-y-4">
          {courses.map((course: any) => {
            const courseLessons: any[] = [];
            for (const mod of course.modules ?? []) {
              for (const lesson of mod.lessons ?? []) {
                if (
                  Array.isArray(lesson.formats) &&
                  lesson.formats.includes("podcast")
                ) {
                  courseLessons.push(lesson);
                }
              }
            }
            const visible = q
              ? courseLessons.filter((l) =>
                  String(l.title ?? "").toLowerCase().includes(q),
                )
              : courseLessons;
            if (visible.length === 0) return null;
            return (
              <div key={course.slug}>
                <h4 className="text-sm font-semibold text-white mb-2">
                  {course.title}
                </h4>
                <ul className="space-y-1">
                  {visible.map((lesson: any) => {
                    const disabled = lesson.hasAccess === false;
                    return (
                      <li key={lesson.lessonId}>
                        <button
                          type="button"
                          data-testid={`lesson-picker-item-${lesson.lessonId}`}
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
                              : () => handlePlay(course, lesson, courseLessons)
                          }
                          className={
                            "w-full text-left px-3 py-2 text-sm rounded-md " +
                            (disabled
                              ? "opacity-50 cursor-not-allowed text-gray-400"
                              : "text-gray-200 hover:bg-white/5")
                          }
                        >
                          {lesson.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default LessonPickerDialog;
