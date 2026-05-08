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
  // Sprint Spot-Anki-Reentry-3 / RF-4 — campos opcionais (backward compat).
  reentryCandidate?: boolean;
  reentryAlreadyActive?: boolean;
  reentryReason?: string;
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

  // Sprint Spot-Anki-Reentry-3 / RF-4 — selecao de candidatos para bulk add
  // a fila de reentry. Pre-marca todos os addable (nao-active).
  const [reentrySelected, setReentrySelected] = React.useState<
    Record<string, boolean>
  >({});

  // Reset selection quando insights mudam (novo sessionId / regenerate).
  const insightsRef = query.data?.generatedAt;
  React.useEffect(() => {
    const list = query.data?.insights?.spotsToReview ?? [];
    const next: Record<string, boolean> = {};
    for (const s of list) {
      if (s.reentryCandidate && !s.reentryAlreadyActive) {
        next[s.spotId] = true; // pre-marcado
      }
    }
    setReentrySelected(next);
  }, [insightsRef]);

  const bulkReentryMutation = useMutation({
    mutationFn: async (spotIds: string[]) =>
      await apiRequest("POST", "/api/reentry/bulk-from-session", {
        sessionId,
        spotIds,
      }),
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: ["/api/reentry/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reentry/stats"] });
      } catch {
        // ignore
      }
    },
  });

  function toggleReentrySelected(spotId: string): void {
    setReentrySelected((prev) => ({ ...prev, [spotId]: !prev[spotId] }));
  }

  function selectAllReentry(addableIds: string[]): void {
    const next: Record<string, boolean> = { ...reentrySelected };
    for (const id of addableIds) next[id] = true;
    setReentrySelected(next);
  }

  function handleBulkReentryAdd(addableIds: string[]): void {
    const ids = addableIds.filter((id) => reentrySelected[id]);
    const finalIds = ids.length > 0 ? ids : addableIds;
    if (finalIds.length === 0) return;
    const mutateFn =
      (bulkReentryMutation as any).mutateAsync ||
      (bulkReentryMutation as any).mutate;
    void mutateFn(finalIds);
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

  // Sprint Spot-Anki-Reentry-3 / RF-4 — split por reentry candidate.
  const reentryCandidates = spotsToReview.filter(
    (s) => s.reentryCandidate === true,
  );
  const reentryAddable = reentryCandidates.filter(
    (s) => !s.reentryAlreadyActive,
  );
  const reentryAllActive =
    reentryCandidates.length > 0 && reentryAddable.length === 0;

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

      {/* Section 4b: Spots para reentry (Sprint Spot-Anki-Reentry-3 / RF-4) */}
      {spotsToReview.length > 0 && (
        <section
          data-testid="session-insights-reentry-section"
          className="space-y-2"
        >
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Spots para reentry
          </h4>

          {reentryCandidates.length === 0 ? (
            <div
              data-testid="session-insights-reentry-empty"
              className="text-xs text-gray-400"
            >
              Sessao limpa — nenhum spot precisa de revisao espacada agora.
            </div>
          ) : reentryAllActive ? (
            <div
              data-testid="session-insights-reentry-all-active"
              className="text-xs text-gray-400 space-y-1"
            >
              <p>
                Todos os candidatos ja estao na fila de revisao.
              </p>
              <Link href="/estudos/reentry">
                <a
                  href="/estudos/reentry"
                  className="text-green-400 hover:text-green-300 underline"
                >
                  Ver fila /estudos/reentry
                </a>
              </Link>
              <ul className="space-y-1 pt-2">
                {reentryCandidates.map((s) => (
                  <li
                    key={s.spotId}
                    className="flex items-center gap-2 text-[10px] text-gray-500"
                  >
                    <input
                      type="checkbox"
                      data-testid={`session-insights-reentry-checkbox-${s.spotId}`}
                      checked={false}
                      disabled
                      aria-disabled="true"
                      readOnly
                    />
                    <span
                      data-testid={`session-insights-reentry-badge-active-${s.spotId}`}
                      className="text-[10px] px-1 py-0.5 rounded bg-blue-900/40 text-blue-200 border border-blue-700"
                    >
                      Ja ativa
                    </span>
                    <span className="font-medium text-gray-300">
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <ul className="space-y-1.5">
                {reentryCandidates.map((s) => {
                  const disabled = !!s.reentryAlreadyActive;
                  const checked = disabled
                    ? false
                    : !!reentrySelected[s.spotId];
                  return (
                    <li
                      key={s.spotId}
                      className="flex items-start gap-2 rounded border border-gray-800 bg-gray-950/30 p-2"
                    >
                      <input
                        id={`session-insights-reentry-cb-${s.spotId}`}
                        data-testid={`session-insights-reentry-checkbox-${s.spotId}`}
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        aria-disabled={disabled}
                        onChange={() => toggleReentrySelected(s.spotId)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`session-insights-reentry-cb-${s.spotId}`}
                          className="text-xs font-medium text-gray-200 cursor-pointer"
                        >
                          {s.label}
                        </label>
                        {disabled && (
                          <span
                            data-testid={`session-insights-reentry-badge-active-${s.spotId}`}
                            className="ml-2 text-[10px] px-1 py-0.5 rounded bg-blue-900/40 text-blue-200 border border-blue-700"
                          >
                            Ja ativa
                          </span>
                        )}
                        {s.reentryReason && (
                          <div
                            data-testid={`session-insights-reentry-reason-${s.spotId}`}
                            className="text-[10px] text-gray-500 mt-0.5"
                          >
                            {s.reentryReason}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between gap-2 pt-1">
                {reentryAddable.length > 1 && (
                  <button
                    type="button"
                    data-testid="session-insights-reentry-select-all"
                    onClick={() =>
                      selectAllReentry(reentryAddable.map((s) => s.spotId))
                    }
                    className="text-[10px] text-gray-400 hover:text-gray-200"
                  >
                    Selecionar todos
                  </button>
                )}
                <button
                  type="button"
                  data-testid="session-insights-reentry-bulk-add"
                  onClick={() =>
                    handleBulkReentryAdd(
                      reentryAddable.map((s) => s.spotId),
                    )
                  }
                  disabled={bulkReentryMutation.isPending}
                  className="ml-auto px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-60"
                >
                  {bulkReentryMutation.isPending
                    ? "Adicionando..."
                    : "Adicionar a reentry"}
                </button>
              </div>
            </>
          )}
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
