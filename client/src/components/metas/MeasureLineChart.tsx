// =============================================================================
// MeasureLineChart — grafico planejado×executado por medida de direcao (ADR-241)
//
// Le GET /api/goals/:id/series (snapshots semanais) e plota duas linhas:
// planejado (expected / pace) vs executado (current). RF-06: SEM P&L/ROI — sao
// valores da medida de direcao (volume, estudo, etc), nunca lucro.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";

interface SeriesPoint {
  weekStartDate: string;
  expected: number | null;
  executed: number | null;
  compliancePct: number | null;
  status: string | null;
}

interface MeasureLineChartProps {
  goalId: string;
  title?: string;
}

export function MeasureLineChart({ goalId, title }: MeasureLineChartProps) {
  const { data, isLoading, isError } = useQuery<{ series: SeriesPoint[] }>({
    queryKey: ["/api/goals", goalId, "series"],
    queryFn: async () =>
      (await apiRequest("GET", `/api/goals/${goalId}/series`)) as { series: SeriesPoint[] },
    retry: false,
  });

  const series = data?.series ?? [];

  if (isLoading) {
    return (
      <div data-testid={`measure-chart-loading-${goalId}`} className="h-48 text-sm text-muted-foreground">
        Carregando grafico...
      </div>
    );
  }
  if (isError) {
    return (
      <div data-testid={`measure-chart-error-${goalId}`} className="h-48 text-sm text-muted-foreground">
        Grafico indisponivel.
      </div>
    );
  }
  if (series.length === 0) {
    return (
      <div data-testid={`measure-chart-empty-${goalId}`} className="text-sm text-muted-foreground">
        Sem historico ainda — o placar acumula uma marca por semana.
      </div>
    );
  }

  const chartData = series.map((p) => ({
    semana: p.weekStartDate?.slice(5) ?? "", // MM-DD
    Planejado: p.expected,
    Executado: p.executed,
  }));

  return (
    <div data-testid={`measure-chart-${goalId}`}>
      {title ? <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p> : null}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="semana" fontSize={11} tickLine={false} />
          <YAxis fontSize={11} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            labelFormatter={(l) => `Semana ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="Planejado"
            stroke="#94a3b8"
            strokeDasharray="5 4"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Executado"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default MeasureLineChart;
