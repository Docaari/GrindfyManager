/**
 * SrsStatsCard — Sprint Spot-Anki-Reentry-3 / RF-5.
 *
 * Widget compacto para o Dashboard /estudos. Exibe 4 metricas SRS:
 *   - Pendentes hoje
 *   - Revisados (7 dias)
 *   - Acerto (7 dias) %
 *   - Streak dias
 *
 * + Link "Ver" para /estudos/reentry. Empty state pedagogico quando user nao
 * tem cards e nao revisou nada nos ultimos 7d.
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #19 wouter Link href em formato registrado
 *   #29 ErrorBoundary local: query falha -> fallback silencioso (nao crasha
 *       o dashboard inteiro).
 */

import * as React from "react";
import { Link } from "wouter";
import { useSrsStats } from "@/hooks/useSrsStats";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class StatsErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_err: unknown): void {
    // Silencioso — widget secundario nao deve quebrar tela
  }

  render() {
    if (this.state.hasError) {
      // Fallback silencioso — render null para nao poluir UI
      return null;
    }
    return this.props.children;
  }
}

function SrsStatsCardInner(): React.ReactElement | null {
  const { stats, isLoading, isError } = useSrsStats();

  if (isLoading) {
    return (
      <div
        data-testid="srs-stats-card"
        className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-3"
      >
        <div
          data-testid="srs-stats-card-loading"
          className="space-y-2"
        >
          <div className="h-4 w-24 rounded bg-gray-800 animate-pulse" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-12 rounded bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    // Lesson #29: silencioso (nao polui dashboard)
    return null;
  }

  const pending = stats?.pendingToday ?? 0;
  const reviewed = stats?.reviewedLast7Days ?? 0;
  const accuracyRaw = stats?.accuracyLast7Days ?? 0;
  const accuracyPct = Number.isFinite(accuracyRaw)
    ? Math.round(accuracyRaw * 100)
    : 0;
  const streak = stats?.streakDays ?? 0;

  const showEmpty = pending === 0 && reviewed === 0;

  return (
    <div
      data-testid="srs-stats-card"
      className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-3"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100">
          Cards SRS
        </h3>
        <Link href="/estudos/reentry">
          <a
            data-testid="srs-stats-card-link"
            href="/estudos/reentry"
            className="text-xs text-green-400 hover:text-green-300"
          >
            Ver
          </a>
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-gray-950/40 border border-gray-800 p-2">
          <div className="text-[10px] uppercase text-gray-400 tracking-wide">
            Pendentes hoje
          </div>
          <div
            data-testid="srs-stats-pending-today"
            className="text-lg font-bold text-gray-100"
          >
            {pending}
          </div>
        </div>
        <div className="rounded-md bg-gray-950/40 border border-gray-800 p-2">
          <div className="text-[10px] uppercase text-gray-400 tracking-wide">
            Revisados (7d)
          </div>
          <div
            data-testid="srs-stats-reviewed-7d"
            className="text-lg font-bold text-gray-100"
          >
            {reviewed}
          </div>
        </div>
        <div className="rounded-md bg-gray-950/40 border border-gray-800 p-2">
          <div className="text-[10px] uppercase text-gray-400 tracking-wide">
            Acerto (7d)
          </div>
          <div
            data-testid="srs-stats-accuracy"
            className="text-lg font-bold text-gray-100"
          >
            {accuracyPct}%
          </div>
        </div>
        <div className="rounded-md bg-gray-950/40 border border-gray-800 p-2">
          <div className="text-[10px] uppercase text-gray-400 tracking-wide">
            Streak
          </div>
          <div
            data-testid="srs-stats-streak"
            className="text-lg font-bold text-gray-100"
          >
            {streak} {streak === 1 ? "dia" : "dias"}
          </div>
        </div>
      </div>

      {showEmpty && (
        <div
          data-testid="srs-stats-card-empty"
          className="text-xs text-gray-400 leading-relaxed"
        >
          Marque insights nos seus spots para ativar a fila de revisao
          espacada. Cole prints em /grind-live ou abra um spot em
          /estudos/spots.
        </div>
      )}
    </div>
  );
}

export function SrsStatsCard(): React.ReactElement {
  return (
    <StatsErrorBoundary>
      <SrsStatsCardInner />
    </StatsErrorBoundary>
  );
}

export default SrsStatsCard;
