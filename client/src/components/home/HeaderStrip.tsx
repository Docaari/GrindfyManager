/**
 * HeaderStrip — Sprint home-reform-5 item 2.
 *
 * Spec: Docs/specs/home-reform-5.md item 2 (Header Sessao).
 *
 * 4 KPIs do topo da Home: Banca | Hoje | ROI 30D | Pendencia.
 * Substitui StatusStrip nesta posicao da Home (StatusStrip permanece exportado
 * pra compatibilidade durante migracao).
 *
 * Cada card eh clickable e navega para rota relevante:
 *   Banca       -> /bankroll
 *   Hoje        -> /grade-planner
 *   ROI 30D     -> /dashboard
 *   Pendencia   -> ctaHref vindo do payload (ex: /upload, /estudos)
 *
 * Empty states:
 *   Banca null     -> "Configure sua banca"
 *   Today.isOff    -> "DAY OFF"
 *   ROI hasData=0  -> "Sem dados 30D"
 *   Pendency null  -> "Tudo em dia"
 */

import React from 'react';
import { Link } from 'wouter';
import { emit } from '@/lib/tracker';

export interface HeaderStripProps {
  data: {
    banca: { totalUsd: number; currency: 'USD' } | null;
    today: { profile: 'A' | 'B' | 'C' | null; plannedCount: number; isOff: boolean };
    roi30d: { value: number | null; hasData: boolean };
    pendency: {
      kind:
        | 'bankroll_check'
        | 'coach_report'
        | 'upload_tournaments'
        | 'spot_review'
        | 'focus_stat';
      label: string;
      ctaHref: string;
      daysSince: number | null;
    } | null;
  };
}

function fmtUsd2(v: number): string {
  return `$${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KpiCard(props: {
  testId: string;
  href: string;
  kpi: string;
  label: string;
  amber?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const { testId, href, kpi, label, amber, children } = props;
  const handleClick = () => {
    emit('home_header_strip_kpi_click', { kpi });
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

export default function HeaderStrip({ data }: HeaderStripProps): JSX.Element {
  const { banca, today, roi30d, pendency } = data;

  return (
    <div
      data-testid="home-header-strip"
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-visible"
    >
      {/* 2.1 Banca */}
      <KpiCard
        testId="header-strip-banca"
        href="/bankroll"
        kpi="banca"
        label="Banca"
      >
        {banca ? (
          <>
            <div data-testid="header-strip-banca-value" className="text-3xl font-bold">
              {fmtUsd2(banca.totalUsd)}
            </div>
            <div className="text-xs text-muted-foreground">USD consolidado</div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Configure sua banca</div>
        )}
      </KpiCard>

      {/* 2.2 Hoje */}
      <KpiCard
        testId="header-strip-hoje"
        href="/grade-planner"
        kpi="hoje"
        label="Hoje"
      >
        {today.isOff ? (
          <div data-testid="header-strip-hoje-off" className="text-3xl font-bold uppercase">
            DAY OFF
          </div>
        ) : (
          <>
            <div data-testid="header-strip-hoje-count" className="text-3xl font-bold">
              {today.plannedCount}
            </div>
            <div className="text-xs text-muted-foreground">
              {today.plannedCount === 1 ? 'torneio' : 'torneios'}
              {today.profile ? ` · perfil ${today.profile}` : ''}
            </div>
          </>
        )}
      </KpiCard>

      {/* 2.3 ROI 30D */}
      <KpiCard
        testId="header-strip-roi"
        href="/dashboard"
        kpi="roi"
        label="ROI 30D"
      >
        {roi30d.hasData && roi30d.value !== null ? (
          <>
            <div data-testid="header-strip-roi-value" className="text-3xl font-bold">
              {roi30d.value >= 0 ? '+' : ''}
              {roi30d.value.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Movimentacao 30 dias</div>
          </>
        ) : (
          <div data-testid="header-strip-roi-empty" className="text-sm text-muted-foreground">
            Sem dados 30D
          </div>
        )}
      </KpiCard>

      {/* 2.4 Pendencia */}
      <KpiCard
        testId="header-strip-pendencia"
        href={pendency?.ctaHref ?? '/'}
        kpi="pendencia"
        label="Pendencia"
        amber={!!pendency}
      >
        {pendency ? (
          <>
            <div data-testid="header-strip-pendencia-label" className="text-base font-semibold">
              {pendency.label}
            </div>
            {pendency.daysSince !== null && pendency.daysSince > 0 ? (
              <div className="text-xs text-muted-foreground">
                ha {pendency.daysSince} {pendency.daysSince === 1 ? 'dia' : 'dias'}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Resolver agora</div>
            )}
          </>
        ) : (
          <div data-testid="header-strip-pendencia-clear" className="text-sm text-muted-foreground">
            Tudo em dia
          </div>
        )}
      </KpiCard>
    </div>
  );
}
