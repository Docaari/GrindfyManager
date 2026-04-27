import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// =============================================================================
// MentalAnalyticsTab — Sprint Cooldown-2
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-06)
//
// Aba "Mental" do perfil. 4 widgets agregados:
//   - Compliance (gauge)
//   - Distribuicao starred hands (donut)
//   - Cool-down impact (comparison)
//   - Top licoes (word cloud)
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

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted/40 ${className ?? "h-24 w-full"}`}
    />
  );
}

function ComplianceWidget({
  data,
  isLoading,
  isError,
}: {
  data?: ComplianceData;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div className="text-sm text-red-500">
        Erro ao carregar compliance. Tente novamente.
      </div>
    );
  }
  const pct = data ? Math.round(data.complianceRate * 100) : 0;
  return (
    <div
      data-testid="mental-analytics-compliance"
      className="rounded border p-4"
    >
      <div className="text-sm font-medium">Compliance de cool-down</div>
      <div className="mt-2 text-3xl font-bold">{pct}%</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {data?.completed ?? 0} de {data?.total ?? 0} sessoes com cool-down
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

  const anyError =
    compliance.isError ||
    distribution.isError ||
    impact.isError ||
    lessons.isError;

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
      </div>
    </div>
  );
}

export default MentalAnalyticsTab;
