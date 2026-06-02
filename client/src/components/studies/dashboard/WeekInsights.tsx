/**
 * Sprint Studies-Reform — RF-02: Insights da semana (3 KPIs)
 */

import React from 'react';
import { useLocation } from 'wouter';

interface WeekInsightsProps {
  insights: {
    themesOpenedThisWeek: number;
    spotsReviewedThisWeek: number;
    hoursStudiedThisWeek: number;
  };
}

export function WeekInsights({ insights }: WeekInsightsProps) {
  const [, navigate] = useLocation();
  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        data-testid="insight-themesOpened"
        onClick={() => navigate('/estudos/temas')}
        className="rounded border border-border bg-muted px-2 py-2 text-left hover:bg-accent"
      >
        <div className="text-lg font-bold text-foreground">{insights.themesOpenedThisWeek}</div>
        <div className="text-[11px] text-muted-foreground">temas abertos</div>
      </button>
      <button
        type="button"
        data-testid="insight-spotsReviewed"
        onClick={() => navigate('/estudos/spots')}
        className="rounded border border-border bg-muted px-2 py-2 text-left hover:bg-accent"
      >
        <div className="text-lg font-bold text-foreground">{insights.spotsReviewedThisWeek}</div>
        <div className="text-[11px] text-muted-foreground">spots revisados</div>
      </button>
      <button
        type="button"
        data-testid="insight-hoursStudied"
        onClick={() => navigate('/estudos/stats')}
        title="Ver historico de sessoes em Stats"
        className="rounded border border-border bg-muted px-2 py-2 text-left hover:bg-accent"
      >
        <div className="text-lg font-bold text-foreground">
          {insights.hoursStudiedThisWeek.toLocaleString('pt-BR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}h
        </div>
        <div className="text-[11px] text-muted-foreground">horas estudadas</div>
      </button>
    </div>
  );
}

export default WeekInsights;
