/**
 * DashboardMonthCard — Sprint home-reform-4 item 2+6.
 *
 * Spec: Docs/specs/home-reform-4.md item 2 (novo Card Dashboard) + item 6
 * (Performance abaixo de Sessoes, mesmo padrao). Mes corrente.
 *
 * Data source: tournaments WHERE grind_session_id IS NULL (CLAUDE.md §6.1)
 * — uploads/manual grade/sharkscope (historico oficial). Diferente do
 * SessionsMonthCard (que usa session_tournaments live).
 *
 * Layout simetrico ao SessionsMonthCard: full-width, 3 KPIs grandes
 * (Torneios | Profit | ROI), label "Mes: {Mes}". Empty state:
 * "Sem dados upados esse mes" (item 6 friendly tone).
 */

import React from 'react';
import { Link } from 'wouter';

interface DashboardMonthData {
  monthStart: string;
  count: number;
  profitUsd: number;
  investedUsd: number;
  roiPct: number | null;
}

interface Props {
  data: DashboardMonthData | null;
}

function fmtUsd(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtRoi(v: number | null): string {
  if (v === null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function fmtMonth(iso: string): string {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  if (!y || !m) return '';
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1, 12, 0, 0));
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function DashboardMonthCard({ data }: Props): JSX.Element {
  const monthLabel = data ? fmtMonth(data.monthStart) : fmtMonth(new Date().toISOString().slice(0, 10));
  const isEmpty = !data || data.count === 0;

  return (
    <Link href="/dashboard">
      <a
        data-testid="dashboard-month-card"
        className="block rounded-lg border border-border bg-card p-4 hover:bg-accent transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold">Dashboard</h3>
          <span
            data-testid="dashboard-month-card-month"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Mes: {monthLabel}
          </span>
        </div>

        {isEmpty ? (
          <div data-testid="dashboard-month-card-empty" className="text-sm text-muted-foreground">
            Sem dados upados esse mes
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div data-testid="dashboard-month-card-count" className="flex flex-col gap-0.5">
              <span className="text-3xl font-bold text-foreground">{data!.count}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Torneios</span>
            </div>
            <div data-testid="dashboard-month-card-profit" className="flex flex-col gap-0.5">
              <span
                className={`text-3xl font-bold ${
                  data!.profitUsd >= 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {fmtUsd(data!.profitUsd)}
              </span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Profit</span>
            </div>
            <div data-testid="dashboard-month-card-roi" className="flex flex-col gap-0.5">
              <span
                className={`text-3xl font-bold ${
                  data!.roiPct == null
                    ? 'text-foreground'
                    : data!.roiPct >= 0
                      ? 'text-emerald-500'
                      : 'text-rose-500'
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
