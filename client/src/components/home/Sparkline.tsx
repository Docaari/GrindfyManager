/**
 * Sparkline — RF-A4 (Onda 3).
 *
 * Mini-grafico 60x20 para Banca + ROI 30d. Sem axes/tooltip/legend.
 * Cor automatica:
 *   - emerald-500 quando delta >= 0
 *   - rose-500 quando delta < 0
 *   - zinc-500 quando delta == null
 *
 * Skip render quando data.length <= 1.
 *
 * Wave F (Fase 3 perf): trocou Recharts (389 KB chunk) por SVG inline.
 * Landing/Home renderizava Sparkline e baixava Recharts inteiro. SVG
 * 100 LoC manual entrega visualmente identico + zero dep cost.
 */

import React from "react";

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

  const stroke =
    delta == null
      ? "#71717a" // zinc-500
      : delta >= 0
        ? "#10b981" // emerald-500
        : "#f43f5e"; // rose-500

  const colorClass =
    delta == null ? "stroke-zinc-500" : delta >= 0 ? "stroke-emerald-500" : "stroke-rose-500";

  // Margin de 1px em cada lado (mantem comportamento original Recharts).
  const PAD = 1;
  const innerW = Math.max(1, width - PAD * 2);
  const innerH = Math.max(1, height - PAD * 2);

  // Normaliza valores pro range [0, innerH], invertido (Y cresce pra baixo no SVG).
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = PAD + (i / (data.length - 1)) * innerW;
      const y = PAD + innerH - ((v - min) / range) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div
      data-testid={testId}
      className={`inline-block ${colorClass}`}
      style={{ width, height }}
      aria-hidden="true"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
    </div>
  );
}
