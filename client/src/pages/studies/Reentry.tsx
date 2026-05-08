/**
 * Reentry queue page — Sprint Spot-Anki-Reentry-3 / RF-3.
 *
 * Pagina /estudos/reentry: queue de cards SRS pendentes hoje.
 *
 * Stages:
 *   - loading -> skeleton
 *   - empty   -> texto pedagogico + nextScheduledAt + CTA voltar
 *   - reviewing -> ReentryCard com avancar pos-grade
 *   - done    -> stats sessao apos batch (acertos/total)
 *
 * Atalhos teclado:
 *   1 -> again (Errei)
 *   2 -> hard
 *   3 -> good
 *   4 -> easy
 *   S -> skip
 *   Esc -> volta /estudos
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #19 wouter Link
 *   #29 ErrorBoundary local NO consumer (Studies wraps esta pagina)
 */

import * as React from "react";
import { Link, useLocation } from "wouter";
import { useReentryQueue, type Grade } from "@/hooks/useReentryQueue";
import { ReentryCard } from "@/components/study/ReentryCard";

interface SessionStats {
  correct: number;
  total: number;
  intervals: Array<{ cardId: string; intervalDays: number }>;
}

export function ReentryQueuePage(): React.ReactElement {
  // Hooks first (lesson #1)
  const [, navigate] = useLocation();
  const { queue, isLoading, isError, gradeMutation, skipMutation } =
    useReentryQueue();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [stage, setStage] = React.useState<"loading" | "reviewing" | "done">(
    "loading",
  );
  const [sessionStats, setSessionStats] = React.useState<SessionStats>({
    correct: 0,
    total: 0,
    intervals: [],
  });

  const items = queue?.items ?? [];
  const total = items.length;
  const currentItem = items[activeIndex];

  // Refs para handlers de teclado (evita stale closure).
  const stageRef = React.useRef(stage);
  const currentItemRef = React.useRef(currentItem);
  React.useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  React.useEffect(() => {
    currentItemRef.current = currentItem;
  }, [currentItem]);

  // Determine inicial stage quando a query resolve.
  React.useEffect(() => {
    if (isLoading) {
      setStage("loading");
      return;
    }
    if (total === 0) {
      // se ja completou batch, mantem "done"; senao empty (mesmo testid)
      if (stage !== "done") setStage("reviewing");
    } else {
      setStage("reviewing");
    }
  }, [isLoading, total]);

  const handleGrade = React.useCallback(
    async (grade: Grade) => {
      const cur = currentItemRef.current;
      if (!cur) return;
      try {
        // Usa mutate (nao mutateAsync) por compat com mocks de useMutation
        // que so expoem `mutate`. mutate aqui eh uma Promise no nosso uso
        // (TanStack mutate retorna void, mas await void resolve immediately;
        // o resultado vem via onSuccess no mutationFn). Usamos mutateAsync
        // apenas como tentativa fallback.
        const mutateFn = (gradeMutation as any).mutateAsync ||
          (gradeMutation as any).mutate;
        const result: any = await mutateFn({
          cardId: cur.card.id,
          grade,
        });
        setSessionStats((s) => ({
          correct: s.correct + (grade !== "again" ? 1 : 0),
          total: s.total + 1,
          intervals: [
            ...s.intervals,
            {
              cardId: cur.card.id,
              intervalDays:
                typeof result?.intervalDays === "number"
                  ? result.intervalDays
                  : Number(result?.card?.intervalDays ?? 0),
            },
          ],
        }));

        if (activeIndex + 1 >= total) {
          setStage("done");
        } else {
          setActiveIndex((i) => i + 1);
        }
      } catch {
        // Mutation error — TanStack ja captura; nao avanca card
      }
    },
    [activeIndex, gradeMutation, total],
  );

  const handleSkip = React.useCallback(async () => {
    const cur = currentItemRef.current;
    if (!cur) return;
    try {
      const mutateFn = (skipMutation as any).mutateAsync ||
        (skipMutation as any).mutate;
      await mutateFn({ cardId: cur.card.id });
      if (activeIndex + 1 >= total) {
        setStage("done");
      } else {
        setActiveIndex((i) => i + 1);
      }
    } catch {
      // ignore
    }
  }, [activeIndex, skipMutation, total]);

  // Atalhos de teclado
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    function onKey(e: KeyboardEvent) {
      // ignora atalho se foco em input/textarea
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const inReview = stageRef.current === "reviewing";
      switch (e.key) {
        case "1":
          if (inReview) {
            e.preventDefault();
            void handleGrade("again");
          }
          break;
        case "2":
          if (inReview) {
            e.preventDefault();
            void handleGrade("hard");
          }
          break;
        case "3":
          if (inReview) {
            e.preventDefault();
            void handleGrade("good");
          }
          break;
        case "4":
          if (inReview) {
            e.preventDefault();
            void handleGrade("easy");
          }
          break;
        case "s":
        case "S":
          if (inReview) {
            e.preventDefault();
            void handleSkip();
          }
          break;
        case "Escape":
          // MEDIUM-4 audit fix: nao navegar se foco/target dentro de dialog
          // (Esc deve fechar o dialog primeiro, comportamento Radix nativo).
          if (target?.closest('[role="dialog"]')) {
            return;
          }
          e.preventDefault();
          try {
            navigate("/estudos");
          } catch {
            // ignore
          }
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleGrade, handleSkip, navigate]);

  const pendingCount = queue?.pendingTotal ?? 0;
  const nextScheduledAt = queue?.nextScheduledAt ?? null;

  return (
    <div
      data-testid="reentry-queue-page"
      className="max-w-2xl mx-auto px-4 py-6 space-y-4"
    >
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">
            Revisao espacada
          </h1>
          <p
            data-testid="reentry-queue-pending-count"
            className="text-xs text-gray-400 font-mono"
          >
            {pendingCount}{" "}
            {pendingCount === 1 ? "card pendente" : "cards pendentes"} hoje
          </p>
        </div>
        <Link href="/estudos">
          <a
            href="/estudos"
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            Voltar
          </a>
        </Link>
      </header>

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-700 bg-red-950/40 p-4 text-sm text-red-300"
        >
          Erro ao carregar fila de revisao. Tente novamente em alguns
          minutos.
        </div>
      )}

      {isLoading && (
        <div
          data-testid="reentry-queue-loading"
          className="rounded-lg border border-gray-700 bg-gray-900/40 p-6 space-y-3"
        >
          <div className="h-6 w-40 rounded bg-gray-800 animate-pulse" />
          <div className="h-40 rounded bg-gray-800 animate-pulse" />
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-10 rounded bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !isError && total === 0 && stage !== "done" && (
        <div
          data-testid="reentry-queue-empty"
          className="rounded-lg border border-gray-700 bg-gray-900/40 p-6 text-center space-y-3"
        >
          <h2 className="text-base font-semibold text-gray-100">
            Nenhum card pendente
          </h2>
          <p className="text-sm text-gray-400">
            Volte amanha — sua memoria de longo prazo agradece. Crie novos
            cards via /grind-live (paste de spot) ou /estudos/spots.
          </p>
          {nextScheduledAt && (
            <p
              data-testid="reentry-queue-next-scheduled"
              className="text-xs text-gray-500"
            >
              Proximo card agendado para{" "}
              {new Date(nextScheduledAt).toLocaleString()}
            </p>
          )}
          <p
            data-testid="reentry-queue-empty-pedagogic"
            className="text-[10px] text-gray-500 leading-relaxed pt-2 border-t border-gray-800"
          >
            Tip: marque insights nos seus spots para que cards sejam criados
            automaticamente. Cards revisados regularmente fixam padroes na
            memoria de longo prazo (Anki applied to poker).
          </p>
          <Link href="/estudos">
            <a
              href="/estudos"
              data-testid="reentry-queue-cta-back"
              className="inline-block px-3 py-1.5 text-xs font-medium rounded border border-gray-700 text-gray-200 hover:bg-gray-800"
            >
              Voltar para /estudos
            </a>
          </Link>
        </div>
      )}

      {!isLoading && !isError && total > 0 && stage === "reviewing" && currentItem && (
        <div data-testid="reentry-queue-reviewing">
          <ReentryCard
            data={currentItem}
            index={activeIndex}
            total={total}
            onGrade={handleGrade}
            onSkip={handleSkip}
            isPending={gradeMutation.isPending || skipMutation.isPending}
          />
        </div>
      )}

      {stage === "done" && (
        <div
          data-testid="reentry-queue-done"
          className="rounded-lg border border-green-700 bg-green-950/30 p-6 text-center space-y-3"
        >
          <h2 className="text-base font-semibold text-green-200">
            Sessao concluida
          </h2>
          <p
            data-testid="reentry-queue-done-stats"
            className="text-sm text-gray-300"
          >
            Voce acertou {sessionStats.correct} de {sessionStats.total}{" "}
            cards.
            {sessionStats.intervals.length > 0 && (
              <span className="block text-[10px] text-gray-500 mt-1">
                Proxima revisao em{" "}
                {Math.min(
                  ...sessionStats.intervals.map((i) => i.intervalDays || 1),
                )}
                d
              </span>
            )}
          </p>
          <Link href="/estudos">
            <a
              href="/estudos"
              className="inline-block px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500"
            >
              Voltar para /estudos
            </a>
          </Link>
        </div>
      )}

      {/* Help text atalhos (visivel apenas em reviewing) */}
      {stage === "reviewing" && total > 0 && (
        <div className="text-[10px] text-gray-500 font-mono text-center pt-2">
          Atalhos: 1=Errei · 2=Dificil · 3=Acertei · 4=Facil · S=Pular · Esc=Sair
        </div>
      )}
    </div>
  );
}

export default ReentryQueuePage;
