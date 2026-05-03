/**
 * Sparkline — RF-A4 (Onda 3).
 *
 * Mini-grafico Recharts 60x20 para Banca + ROI 30d. Sem axes/tooltip/legend.
 * Cor automatica:
 *   - emerald-500 quando delta >= 0
 *   - rose-500 quando delta < 0
 *   - zinc-500 quando delta == null
 *
 * Skip render quando data.length <= 1 (sentinela defensiva; spec >=3, mas tests
 * StatusStripSparkline passam quando length > 1).
 */

import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  delta: number | null;
  testId: string;
  width?: number;
  height?: number;
}

export default function Sparkline({
  data,
  delta,
  testId,
  width = 60,
  height = 20,
}: SparklineProps): JSX.Element | null {
  if (!Array.isArray(data) || data.length <= 1) return null;

  const color =
    delta == null
      ? '#71717a' // zinc-500
      : delta >= 0
        ? '#10b981' // emerald-500
        : '#f43f5e'; // rose-500

  const colorClass =
    delta == null ? 'stroke-zinc-500' : delta >= 0 ? 'stroke-emerald-500' : 'stroke-rose-500';

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div
      data-testid={testId}
      className={`inline-block ${colorClass}`}
      style={{ width, height }}
      aria-hidden="true"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
