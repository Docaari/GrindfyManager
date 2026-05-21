/**
 * BibliotecaRecommendationsCard — Sprint Estudos-Coach-Biblio-2 / RF-2.5
 *
 * Card "Aulas recomendadas pra voce" que cruza top 3 leaks do user com
 * `study_themes.linkedLessons`. Renderizado em /home (apos FocusStatsCard) e
 * /estudos (header dashboard).
 *
 * Empty states:
 *   - Sem leaks ou recomendacoes vazias  -> CTA "Selecionar 3 stats em foco"
 *     navegando /estudos/stats.
 *
 * Refresh button -> POST /api/biblioteca/recommendations/refresh + invalida
 * cache TanStack.
 *
 * Lessons aplicadas:
 *   #1  hooks first (early return depois de hooks)
 *   #2  data-testid estaveis
 *   #11 sem decorativos default — empty state distinto + sem cards quando
 *       isError silent
 *   #13 apiRequest retorna JSON parseado direto
 *   #19 link Wouter usa courseSlug + lessonSlug (rota
 *       /biblioteca/curso/:courseSlug/:lessonSlug/play)
 *   #21 cache server-side server-side, no client invalidamos via TanStack
 *
 * Spec: Docs/specs/estudos-coach-biblio-2.md §RF-2.4 + §RF-2.5
 */

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { tokens } from "@/lib/ui-tokens";

interface RecLeak {
  statId: string;
  statName: string;
  value: number;
  benchmark: number;
  delta: number;
  severity: number;
}

interface RecTheme {
  id: string;
  name: string;
  slug: string;
  isCurated: boolean;
}

interface RecLesson {
  id: string;
  title: string;
  courseSlug: string;
  lessonSlug: string;
  durationSeconds: number;
  thumbnailUrl?: string | null;
  watchedPct?: number;
}

interface RecResponse {
  recommendations: Array<{
    leak: RecLeak;
    theme: RecTheme;
    lessons: RecLesson[];
  }>;
  generatedAt: string;
  cacheExpiresAt: string;
  cacheHit?: boolean;
}

export interface BibliotecaRecommendationsCardProps {
  placement: "home" | "estudos";
}

const QUERY_KEY = ["/api/biblioteca/recommendations"] as const;

function formatMinutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
}

function severityBadgeClass(severity: number): string {
  if (severity >= 8) return "bg-red-500/20 text-red-300 border-red-500/40";
  // RF-06 (UX-QW-3): triplet semantico "warn" -> tokens.color.warn.
  if (severity >= 5) return `${tokens.color.warn.bg} ${tokens.color.warn.text} ${tokens.color.warn.border}`;
  return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
}

export function BibliotecaRecommendationsCard({
  placement,
}: BibliotecaRecommendationsCardProps) {
  const [, navigate] = useLocation();

  const query = useQuery<RecResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () =>
      await apiRequest("GET", "/api/biblioteca/recommendations"),
    staleTime: 60 * 1000,
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: async () =>
      await apiRequest("POST", "/api/biblioteca/recommendations/refresh"),
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } catch {
        // ignore — TanStack ja deve estar inicializado
      }
    },
  });

  // Lesson #11 + spec RF-2.4: silent fail quando isError (card nao renderiza).
  if (query.isError) {
    return null;
  }

  if (query.isLoading) {
    return (
      <div
        data-testid="biblioteca-recommendations-card-skeleton"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-3"
      >
        <div className="h-4 w-1/3 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-32 rounded-lg bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const data = query.data;
  const recommendations = data?.recommendations ?? [];

  // Empty state (RF-2.4): sem leaks/recomendacoes -> CTA stats-analyzer.
  if (recommendations.length === 0) {
    return (
      <div
        data-testid="biblioteca-recommendations-card"
        data-placement={placement}
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-4"
      >
        <div
          data-testid="biblioteca-recommendations-empty-no-stats"
          className="text-center space-y-3 py-6"
        >
          <h3 className="text-sm font-semibold text-gray-200">
            Aulas recomendadas pra voce
          </h3>
          <p className="text-sm text-gray-400">
            Selecione 3 stats em foco em /stats-analyzer pra receber
            recomendacoes.
          </p>
          <button
            type="button"
            data-testid="biblioteca-recommendations-empty-cta"
            onClick={() => navigate("/estudos/stats")}
            className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500"
          >
            Selecionar 3 stats
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="biblioteca-recommendations-card"
      data-placement={placement}
      className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-3"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">
          Aulas recomendadas pra voce
        </h3>
        <button
          type="button"
          data-testid="biblioteca-recommendations-refresh"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          aria-label="Atualizar recomendacoes"
          className="text-xs text-gray-400 hover:text-white"
        >
          {refreshMutation.isPending ? "..." : "Atualizar"}
        </button>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recommendations.map((rec) => {
          const lesson = rec.lessons[0];
          if (!lesson) return null;
          const watchedPct = Math.round((lesson.watchedPct ?? 0) * 100);
          const href = `/biblioteca/curso/${lesson.courseSlug}/${lesson.lessonSlug}/play`;
          return (
            <li
              key={lesson.id}
              data-testid={`biblioteca-recommendations-card-item-${lesson.id}`}
              className="rounded-md border border-gray-800 bg-gray-950/40 overflow-hidden"
            >
              <Link href={href}>
                <a className="block p-3 space-y-2 hover:bg-gray-900/60 transition-colors">
                  {lesson.thumbnailUrl && (
                    <img
                      src={lesson.thumbnailUrl}
                      alt=""
                      className="w-full aspect-video object-cover rounded"
                    />
                  )}
                  <h4 className="text-sm font-medium text-white line-clamp-2">
                    {lesson.title}
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                      Tema: {rec.theme.name}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded border ${severityBadgeClass(rec.leak.severity)}`}
                    >
                      Leak: {rec.leak.delta}
                    </span>
                  </div>
                  {watchedPct > 0 && (
                    <div
                      className="text-xs text-gray-400"
                      aria-label={`${watchedPct}% assistido`}
                    >
                      <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${watchedPct}%` }}
                        />
                      </div>
                      <span>{watchedPct}% assistido</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    {formatMinutes(lesson.durationSeconds)}
                  </div>
                </a>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default BibliotecaRecommendationsCard;
