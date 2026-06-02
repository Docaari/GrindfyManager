/**
 * Sprint Studies-Reform — RF-06: RecommendationsView
 *
 * Lista ate 10 cards de recomendacoes (leak / stale_spot / dormant_theme).
 * Filter chips por tipo. Empty state contextual baseado em source_counts.
 *
 * Lessons:
 *   #1 hooks first
 *   #2 data-testid: studies-view-recomendacoes, recommendation-card-{id}
 *   #9 try/catch com log antes do fallback (recoverable error)
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

type RecType = 'leak' | 'stale_spot' | 'dormant_theme';
type FilterType = RecType | 'todos';

interface RecItem {
  id: string;
  type: RecType;
  title: string;
  description?: string;
  priority_score: number;
  cta_action?: string;
  cta_url?: string;
  metadata?: Record<string, any>;
}

interface RecResponse {
  items: RecItem[];
  source_counts?: { leaks: number; stale_spots: number; dormant_themes: number };
  generated_at?: string;
}

const TYPE_BADGE_CLASS: Record<RecType, string> = {
  leak: 'bg-red-600/20 text-red-300 border border-red-600/40',
  stale_spot: 'bg-yellow-600/20 text-yellow-300 border border-yellow-600/40',
  dormant_theme: 'bg-purple-600/20 text-purple-300 border border-purple-600/40',
};

const TYPE_LABEL: Record<RecType, string> = {
  leak: 'Leak',
  stale_spot: 'Spot antigo',
  dormant_theme: 'Tema dormente',
};

const CTA_LABEL: Record<string, string> = {
  create_theme: 'Criar tema',
  review_spot: 'Revisar spot',
};

function ctaLabelFor(action: string | undefined): string {
  return (action && CTA_LABEL[action]) ?? 'Abrir';
}

async function fetchRecs(): Promise<RecResponse> {
  try {
    const res = await fetch('/api/study/recommendations', { credentials: 'include' });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as RecResponse;
  } catch (err) {
    console.error('[RecommendationsView] failed to load', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      items: [],
      source_counts: { leaks: 0, stale_spots: 0, dormant_themes: 0 },
    };
  }
}

export function RecommendationsView() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterType>('todos');

  const { data, isLoading } = useQuery<RecResponse>({
    queryKey: ['study', 'recommendations'],
    queryFn: fetchRecs,
    staleTime: 5 * 60 * 1000,
  });

  const items = data?.items ?? [];
  const sourceCounts = data?.source_counts ?? { leaks: 0, stale_spots: 0, dormant_themes: 0 };

  const filtered = useMemo(() => {
    const arr = filter === 'todos' ? items : items.filter((it) => it.type === filter);
    return arr.slice(0, 10);
  }, [items, filter]);

  if (isLoading) {
    return (
      <div data-testid="studies-view-recomendacoes" className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold text-white">Recomendacoes</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              data-testid={`recommendations-skeleton-${n}`}
              className="h-24 rounded-md bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  let emptyContextual = 'Voce esta em dia. Continue estudando.';
  if (sourceCounts.leaks > 0) {
    emptyContextual = `Detectamos ${sourceCounts.leaks} leak(s), mas nenhum tem severidade alta o bastante para sugestao.`;
  } else if (sourceCounts.stale_spots > 0) {
    emptyContextual = `${sourceCounts.stale_spots} spot(s) antigo(s) ainda nao geram recomendacao.`;
  } else if (sourceCounts.dormant_themes > 0) {
    emptyContextual = `${sourceCounts.dormant_themes} tema(s) dormente(s) — continue estudando.`;
  }

  return (
    <div data-testid="studies-view-recomendacoes" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Recomendacoes</h2>
        <div data-testid="recommendations-filter-type" className="flex items-center gap-2">
          {(['todos', 'leak', 'stale_spot', 'dormant_theme'] as FilterType[]).map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`recommendations-filter-type-${f}`}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`text-xs px-2 py-1 rounded border ${
                filter === f
                  ? 'bg-primary text-black border-primary'
                  : 'border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              {f === 'todos' ? 'Todos' : TYPE_LABEL[f as RecType]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          data-testid="recommendations-empty"
          className="rounded-lg border border-gray-700 bg-gray-800/40 p-8 text-center text-sm text-gray-400"
        >
          {emptyContextual}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((r) => {
            const badge = TYPE_BADGE_CLASS[r.type] ?? 'bg-gray-700 text-gray-300';
            const pct = Math.max(0, Math.min(100, r.priority_score));
            const navigateToCta = () => {
              if (r.cta_url) navigate(r.cta_url);
            };
            return (
              <article
                key={r.id}
                data-testid={`recommendation-card-${r.id}`}
                data-rec-type={r.type}
                role={r.cta_url ? 'button' : undefined}
                tabIndex={r.cta_url ? 0 : undefined}
                onClick={r.cta_url ? navigateToCta : undefined}
                onKeyDown={
                  r.cta_url
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigateToCta();
                        }
                      }
                    : undefined
                }
                className={`rounded-xl border border-gray-700/80 bg-gray-900/40 p-4 transition-all duration-200 ${
                  r.cta_url
                    ? 'cursor-pointer hover:-translate-y-0.5 hover:bg-gray-800/60 hover:border-gray-600 hover:shadow-lg hover:shadow-black/20 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    : ''
                }`}
              >
                <header className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badge}`}>
                    {TYPE_LABEL[r.type] ?? r.type}
                  </span>
                  <span className="text-[11px] text-gray-500">score {r.priority_score}</span>
                </header>
                <div className="text-sm font-semibold text-white mb-1">{r.title}</div>
                {r.description && (
                  <div className="text-[11px] text-gray-400 mb-2 line-clamp-2">
                    {r.description}
                  </div>
                )}
                <div
                  className="h-1.5 bg-gray-800 rounded overflow-hidden mb-2"
                  aria-hidden
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {r.cta_url && (
                  <button
                    type="button"
                    data-testid={`recommendation-card-${r.id}-cta`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(r.cta_url!);
                    }}
                    className="text-xs px-3 py-1.5 rounded bg-primary text-black font-semibold"
                  >
                    {ctaLabelFor(r.cta_action)}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RecommendationsView;
