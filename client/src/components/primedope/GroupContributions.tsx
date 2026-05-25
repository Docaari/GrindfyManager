import * as React from "react";

interface GroupContribution {
  name: string;
  count: number;
  invested: number;
  expectedProfit: number;
}

interface GroupContributionsProps {
  groupContributions: GroupContribution[];
}

function formatUsd(v: number): string {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return v < 0 ? `-$${formatted}` : `$${formatted}`;
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

export function GroupContributions({ groupContributions }: GroupContributionsProps): React.ReactElement {
  const sorted = [...groupContributions].sort(
    (a, b) => Math.abs(b.expectedProfit) - Math.abs(a.expectedProfit),
  );

  const maxAbsEv = sorted.length > 0 ? Math.abs(sorted[0].expectedProfit) : 1;

  const totalCount = groupContributions.reduce((s, g) => s + g.count, 0);
  const totalInvested = groupContributions.reduce((s, g) => s + g.invested, 0);
  const totalEv = groupContributions.reduce((s, g) => s + g.expectedProfit, 0);

  return (
    <div data-testid="group-contributions" className="rounded border border-border bg-card p-4 space-y-2">
      <div className="text-sm font-medium">Contribuicao por Grupo</div>
      <div className="space-y-2">
        {sorted.map((group, i) => {
          const colorClass = group.expectedProfit >= 0 ? "text-green-600" : "text-red-600";
          const barColor = group.expectedProfit >= 0 ? "bg-green-500" : "bg-red-500";
          const widthPct = maxAbsEv > 0 ? Math.round((Math.abs(group.expectedProfit) / maxAbsEv) * 100) : 0;

          return (
            <div
              key={i}
              data-testid={`group-contribution-row-${i}`}
              className="space-y-1"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{group.name}</span>
                <span>{group.count}</span>
                <span>{formatUsd(group.invested)}</span>
                <span className={colorClass}>{formatUsdSigned(group.expectedProfit)}</span>
              </div>
              <div className="h-1.5 w-full rounded bg-muted">
                <div
                  className={`h-1.5 rounded bar ${barColor}`}
                  role="progressbar"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
        {groupContributions.length > 0 && (
          <div
            data-testid="group-contribution-total"
            className="flex items-center justify-between text-sm font-bold border-t pt-2"
          >
            <span>TOTAL</span>
            <span>{totalCount}</span>
            <span>{formatUsd(totalInvested)}</span>
            <span className={totalEv >= 0 ? "text-green-600" : "text-red-600"}>
              {formatUsdSigned(totalEv)}
            </span>
          </div>
        )}
        {groupContributions.length === 0 && (
          <div data-testid="group-contribution-total" className="text-xs text-muted-foreground">
            Nenhum grupo.
          </div>
        )}
      </div>
    </div>
  );
}

export default GroupContributions;
