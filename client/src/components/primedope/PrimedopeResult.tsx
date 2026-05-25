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

  const roi =
    result.totalInvested > 0
      ? (result.ev / result.totalInvested) * 100
      : 0;

  const p = result.percentiles ?? {};
  const dd = result.drawdown ?? {};

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
        >
          <div className="text-xs text-muted-foreground">EV</div>
          <div className="text-xl font-semibold">{formatUsd(result.ev)}</div>
        </div>
        <div
          data-testid="primedope-result-card-roi"
          className="rounded border border-border bg-card p-3"
        >
          <div className="text-xs text-muted-foreground">ROI</div>
          <div className="text-xl font-semibold">{formatPct(roi)}</div>
        </div>
        <div
          data-testid="primedope-result-card-sd"
          className="rounded border border-border bg-card p-3"
        >
          <div className="text-xs text-muted-foreground">SD</div>
          <div className="text-xl font-semibold">{formatUsd(result.stdDev)}</div>
        </div>
        <div
          data-testid="primedope-result-card-profit-chance"
          className="rounded border border-border bg-card p-3"
        >
          <div className="text-xs text-muted-foreground">Chance de Lucro</div>
          <div className="text-xl font-semibold">
            {formatPct(result.profitablePct)}
          </div>
        </div>
      </div>

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

      {/* Drawdown Section */}
      <div
        data-testid="primedope-result-drawdown"
        className="rounded border border-border bg-card p-3"
      >
        <div className="mb-2 text-sm font-medium">Drawdown esperado</div>
        <div className="space-y-1 text-xs">
          <div data-testid="primedope-dd-median" className="flex justify-between">
            <span>Tipico (mediano)</span>
            <span>{formatUsd(dd.median)}</span>
          </div>
          <div data-testid="primedope-dd-p95" className="flex justify-between">
            <span>Preparar (95%)</span>
            <span>{formatUsd(dd.p95)}</span>
          </div>
          <div data-testid="primedope-dd-worst" className="flex justify-between">
            <span>Pior raro</span>
            <span>{formatUsd(dd.worst)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PrimedopeResult;
