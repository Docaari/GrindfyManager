// =============================================================================
// MetasPage — placar 4DX (/metas) — METAS-1 fatia-1 (ADR-229)
//
// RF-06: NAO renderiza P&L diario / ROI semanal. Lag da WIG so com horizon >=
// quarter. RF-07: cada meta exibe current/target/expectedNow/status.
// O sub-fetcher do placar vive numa ErrorBoundary local (lesson #29) — falha de
// fetch nao derruba a raiz da pagina.
// =============================================================================

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ScoreboardAdherence {
  planned: number | null;
  actual: number;
  skipped: boolean;
  shortfall: number | null;
  overachieved: boolean;
  note: string | null;
}

interface ScoreboardMeasure {
  id: string;
  title: string;
  sourceMetric?: string;
  current: number | null;
  target: number;
  expectedNow: number | null;
  status: string;
  // ADICOES fatia-2 (opcionais; ausentes/null em metas diretas/legadas).
  compliancePct?: number | null;
  dataSufficiency?: "ok" | "low";
  adherence?: ScoreboardAdherence | null;
}

interface ScoreboardWig {
  careerGoalId: string;
  title: string;
  horizon: string;
  current: number | null;
  target: number;
  expectedNow: number | null;
  status: string;
}

interface Scoreboard {
  wigs: ScoreboardWig[];
  measures: ScoreboardMeasure[];
  snapshotsWeek?: string;
}

const HORIZON_RANK: Record<string, number> = { week: 1, month: 2, quarter: 3, season: 4 };
function horizonAtLeastQuarter(horizon: string): boolean {
  return (HORIZON_RANK[horizon] ?? 0) >= HORIZON_RANK.quarter;
}

// ErrorBoundary local: isola o sub-fetcher do placar (lesson #29).
class ScoreboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.error("MetasPage.scoreboard.boundary", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="metas-scoreboard-error" className="text-sm text-muted-foreground">
          Nao foi possivel carregar o placar agora.
        </div>
      );
    }
    return this.props.children;
  }
}

function ScoreboardContent() {
  const { data, isLoading, isError } = useQuery<Scoreboard>({
    queryKey: ["/api/goals/scoreboard"],
    queryFn: async () => (await apiRequest("GET", "/api/goals/scoreboard")) as Scoreboard,
    retry: false,
  });

  if (isLoading) {
    return <div data-testid="metas-scoreboard-loading">Carregando placar...</div>;
  }
  if (isError || !data) {
    return (
      <div data-testid="metas-scoreboard-empty" className="text-sm text-muted-foreground">
        Placar indisponivel.
      </div>
    );
  }

  const wigs = data.wigs ?? [];
  const measures = data.measures ?? [];

  return (
    <div data-testid="metas-scoreboard">
      <section data-testid="metas-wigs">
        <h2 className="text-lg font-semibold">Metas Globais (WIG)</h2>
        {wigs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma WIG ativa.</p>
        ) : (
          <ul>
            {wigs.map((w) => (
              <li key={w.careerGoalId} data-testid={`wig-row-${w.careerGoalId}`}>
                <span>{w.title}</span>
                {horizonAtLeastQuarter(w.horizon) ? (
                  <span data-testid={`wig-lag-value-${w.careerGoalId}`}>
                    {w.current ?? "—"} / {w.target}
                  </span>
                ) : null}
                <span data-testid={`wig-status-${w.careerGoalId}`}>{w.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="metas-measures">
        <h2 className="text-lg font-semibold">Medidas de Direcao</h2>
        {measures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma medida ativa.</p>
        ) : (
          <ul>
            {measures.map((m) => {
              const compliance =
                typeof m.compliancePct === "number" ? `${m.compliancePct}%` : "—";
              const adherenceLabel = m.adherence?.skipped
                ? "pulado conscientemente"
                : (m.adherence?.shortfall ?? 0) > 0
                  ? "abaixo do plano"
                  : null;
              return (
                <li key={m.id} data-testid={`measure-row-${m.id}`}>
                  <span>{m.title}</span>
                  <span data-testid={`measure-current-${m.id}`}>{m.current ?? "—"}</span>
                  <span data-testid={`measure-target-${m.id}`}>{m.target}</span>
                  <span data-testid={`measure-expected-${m.id}`}>{m.expectedNow ?? "—"}</span>
                  <span data-testid={`measure-status-${m.id}`}>{m.status}</span>
                  {/* fatia-2: compliancePct rigoroso (null nunca vira "0%" — lesson #11). */}
                  <span data-testid={`measure-compliance-${m.id}`}>{compliance}</span>
                  {/* amostra fraca — badge so quando dataSufficiency='low'. */}
                  {m.dataSufficiency === "low" ? (
                    <span data-testid={`measure-datasufficiency-${m.id}`}>amostra fraca</span>
                  ) : null}
                  {/* A4: "pulado conscientemente" vs "abaixo do plano" (sem culpa). */}
                  {adherenceLabel ? (
                    <span data-testid={`measure-adherence-${m.id}`}>{adherenceLabel}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function MetasPage() {
  return (
    <div data-testid="metas-page" className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Metas</h1>
        <a href="/metas/nova" data-testid="metas-nova-cta" className="text-sm underline">
          Nova meta
        </a>
      </header>
      <ScoreboardErrorBoundary>
        <ScoreboardContent />
      </ScoreboardErrorBoundary>
    </div>
  );
}

export default MetasPage;
