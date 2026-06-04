// =============================================================================
// MetasPage — placar 4DX em PAGINA UNICA (/metas) — ADR-229 + ADR-241 (M1-M12)
//
// Narrativa 4DX descendente (sem abas): Hero "Placar da Semana" (veredito) →
// WIG (norte) → Medidas (controle, barra de pace) → Calendario (cadencia).
// RF-06: zero P&L/ROI. Testids preservados (contrato metas-1/metas-2).
// Sub-fetcher do placar em ErrorBoundary local (lesson #29).
// =============================================================================

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, ChevronDown, CalendarDays } from "lucide-react";
import { ScoreboardHero, type ConsistencyData } from "@/components/metas/ScoreboardHero";
import { WigBanner, type WigBannerData } from "@/components/metas/WigBanner";
import { MeasureCard, type MeasureCardData } from "@/components/metas/MeasureCard";
import { CoachNudgeCard } from "@/components/metas/CoachNudgeCard";
import { MetasEmptyState } from "@/components/metas/MetasEmptyState";
import { GoalsCalendar, type DailyLogLite } from "@/components/metas/GoalsCalendar";
import { GoalDayReportModal } from "@/components/metas/GoalDayReportModal";
import { todayYmd, localYmd } from "@/components/metas/metaUi";

interface Scoreboard {
  wigs: WigBannerData[];
  measures: MeasureCardData[];
  snapshotsWeek?: string;
}

function monthRange(d: Date): { from: string; to: string } {
  return {
    from: localYmd(new Date(d.getFullYear(), d.getMonth(), 1)),
    to: localYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
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

function CalendarSection({ onDayClick }: { onDayClick: (ymd: string) => void }) {
  const [range, setRange] = useState(() => monthRange(new Date()));
  const { data } = useQuery<{ logs: DailyLogLite[] }>({
    queryKey: ["/api/goals/daily-logs", range.from, range.to],
    queryFn: async () =>
      (await apiRequest("GET", `/api/goals/daily-logs?from=${range.from}&to=${range.to}`)) as { logs: DailyLogLite[] },
    retry: false,
  });

  const logsByDate: Record<string, DailyLogLite> = {};
  for (const log of data?.logs ?? []) {
    if (log?.logDate) logsByDate[String(log.logDate).slice(0, 10)] = { ...log, logDate: String(log.logDate).slice(0, 10) };
  }

  return (
    <section data-testid="metas-calendar" className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Cadencia — calendario de consistencia</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Clique num dia para registrar o processo: medidas exercidas, torneios, estudo e aprendizados. Sem resultado financeiro.
      </p>
      <GoalsCalendar
        logsByDate={logsByDate}
        onDayClick={onDayClick}
        onMonthChange={(from, to) => setRange({ from, to })}
      />
    </section>
  );
}

function MetasContent({ onDayClick }: { onDayClick: (ymd: string) => void }) {
  const { data, isLoading, isError } = useQuery<Scoreboard>({
    queryKey: ["/api/goals/scoreboard"],
    queryFn: async () => (await apiRequest("GET", "/api/goals/scoreboard")) as Scoreboard,
    retry: false,
  });
  const { data: consistency } = useQuery<ConsistencyData>({
    queryKey: ["/api/goals/consistency"],
    queryFn: async () => (await apiRequest("GET", "/api/goals/consistency")) as ConsistencyData,
    retry: false,
  });

  if (isLoading) {
    return (
      <div data-testid="metas-scoreboard-loading" className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
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

  // Empty-state de onboarding 4DX (M6).
  if (wigs.length === 0 && measures.length === 0) {
    return (
      <div data-testid="metas-scoreboard" className="space-y-6">
        <MetasEmptyState />
        <CalendarSection onDayClick={onDayClick} />
      </div>
    );
  }

  return (
    <div data-testid="metas-scoreboard" className="space-y-6">
      {/* 1. Hero — placar da semana (M1) */}
      <ScoreboardHero
        measuresStatuses={measures.map((m) => m.status)}
        consistency={consistency ?? null}
        onRegisterToday={() => onDayClick(todayYmd())}
      />

      {/* 2. WIG — norte (M9) */}
      {wigs.length > 0 ? (
        <section data-testid="metas-wigs" className="space-y-3">
          {wigs.map((w) => (
            <WigBanner key={w.careerGoalId} wig={w} />
          ))}
        </section>
      ) : null}

      {/* 2b. Coach IA — cobranca contextual do placar (M5). */}
      <CoachNudgeCard measures={measures} consistency={consistency ?? null} />

      {/* 3. Medidas de direcao — controle (M3 + filtro horizonte M15) */}
      <MeasuresSection measures={measures} />

      {/* 4. Calendario — cadencia (M2 fusao + M7) */}
      <CalendarSection onDayClick={onDayClick} />
    </div>
  );
}

const HORIZON_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "quarter", label: "Trimestre" },
  { key: "season", label: "Temporada" },
];

function MeasuresSection({ measures }: { measures: MeasureCardData[] }) {
  const [filter, setFilter] = useState("all");
  // So mostra chips de horizonte que existem (alem de "Todas").
  const present = new Set(measures.map((m) => m.horizon).filter(Boolean));
  const chips = HORIZON_FILTERS.filter((f) => f.key === "all" || present.has(f.key));
  const shown = filter === "all" ? measures : measures.filter((m) => m.horizon === filter);

  return (
    <section data-testid="metas-measures" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Medidas de Direcao</h2>
        {measures.length > 0 && chips.length > 2 ? (
          <div className="flex flex-wrap gap-1" data-testid="metas-measures-filter">
            {chips.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  filter === f.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {measures.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma medida ativa. Medidas sao o que voce controla — volume, horas de estudo, rotina.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma medida neste horizonte.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((m) => (
            <MeasureCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </section>
  );
}

export function MetasPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <div data-testid="metas-page" className="p-6">
      <PageHeader
        title="Metas"
        subtitle="Seu placar 4DX: a WIG (norte), as medidas que voce controla e a cadencia do processo."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              data-testid="metas-register-today-header"
              onClick={() => setSelectedDate(todayYmd())}
            >
              <CalendarDays className="mr-1.5 h-4 w-4" />
              Registrar hoje
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="metas-nova-cta">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nova meta
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/metas/nova?kind=wig" data-testid="metas-nova-wig">Meta Global (WIG)</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/metas/nova?kind=measure" data-testid="metas-nova-measure">Medida de Direcao</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <ScoreboardErrorBoundary>
        <MetasContent onDayClick={setSelectedDate} />
      </ScoreboardErrorBoundary>

      <GoalDayReportModal date={selectedDate} onClose={() => setSelectedDate(null)} />
    </div>
  );
}

export default MetasPage;
