import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// =============================================================================
// MentalAnalyticsTab — Sprint Cooldown-2 + Fase B (lead measures)
//
// Specs: Docs/specs/cooldown-refactor-plan.md (RF-06) +
//        Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md (RF-01/02) +
//        Docs/specs/metas-tool-2026-06-01.md (consumidor futuro: sourceMetric)
//
// Aba "Mental" do perfil. 6 widgets agregados:
//   - Compliance cool-down (gauge) + warm-up (Fase B RF-01)
//   - Distribuicao starred hands (donut)
//   - Cool-down impact (comparison)
//   - Top licoes (word cloud)
//   - Distribuicao A/B + C-game (Fase B RF-02)
// Period selector 7d/30d/90d.
// =============================================================================

type Period = "7d" | "30d" | "90d";

const PERIODS: Period[] = ["7d", "30d", "90d"];

export interface MentalAnalyticsTabProps {
  // Sem props no Sprint 2 — autocontido.
}

interface ComplianceData {
  total: number;
  completed: number;
  complianceRate: number;
}

interface DistributionItem {
  type: string;
  count: number;
}

interface ImpactData {
  withCooldown: { avgRoi: number };
  withoutCooldown: { avgRoi: number };
  delta: number;
}

interface LessonItem {
  token: string;
  count: number;
}

// Fase B — espelho local dos shapes server (ADR-228 D-B3)
interface WarmupComplianceData {
  total: number;
  completed: number;
  complianceRate: number;
  abortedCount: number;
  decisionNotToPlayCount: number;
  overrideUsedCount: number;
}

interface AbGameThemeItem {
  token: string;
  count: number;
}

interface AbGameDistributionData {
  journaledSessions: number;
  aGameItemCount: number;
  bGameItemCount: number;
  cGameEntryCount: number;
  avgAGamePerSession: number;
  avgBGamePerSession: number;
  abShare: { aGamePct: number; bGamePct: number };
  cGameThemes: AbGameThemeItem[];
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted/40 ${className ?? "h-24 w-full"}`}
    />
  );
}

// Compliance de processo (cool-down RF — Sprint Cooldown-2; warm-up RF-01 — Fase B).
// Widget genérico: mesma renderização, varia só rótulo/testid (lead measure 4DX-D2).
function ComplianceWidget({
  data,
  isLoading,
  isError,
  testId,
  title,
  footerNoun,
  errorLabel,
  errorTestId,
}: {
  data?: ComplianceData;
  isLoading: boolean;
  isError: boolean;
  testId: string;
  title: string;
  footerNoun: string;
  errorLabel: string;
  errorTestId?: string;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div data-testid={errorTestId} className="text-sm text-red-500">
        Erro ao carregar {errorLabel}. Tente novamente.
      </div>
    );
  }
  const pct = data ? Math.round(data.complianceRate * 100) : 0;
  return (
    <div data-testid={testId} className="rounded border p-4">
      <div className="text-sm font-medium">Compliance de {title}</div>
      <div className="mt-2 text-3xl font-bold">{pct}%</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {data?.completed ?? 0} de {data?.total ?? 0} sessoes com {footerNoun}
      </div>
    </div>
  );
}

function DistributionWidget({
  data,
  isLoading,
  isError,
}: {
  data?: DistributionItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div className="text-sm text-red-500">
        Erro ao carregar distribuicao. Tente novamente.
      </div>
    );
  }
  const items = Array.isArray(data) ? data : [];
  return (
    <div
      data-testid="mental-analytics-distribution"
      className="rounded border p-4"
    >
      <div className="text-sm font-medium">Distribuicao de maos estreladas</div>
      {items.length === 0 ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Sem dados nesse periodo.
        </div>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((it) => (
            <li
              key={it.type}
              className="flex items-center justify-between"
              data-distribution-type={it.type}
            >
              <span>{it.type}</span>
              <span className="font-mono">{it.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImpactWidget({
  data,
  isLoading,
  isError,
}: {
  data?: ImpactData;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div className="text-sm text-red-500">
        Erro ao carregar impacto. Tente novamente.
      </div>
    );
  }
  const fmt = (n: number) => `${(n * 100).toFixed(1)}%`;
  const withRoi = data?.withCooldown?.avgRoi;
  const withoutRoi = data?.withoutCooldown?.avgRoi;
  const delta = data?.delta;
  return (
    <div
      data-testid="mental-analytics-impact"
      className="rounded border p-4"
    >
      <div className="text-sm font-medium">Impacto do cool-down (ROI medio)</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Com cool-down</div>
          <div className="font-mono text-lg">
            {typeof withRoi === "number" ? fmt(withRoi) : "-"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Sem cool-down</div>
          <div className="font-mono text-lg">
            {typeof withoutRoi === "number" ? fmt(withoutRoi) : "-"}
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        Delta:{" "}
        <span className="font-mono">
          {typeof delta === "number" ? fmt(delta) : "-"}
        </span>
      </div>
    </div>
  );
}

function LessonsWidget({
  data,
  isLoading,
  isError,
}: {
  data?: LessonItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div className="text-sm text-red-500">
        Erro ao carregar licoes. Tente novamente.
      </div>
    );
  }
  const items = Array.isArray(data) ? data : [];
  return (
    <div data-testid="mental-analytics-lessons" className="rounded border p-4">
      <div className="text-sm font-medium">Licoes mais frequentes</div>
      {items.length === 0 ? (
        <div
          data-testid="mental-analytics-lessons-empty"
          className="mt-2 text-xs text-muted-foreground"
        >
          Sem dados. Comece registrando licoes no cool-down para gerar a nuvem.
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((it) => (
            <span
              key={it.token}
              className="rounded bg-muted px-2 py-1 text-xs"
              style={{ fontSize: `${Math.min(20, 10 + it.count)}px` }}
            >
              {it.token}{" "}
              <span className="text-muted-foreground">({it.count})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Fase B — RF-01: compliance de warm-up (processo, sem $/ROI — RF-03)
// Fase B — RF-02: distribuicao A/B + C-game (sem $/ROI nem comparacao social — RF-03)
function AbGameDistributionWidget({
  data,
  isLoading,
  isError,
}: {
  data?: AbGameDistributionData;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div
        data-testid="mental-analytics-abgame-error"
        className="text-sm text-red-500"
      >
        Erro ao carregar A/B/C-game. Tente novamente.
      </div>
    );
  }

  const journaled = data?.journaledSessions ?? 0;
  if (journaled === 0) {
    return (
      <div data-testid="mental-analytics-abgame" className="rounded border p-4">
        <div className="text-sm font-medium">Distribuicao A/B/C-game</div>
        <div
          data-testid="mental-analytics-abgame-empty"
          className="mt-2 text-xs text-muted-foreground"
        >
          Sem registros A/B/C. Preencha o journal no cool-down para acompanhar.
        </div>
      </div>
    );
  }

  const aPct = Math.round((data?.abShare?.aGamePct ?? 0) * 100);
  const bPct = Math.round((data?.abShare?.bGamePct ?? 0) * 100);
  const themes = Array.isArray(data?.cGameThemes) ? data!.cGameThemes : [];

  return (
    <div data-testid="mental-analytics-abgame" className="rounded border p-4">
      <div className="text-sm font-medium">Distribuicao A/B/C-game</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {journaled} sessoes com journal
      </div>
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${aPct}%` }}
          aria-label={`A-game ${aPct}%`}
        />
        <div
          className="h-full bg-amber-500"
          style={{ width: `${bPct}%` }}
          aria-label={`B-game ${bPct}%`}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>A-game {aPct}%</span>
        <span>B-game {bPct}%</span>
      </div>
      <div className="mt-3 text-xs font-medium">
        C-game: {data?.cGameEntryCount ?? 0} registros
      </div>
      {themes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {themes.map((t) => (
            <span
              key={t.token}
              className="rounded bg-muted px-2 py-1 text-xs"
            >
              {t.token}{" "}
              <span className="text-muted-foreground">({t.count})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MentalAnalyticsTab(_props: MentalAnalyticsTabProps = {}) {
  // Hooks first
  const [period, setPeriod] = useState<Period>("30d");

  const compliance = useQuery<ComplianceData>({
    queryKey: ["mental-analytics", "compliance", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/cooldown-compliance?period=${period}`),
  });

  const distribution = useQuery<DistributionItem[]>({
    queryKey: ["mental-analytics", "distribution", period],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/analytics/starred-hands-distribution?period=${period}`,
      ),
  });

  const impact = useQuery<ImpactData>({
    queryKey: ["mental-analytics", "impact", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/cooldown-impact?period=${period}`),
  });

  const lessons = useQuery<LessonItem[]>({
    queryKey: ["mental-analytics", "top-lessons", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/top-lessons?period=${period}`),
  });

  // Fase B — RF-01/RF-02
  const warmupCompliance = useQuery<WarmupComplianceData>({
    queryKey: ["mental-analytics", "warmup-compliance", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/warmup-compliance?period=${period}`),
  });

  const abGame = useQuery<AbGameDistributionData>({
    queryKey: ["mental-analytics", "abgame-distribution", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/abgame-distribution?period=${period}`),
  });

  const anyError =
    compliance.isError ||
    distribution.isError ||
    impact.isError ||
    lessons.isError ||
    warmupCompliance.isError ||
    abGame.isError;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Mental Analytics</h3>
        <div
          data-testid="mental-analytics-period"
          role="tablist"
          aria-label="Periodo"
          className="flex gap-1"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`mental-analytics-period-${p}`}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`rounded border px-2 py-1 text-xs ${
                period === p ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {anyError && (
        <div
          data-testid="mental-analytics-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700"
        >
          Erro ao carregar metricas. Tente novamente.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ComplianceWidget
          data={compliance.data}
          isLoading={compliance.isLoading}
          isError={compliance.isError}
          testId="mental-analytics-compliance"
          title="cool-down"
          footerNoun="cool-down"
          errorLabel="compliance"
        />
        <DistributionWidget
          data={distribution.data}
          isLoading={distribution.isLoading}
          isError={distribution.isError}
        />
        <ImpactWidget
          data={impact.data}
          isLoading={impact.isLoading}
          isError={impact.isError}
        />
        <LessonsWidget
          data={lessons.data}
          isLoading={lessons.isLoading}
          isError={lessons.isError}
        />
        <ComplianceWidget
          data={warmupCompliance.data}
          isLoading={warmupCompliance.isLoading}
          isError={warmupCompliance.isError}
          testId="mental-analytics-warmup-compliance"
          title="warm-up"
          footerNoun="warm-up completo"
          errorLabel="warm-up"
          errorTestId="mental-analytics-warmup-compliance-error"
        />
        <AbGameDistributionWidget
          data={abGame.data}
          isLoading={abGame.isLoading}
          isError={abGame.isError}
        />
      </div>
    </div>
  );
}

export default MentalAnalyticsTab;
