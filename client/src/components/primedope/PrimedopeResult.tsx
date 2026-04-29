// =============================================================================
// Sprint F4 W1 — PrimedopeResult (RF-04, RF-06, RF-07, RF-14, RF-23, RF-24)
//
// 4 cards EV/ROI/SD/RoR + tabela CI + bankroll percentiles + source badge +
// pin toggle + multiplier dropdown + skeleton loading + error block.
// =============================================================================

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface SimulationResultData {
  ev?: number;
  roiPct?: number;
  stdDev?: number;
  riskOfRuinPct?: number;
  confidenceIntervals?: {
    p70?: { low: number; high: number };
    p95?: { low: number; high: number };
    p997?: { low: number; high: number };
  };
  minBankroll?: { p50?: number; p15?: number; p05?: number; p01?: number };
}

export interface PrimedopeResultPayload {
  source: "primedope" | "cache" | "fallback-stale";
  data: SimulationResultData;
  histogramUrl?: string;
  randomRunsUrl?: string;
  latencyMs: number;
  inputHash?: string;
  runId?: string;
  pinned?: boolean;
  cachedAtMs?: number;
  staleAgeMs?: number;
}

export interface PrimedopeResultError {
  statusCode: number;
  errorType?: string;
  retryAfterMs?: number;
  inputHash?: string;
  timestamp?: string;
  message?: string;
}

interface PrimedopeResultProps {
  result?: PrimedopeResultPayload;
  isLoading?: boolean;
  error?: PrimedopeResultError;
  onTogglePin?: (runId: string, nextPinned: boolean) => void;
  onMultiplierChange?: (multiplier: 1 | 4 | 12 | 52) => void;
  multiplier?: 1 | 4 | 12 | 52;
}

function formatUsd(v: number | undefined): string {
  return `$${(v ?? 0).toFixed(2)}`;
}

function formatPct(v: number | undefined): string {
  return `${(v ?? 0).toFixed(2)}%`;
}

const MULTIPLIERS = [1, 4, 12, 52] as const;

function SourceBadge({
  source,
  cachedAtMs,
  staleAgeMs,
}: {
  source: PrimedopeResultPayload["source"];
  cachedAtMs?: number;
  staleAgeMs?: number;
}) {
  if (source === "primedope") {
    return (
      <span
        data-testid="primedope-source-badge"
        className="rounded bg-emerald-200 px-2 py-1 text-xs text-emerald-900"
      >
        Recem-simulado
      </span>
    );
  }
  if (source === "cache") {
    const minutes = cachedAtMs
      ? Math.max(0, Math.round((Date.now() - cachedAtMs) / 60_000))
      : 0;
    return (
      <span
        data-testid="primedope-source-badge"
        className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-900"
      >
        Em cache ({minutes}min atras)
      </span>
    );
  }
  // fallback-stale
  const hours = staleAgeMs ? Math.round(staleAgeMs / 3600_000) : 0;
  return (
    <span
      data-testid="primedope-source-badge"
      className="rounded bg-amber-200 px-2 py-1 text-xs text-amber-900"
    >
      Dados de {hours}h atras (PrimeDope offline / fallback)
    </span>
  );
}

function ErrorBlock({ error }: { error: PrimedopeResultError }) {
  const [countdownMs, setCountdownMs] = React.useState(error.retryAfterMs ?? 0);
  React.useEffect(() => {
    if (!error.retryAfterMs) return;
    setCountdownMs(error.retryAfterMs);
    const t = setInterval(() => {
      setCountdownMs((c) => Math.max(0, c - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [error.retryAfterMs]);

  if (error.statusCode === 429) {
    return (
      <div
        data-testid="primedope-error-block"
        className="rounded border border-amber-500 bg-amber-100/60 p-3 text-sm"
      >
        <p>Aguarde antes de simular novamente.</p>
        <p data-testid="primedope-error-rate-limit-countdown" className="mt-1 text-xs">
          Tente novamente em {Math.ceil((countdownMs ?? 0) / 1000)}s
        </p>
      </div>
    );
  }
  if (error.statusCode === 502 || error.errorType === "upstream_4xx_schema_change") {
    const subject = encodeURIComponent("PrimeDope schema change detected");
    const body = encodeURIComponent(
      `inputHash: ${error.inputHash ?? "(n/a)"}\ntimestamp: ${error.timestamp ?? new Date().toISOString()}`,
    );
    return (
      <div
        data-testid="primedope-error-block"
        className="rounded border border-red-500 bg-red-100/60 p-3 text-sm"
      >
        <p>PrimeDope retornou erro inesperado (provavel mudanca de schema).</p>
        <p className="mt-1 text-xs">
          Hash: {error.inputHash}
          {" "}
          - {error.timestamp}
        </p>
        <a
          data-testid="primedope-error-mailto-cta"
          href={`mailto:suporte@grindfy.com?subject=${subject}&body=${body}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs underline"
        >
          Avise o time (copiar detalhes tecnicos)
        </a>
      </div>
    );
  }
  // 503 or other
  return (
    <div
      data-testid="primedope-error-block"
      className="rounded border border-red-500 bg-red-100/60 p-3 text-sm"
    >
      <p>Servico indisponivel. PrimeDope offline no momento, sem fallback recente.</p>
    </div>
  );
}

export function PrimedopeResult({
  result,
  isLoading = false,
  error,
  onTogglePin,
  onMultiplierChange,
  multiplier,
}: PrimedopeResultProps): React.ReactElement {
  // Hooks ANTES de early-return
  const [localMultiplier, setLocalMultiplier] = React.useState<1 | 4 | 12 | 52>(
    multiplier ?? 1,
  );
  const debounceRef = React.useRef<any>(null);
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (error) {
    return <ErrorBlock error={error} />;
  }

  if (isLoading) {
    return (
      <div data-testid="primedope-result" className="space-y-3">
        <div
          data-testid="primedope-result-skeleton"
          className="h-32 animate-pulse rounded bg-muted"
        />
        <p data-testid="primedope-result-eta" className="text-xs text-muted-foreground">
          Simulando... ~4s
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

  const data = result.data ?? {};
  const ci = data.confidenceIntervals ?? {};
  const mb = data.minBankroll ?? {};

  const handleMultiplierChange = (next: 1 | 4 | 12 | 52) => {
    setLocalMultiplier(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onMultiplierChange?.(next);
    }, 2000);
  };

  return (
    <section data-testid="primedope-result" className="space-y-4">
      <header className="flex items-center justify-between">
        <SourceBadge
          source={result.source}
          cachedAtMs={result.cachedAtMs}
          staleAgeMs={result.staleAgeMs}
        />
        <div className="flex items-center gap-2">
          <select
            data-testid="primedope-result-multiplier"
            className="rounded border border-border bg-background p-1 text-xs"
            value={localMultiplier}
            onChange={(e) =>
              handleMultiplierChange(Number(e.target.value) as 1 | 4 | 12 | 52)
            }
          >
            {MULTIPLIERS.map((m) => (
              <option key={m} value={m}>
                {m}x
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="primedope-result-pin"
            onClick={() => {
              if (!result.runId || !onTogglePin) return;
              onTogglePin(result.runId, !result.pinned);
            }}
            className="rounded border border-border px-2 py-1 text-xs"
            aria-pressed={result.pinned ? "true" : "false"}
          >
            {result.pinned ? "[Fixado]" : "[Fixar]"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div
          data-testid="primedope-result-card-ev"
          className="rounded border border-border bg-card p-3"
        >
          <div className="text-xs text-muted-foreground">EV</div>
          <div className="text-xl font-semibold">{formatUsd(data.ev)}</div>
        </div>
        <div
          data-testid="primedope-result-card-roi"
          className="rounded border border-border bg-card p-3"
        >
          <div className="text-xs text-muted-foreground">ROI</div>
          <div className="text-xl font-semibold">{formatPct(data.roiPct)}</div>
        </div>
        <div
          data-testid="primedope-result-card-sd"
          className="rounded border border-border bg-card p-3"
        >
          <div className="text-xs text-muted-foreground">SD</div>
          <div className="text-xl font-semibold">{formatUsd(data.stdDev)}</div>
        </div>
        <div
          data-testid="primedope-result-card-ror"
          className="rounded border border-border bg-card p-3"
        >
          <div className="text-xs text-muted-foreground">RoR</div>
          <div className="text-xl font-semibold">{formatPct(data.riskOfRuinPct)}</div>
        </div>
      </div>

      <div
        data-testid="primedope-result-confidence-table"
        className="rounded border border-border bg-card p-3"
      >
        <div className="mb-2 text-sm font-medium">Confidence intervals</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left">Faixa</th>
              <th className="text-right">Low</th>
              <th className="text-right">High</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>70%</td>
              <td className="text-right">{formatUsd(ci.p70?.low)}</td>
              <td className="text-right">{formatUsd(ci.p70?.high)}</td>
            </tr>
            <tr>
              <td>95%</td>
              <td className="text-right">{formatUsd(ci.p95?.low)}</td>
              <td className="text-right">{formatUsd(ci.p95?.high)}</td>
            </tr>
            <tr>
              <td>99.7%</td>
              <td className="text-right">{formatUsd(ci.p997?.low)}</td>
              <td className="text-right">{formatUsd(ci.p997?.high)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        data-testid="primedope-result-bankroll-percentiles"
        className="rounded border border-border bg-card p-3"
      >
        <div className="mb-2 text-sm font-medium">Banca minima por RoR</div>
        <ul className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <li>P50%: {formatUsd(mb.p50)}</li>
          <li>P15%: {formatUsd(mb.p15)}</li>
          <li>P5%: {formatUsd(mb.p05)}</li>
          <li>P1%: {formatUsd(mb.p01)}</li>
        </ul>
      </div>
    </section>
  );
}

export default PrimedopeResult;
