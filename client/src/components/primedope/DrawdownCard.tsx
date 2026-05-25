import * as React from "react";

interface Drawdown {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  worst: number;
}

interface DrawdownCardProps {
  drawdown: Drawdown;
}

function formatUsd(v: number): string {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `$${formatted}`;
}

export function DrawdownCard({ drawdown }: DrawdownCardProps): React.ReactElement {
  const worstVal = drawdown.worst || 1;
  const levels = [
    { key: "tipico", label: "Tipico", value: drawdown.median },
    { key: "preparar", label: "Preparar (95%)", value: drawdown.p95 },
    { key: "pior", label: "Pior raro", value: drawdown.worst },
  ];

  return (
    <div data-testid="drawdown-card" className="rounded border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">Drawdown esperado</div>
      <p className="text-xs text-muted-foreground">
        Maior queda do pico ao vale no periodo simulado.
      </p>
      <div className="space-y-3">
        {levels.map((level) => {
          const widthPct = worstVal > 0 ? Math.round((level.value / worstVal) * 100) : 0;
          return (
            <div key={level.key} data-testid={`drawdown-${level.key}`} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{level.label}</span>
                <span className="font-semibold">{formatUsd(level.value)}</span>
              </div>
              <div className="h-2 w-full rounded bg-muted">
                <div
                  className="h-2 rounded bar bg-red-400"
                  data-testid={`drawdown-bar-${level.key}`}
                  role="progressbar"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DrawdownCard;
