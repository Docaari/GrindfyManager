/**
 * RF-16 — PerformanceMini F6 sparkline (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-16, §5.8 F6, §3 D12
 *
 * Sparkline + 3 metricas (ITM%, Cash%, ROI). Toggle 7d/30d/90d/YTD (default 30d).
 * Persiste em localStorage:home:f6:range. Toggle dispara re-fetch local.
 */

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

type Period = '7d' | '30d' | '90d' | 'ytd';

interface PerformanceData {
  roi: number;
  itm: number;
  cash: number;
  sparkline: number[];
  period: Period;
}

interface Props {
  data: PerformanceData | null;
}

function readStoredRange(): Period {
  try {
    const v = localStorage.getItem('home:f6:range') as Period | null;
    if (v === '7d' || v === '30d' || v === '90d' || v === 'ytd') return v;
  } catch {
    // ignore
  }
  return '30d';
}

function MiniSparkline({
  points,
  ariaLabel,
}: {
  points: number[];
  ariaLabel: string;
}): JSX.Element {
  if (!points || points.length === 0) {
    return (
      <div
        data-testid="performance-mini-sparkline"
        aria-label={ariaLabel}
        className="h-12 w-full rounded-md bg-muted/40"
      />
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const stepX = w / Math.max(1, points.length - 1);
  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      data-testid="performance-mini-sparkline"
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-12 text-primary"
      aria-label={ariaLabel}
      role="img"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ToggleBtn(props: {
  testId: string;
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      data-testid={props.testId}
      data-active={props.active ? 'true' : 'false'}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
        props.active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:bg-accent'
      }`}
    >
      {props.label}
    </button>
  );
}

export default function PerformanceMini({ data }: Props): JSX.Element {
  const [range, setRange] = useState<Period>(() => readStoredRange());

  // Re-fetch quando range muda (exceto se range eh 30d, que ja vem no overview).
  const localQuery = useQuery({
    queryKey: ['/api/dashboard/performance', { period: range }],
    queryFn: () => apiRequest('GET', `/api/dashboard/performance?period=${range}`),
    enabled: range !== '30d',
    staleTime: 30_000,
  });

  // Persiste em localStorage quando range muda.
  useEffect(() => {
    try {
      localStorage.setItem('home:f6:range', range);
    } catch {
      // ignore
    }
  }, [range]);

  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Sem dados de performance — importe CSVs
        </p>
        <Link href="/upload">
          <a className="mt-2 inline-block text-sm text-primary hover:underline">
            Importar →
          </a>
        </Link>
      </div>
    );
  }

  const effective = (range === '30d' ? data : (localQuery.data as PerformanceData | undefined)) ?? data;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold">Performance</h3>
        <div className="flex items-center gap-1.5">
          <ToggleBtn
            testId="performance-mini-toggle-7d"
            label="7d"
            active={range === '7d'}
            onClick={() => setRange('7d')}
          />
          <ToggleBtn
            testId="performance-mini-toggle-30d"
            label="30d"
            active={range === '30d'}
            onClick={() => setRange('30d')}
          />
          <ToggleBtn
            testId="performance-mini-toggle-90d"
            label="90d"
            active={range === '90d'}
            onClick={() => setRange('90d')}
          />
          <ToggleBtn
            testId="performance-mini-toggle-ytd"
            label="YTD"
            active={range === 'ytd'}
            onClick={() => setRange('ytd')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MiniSparkline
          points={effective.sparkline ?? []}
          ariaLabel="Grafico de performance ROI"
        />
        <div className="grid grid-cols-3 gap-3">
          <div data-testid="performance-mini-metric-itm" className="text-sm">
            <div className="text-xs uppercase text-muted-foreground">ITM</div>
            <div className="font-semibold">{effective.itm}%</div>
          </div>
          <div data-testid="performance-mini-metric-cash" className="text-sm">
            <div className="text-xs uppercase text-muted-foreground">Cash</div>
            <div className="font-semibold">{effective.cash}%</div>
          </div>
          <div data-testid="performance-mini-metric-roi" className="text-sm">
            <div className="text-xs uppercase text-muted-foreground">ROI</div>
            <div className="font-semibold">{effective.roi}%</div>
          </div>
        </div>
      </div>

      <Link href="/dashboard">
        <a
          data-testid="performance-mini-cta-dashboard"
          href="/dashboard"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Ver dashboard completo →
        </a>
      </Link>
    </div>
  );
}
