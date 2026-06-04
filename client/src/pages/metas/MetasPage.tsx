// =============================================================================
// MetasPage — placar 4DX + calendario de metas (/metas) — ADR-229 + ADR-241
//
// RF-06: NAO renderiza P&L diario / ROI semanal. Lag da WIG so com horizon >=
// quarter. RF-07: cada meta exibe current/target/expectedNow/status + grafico
// planejado×executado. Aba Calendario: relatorio diario por dia (processo).
// O sub-fetcher do placar vive numa ErrorBoundary local (lesson #29).
// Tabs controladas com onClick redundante (lesson #27 — RTL fireEvent.click).
// =============================================================================

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MeasureLineChart } from "@/components/metas/MeasureLineChart";
import { GoalsCalendar, type DailyLogLite } from "@/components/metas/GoalsCalendar";
import { GoalDayReportModal } from "@/components/metas/GoalDayReportModal";

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

// Rotulo + cor por status (UI). Mantem os valores crus nos data-testid.
const STATUS_META: Record<string, { label: string; cls: string }> = {
  ahead: { label: "Adiantado", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-600/40" },
  on_track: { label: "No ritmo", cls: "bg-sky-500/15 text-sky-400 border-sky-600/40" },
  behind: { label: "Atrasado", cls: "bg-amber-500/15 text-amber-400 border-amber-600/40" },
  at_risk: { label: "Em risco", cls: "bg-red-500/15 text-red-400 border-red-600/40" },
  achieved: { label: "Concluido", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50" },
};
function StatusBadge({ status, testid }: { status: string; testid: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      {/* status cru preservado p/ contrato de teste; rotulo PT visivel. */}
      <span className="sr-only">{status}</span>
      <span aria-hidden="true">{meta.label}</span>
    </span>
  );
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
    <div data-testid="metas-scoreboard" className="space-y-6">
      <section data-testid="metas-wigs" className="space-y-3">
        <h2 className="text-lg font-semibold">Metas Globais (WIG)</h2>
        {wigs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma WIG ativa. Comece definindo sua meta global "de X para Y ate quando".
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {wigs.map((w) => (
              <Card key={w.careerGoalId} data-testid={`wig-row-${w.careerGoalId}`}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{w.title}</span>
                    <StatusBadge status={w.status} testid={`wig-status-${w.careerGoalId}`} />
                  </div>
                  {horizonAtLeastQuarter(w.horizon) ? (
                    <p className="text-sm text-muted-foreground" data-testid={`wig-lag-value-${w.careerGoalId}`}>
                      {w.current ?? "—"} / {w.target}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section data-testid="metas-measures" className="space-y-3">
        <h2 className="text-lg font-semibold">Medidas de Direcao</h2>
        {measures.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma medida ativa. Medidas sao o que voce controla — volume, horas de estudo, rotina.
          </p>
        ) : (
          <div className="space-y-3">
            {measures.map((m) => {
              const compliance =
                typeof m.compliancePct === "number" ? `${m.compliancePct}%` : "—";
              const adherenceLabel = m.adherence?.skipped
                ? "pulado conscientemente"
                : (m.adherence?.shortfall ?? 0) > 0
                  ? "abaixo do plano"
                  : null;
              return (
                <Card key={m.id} data-testid={`measure-row-${m.id}`}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{m.title}</span>
                      <StatusBadge status={m.status} testid={`measure-status-${m.id}`} />
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        Atual: <strong data-testid={`measure-current-${m.id}`} className="text-foreground">{m.current ?? "—"}</strong>
                      </span>
                      <span>
                        Alvo: <strong data-testid={`measure-target-${m.id}`} className="text-foreground">{m.target}</strong>
                      </span>
                      <span>
                        Esperado agora: <strong data-testid={`measure-expected-${m.id}`} className="text-foreground">{m.expectedNow ?? "—"}</strong>
                      </span>
                      {/* fatia-2: compliancePct rigoroso (null nunca vira "0%" — lesson #11). */}
                      <span>
                        Aderencia: <strong data-testid={`measure-compliance-${m.id}`} className="text-foreground">{compliance}</strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {m.dataSufficiency === "low" ? (
                        <span
                          data-testid={`measure-datasufficiency-${m.id}`}
                          className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
                        >
                          amostra fraca
                        </span>
                      ) : null}
                      {adherenceLabel ? (
                        <span
                          data-testid={`measure-adherence-${m.id}`}
                          className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {adherenceLabel}
                        </span>
                      ) : null}
                    </div>
                    {/* Grafico planejado×executado (ADR-241). */}
                    <MeasureLineChart goalId={m.id} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Calendario — relatorio diario por dia (ADR-241).
// ---------------------------------------------------------------------------
function monthRange(d: Date): { from: string; to: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const ymd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: ymd(first), to: ymd(last) };
}

function CalendarTab() {
  const [range, setRange] = useState(() => monthRange(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ logs: DailyLogLite[] }>({
    queryKey: ["/api/goals/daily-logs", range.from, range.to],
    queryFn: async () =>
      (await apiRequest("GET", `/api/goals/daily-logs?from=${range.from}&to=${range.to}`)) as {
        logs: DailyLogLite[];
      },
    retry: false,
  });

  const logsByDate: Record<string, DailyLogLite> = {};
  for (const log of data?.logs ?? []) {
    if (log?.logDate) logsByDate[String(log.logDate).slice(0, 10)] = { ...log, logDate: String(log.logDate).slice(0, 10) };
  }

  return (
    <div data-testid="metas-calendar-tab" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Clique num dia para registrar o relatorio: medidas exercidas, torneios, estudo e aprendizados.
        Foco no processo — sem resultado financeiro.
      </p>
      {isLoading ? (
        <div data-testid="metas-calendar-loading" className="text-sm text-muted-foreground">
          Carregando calendario...
        </div>
      ) : isError ? (
        <div data-testid="metas-calendar-error" className="text-sm text-muted-foreground">
          Nao foi possivel carregar o calendario agora.
        </div>
      ) : null}
      <GoalsCalendar
        logsByDate={logsByDate}
        onDayClick={setSelectedDate}
        onMonthChange={(from, to) => setRange({ from, to })}
      />
      <GoalDayReportModal date={selectedDate} onClose={() => setSelectedDate(null)} />
    </div>
  );
}

export function MetasPage() {
  const [tab, setTab] = useState("placar");
  return (
    <div data-testid="metas-page" className="p-6">
      <PageHeader
        title="Metas"
        subtitle="Sua WIG, as medidas de direcao que voce controla e o relatorio diario do processo."
        actions={
          <Link href="/metas/nova">
            <Button data-testid="metas-nova-cta">Nova meta</Button>
          </Link>
        }
      />
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="placar" data-testid="metas-tab-placar" onClick={() => setTab("placar")}>
            Placar
          </TabsTrigger>
          <TabsTrigger value="calendario" data-testid="metas-tab-calendario" onClick={() => setTab("calendario")}>
            Calendario
          </TabsTrigger>
        </TabsList>
        <TabsContent value="placar" className="mt-4">
          <ScoreboardErrorBoundary>
            <ScoreboardContent />
          </ScoreboardErrorBoundary>
        </TabsContent>
        <TabsContent value="calendario" className="mt-4">
          <CalendarTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MetasPage;
