/**
 * AllTimeEvolutionChart — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md Item 7. Grafico evolucao all-time agrupado
 * por mes UTC. Mesma fonte do DashboardAllTimeCard (CLAUDE.md §6.1 —
 * `tournaments WHERE grind_session_id IS NULL`).
 *
 * Eixo X = mes (label "Jan 2024", "Fev 2024", ...). Linha unica = profit
 * acumulado USD. Empty quando nenhum mes teve volume.
 *
 * Endpoint /api/home/evolution?scope=all (Sprint home-reform-5 item 7).
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '@/lib/queryClient';

interface EvolutionMonth {
  month: string;
  profitUsd: number;
  cumulativeProfitUsd: number;
  count: number;
}

interface EvolutionResponse {
  months: EvolutionMonth[];
  totalProfitUsd: number;
}

function fmtUsd(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtMonthShort(iso: string): string {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  if (!y || !m) return '';
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1, 12, 0, 0));
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
  }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const ChartTooltip = ({ active, payload, label }: any): JSX.Element | null => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload as EvolutionMonth;
  const monthLabel = (() => {
    try {
      return fmtMonthShort(point.month);
    } catch {
      return label;
    }
  })();
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-foreground">{monthLabel}</div>
      <div className="text-muted-foreground">
        Acumulado:{' '}
        <span
          className={`font-semibold ${
            point.cumulativeProfitUsd >= 0 ? 'text-emerald-500' : 'text-rose-500'
          }`}
        >
          {fmtUsd(point.cumulativeProfitUsd)}
        </span>
      </div>
      <div className="text-muted-foreground">
        Profit do mes:{' '}
        <span
          className={
            point.profitUsd === 0
              ? ''
              : point.profitUsd > 0
                ? 'text-emerald-500'
                : 'text-rose-500'
          }
        >
          {fmtUsd(point.profitUsd)}
        </span>
      </div>
      <div className="text-muted-foreground">Torneios: {point.count}</div>
    </div>
  );
};

export default function AllTimeEvolutionChart(): JSX.Element {
  const { data, isLoading, isError } = useQuery<EvolutionResponse>({
    queryKey: ['/api/home/evolution', 'all'],
    queryFn: () => apiRequest('GET', '/api/home/evolution?scope=all'),
    staleTime: 60_000,
  });

  const chartData = useMemo(() => {
    if (!data?.months) return [];
    return data.months.map((m) => ({
      ...m,
      label: fmtMonthShort(m.month),
    }));
  }, [data]);

  const totalProfit = data?.totalProfitUsd ?? 0;
  const hasVolume = chartData.some((m) => m.count > 0);

  return (
    <div
      data-testid="all-time-evolution-chart"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Evolucao All Time</h3>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Por mes
        </span>
      </div>

      {isLoading ? (
        <div
          data-testid="all-time-evolution-chart-loading"
          className="h-[280px] animate-pulse rounded-md bg-muted/40"
        />
      ) : isError ? (
        <div
          data-testid="all-time-evolution-chart-error"
          className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
        >
          Erro ao carregar evolucao
        </div>
      ) : !hasVolume ? (
        <div
          data-testid="all-time-evolution-chart-empty"
          className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
        >
          Sem torneios upados ainda — importe um CSV ou registre na grade.
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2">
            <span
              data-testid="all-time-evolution-chart-total"
              className={`text-2xl font-bold ${
                totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {fmtUsd(totalProfit)}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Acumulado all time
            </span>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => fmtUsd(Number(v))}
                  width={70}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cumulativeProfitUsd"
                  stroke={totalProfit >= 0 ? '#10b981' : '#f43f5e'}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
