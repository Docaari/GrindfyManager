import * as React from "react";

interface Bucket {
  name: string;
  count: number;
  buyIn: number;
  investment: number;
}

interface BucketsTotalizerProps {
  buckets: Bucket[];
}

function formatUsd(v: number): string {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return v < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function BucketsTotalizer({ buckets }: BucketsTotalizerProps): React.ReactElement {
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const totalInvestment = buckets.reduce((s, b) => s + b.investment, 0);
  const abi = totalCount > 0 ? Math.round(totalInvestment / totalCount) : 0;

  return (
    <div data-testid="buckets-totalizer" className="rounded border border-border bg-card p-4">
      <div className="text-sm font-medium mb-2">Totalizador</div>
      <div className="flex items-center gap-4 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Torneios</span>
          <div data-testid="totalizer-count" className="font-semibold">{totalCount}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Investimento</span>
          <div data-testid="totalizer-investment" className="font-semibold">{formatUsd(totalInvestment)}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">ABI</span>
          <div data-testid="totalizer-abi" className="font-semibold">${abi}</div>
        </div>
      </div>
    </div>
  );
}

export default BucketsTotalizer;
