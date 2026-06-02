import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getTiltType, type TiltTypeId } from "@shared/tilt-types";

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

// Fase C #4 (ADR-232 D-5) — espelho local do shape server TiltTypeDistribution.
interface TiltTypeDistributionData {
  period: Period;
  totalAssessments: number;
  typedCount: number;
  dominant: TiltTypeId | null;
  distribution: Array<{ tiltType: TiltTypeId; count: number; sharePct: number }>;
  dataSufficiency: "ok" | "low";
}

// Fase C #10 (ADR-233 — RF-04) — espelho local do shape server MentalResultBuckets.
type BucketSufficiency = "ok" | "low";

interface MentalResultBucketStat {
  n: number;
  avgPnlUsd: number | null;
  medianPnlUsd: number | null;
  dataSufficiency: BucketSufficiency;
}

interface MentalResultBucket extends MentalResultBucketStat {
  key: string;
  deltaVsBaseline: number | null;
}

interface MentalResultData {
  period: Period;
  baseline: MentalResultBucketStat;
  buckets: MentalResultBucket[];
  dataSufficiency: BucketSufficiency;
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

// Fase C #4 (ADR-232 — RF-04/05): "Seu tilt mais frequente" + antidoto do dominante.
function TiltDominantWidget({
  data,
  isLoading,
  isError,
}: {
  data?: TiltTypeDistributionData;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div
        data-testid="mental-tilt-dominant-error"
        className="text-sm text-red-500"
      >
        Erro ao carregar tipos de tilt. Tente novamente.
      </div>
    );
  }

  const dominant = data?.dominant ?? null;
  const meta = dominant ? getTiltType(dominant) : undefined;
  const share = dominant
    ? data?.distribution?.find((d) => d.tiltType === dominant)?.sharePct ?? 0
    : 0;
  const sharePctInt = Math.round(share * 100);
  const isLow = data?.dataSufficiency === "low";

  return (
    <div data-testid="mental-tilt-dominant" className="rounded border p-4">
      <div className="text-sm font-medium">Seu tilt mais frequente</div>

      {meta == null ? (
        // Empty state — sem antidoto decorativo (lesson #11).
        <div className="mt-2 text-xs text-muted-foreground">
          Sem tipos de tilt registrados nesse periodo. Tipifique o tilt no
          cool-down para acompanhar.
        </div>
      ) : (
        <>
          <div className="mt-2 text-2xl font-bold">{meta.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {sharePctInt}% dos episodios tipificados
          </div>
          {isLow && (
            <div className="mt-1 text-xs text-amber-600">
              Amostra pequena, continue registrando.
            </div>
          )}
          <p className="mt-2 text-sm text-muted-foreground">{meta.antidote}</p>
        </>
      )}
    </div>
  );
}

// Fase C #10 (ADR-233 — RF-04): cruzamento mental × resultado (P&L USD).
// Degrada loading/erro/empty/low-sample sem fabricar conclusao (lesson #11).
function MentalResultWidget({
  data,
  isLoading,
  isError,
  testId,
  title,
  labelFor,
}: {
  data?: MentalResultData;
  isLoading: boolean;
  isError: boolean;
  testId: string;
  title: string;
  labelFor: (key: string) => string;
}) {
  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div
        data-testid={`${testId}-error`}
        className="text-sm text-red-500"
      >
        Erro ao carregar {title}. Tente novamente.
      </div>
    );
  }

  const baselineN = data?.baseline?.n ?? 0;
  if (baselineN === 0) {
    return (
      <div data-testid={testId} className="rounded border p-4">
        <div className="text-sm font-medium">{title}</div>
        <div
          data-testid={`${testId}-empty`}
          className="mt-2 text-xs text-muted-foreground"
        >
          Sem sessoes com P&amp;L nesse periodo. Registre sessoes para gerar o
          insight.
        </div>
      </div>
    );
  }

  const fmtUsd = (n: number | null) =>
    typeof n === "number"
      ? `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`
      : "-";
  const fmtDelta = (n: number | null) =>
    typeof n === "number"
      ? `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`
      : "-";

  const isLow = data?.dataSufficiency === "low";
  const buckets = Array.isArray(data?.buckets) ? data!.buckets : [];
  // So mostra buckets com pelo menos 1 sessao (sem fabricar linhas vazias).
  const filled = buckets.filter((b) => b.n > 0);

  return (
    <div data-testid={testId} className="rounded border p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Baseline: {fmtUsd(data?.baseline?.avgPnlUsd ?? null)} ({baselineN} sessoes)
      </div>

      {isLow && (
        <div className="mt-1 text-xs text-amber-600">
          Amostra pequena, continue registrando.
        </div>
      )}

      {filled.length === 0 ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Sem registros mentais nesse periodo para cruzar com o resultado.
        </div>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {filled.map((b) => {
            const delta = b.deltaVsBaseline;
            const deltaColor =
              typeof delta === "number"
                ? delta > 0
                  ? "text-emerald-600"
                  : delta < 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                : "text-muted-foreground";
            return (
              <li
                key={b.key}
                className="flex items-center justify-between"
                data-mental-result-bucket={b.key}
              >
                <span>
                  {labelFor(b.key)}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({b.n})
                  </span>
                  {b.dataSufficiency === "low" && (
                    <span className="ml-1 text-xs text-amber-600">
                      amostra pequena
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 font-mono">
                  <span>{fmtUsd(b.avgPnlUsd)}</span>
                  <span className={deltaColor}>{fmtDelta(delta)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const FOCUS_BUCKET_LABELS: Record<string, string> = {
  alto: "Foco alto",
  medio: "Foco medio",
  baixo: "Foco baixo",
};

const ABGAME_BUCKET_LABELS: Record<string, string> = {
  a_dominant: "A-game predominante",
  bc_present: "B/C-game presente",
};

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

  // Fase C #4 — RF-04
  const tiltTypeDistribution = useQuery<TiltTypeDistributionData>({
    queryKey: ["mental-analytics", "tilt-type-distribution", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/tilt-type-distribution?period=${period}`),
  });

  // Fase C #10 — RF-04: cruzamento mental × resultado (3 endpoints).
  const mentalResultTilt = useQuery<MentalResultData>({
    queryKey: ["mental-analytics", "mental-result-tilt", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/mental-result/tilt?period=${period}`),
  });

  const mentalResultFocus = useQuery<MentalResultData>({
    queryKey: ["mental-analytics", "mental-result-focus", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/mental-result/focus?period=${period}`),
  });

  const mentalResultAbgame = useQuery<MentalResultData>({
    queryKey: ["mental-analytics", "mental-result-abgame", period],
    queryFn: () =>
      apiRequest("GET", `/api/analytics/mental-result/abgame?period=${period}`),
  });

  const anyError =
    compliance.isError ||
    distribution.isError ||
    impact.isError ||
    lessons.isError ||
    warmupCompliance.isError ||
    abGame.isError ||
    tiltTypeDistribution.isError ||
    mentalResultTilt.isError ||
    mentalResultFocus.isError ||
    mentalResultAbgame.isError;

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
        <TiltDominantWidget
          data={tiltTypeDistribution.data}
          isLoading={tiltTypeDistribution.isLoading}
          isError={tiltTypeDistribution.isError}
        />
        <MentalResultWidget
          data={mentalResultTilt.data}
          isLoading={mentalResultTilt.isLoading}
          isError={mentalResultTilt.isError}
          testId="mental-result-tilt"
          title="Tilt x Resultado"
          labelFor={(key) => getTiltType(key)?.label ?? key}
        />
        <MentalResultWidget
          data={mentalResultFocus.data}
          isLoading={mentalResultFocus.isLoading}
          isError={mentalResultFocus.isError}
          testId="mental-result-focus"
          title="Foco x Resultado"
          labelFor={(key) => FOCUS_BUCKET_LABELS[key] ?? key}
        />
        <MentalResultWidget
          data={mentalResultAbgame.data}
          isLoading={mentalResultAbgame.isLoading}
          isError={mentalResultAbgame.isError}
          testId="mental-result-abgame"
          title="A-game vs B/C-game x Resultado"
          labelFor={(key) => ABGAME_BUCKET_LABELS[key] ?? key}
        />
      </div>
    </div>
  );
}

export default MentalAnalyticsTab;
