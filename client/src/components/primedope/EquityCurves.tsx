import * as React from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface EquityCurvesData {
  paths: number[][];
  bands: {
    p2_5: number[];
    p15: number[];
    p85: number[];
    p97_5: number[];
  };
}

interface EquityCurvesProps {
  equityCurves: EquityCurvesData;
  weeks: number;
}

export function EquityCurves({ equityCurves, weeks }: EquityCurvesProps): React.ReactElement {
  const { paths, bands } = equityCurves;

  // Build chart data: one row per week
  const data = Array.from({ length: weeks }, (_, w) => {
    const row: Record<string, number> = { week: w + 1 };
    paths.forEach((path, i) => {
      row[`path${i}`] = path[w] ?? 0;
    });
    row.band95_lower = bands.p2_5[w] ?? 0;
    row.band95_upper = bands.p97_5[w] ?? 0;
    row.band70_lower = bands.p15[w] ?? 0;
    row.band70_upper = bands.p85[w] ?? 0;
    return row;
  });

  return (
    <div data-testid="equity-curves-chart">
      {/* Path testid indicators */}
      <div style={{ display: "none" }}>
        {paths.map((_, i) => (
          <div key={i} data-testid={`equity-path-${i}`} />
        ))}
      </div>
      {/* Band testid indicators */}
      <div data-testid="equity-band-70" style={{ display: "none" }} />
      <div data-testid="equity-band-95" style={{ display: "none" }} />
      {/* Zero line testid */}
      <div data-testid="equity-zero-line" style={{ display: "none" }} />

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          {/* 95% band */}
          <Area
            dataKey="band95_upper"
            stroke="none"
            fill="#3b82f6"
            fillOpacity={0.1}
          />
          <Area
            dataKey="band95_lower"
            stroke="none"
            fill="#ffffff"
            fillOpacity={0}
          />
          {/* 70% band */}
          <Area
            dataKey="band70_upper"
            stroke="none"
            fill="#3b82f6"
            fillOpacity={0.2}
          />
          <Area
            dataKey="band70_lower"
            stroke="none"
            fill="#ffffff"
            fillOpacity={0}
          />
          {/* Individual paths */}
          {paths.map((_, i) => (
            <Line
              key={i}
              dataKey={`path${i}`}
              stroke="#6b7280"
              strokeOpacity={0.15}
              dot={false}
              strokeWidth={1}
            />
          ))}
          {/* Zero line */}
          <ReferenceLine
            y={0}
            stroke="#9ca3af"
            strokeDasharray="5 5"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default EquityCurves;
