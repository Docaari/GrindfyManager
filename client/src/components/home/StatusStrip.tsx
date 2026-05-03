/**
 * RF-09 — Status Strip 4 KPIs (Sprint home-reform-1) + Onda 3 (sparklines + KPI Hoje fix).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-09, §5.1 S1, §3 D8, D-FOUNDER-1
 * ADR-099 §2.1, ADR-110 §2.5 (sticky)
 *
 * 4 KPIs (NUNCA 5): Banca / ROI 30d / Hoje / Pendencias.
 * Cada card clicavel navega para rota correspondente.
 * Cor amber soh quando pendencias > 0 (anti Christmas-tree).
 *
 * Onda 3 mudancas:
 *   - RF-A4: sparkline Banca + ROI 30d (Recharts 60x20).
 *   - RF-C1: KPI Hoje aponta para /grade-planner (era /coach).
 */

import React from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';
import Sparkline from './Sparkline';

interface BancaKpi {
  totalUsd: number;
  bisAvailable: number | null;
  deltaPct7d: number | null;
  sparkline: number[];
}

interface RoiKpi {
  value: number;
  sparkline: number[];
}

interface TodayKpi {
  plannedCount: number;
  firstStartTime: string | null;
  realizedPnlUsd: number | null;
}

interface PendenciasKpi {
  starredHands: number;
  cooldownAlerts: number;
}

interface StatusStripData {
  banca: BancaKpi | null;
  roi30d: RoiKpi | null;
  today: TodayKpi | null;
  pendencias: PendenciasKpi | null;
}

interface StatusStripProps {
  data: StatusStripData;
}

function fmtUsd(v: number): string {
  return `$${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function KpiCard(props: {
  testId: string;
  href: string;
  kpi: 'banca' | 'roi' | 'hoje' | 'pendencias';
  label: string;
  children: React.ReactNode;
  amber?: boolean;
}): JSX.Element {
  const { testId, href, kpi, label, children, amber } = props;
  const handleClick = () => {
    emit('home_status_strip_kpi_click', { kpi });
    emit('home_block_click', { blockId: 'S1', action: `kpi:${kpi}` });
  };
  return (
    <Link href={href}>
      <a
        data-testid={testId}
        onClick={handleClick}
        className={`block rounded-lg border p-4 transition-colors hover:bg-accent ${
          amber ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-card'
        }`}
      >
        <div className="text-xs uppercase text-muted-foreground tracking-wide">
          {label}
        </div>
        <div className="mt-1">{children}</div>
      </a>
    </Link>
  );
}

export default function StatusStrip({ data }: StatusStripProps): JSX.Element {
  const pendCount =
    (data.pendencias?.starredHands ?? 0) + (data.pendencias?.cooldownAlerts ?? 0);
  const pendAmber = pendCount > 0;

  const bancaSparkData = data.banca?.sparkline ?? [];
  const roiSparkData = data.roi30d?.sparkline ?? [];
  const roiValue = data.roi30d?.value ?? null;

  return (
    <div
      data-testid="home-status-strip"
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-visible"
    >
      {/* Banca */}
      <KpiCard
        testId="status-strip-card-banca"
        href="/bankroll"
        kpi="banca"
        label="Banca"
      >
        {data.banca ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="text-3xl font-bold">{fmtUsd(data.banca.totalUsd)}</div>
              {bancaSparkData.length > 1 ? (
                <Sparkline
                  data={bancaSparkData}
                  delta={data.banca.deltaPct7d}
                  testId="sparkline-banca"
                />
              ) : null}
            </div>
            {data.banca.bisAvailable !== null && (
              <div className="text-xs text-muted-foreground">
                {data.banca.bisAvailable} BIs disponiveis
              </div>
            )}
            {data.banca.deltaPct7d !== null && (
              <div className="text-xs text-muted-foreground">
                {data.banca.deltaPct7d >= 0 ? '+' : ''}
                {data.banca.deltaPct7d.toFixed(1)}% 7d
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            Configure sua banca
          </div>
        )}
      </KpiCard>

      {/* ROI 30d */}
      <KpiCard
        testId="status-strip-card-roi"
        href="/dashboard"
        kpi="roi"
        label="ROI 30d"
      >
        {data.roi30d ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="text-3xl font-bold">
                {data.roi30d.value >= 0 ? '+' : ''}
                {data.roi30d.value.toFixed(1)}%
              </div>
              {roiSparkData.length > 1 ? (
                <Sparkline
                  data={roiSparkData}
                  delta={roiValue}
                  testId="sparkline-roi30d"
                />
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">Ultimos 30 dias</div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            Sem dados — importe CSVs
          </div>
        )}
      </KpiCard>

      {/* Hoje */}
      <KpiCard
        testId="status-strip-card-hoje"
        href="/grade-planner"
        kpi="hoje"
        label="Hoje"
      >
        {data.today ? (
          data.today.plannedCount > 0 ? (
            <>
              <div className="text-3xl font-bold">{data.today.plannedCount}</div>
              <div className="text-xs text-muted-foreground">
                torneios{' '}
                {data.today.firstStartTime
                  ? `· primeiro ${data.today.firstStartTime}`
                  : ''}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Sem grade hoje
            </div>
          )
        ) : (
          <div className="text-sm text-muted-foreground">Sem grade hoje</div>
        )}
      </KpiCard>

      {/* Pendencias */}
      <KpiCard
        testId="status-strip-card-pendencias"
        href="/estudos"
        kpi="pendencias"
        label="Pendencias"
        amber={pendAmber}
      >
        {data.pendencias && pendCount > 0 ? (
          <>
            <div className="text-3xl font-bold">{pendCount}</div>
            <div className="text-xs text-muted-foreground">
              {data.pendencias.starredHands} starred
              {data.pendencias.cooldownAlerts > 0
                ? ` · ${data.pendencias.cooldownAlerts} cooldown`
                : ''}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Tudo em dia</div>
        )}
      </KpiCard>
    </div>
  );
}
