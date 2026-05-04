/**
 * MonthSummaryCard — Sprint home-reform-4 / MEDIUM-11 reviewer.
 *
 * Card generico full-width com 3 KPIs (Torneios | Profit | ROI) + label mes,
 * usado por SessionsMonthCard (live grind) e DashboardMonthCard (uploads).
 * Eliminamos duplicacao mantendo wrappers thin de 5-10 linhas.
 *
 * Empty state friendly: mensagem custom via prop `emptyMessage`.
 *
 * Lessons aplicadas:
 *   #11 sem actions decorativas — props ditam comportamento.
 */

import React from 'react';
import { Link } from 'wouter';
import { tokens } from '@/lib/ui-tokens';
import { fmtUsdShort, fmtRoi, fmtMonth } from '@/lib/format';

export interface MonthSummaryData {
  monthStart: string;
  count: number;
  profitUsd: number;
  investedUsd: number;
  roiPct: number | null;
}

export interface MonthSummaryCardProps {
  /** Titulo visivel no header (ex: "Sessoes", "Dashboard"). */
  title: string;
  /** Destino do click (Wouter Link). */
  href: string;
  /** Mensagem do empty state (count=0 ou data=null). */
  emptyMessage: string;
  /** Prefixo do data-testid (ex: "sessions-month-card"). */
  testidPrefix: string;
  /** Dados do mes ou null para empty. */
  data: MonthSummaryData | null;
}

export default function MonthSummaryCard({
  title,
  href,
  emptyMessage,
  testidPrefix,
  data,
}: MonthSummaryCardProps): JSX.Element {
  const monthLabel = data
    ? fmtMonth(data.monthStart)
    : fmtMonth(new Date().toISOString().slice(0, 10));
  const isEmpty = !data || data.count === 0;

  return (
    <Link href={href}>
      <a
        data-testid={testidPrefix}
        className="block rounded-lg border border-border bg-card p-4 hover:bg-accent transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span
            data-testid={`${testidPrefix}-month`}
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Mes: {monthLabel}
          </span>
        </div>

        {isEmpty ? (
          <div
            data-testid={`${testidPrefix}-empty`}
            className="text-sm text-muted-foreground"
          >
            {emptyMessage}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div data-testid={`${testidPrefix}-count`} className="flex flex-col gap-0.5">
              <span className="text-3xl font-bold text-foreground">{data!.count}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Torneios
              </span>
            </div>
            <div data-testid={`${testidPrefix}-profit`} className="flex flex-col gap-0.5">
              <span
                className={`text-3xl font-bold ${
                  data!.profitUsd >= 0
                    ? tokens.color.delta.positive
                    : tokens.color.delta.negative
                }`}
              >
                {fmtUsdShort(data!.profitUsd)}
              </span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Profit
              </span>
            </div>
            <div data-testid={`${testidPrefix}-roi`} className="flex flex-col gap-0.5">
              <span
                className={`text-3xl font-bold ${
                  data!.roiPct == null
                    ? 'text-foreground'
                    : data!.roiPct >= 0
                      ? tokens.color.delta.positive
                      : tokens.color.delta.negative
                }`}
              >
                {fmtRoi(data!.roiPct)}
              </span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">ROI</span>
            </div>
          </div>
        )}
      </a>
    </Link>
  );
}
