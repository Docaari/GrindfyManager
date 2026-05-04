/**
 * ImmediateAction — Sprint home-reform-5 item 4.
 *
 * Spec: Docs/specs/home-reform-5.md item 4 (Acao Imediata: stat destaque +
 * Iniciar sessao).
 *
 * Card primary CTA da zona "Acao Imediata" da Home. Renderiza 1 das 3 variants
 * conforme prioridade resolvida no backend (`/api/home/overview` ->
 * `data.immediateAction`):
 *   - pending_hand   — "X mao(s) pendente(s)" -> /estudos.
 *   - focus_stat     — "Stat XYZ requer revisao" -> ctaHref (slot DORMENTE ate
 *                      Stats Analyzer destaque ser entregue).
 *   - start_session  — "X torneios planejados — perfis Y" -> /grind?open=quickstart
 *                      (modal Inicio Rapido, wired no GrindSession.tsx desde
 *                      home-reform-5 item 3).
 *
 * Quando data eh null (nenhum gancho ativo), nao renderiza nada (zona Acao
 * Imediata cai para a sub-grid PendingHandsList + CoachRecommendationCard).
 */

import React from 'react';
import { Link } from 'wouter';

export type ImmediateActionData =
  | { kind: 'pending_hand'; count: number; ctaHref: string }
  | { kind: 'focus_stat'; statName: string; daysSince: number; ctaHref: string }
  | {
      kind: 'start_session';
      plannedCount: number;
      activeProfilesLabel: string | null;
      ctaHref: string;
    };

interface Props {
  data: ImmediateActionData | null;
}

export default function ImmediateAction({ data }: Props): JSX.Element | null {
  if (!data) return null;

  if (data.kind === 'pending_hand') {
    const label = data.count === 1 ? '1 mão pendente' : `${data.count} mãos pendentes`;
    return (
      <div
        data-testid="immediate-action"
        data-kind="pending_hand"
        className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3"
      >
        <div>
          <h3 className="text-sm font-semibold">Ação imediata</h3>
          <p className="text-sm text-muted-foreground">{label} aguardando revisão.</p>
        </div>
        <Link href={data.ctaHref}>
          <a
            data-testid="immediate-action-cta"
            href={data.ctaHref}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Revisar agora →
          </a>
        </Link>
      </div>
    );
  }

  if (data.kind === 'focus_stat') {
    const days = Math.max(0, Math.floor(data.daysSince));
    return (
      <div
        data-testid="immediate-action"
        data-kind="focus_stat"
        className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3"
      >
        <div>
          <h3 className="text-sm font-semibold">Ação imediata</h3>
          <p className="text-sm text-muted-foreground">
            Stat <span className="font-mono">{data.statName}</span> sem revisão há {days} dias.
          </p>
        </div>
        <Link href={data.ctaHref}>
          <a
            data-testid="immediate-action-cta"
            href={data.ctaHref}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Ver stat →
          </a>
        </Link>
      </div>
    );
  }

  // start_session
  const tournLabel = data.plannedCount === 1 ? '1 torneio planejado' : `${data.plannedCount} torneios planejados`;
  return (
    <div
      data-testid="immediate-action"
      data-kind="start_session"
      className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3"
    >
      <div>
        <h3 className="text-sm font-semibold">Ação imediata</h3>
        <p className="text-sm text-muted-foreground">
          {tournLabel} para hoje.
          {data.activeProfilesLabel ? (
            <>
              {' · '}
              <span data-testid="immediate-action-profiles-label">{data.activeProfilesLabel}</span>
            </>
          ) : null}
        </p>
      </div>
      <Link href={data.ctaHref}>
        <a
          data-testid="immediate-action-cta"
          href={data.ctaHref}
          className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          Início Rápido →
        </a>
      </Link>
    </div>
  );
}
