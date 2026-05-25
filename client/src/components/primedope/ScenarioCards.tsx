import * as React from "react";

interface Percentiles {
  p0_15: number;
  p2_5: number;
  p15: number;
  p30: number;
  p50: number;
  p70: number;
  p85: number;
  p97_5: number;
  p99_85: number;
}

interface ScenarioCardsProps {
  percentiles: Percentiles;
  weeks: number;
}

function formatUsdSigned(v: number): string {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (v < 0) return `-$${formatted}`;
  if (v > 0) return `+$${formatted}`;
  return `$${formatted}`;
}

function getPeriodLabel(weeks: number): string {
  if (weeks === 1) return "semanas";
  if (weeks === 4) return "meses";
  if (weeks === 12) return "trimestres";
  if (weeks === 52) return "anos";
  return "semanas";
}

export function ScenarioCards({ percentiles, weeks }: ScenarioCardsProps): React.ReactElement {
  const periodLabel = getPeriodLabel(weeks);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {/* Pessimista */}
      <div
        data-testid="scenario-card-pessimista"
        className="rounded border border-red-300 bg-red-50 p-4"
      >
        <div className="text-sm font-medium text-red-700">Pessimista</div>
        <div className="text-xl font-semibold text-red-700">
          {formatUsdSigned(percentiles.p2_5)}
        </div>
        <div className="text-xs text-muted-foreground">
          1 a cada 40 {periodLabel}
        </div>
      </div>

      {/* Mediana */}
      <div
        data-testid="scenario-card-mediana"
        className="rounded border border-blue-300 bg-blue-50 p-4"
      >
        <div className="text-sm font-medium text-blue-700">Resultado tipico</div>
        <div className="text-xl font-semibold text-blue-700">
          {formatUsdSigned(percentiles.p50)}
        </div>
        <div className="text-xs text-muted-foreground">
          Mediana (50%)
        </div>
      </div>

      {/* Otimista */}
      <div
        data-testid="scenario-card-otimista"
        className="rounded border border-green-300 bg-green-50 p-4"
      >
        <div className="text-sm font-medium text-green-700">Otimista</div>
        <div className="text-xl font-semibold text-green-700">
          {formatUsdSigned(percentiles.p97_5)}
        </div>
        <div className="text-xs text-muted-foreground">
          1 a cada 40 {periodLabel}
        </div>
      </div>
    </div>
  );
}

export default ScenarioCards;
