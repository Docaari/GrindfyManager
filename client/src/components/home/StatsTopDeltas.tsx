/**
 * Sprint home-reform-2 — RF-29 (B7 Stats Analyzer Top 3 Deltas).
 *
 * Spec: Docs/specs/home-reform-2.md §3 B7, §5 RF-29
 *
 * 3 chips horizontais com label/current/delta. Empty state CTA /estudos.
 * Tracker:
 *   home_stats_top_deltas_view  { count }   — mount com count >= 1
 *   home_stats_top_deltas_click { stat, severity }
 *
 * Lessons aplicadas:
 *   #1 hooks first (useEffect antes de early return)
 *   #2 data-testid estavel
 *   #11 spec eh fonte da verdade
 */

import React, { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';

interface TopDelta {
  stat: string;
  statLabel: string;
  baseline: number;
  current: number;
  delta: number;
  deltaAbs: number;
  severity: 'high' | 'medium' | 'low';
  direction: 'positive' | 'negative' | 'neutral';
  period: '30d';
}

interface Props {
  data: TopDelta[] | null;
}

const SEVERITY_CLASSES: Record<TopDelta['severity'], string> = {
  high: 'text-rose-300 border-rose-700/40',
  medium: 'text-amber-300 border-amber-700/40',
  low: 'text-zinc-300 border-zinc-700/40',
};

const DIRECTION_CLASSES: Record<TopDelta['direction'], string> = {
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  neutral: 'text-zinc-300',
};

export default function StatsTopDeltas({ data }: Props): JSX.Element {
  const viewedRef = useRef(false);
  const items = Array.isArray(data) ? data.slice(0, 3) : [];

  useEffect(() => {
    if (viewedRef.current) return;
    if (items.length === 0) return;
    viewedRef.current = true;
    emit('home_stats_top_deltas_view', { count: items.length });
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div
        data-testid="home-stats-top-deltas-empty"
        className="rounded-lg border border-border bg-card p-4"
      >
        <p className="text-sm text-muted-foreground">
          Importe HUD para ver insights de stats
        </p>
        <Link href="/estudos">
          <a
            data-testid="home-stats-top-deltas-empty-cta"
            href="/estudos"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            Abrir Estudos →
          </a>
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid="home-stats-top-deltas"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h3 className="text-sm font-semibold mb-3">Stats — Top deltas (30d)</h3>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {items.map((d) => (
          <li key={d.stat}>
            <button
              type="button"
              data-testid={`home-stats-top-deltas-chip-${d.stat}`}
              data-severity={d.severity}
              data-direction={d.direction}
              onClick={() => emit('home_stats_top_deltas_click', { stat: d.stat, severity: d.severity })}
              className={`w-full text-left px-3 py-2 rounded-md border ${SEVERITY_CLASSES[d.severity]} hover:bg-accent transition-colors`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{d.statLabel}</span>
                <span className={`text-xs ${DIRECTION_CLASSES[d.direction]}`}>
                  {d.delta > 0 ? '+' : ''}
                  {d.delta.toFixed(1)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {d.baseline.toFixed(1)} → {d.current.toFixed(1)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
