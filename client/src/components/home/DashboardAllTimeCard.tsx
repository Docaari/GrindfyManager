/**
 * DashboardAllTimeCard — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md Item 7 (Dashboard - All Time + 6 KPIs:
 * Torneios | Profit | ROI | ITM | Mesas Finais | Cravadas).
 *
 * Mesma estrutura do SessionsRegisteredCard (item 6) mas fonte = tournaments
 * historico (`grind_session_id IS NULL`, CLAUDE.md §6.1) e sem range de mes
 * (all-time). Linka para /dashboard.
 */

import React from 'react';
import { Link } from 'wouter';
import { tokens } from '@/lib/ui-tokens';
import { fmtRoi } from '@/lib/format';

function fmtUsd2(v: number): string {
  if (!Number.isFinite(v)) return '$0,00';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface DashboardAllTimeData {
  tournaments: number;
  profit: number;
  invested: number;
  roi: number | null;
  itm: number;
  finalTables: number;
  wins: number;
}

interface Props {
  data: DashboardAllTimeData | null;
}

function ProfitClass(v: number): string {
  if (v > 0) return tokens.color.delta.positive;
  if (v < 0) return tokens.color.delta.negative;
  return 'text-foreground';
}

function RoiClass(v: number | null): string {
  if (v == null) return 'text-foreground';
  if (v > 0) return tokens.color.delta.positive;
  if (v < 0) return tokens.color.delta.negative;
  return 'text-foreground';
}

function Kpi({
  testId,
  label,
  value,
  valueClass,
}: {
  testId: string;
  label: string;
  value: string;
  valueClass?: string;
}): JSX.Element {
  return (
    <div data-testid={testId} className="flex flex-col gap-0.5">
      <span className={`text-2xl font-bold ${valueClass ?? 'text-foreground'}`}>{value}</span>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

export default function DashboardAllTimeCard({ data }: Props): JSX.Element {
  const isEmpty = !data || data.tournaments === 0;

  return (
    <Link href="/dashboard">
      <a
        data-testid="dashboard-all-time-card"
        className="block rounded-lg border border-border bg-card p-4 hover:bg-accent transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold">Dashboard - All Time</h3>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            All Time · uploads
          </span>
        </div>

        {isEmpty ? (
          <div
            data-testid="dashboard-all-time-card-empty"
            className="text-sm text-muted-foreground"
          >
            Sem torneios upados ainda — importe um CSV ou registre na grade.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Kpi
              testId="dashboard-all-time-kpi-tournaments"
              label="Torneios"
              value={String(data!.tournaments)}
            />
            <Kpi
              testId="dashboard-all-time-kpi-profit"
              label="Profit"
              value={fmtUsd2(data!.profit)}
              valueClass={ProfitClass(data!.profit)}
            />
            <Kpi
              testId="dashboard-all-time-kpi-roi"
              label="ROI"
              value={fmtRoi(data!.roi)}
              valueClass={RoiClass(data!.roi)}
            />
            <Kpi
              testId="dashboard-all-time-kpi-itm"
              label="ITM"
              value={String(data!.itm)}
            />
            <Kpi
              testId="dashboard-all-time-kpi-final-tables"
              label="Mesas Finais"
              value={String(data!.finalTables)}
            />
            <Kpi
              testId="dashboard-all-time-kpi-wins"
              label="Cravadas"
              value={String(data!.wins)}
            />
          </div>
        )}
      </a>
    </Link>
  );
}
