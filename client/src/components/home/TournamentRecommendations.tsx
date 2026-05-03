/**
 * Sprint home-reform-2 — RF-31 (B9 Tournament Selector Top 3 Hoje).
 * Sprint home-reform-3 — RF-C3 (grade S destaque) + RF-C4 (badge "Ja na grade").
 *
 * Spec: Docs/specs/home-reform-2.md §3 B9, §5 RF-31
 *       Docs/specs/home-reform-3.md §RF-C3, §RF-C4
 *
 * 3 cards horizontais com name/buyin/score/grade.
 * Empty: "Configure sua grade..." (CTA /grade-planner) OR
 *        "Sem recomendacoes acima de score 70 hoje" se plannedTodayCount > 0.
 * Tracker:
 *   home_tournament_recommendations_view  { count } — mount
 *   home_tournament_recommendations_click { grade, score } — click
 *
 * Onda 3 mudancas:
 *   - Grade S: bg-gradient-to-br from-emerald-500/10 to-emerald-300/5 + border-emerald-500/40
 *   - Score sempre text-2xl font-bold
 *   - Badge "Ja na grade" quando alreadyInGrid===true
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
  alreadyInGrid?: boolean;
}

interface Props {
  data: Recommendation[];
  plannedTodayCount: number;
}

const GRADE_BORDER: Record<Recommendation['grade'], string> = {
  S: 'border-emerald-500/40',
  A: 'border-emerald-700/40',
  B: 'border-amber-700/40',
};

const GRADE_TEXT: Record<Recommendation['grade'], string> = {
  S: 'text-emerald-300',
  A: 'text-emerald-300',
  B: 'text-amber-300',
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
          const isS = t.grade === 'S';
          const cardClasses = [
            'w-full text-left px-3 py-2 rounded-md border transition-colors hover:bg-accent',
            GRADE_TEXT[t.grade],
            GRADE_BORDER[t.grade],
            isS ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-300/5' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={t.id}>
              <button
                type="button"
                data-testid={`home-tournament-recommendations-card-${t.id}`}
                data-grade={t.grade}
                onClick={() => emit('home_tournament_recommendations_click', { grade: t.grade, score: t.score })}
                className={cardClasses}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{name}</span>
                  <span className="text-xs uppercase px-1.5 py-0.5 rounded-md border border-current">
                    {t.grade}
                  </span>
                </div>
                <div className="text-2xl font-bold mt-1">{t.score}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ${t.buyinUsd} · {t.platform}
                </div>
                {t.alreadyInGrid === true ? (
                  <span
                    data-testid="recommendation-already-in-grid-badge"
                    className="inline-block mt-1 text-[10px] uppercase rounded-md border border-current px-1.5 py-0.5"
                  >
                    Ja na grade
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
