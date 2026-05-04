/**
 * SessionsRegisteredCard — Sprint home-reform-5 item 6.
 *
 * Spec: Docs/specs/home-reform-5.md Item 6 (renome "Performance" -> "Sessoes
 * Registradas" + 6 KPIs: Torneios / Profit / ROI / ITM / Mesas Finais /
 * Cravadas). Fonte: session_tournaments (live grind), all-time.
 *
 * Diferente do SessionsMonthCard / DashboardMonthCard (3 KPIs por mes), aqui
 * temos 6 KPIs all-time + linkagem pro /grind-live history.
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

export interface SessionsRegisteredData {
  tournaments: number;
  profit: number;
  invested: number;
  roi: number | null;
  itm: number;
  finalTables: number;
  wins: number;
}

interface Props {
  data: SessionsRegisteredData | null;
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

export default function SessionsRegisteredCard({ data }: Props): JSX.Element {
  const isEmpty = !data || data.tournaments === 0;

  return (
    <Link href="/grind-live">
      <a
        data-testid="sessions-registered-card"
        className="block rounded-lg border border-border bg-card p-4 hover:bg-accent transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold">Sessoes Registradas</h3>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            All time · /grind
          </span>
        </div>

        {isEmpty ? (
          <div
            data-testid="sessions-registered-card-empty"
            className="text-sm text-muted-foreground"
          >
            Nenhuma sessao registrada — inicie sua primeira sessao em /grind.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Kpi
              testId="sessions-registered-kpi-tournaments"
              label="Torneios"
              value={String(data!.tournaments)}
            />
            <Kpi
              testId="sessions-registered-kpi-profit"
              label="Profit"
              value={fmtUsd2(data!.profit)}
              valueClass={ProfitClass(data!.profit)}
            />
            <Kpi
              testId="sessions-registered-kpi-roi"
              label="ROI"
              value={fmtRoi(data!.roi)}
              valueClass={RoiClass(data!.roi)}
            />
            <Kpi
              testId="sessions-registered-kpi-itm"
              label="ITM"
              value={String(data!.itm)}
            />
            <Kpi
              testId="sessions-registered-kpi-final-tables"
              label="Mesas Finais"
              value={String(data!.finalTables)}
            />
            <Kpi
              testId="sessions-registered-kpi-wins"
              label="Cravadas"
              value={String(data!.wins)}
            />
          </div>
        )}
      </a>
    </Link>
  );
}
