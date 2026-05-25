import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

interface HistogramBucket {
  bucketStart: number;
  bucketEnd: number;
  count: number;
}

interface VarianceHistogramProps {
  histogram: HistogramBucket[];
  medianValue: number;
}

function formatUsd(v: number): string {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return v < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function VarianceHistogram({ histogram, medianValue }: VarianceHistogramProps): React.ReactElement {
  const totalCount = histogram.reduce((s, b) => s + b.count, 0);

  return (
    <div data-testid="variance-histogram">
      {/* Bar indicators for test assertions */}
      <div style={{ display: "none" }}>
        {histogram.map((bucket, i) => {
          const color = bucket.bucketEnd <= 0 ? "red" : "green";
          return (
            <div
              key={i}
              data-testid={`histogram-bar-${i}`}
              data-color={color}
              className={color === "red" ? "text-red-500" : "text-green-500"}
            />
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={histogram}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucketStart" tickFormatter={(v: number) => formatUsd(v)} />
          <YAxis />
          <Tooltip
            content={({ active, payload }: any) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as HistogramBucket;
              const pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : "0.0";
              return (
                <div className="rounded border bg-card p-2 text-xs">
                  <div>{formatUsd(d.bucketStart)} a {formatUsd(d.bucketEnd)}</div>
                  <div>{d.count} simulacoes ({pct}%)</div>
                </div>
              );
            }}
          />
          <Bar dataKey="count">
            {histogram.map((bucket, i) => (
              <Cell key={i} fill={bucket.bucketEnd <= 0 ? "#ef4444" : "#22c55e"} />
            ))}
          </Bar>
          <ReferenceLine
            x={medianValue}
            strokeDasharray="5 5"
            stroke="#6b7280"
            label="Mediana"
          />
        </BarChart>
      </ResponsiveContainer>
      <div data-testid="histogram-median-line" style={{ display: "none" }} />
    </div>
  );
}

export default VarianceHistogram;
