// =============================================================================
// Sprint VR-1 — PrimedopeResult (RF-03)
//
// Updated for native VarianceSimulationResult format (ADR-211).
// 4 KPI cards: EV, ROI (calculated), SD, Chance de Lucro (replaces RoR).
// CI table: 3 bands (70%, 95%, 99.7%) from native percentiles.
// Drawdown section: median, p95, worst.
// Risk badge: red < 50%, green >= 90%, yellow otherwise.
// =============================================================================

import * as React from "react";
import { ScenarioCards } from "./ScenarioCards";
import { DrawdownCard } from "./DrawdownCard";
import { VarianceHistogram } from "./VarianceHistogram";
import { GroupContributions } from "./GroupContributions";
import { EquityCurves } from "./EquityCurves";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PrimedopeResultProps {
  result?: any;
  isLoading?: boolean;
  error?: any;
  onTogglePin?: (runId: string, nextPinned: boolean) => void;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatUsd(v: number | undefined): string {
  if (v == null) return "$0";
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return v < 0 ? `-$${formatted}` : `$${formatted}`;
}

function formatPct(v: number | undefined): string {
  return `${(v ?? 0).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Source Badge
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source?: string }) {
  if (source === "native") {
    return (
      <span
        data-testid="primedope-source-badge"
        className="rounded bg-emerald-200 px-2 py-1 text-xs text-emerald-900"
      >
        Nativo
      </span>
    );
  }
  if (source === "cache") {
    return (
      <span
        data-testid="primedope-source-badge"
        className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-900"
      >
        Em cache
      </span>
    );
  }
  return (
    <span
      data-testid="primedope-source-badge"
      className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-900"
    >
      Simulado
    </span>
  );
}

// ---------------------------------------------------------------------------
// Risk Badge
// ---------------------------------------------------------------------------

function RiskBadge({ profitablePct }: { profitablePct: number }) {
  if (profitablePct < 50) {
    return (
      <span
        data-testid="primedope-risk-badge"
        className="rounded bg-red-200 px-2 py-1 text-xs font-medium text-red-900"
      >
        Alto risco
      </span>
    );
  }
  if (profitablePct >= 90) {
    return (
      <span
        data-testid="primedope-risk-badge"
        className="rounded bg-emerald-200 px-2 py-1 text-xs font-medium text-emerald-900"
      >
        Baixo risco
      </span>
    );
  }
  return (
    <span
      data-testid="primedope-risk-badge"
      className="rounded bg-yellow-200 px-2 py-1 text-xs font-medium text-yellow-900"
    >
      Risco moderado
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrimedopeResult({
  result,
  isLoading = false,
  error,
  onTogglePin,
}: PrimedopeResultProps): React.ReactElement {
  if (error) {
    return (
      <div
        data-testid="primedope-error-block"
        className="rounded border border-red-500 bg-red-100/60 p-3 text-sm"
      >
        <p>{error?.message ?? "Erro na simulacao."}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div data-testid="primedope-result" className="space-y-3">
        <div
          data-testid="primedope-result-skeleton"
          className="h-32 animate-pulse rounded bg-muted"
        />
        <p className="text-xs text-muted-foreground">
          Simulando...
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div data-testid="primedope-result" className="text-xs text-muted-foreground">
        Nenhuma simulacao ainda.
      </div>
    );
  }

  // ADR-215 D4: backend agora retorna roi.mean + roi.median. Fallback ao calculo
  // antigo se o payload for de cache antigo (sem campo roi).
  const roiMeanPct =
    result.roi?.mean != null
      ? result.roi.mean * 100
      : result.totalInvested > 0
      ? (result.ev / result.totalInvested) * 100
      : 0;
  const roiMedianPct =
    result.roi?.median != null ? result.roi.median * 100 : null;

  const p = result.percentiles ?? {};
  const dd = result.drawdown ?? {};
  const evCi = result.evCi95; // ADR-215 D3
  const ror = result.riskOfRuin; // ADR-215 D2

  return (
    <section data-testid="primedope-result" className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SourceBadge source={result.source} />
          <RiskBadge profitablePct={result.profitablePct ?? 0} />
        </div>
        {result.runId && onTogglePin && (
          <button
            type="button"
            data-testid="primedope-result-pin"
            onClick={() => onTogglePin(result.runId, !result.pinned)}
            className="rounded border border-border px-2 py-1 text-xs"
            aria-pressed={result.pinned ? "true" : "false"}
          >
            {result.pinned ? "[Fixado]" : "[Fixar]"}
          </button>
        )}
      </header>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div
          data-testid="primedope-result-card-ev"
          className="rounded border border-border bg-card p-3"
          title="Valor esperado medio (mean das simulacoes)"
        >
          <div className="text-xs text-muted-foreground">EV</div>
          <div className="text-xl font-semibold">{formatUsd(result.ev)}</div>
          {evCi ? (
            <div
              data-testid="primedope-result-card-ev-ci"
              className="mt-1 text-[10px] text-muted-foreground"
              title="Intervalo de confianca 95% do estimador Monte Carlo (CLT)"
            >
              ±{formatUsd(1.96 * evCi.stdErr)} (95% CI)
            </div>
          ) : null}
        </div>
        <div
          data-testid="primedope-result-card-roi"
          className="rounded border border-border bg-card p-3"
          title="ROI medio (mean). Distribuicao MTT eh skewed, veja tambem ROI mediana abaixo."
        >
          <div className="text-xs text-muted-foreground">ROI medio</div>
          <div className="text-xl font-semibold">{formatPct(roiMeanPct)}</div>
          {roiMedianPct != null ? (
            <div
              data-testid="primedope-result-card-roi-median"
              className="mt-1 text-[10px] text-muted-foreground"
              title="Mediana — cenario tipico. Gap mean>median revela long-tail."
            >
              mediana {formatPct(roiMedianPct)}
            </div>
          ) : null}
        </div>
        <div
          data-testid="primedope-result-card-sd"
          className="rounded border border-border bg-card p-3"
          title="Desvio padrao da distribuicao de profit USD"
        >
          <div className="text-xs text-muted-foreground">SD</div>
          <div className="text-xl font-semibold">{formatUsd(result.stdDev)}</div>
        </div>
        <div
          data-testid="primedope-result-card-profit-chance"
          className="rounded border border-border bg-card p-3"
          title="% de simulacoes que terminaram com profit > 0"
        >
          <div className="text-xs text-muted-foreground">Chance de Lucro</div>
          <div className="text-xl font-semibold">
            {formatPct(result.profitablePct)}
          </div>
        </div>
      </div>

      {/* ADR-215 D2: Risk of Ruin card (so quando bankrollUsd informado) */}
      {ror ? (
        <div
          data-testid="primedope-result-card-ror"
          className="rounded border border-border bg-card p-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">
                Risk of Ruin (MC empirico)
              </div>
              <div className="text-xl font-semibold">
                {formatPct(ror.pct)}
              </div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <div>Bankroll: {formatUsd(ror.bankrollUsd)}</div>
              <div>
                {ror.ruinSims.toLocaleString("pt-BR")} de{" "}
                {ror.totalSims.toLocaleString("pt-BR")} sims tocaram o piso
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* CI Table */}
      <div
        data-testid="primedope-result-confidence-table"
        className="rounded border border-border bg-card p-3"
      >
        <div className="mb-2 text-sm font-medium">Intervalos de confianca</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left">Faixa</th>
              <th className="text-right">Min</th>
              <th className="text-right">Max</th>
            </tr>
          </thead>
          <tbody>
            <tr data-testid="primedope-ci-band-70">
              <td>70%</td>
              <td className="text-right">{formatUsd(p.p15)}</td>
              <td className="text-right">{formatUsd(p.p85)}</td>
            </tr>
            <tr data-testid="primedope-ci-band-95">
              <td>95%</td>
              <td className="text-right">{formatUsd(p.p2_5)}</td>
              <td className="text-right">{formatUsd(p.p97_5)}</td>
            </tr>
            <tr data-testid="primedope-ci-band-997">
              <td>99.7%</td>
              <td className="text-right">{formatUsd(p.p0_15)}</td>
              <td className="text-right">{formatUsd(p.p99_85)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* VR-3: Scenario Cards (pessimista / mediana / otimista) */}
      <ScenarioCards
        percentiles={p}
        weeks={result.weeks ?? 12}
      />

      {/* VR-3: Drawdown Card (visual bars) */}
      <DrawdownCard drawdown={dd} />

      {/* VR-3: Histogram */}
      {Array.isArray(result.histogram) && result.histogram.length > 0 && (
        <VarianceHistogram
          histogram={result.histogram}
          medianValue={p.p50 ?? 0}
        />
      )}

      {/* VR-3: Equity Curves */}
      {result.equityCurves && (
        <EquityCurves
          equityCurves={result.equityCurves}
          weeks={result.weeks ?? 12}
        />
      )}

      {/* VR-3: Group Contributions */}
      {Array.isArray(result.groupContributions) && result.groupContributions.length > 0 && (
        <GroupContributions groupContributions={result.groupContributions} />
      )}
    </section>
  );
}

export default PrimedopeResult;
