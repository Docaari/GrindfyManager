/**
 * MonthEvolutionChart — Sprint home-reform-4 item 10.
 *
 * Spec: Docs/specs/home-reform-4.md item 10. Grafico evolucao mes
 * selecionado abaixo do DashboardMonthCard. Mesma fonte do card
 * (CLAUDE.md §6.1 — `tournaments WHERE grind_session_id IS NULL`),
 * agregada por dia. Linha unica = profit acumulado USD.
 *
 * Mes corrente por default (sincronizado com DashboardMonthCard). Empty
 * state quando nenhum dia teve volume. Fetch isolado: query dedicada,
 * staleTime 60s.
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

interface EvolutionDay {
  date: string;
  profitUsd: number;
  cumulativeProfitUsd: number;
  count: number;
}

interface EvolutionResponse {
  monthStart: string;
  endDate: string;
  days: EvolutionDay[];
  totalProfitUsd: number;
}

interface Props {
  /** Default = mes corrente UTC (YYYY-MM). */
  month?: string;
}

function fmtUsd(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtMonth(iso: string): string {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  if (!y || !m) return '';
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1, 12, 0, 0));
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtDayShort(iso: string): string {
  if (!iso) return '';
  const [, , d] = iso.split('-');
  return d ?? '';
}

function currentMonthIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const ChartTooltip = ({ active, payload, label }: any): JSX.Element | null => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload as EvolutionDay;
  const dayLabel = (() => {
    try {
      const dt = new Date(`${point.date}T12:00:00Z`);
      return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(dt);
    } catch {
      return label;
    }
  })();
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-foreground">{dayLabel}</div>
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
        Profit do dia:{' '}
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

export default function MonthEvolutionChart({ month }: Props): JSX.Element {
  const monthIso = month ?? currentMonthIso();
  const { data, isLoading, isError } = useQuery<EvolutionResponse>({
    queryKey: ['/api/home/evolution', monthIso],
    queryFn: () => apiRequest('GET', `/api/home/evolution?month=${monthIso}`),
    staleTime: 60_000,
  });

  const chartData = useMemo(() => {
    if (!data?.days) return [];
    return data.days.map((d) => ({
      ...d,
      label: fmtDayShort(d.date),
    }));
  }, [data]);

  const monthLabel = fmtMonth(data?.monthStart ?? `${monthIso}-01`);
  const totalProfit = data?.totalProfitUsd ?? 0;
  const hasVolume = chartData.some((d) => d.count > 0);

  return (
    <div
      data-testid="month-evolution-chart"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Evolucao do mes</h3>
        <span
          data-testid="month-evolution-chart-month"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Mes: {monthLabel}
        </span>
      </div>

      {isLoading ? (
        <div
          data-testid="month-evolution-chart-loading"
          className="h-[280px] animate-pulse rounded-md bg-muted/40"
        />
      ) : isError ? (
        <div
          data-testid="month-evolution-chart-error"
          className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
        >
          Erro ao carregar evolucao
        </div>
      ) : !hasVolume ? (
        <div
          data-testid="month-evolution-chart-empty"
          className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
        >
          Sem dados upados esse mes
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2">
            <span
              data-testid="month-evolution-chart-total"
              className={`text-2xl font-bold ${
                totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {fmtUsd(totalProfit)}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Acumulado no mes
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
