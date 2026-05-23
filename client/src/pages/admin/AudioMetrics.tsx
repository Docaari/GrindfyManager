// =============================================================================
// AdminAudioMetrics — Sprint MP-VALIDATION / RF-03.
// Admin-only KPIs do cluster MP + lesson playback + queue + spotify fallback.
// =============================================================================

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type Range = "7d" | "30d" | "90d";

interface AudioMetricsResponse {
  range: Range;
  generatedAt: string;
  kpis: {
    mpDau: number;
    mpWau: number;
    avgListeningTimePerSessionSec: number;
    queueDepthMedian: number;
    queueDepthP95: number;
    spotifyToInternalFallbackRate: number;
    totalPlays: number;
    totalLessonCompletions: number;
  };
  topLessonsCompletion: Array<{
    lessonId: string;
    courseSlug: string;
    lessonSlug: string;
    completionPct: number;
    plays: number;
  }>;
  topLessonsPlays: Array<{
    lessonId: string;
    courseSlug: string;
    lessonSlug: string;
    plays: number;
  }>;
  canaryDrift?: boolean;
}

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function formatMinutes(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0m";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

export default function AdminAudioMetrics(): JSX.Element {
  const [range, setRange] = React.useState<Range>("7d");

  const query = useQuery<AudioMetricsResponse>({
    queryKey: ["admin-audio-metrics", range],
    queryFn: async () =>
      await apiRequest("GET", `/api/admin/audio-metrics?range=${range}`),
    staleTime: 60_000,
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <div
        data-testid="admin-audio-loading"
        className="p-6 text-sm text-gray-400"
      >
        Carregando metricas...
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div
        data-testid="admin-audio-error"
        className="p-6 text-sm text-red-400"
      >
        Metricas indisponiveis temporariamente.
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => query.refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { kpis, topLessonsCompletion, topLessonsPlays, canaryDrift } = query.data;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-white">Metricas de Audio</h1>
        <select
          data-testid="admin-audio-range-select"
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1 text-sm text-gray-200"
        >
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="90d">90d</option>
        </select>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div
          data-testid="admin-audio-kpi-dau"
          className="rounded-lg bg-gray-900 border border-gray-800 p-4"
        >
          <div className="text-xs text-gray-400">DAU</div>
          <div className="text-2xl font-bold text-white">{kpis.mpDau}</div>
        </div>
        <div
          data-testid="admin-audio-kpi-wau"
          className="rounded-lg bg-gray-900 border border-gray-800 p-4"
        >
          <div className="text-xs text-gray-400">WAU</div>
          <div className="text-2xl font-bold text-white">{kpis.mpWau}</div>
        </div>
        <div
          data-testid="admin-audio-kpi-avg-listening"
          className="rounded-lg bg-gray-900 border border-gray-800 p-4"
        >
          <div className="text-xs text-gray-400">Tempo medio / sessao</div>
          <div className="text-2xl font-bold text-white">
            {formatMinutes(kpis.avgListeningTimePerSessionSec)}
          </div>
        </div>
        <div
          data-testid="admin-audio-kpi-fallback-rate"
          className="rounded-lg bg-gray-900 border border-gray-800 p-4"
        >
          <div className="text-xs text-gray-400">Fallback Spotify→Internal</div>
          <div className="text-2xl font-bold text-white">
            {formatPct(kpis.spotifyToInternalFallbackRate)}
          </div>
        </div>
      </section>

      {canaryDrift ? (
        <div
          data-testid="admin-audio-canary-drift"
          className="rounded-md bg-amber-900/30 border border-amber-700 px-3 py-2 text-xs text-amber-300"
        >
          Drift detectado entre eventos legacy (audio_*) e dot-namespace (audio.*).
        </div>
      ) : null}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <table
          data-testid="admin-audio-table-completion"
          className="w-full text-sm text-gray-200 border border-gray-800 rounded-lg overflow-hidden"
        >
          <thead className="bg-gray-900">
            <tr>
              <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
                Lesson (Completion%)
              </th>
              <th className="text-right px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
                %
              </th>
              <th className="text-right px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
                Plays
              </th>
            </tr>
          </thead>
          <tbody>
            {topLessonsCompletion.map((row) => (
              <tr key={row.lessonId} className="border-t border-gray-800">
                <td className="px-3 py-2">
                  {row.courseSlug}/{row.lessonSlug}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatPct(row.completionPct)}
                </td>
                <td className="px-3 py-2 text-right">{row.plays}</td>
              </tr>
            ))}
            {topLessonsCompletion.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                  Sem dados no periodo
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <table
          data-testid="admin-audio-table-plays"
          className="w-full text-sm text-gray-200 border border-gray-800 rounded-lg overflow-hidden"
        >
          <thead className="bg-gray-900">
            <tr>
              <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
                Lesson (Plays)
              </th>
              <th className="text-right px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
                Plays
              </th>
            </tr>
          </thead>
          <tbody>
            {topLessonsPlays.map((row) => (
              <tr key={row.lessonId} className="border-t border-gray-800">
                <td className="px-3 py-2">
                  {row.courseSlug}/{row.lessonSlug}
                </td>
                <td className="px-3 py-2 text-right">{row.plays}</td>
              </tr>
            ))}
            {topLessonsPlays.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-4 text-center text-gray-500">
                  Sem dados no periodo
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
