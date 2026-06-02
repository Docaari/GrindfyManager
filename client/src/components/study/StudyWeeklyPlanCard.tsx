/**
 * StudyWeeklyPlanCard — Sprint Estudos-Coach-Biblio-2 / RF-3.6
 *
 * Card "Plano da semana" em /estudos. 5 dias (mon..fri) x 3-4 atividades cada.
 *
 * Estados:
 *   - Loading -> skeleton
 *   - Empty (sem plano)  -> CTA "Gerar plano agora" -> POST regenerate
 *   - Carregado  -> 5 dias horizontais + checkboxes + counter "X/Y" + botao
 *     Regenerar
 *
 * Endpoints consumidos:
 *   GET   /api/study-weekly-plan
 *   POST  /api/study-weekly-plan/regenerate
 *   PATCH /api/study-weekly-plan/items/:itemId/toggle
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estaveis (study-weekly-plan-day-{label}, *-item-{id},
 *       *-item-checkbox-{id}, *-progress-counter, *-empty, *-generate-cta,
 *       *-regenerate)
 *   #11 sem decorativos default — empty state explicito
 *   #13 apiRequest retorna JSON parseado direto
 *
 * Spec: Docs/specs/estudos-coach-biblio-2.md §RF-3.5 + §RF-3.6
 */

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

type DayLabel = "mon" | "tue" | "wed" | "thu" | "fri";

const DAY_LABELS: Record<DayLabel, string> = {
  mon: "Seg",
  tue: "Ter",
  wed: "Qua",
  thu: "Qui",
  fri: "Sex",
};

const DAY_ORDER: DayLabel[] = ["mon", "tue", "wed", "thu", "fri"];

interface PlanActivity {
  itemId: string;
  type:
    | "drill_gto"
    | "lesson"
    | "hand_review"
    | "theory_read"
    | "snapshot_review"
    | "other";
  title: string;
  description?: string;
  estimatedMinutes: number;
  ctaTarget: string | null;
  themeId: string | null;
  lessonId: string | null;
  handIds?: string[];
  reasoning?: string;
}

interface PlanDay {
  dayLabel: DayLabel;
  date: string;
  activities: PlanActivity[];
}

interface PlanResponse {
  id: string;
  userId: string;
  weekStartDate: string;
  source: "coach_auto" | "coach_manual";
  dailyTargetMinutes: number;
  generatedAt: string;
  completedItemsJsonb: string[];
  planJsonb: { days: PlanDay[] };
}

const QUERY_KEY = ["/api/study-weekly-plan"] as const;

const TYPE_LABELS: Record<PlanActivity["type"], string> = {
  drill_gto: "Drill",
  lesson: "Aula",
  hand_review: "Mao",
  theory_read: "Teoria",
  snapshot_review: "Snapshot",
  other: "Outro",
};

export function StudyWeeklyPlanCard() {
  const query = useQuery<PlanResponse | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // Sprint Estudos-UX-Fix BUG-D: 404 = "sem plano nesta semana" (estado
      // legitimo de quem nunca gerou plano), NAO um erro. Sem este catch o 404
      // cai no branch query.isError e o card mostra "Nao consegui carregar seu
      // plano" pra todo usuario sem plano. Erros reais (500/timeout) ainda
      // propagam -> error state com retry.
      try {
        const r = await apiRequest("GET", "/api/study-weekly-plan");
        return r ?? null;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    staleTime: 30 * 1000,
    retry: false,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () =>
      await apiRequest("POST", "/api/study-weekly-plan/regenerate"),
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } catch {
        // ignore
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (vars: { itemId: string; completed: boolean }) =>
      await apiRequest(
        "PATCH",
        `/api/study-weekly-plan/items/${vars.itemId}/toggle`,
        { completed: vars.completed },
      ),
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } catch {
        // ignore
      }
    },
  });

  if (query.isLoading) {
    return (
      <div
        data-testid="study-weekly-plan-card-skeleton"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-3"
      >
        <div className="h-5 w-1/2 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="h-32 rounded-md bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  // MEDIUM-4 fix (review): error state explicito. Antes query.isError caia em
  // `data ?? null` -> renderizava empty state, ocultando que houve falha real
  // (ex: 500/timeout do Coach). Agora mostramos retry CTA semelhante a
  // SessionInsightsPanel.
  if (query.isError) {
    return (
      <div
        data-testid="study-weekly-plan-card"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-6"
      >
        <div
          data-testid="study-weekly-plan-error"
          className="text-center space-y-3"
        >
          <h3 className="text-base font-semibold text-gray-100">
            Plano da semana
          </h3>
          <p className="text-sm text-gray-300">
            Nao consegui carregar seu plano. Tente novamente em alguns instantes.
          </p>
          <button
            type="button"
            data-testid="study-weekly-plan-retry"
            onClick={() => query.refetch()}
            className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const plan = query.data ?? null;

  if (!plan) {
    return (
      <div
        data-testid="study-weekly-plan-card"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-6"
      >
        <div
          data-testid="study-weekly-plan-empty"
          className="text-center space-y-3"
        >
          <h3 className="text-base font-semibold text-gray-100">
            Plano da semana
          </h3>
          <p className="text-sm text-gray-400">
            Plano da semana eh gerado toda segunda-feira automaticamente.
          </p>
          <button
            type="button"
            data-testid="study-weekly-plan-generate-cta"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-60"
          >
            {regenerateMutation.isPending ? "Gerando..." : "Gerar plano agora"}
          </button>
        </div>
      </div>
    );
  }

  const completed = new Set(plan.completedItemsJsonb ?? []);
  const allActivities: PlanActivity[] = [];
  for (const day of plan.planJsonb?.days ?? []) {
    for (const a of day.activities) allActivities.push(a);
  }
  const totalCount = allActivities.length;
  const completedCount = allActivities.filter((a) =>
    completed.has(a.itemId),
  ).length;

  // Order days conforme DAY_ORDER (defensive — caso backend retorne fora de ordem).
  const daysByLabel = new Map<DayLabel, PlanDay>();
  for (const d of plan.planJsonb?.days ?? []) {
    daysByLabel.set(d.dayLabel, d);
  }

  return (
    <div
      data-testid="study-weekly-plan-card"
      className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-4"
    >
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-100">
          Plano da semana
        </h3>
        <div className="flex items-center gap-3">
          <span
            data-testid="study-weekly-plan-progress-counter"
            className="text-xs text-gray-400"
          >
            {completedCount} / {totalCount} concluidos
          </span>
          <button
            type="button"
            data-testid="study-weekly-plan-regenerate"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="px-2 py-1 text-xs rounded border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-60"
          >
            {regenerateMutation.isPending ? "..." : "Regenerar"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {DAY_ORDER.map((label) => {
          const day = daysByLabel.get(label);
          const activities = day?.activities ?? [];
          const dayMinutes = activities.reduce(
            (acc, a) => acc + (a.estimatedMinutes || 0),
            0,
          );
          return (
            <section
              key={label}
              data-testid={`study-weekly-plan-day-${label}`}
              className="rounded-md border border-gray-800 bg-gray-950/30 p-3 space-y-2"
            >
              <header className="flex items-baseline justify-between">
                <h4 className="text-sm font-semibold text-gray-100">
                  {DAY_LABELS[label]}
                </h4>
                <span className="text-[10px] text-gray-500">
                  {dayMinutes}m
                </span>
              </header>
              <ul className="space-y-1.5">
                {activities.map((a) => {
                  const isChecked = completed.has(a.itemId);
                  return (
                    <li
                      key={a.itemId}
                      data-testid={`study-weekly-plan-item-${a.itemId}`}
                      className="text-xs text-gray-200 flex items-start gap-2"
                    >
                      <input
                        type="checkbox"
                        data-testid={`study-weekly-plan-item-checkbox-${a.itemId}`}
                        checked={isChecked}
                        onChange={(e) =>
                          toggleMutation.mutate({
                            itemId: a.itemId,
                            completed: e.target.checked,
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="flex-1">
                        <span
                          className={isChecked ? "line-through text-gray-500" : ""}
                        >
                          {a.title}
                        </span>
                        <span className="text-[10px] text-gray-500 ml-1">
                          ({a.estimatedMinutes}m · {TYPE_LABELS[a.type]})
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default StudyWeeklyPlanCard;
