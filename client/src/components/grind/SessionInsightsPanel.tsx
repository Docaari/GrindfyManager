/**
 * SessionInsightsPanel — Sprint Estudos-Coach-Biblio-2 / RF-4.4
 *
 * Painel "Insights da sessao" exibido pos-finalize de uma sessao /grind-live.
 * Lazy-load via GET /api/coach/session-insights/:sessionId — Coach gera
 * structured insights (top 3 maos, aulas sugeridas, spots, focus stats).
 *
 * Sections:
 *   1. Resumo (summary text)
 *   2. Top maos (max 3) — CTA "Registrar review" (abre StudyLogDialog mode=
 *      hand_review pre-preenchido) + "Adicionar insight"
 *   3. Aulas sugeridas (max 2) — link Wouter /biblioteca/curso/X/Y/play
 *      (lesson #19)
 *   4. Spots gravados (todos) — sugestao por tipo
 *   5. Focus stats highlights
 *
 * Loading -> skeleton; Error -> mensagem + retry; Empty -> mensagem "sessao
 * curta".
 *
 * Botao Regenerar -> POST /api/coach/session-insights/:sessionId/regenerate
 * (rate limit 3/sessao).
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #11 sem decorativos default
 *   #13 apiRequest retorna JSON parseado direto
 *   #19 Wouter href com courseSlug+lessonSlug
 *   #29 sub-tree com useQuery em test renderiza com QueryClientProvider
 *
 * Spec: Docs/specs/estudos-coach-biblio-2.md §RF-4.4
 */

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StudyLogDialog } from "@/components/study/StudyLogDialog";

interface TopHand {
  handId: string;
  title: string;
  rationale: string;
  action: "review" | "study";
  ctaUrl: string;
  handBadge?: "big_pot" | "tilted" | "gto_deviation" | "icm_critical";
}

interface SuggestedLesson {
  lessonId: string;
  title: string;
  courseSlug: string;
  lessonSlug: string;
  rationale: string;
  durationSeconds: number;
}

interface SpotToReview {
  spotId: string;
  label: string;
  suggestedAction: "add_insight" | "link_theme" | "review_later";
}

interface FocusStatHighlight {
  statId: string;
  statName: string;
  occurredCount: number;
  rationale: string;
}

interface InsightsBody {
  summary: string;
  topHands: TopHand[];
  suggestedLessons: SuggestedLesson[];
  spotsToReview: SpotToReview[];
  focusStatsHighlight: FocusStatHighlight[];
}

interface InsightsResponse {
  cached: boolean;
  generatedAt: string;
  expiresAt: string;
  insights: InsightsBody;
}

export interface SessionInsightsPanelProps {
  sessionId: string;
}

const BADGE_LABELS: Record<NonNullable<TopHand["handBadge"]>, string> = {
  big_pot: "Pot grande",
  tilted: "Tilt",
  gto_deviation: "Desvio GTO",
  icm_critical: "ICM critico",
};

const SPOT_ACTION_LABELS: Record<SpotToReview["suggestedAction"], string> = {
  add_insight: "Adicionar insight",
  link_theme: "Vincular tema",
  review_later: "Revisar depois",
};

function isInsightsEmpty(insights: InsightsBody | undefined): boolean {
  if (!insights) return true;
  const noSummary = !insights.summary || insights.summary.trim() === "";
  const noContent =
    (insights.topHands?.length ?? 0) === 0 &&
    (insights.suggestedLessons?.length ?? 0) === 0 &&
    (insights.spotsToReview?.length ?? 0) === 0 &&
    (insights.focusStatsHighlight?.length ?? 0) === 0;
  return noSummary && noContent;
}

export function SessionInsightsPanel({ sessionId }: SessionInsightsPanelProps) {
  const queryKey = React.useMemo(
    () => [`/api/coach/session-insights/${sessionId}`],
    [sessionId],
  );

  const query = useQuery<InsightsResponse>({
    queryKey,
    queryFn: async () =>
      await apiRequest("GET", `/api/coach/session-insights/${sessionId}`),
    retry: false,
    staleTime: 60 * 1000,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () =>
      await apiRequest(
        "POST",
        `/api/coach/session-insights/${sessionId}/regenerate`,
      ),
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey });
      } catch {
        // ignore
      }
    },
  });

  // StudyLogDialog state — quando user clica "Registrar review" pre-preenche
  // starredHandIds (RF-4.4 spec).
  const [reviewDialog, setReviewDialog] = React.useState<{
    open: boolean;
    handId: string | null;
  }>({ open: false, handId: null });

  function openReviewDialog(handId: string): void {
    setReviewDialog({ open: true, handId });
  }

  function closeReviewDialog(): void {
    setReviewDialog({ open: false, handId: null });
  }

  if (query.isLoading) {
    return (
      <div
        data-testid="session-insights-loading"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-3"
      >
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-16 rounded bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        data-testid="session-insights-error"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 text-center space-y-3"
      >
        <p className="text-sm text-gray-300">
          Coach indisponivel agora. Tente novamente em alguns minutos.
        </p>
        <button
          type="button"
          data-testid="session-insights-retry"
          onClick={() => query.refetch()}
          className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const data = query.data;
  const insights = data?.insights;

  if (isInsightsEmpty(insights)) {
    return (
      <div
        data-testid="session-insights-panel"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-6"
      >
        <div
          data-testid="session-insights-empty"
          className="text-center space-y-2"
        >
          <h3 className="text-sm font-semibold text-gray-100">
            Insights da sessao
          </h3>
          <p className="text-sm text-gray-400">
            Sessao curta — sem insights estruturados.
          </p>
        </div>
      </div>
    );
  }

  // Defensive: cap topHands em 3 mesmo se backend mandar mais (test cap-3).
  const topHands = (insights!.topHands ?? []).slice(0, 3);
  const suggestedLessons = (insights!.suggestedLessons ?? []).slice(0, 2);
  const spotsToReview = insights!.spotsToReview ?? [];
  const focusStats = insights!.focusStatsHighlight ?? [];

  return (
    <div
      data-testid="session-insights-panel"
      className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-4"
    >
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-100">
          Insights da sessao
        </h3>
        <button
          type="button"
          data-testid="session-insights-regenerate"
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
          className="px-2 py-1 text-xs rounded border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-60"
        >
          {regenerateMutation.isPending ? "..." : "Regenerar"}
        </button>
      </header>

      {/* Section 1: Resumo */}
      <section
        data-testid="session-insights-summary"
        className="text-sm text-gray-300 leading-relaxed"
      >
        {insights!.summary}
      </section>

      {/* Section 2: Top maos */}
      {topHands.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Top maos para review
          </h4>
          <ul className="space-y-2">
            {topHands.map((h) => (
              <li
                key={h.handId}
                data-testid={`session-insights-top-hand-${h.handId}`}
                className="rounded-md border border-gray-800 bg-gray-950/30 p-3 space-y-2"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  {h.handBadge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                      {BADGE_LABELS[h.handBadge]}
                    </span>
                  )}
                  <h5 className="text-sm font-medium text-gray-100">
                    {h.title}
                  </h5>
                </div>
                <p className="text-xs text-gray-400">{h.rationale}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`session-insights-cta-register-review-${h.handId}`}
                    onClick={() => openReviewDialog(h.handId)}
                    className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500"
                  >
                    Registrar review
                  </button>
                  <Link href={h.ctaUrl}>
                    <a className="px-2 py-1 text-xs rounded border border-gray-700 text-gray-200 hover:bg-gray-800">
                      Adicionar insight
                    </a>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 3: Aulas sugeridas */}
      {suggestedLessons.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Aulas sugeridas
          </h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestedLessons.map((l) => {
              const href = `/biblioteca/curso/${l.courseSlug}/${l.lessonSlug}/play`;
              return (
                <li
                  key={l.lessonId}
                  data-testid={`session-insights-cta-watch-lesson-${l.lessonId}`}
                  className="rounded-md border border-gray-800 bg-gray-950/30"
                >
                  <Link href={href}>
                    <a className="block p-3 hover:bg-gray-900/60 space-y-1">
                      <h5 className="text-sm font-medium text-gray-100">
                        {l.title}
                      </h5>
                      <p className="text-xs text-gray-400">{l.rationale}</p>
                      <span className="text-[10px] text-gray-500">
                        {Math.round(l.durationSeconds / 60)} min
                      </span>
                    </a>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Section 4: Spots gravados */}
      {spotsToReview.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Spots gravados ({spotsToReview.length})
          </h4>
          <ul className="flex flex-wrap gap-2">
            {spotsToReview.map((s) => (
              <li
                key={s.spotId}
                data-testid={`session-insights-spot-${s.spotId}`}
                className="px-2 py-1 text-xs rounded border border-gray-800 bg-gray-950/30 text-gray-200"
              >
                <span className="font-medium">{s.label}</span>
                <span className="ml-1 text-[10px] text-gray-500">
                  · {SPOT_ACTION_LABELS[s.suggestedAction]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 5: Focus stats highlight */}
      {focusStats.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Stats foco da sessao
          </h4>
          <ul className="flex flex-wrap gap-2">
            {focusStats.map((fs) => (
              <li
                key={fs.statId}
                data-testid={`session-insights-focus-stat-${fs.statId}`}
                className="px-2 py-1 text-xs rounded border border-gray-800 bg-gray-950/30 text-gray-200"
              >
                <span className="font-medium">{fs.statName}</span>
                <span className="ml-1 text-[10px] text-gray-500">
                  ×{fs.occurredCount}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* StudyLogDialog para CTA "Registrar review" — pre-preenche
          starredHandIds com o handId clicado. */}
      {reviewDialog.open && reviewDialog.handId && (
        <StudyLogDialog
          open={reviewDialog.open}
          onClose={closeReviewDialog}
          initialMode="hand_review"
          defaultStarredHandIds={[reviewDialog.handId]}
        />
      )}
    </div>
  );
}

export default SessionInsightsPanel;
