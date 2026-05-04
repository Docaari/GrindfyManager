/**
 * SessionsMonthCard — Sprint home-reform-4 item 1.
 *
 * Spec: Docs/specs/home-reform-4.md item 1 (Card "Sessoes" mes atual).
 *
 * Wrapper thin de <MonthSummaryCard /> (MEDIUM-11 reviewer): elimina
 * duplicacao com DashboardMonthCard. Layout/KPIs/empty-state/cores ficam
 * centralizados em MonthSummaryCard + tokens.color.delta.
 *
 * Data source: session_tournaments do mes corrente (live grind).
 * Diferente do Card Dashboard (item 2) que usa tournaments WHERE
 * grind_session_id IS NULL — CLAUDE.md §6.1.
 */

import React from 'react';
import MonthSummaryCard, { type MonthSummaryData } from './MonthSummaryCard';

interface Props {
  data: MonthSummaryData | null;
}

export default function SessionsMonthCard({ data }: Props): JSX.Element {
  return (
    <MonthSummaryCard
      title="Sessoes"
      href="/grind"
      emptyMessage="Sem sessoes esse mes"
      testidPrefix="sessions-month-card"
      data={data}
    />
  );
}
