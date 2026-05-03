/**
 * Sprint home-reform-2 — RF-34 (B12 Heuristicas server-side, frontend card).
 *
 * Spec: Docs/specs/home-reform-2.md §3 B12, §5 RF-34
 * ADR : Docs/architecture/decisions/108-home-heuristics-server-side-rules.md
 *
 * Lista vertical ate 3 heuristicas com severity color + CTA opcional.
 * Empty oculto silenciosamente (NAO renderiza placeholder).
 * Tracker:
 *   home_heuristics_view  { count }       — mount com count >= 1
 *   home_heuristics_click { id, severity } — click em CTA/item
 *
 * Lessons aplicadas:
 *   #1 hooks first
 *   #2 data-testid estavel
 *   #11 spec eh fonte da verdade
 */

import React, { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';

interface Heuristic {
  id: string;
  message: string;
  severity: 'info' | 'caution' | 'positive';
  ctaHref: string | null;
}

interface Props {
  data: Heuristic[] | null;
}

const SEVERITY_CLASSES: Record<Heuristic['severity'], string> = {
  info: 'text-zinc-300 border-zinc-700/40',
  caution: 'text-amber-300 border-amber-700/40',
  positive: 'text-emerald-300 border-emerald-700/40',
};

export default function HeuristicsCard({ data }: Props): JSX.Element | null {
  const viewedRef = useRef(false);
  const items = Array.isArray(data) ? data.slice(0, 3) : [];

  useEffect(() => {
    if (viewedRef.current) return;
    if (items.length === 0) return;
    viewedRef.current = true;
    emit('home_heuristics_view', { count: items.length });
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div
      data-testid="home-heuristics-card"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h3 className="text-sm font-semibold mb-3">Insights</h3>
      <ul className="space-y-2">
        {items.map((h) => (
          <li key={h.id}>
            <div
              data-testid={`home-heuristics-item-${h.id}`}
              data-severity={h.severity}
              className={`px-3 py-2 rounded-md border ${SEVERITY_CLASSES[h.severity]} flex items-center justify-between gap-2`}
            >
              <span className="text-sm flex-1">{h.message}</span>
              {h.ctaHref ? (
                <Link
                  href={h.ctaHref}
                  onClick={() => emit('home_heuristics_click', { id: h.id, severity: h.severity })}
                >
                  <a
                    href={h.ctaHref}
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    Ver →
                  </a>
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
