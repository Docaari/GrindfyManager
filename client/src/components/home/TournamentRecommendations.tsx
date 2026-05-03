/**
 * Sprint home-reform-2 — RF-31 (B9 Tournament Selector Top 3 Hoje).
 *
 * Spec: Docs/specs/home-reform-2.md §3 B9, §5 RF-31
 *
 * 3 cards horizontais com name/buyin/score/grade.
 * Empty: "Configure sua grade..." (CTA /grade-planner) OR
 *        "Sem recomendacoes acima de score 70 hoje" se plannedTodayCount > 0.
 * Tracker:
 *   home_tournament_recommendations_view  { count } — mount
 *   home_tournament_recommendations_click { grade, score } — click
 *
 * Lessons aplicadas:
 *   #1 hooks first
 *   #2 data-testid estavel
 *   #11 spec eh fonte da verdade
 */

import React, { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';

interface Recommendation {
  id: string;
  name: string;
  buyinUsd: number;
  buyinNative: number;
  currency: string;
  score: number;
  grade: 'S' | 'A' | 'B';
  startTime: string;
  platform: string;
  alreadyInGrid: boolean;
}

interface Props {
  data: Recommendation[];
  plannedTodayCount: number;
}

const GRADE_CLASSES: Record<Recommendation['grade'], string> = {
  S: 'text-emerald-300 border-emerald-700/40',
  A: 'text-emerald-300 border-emerald-700/40',
  B: 'text-amber-300 border-amber-700/40',
};

export default function TournamentRecommendations({ data, plannedTodayCount }: Props): JSX.Element {
  const viewedRef = useRef(false);
  const items = Array.isArray(data) ? data.slice(0, 3) : [];

  useEffect(() => {
    if (viewedRef.current) return;
    if (items.length === 0) return;
    viewedRef.current = true;
    emit('home_tournament_recommendations_view', { count: items.length });
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div
        data-testid="home-tournament-recommendations-empty"
        className="rounded-lg border border-border bg-card p-4"
      >
        {plannedTodayCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem recomendacoes acima de score 70 hoje. Tente novamente amanha.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Configure sua grade para ver recomendacoes
            </p>
            <Link href="/grade-planner">
              <a
                data-testid="home-tournament-recommendations-empty-cta"
                href="/grade-planner"
                className="mt-2 inline-block text-sm text-primary hover:underline"
              >
                Abrir Grade →
              </a>
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="home-tournament-recommendations"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h3 className="text-sm font-semibold mb-3">Recomendacoes de hoje</h3>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {items.map((t) => {
          const name = t.name.length > 40 ? `${t.name.slice(0, 40)}...` : t.name;
          return (
            <li key={t.id}>
              <button
                type="button"
                data-testid={`home-tournament-recommendations-card-${t.id}`}
                data-grade={t.grade}
                onClick={() => emit('home_tournament_recommendations_click', { grade: t.grade, score: t.score })}
                className={`w-full text-left px-3 py-2 rounded-md border ${GRADE_CLASSES[t.grade]} hover:bg-accent transition-colors`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{name}</span>
                  <span className="text-xs uppercase px-1.5 py-0.5 rounded-md border border-current">
                    {t.grade}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ${t.buyinUsd} · score {t.score} · {t.platform}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
