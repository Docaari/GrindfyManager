/**
 * DashboardMonthCard — Sprint home-reform-4 item 2+6.
 *
 * Spec: Docs/specs/home-reform-4.md item 2 (novo Card Dashboard) + item 6
 * (Performance abaixo de Sessoes, mesmo padrao). Mes corrente.
 *
 * Wrapper thin de <MonthSummaryCard /> (MEDIUM-11 reviewer): elimina
 * duplicacao com SessionsMonthCard. Toda renderizacao em MonthSummaryCard.
 *
 * Data source: tournaments WHERE grind_session_id IS NULL (CLAUDE.md §6.1)
 * — uploads/manual grade/sharkscope (historico oficial). Diferente do
 * SessionsMonthCard (que usa session_tournaments live).
 */

import React from 'react';
import MonthSummaryCard, { type MonthSummaryData } from './MonthSummaryCard';

interface Props {
  data: MonthSummaryData | null;
}

export default function DashboardMonthCard({ data }: Props): JSX.Element {
  return (
    <MonthSummaryCard
      title="Dashboard"
      href="/dashboard"
      emptyMessage="Sem dados upados esse mes"
      testidPrefix="dashboard-month-card"
      data={data}
    />
  );
}
