/**
 * Sprint home-reform-1-5 — RF-22.1 + RF-22.6 (B1 DailyInsight componente UI).
 *
 * Spec : Docs/specs/home-reform-1-5.md RF-22.1, RF-22.6, RNF-1.5-6
 * ADR  : Docs/architecture/decisions/106-home-daily-insight-rule-engine.md
 *
 * Card horizontal full-width: emoji + title + body + CTA. Chama a engine
 * pura `computeDailyInsight(data)` para obter 1 insight (nunca null).
 *
 * Tracker:
 *   - emit('home_insight_view', { insightType, severity }) 1x no mount
 *   - emit('home_insight_click', { insightType, ctaLabel, href }) no click do CTA
 *
 * Lessons aplicadas:
 *   #1   hooks ANTES de early return — neste componente nao ha return condicional
 *        antes de hooks (engine nunca retorna null)
 *   #11  spec eh fonte da verdade
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Link } from 'wouter';
import { tokens } from '@/lib/ui-tokens';
import { emit } from '@/lib/tracker';
import { computeDailyInsight, type DailyInsight as DailyInsightT } from '@/lib/home/dailyInsight';
import { useAuth } from '@/contexts/AuthContext';

interface DailyInsightProps {
  data: any;
}

function severityClasses(sev: DailyInsightT['severity']): string {
  if (sev === 'critical') {
    return `${tokens.color.warn.border} ${tokens.color.warn.bg}`;
  }
  if (sev === 'celebration') {
    // Texto neutro, sem cor verde gritante (anti-Christmas tree).
    return `border-border bg-card`;
  }
  // neutral / default
  return 'border-border bg-card';
}

export default function DailyInsight({ data }: DailyInsightProps): JSX.Element {
  const { user } = useAuth();
  const userId = user?.userPlatformId;
  // Memoizacao: dep em meta.generatedAt para evitar recompute.
  const insight = useMemo<DailyInsightT>(
    () => computeDailyInsight(data ?? {}, { userId }),
    [data?.meta?.generatedAt, userId],
  );

  const viewEmittedRef = useRef(false);
  useEffect(() => {
    if (viewEmittedRef.current) return;
    viewEmittedRef.current = true;
    emit('home_insight_view', {
      insightType: insight.type,
      severity: insight.severity ?? 'neutral',
    });
    // Tough-stretch grava timestamp pra cooldown 2d (rule respeitar proximo render).
    if (insight.type === 'tough-stretch' && userId) {
      try {
        const key = `daily-insight-cooldown:tough-stretch:${userId}`;
        localStorage.setItem(key, new Date().toISOString());
      } catch {}
    }
  }, [insight.type, insight.severity, userId]);

  const handleClick = () => {
    emit('home_insight_click', {
      insightType: insight.type,
      ctaLabel: insight.cta.label,
      href: insight.cta.href,
    });
  };

  return (
    <div
      data-testid="home-daily-insight"
      data-severity={insight.severity ?? 'neutral'}
      role="article"
      aria-label={`Insight do dia: ${insight.title}`}
      className={`rounded-lg border p-3 md:p-4 transition-colors ${severityClasses(insight.severity)}`}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
        {insight.emoji && (
          <div className="text-xl md:text-2xl flex-shrink-0" aria-hidden="true">
            {insight.emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{insight.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{insight.body}</div>
        </div>
        <Link href={insight.cta.href}>
          <a
            data-testid="home-daily-insight-cta"
            href={insight.cta.href}
            onClick={handleClick}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 flex-shrink-0 self-start md:self-center"
          >
            {insight.cta.label}
          </a>
        </Link>
      </div>
    </div>
  );
}
