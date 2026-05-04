/**
 * immediateAction — Sprint home-reform-5 item 4.
 *
 * Spec: Docs/specs/home-reform-5.md item 4 (Acao Imediata: stat destaque +
 * Iniciar sessao).
 *
 * Builder PURO do bloco `immediateAction` exposto em /api/home/overview.
 * Aplica prioridade fixa:
 *   1. pending_hand   — pendingHandsCount > 0.
 *   2. focus_stat     — focusStatPending != null. Slot DORMENTE: ate Stats
 *                       Analyzer destaque ser entregue, route handler passa
 *                       sempre `null`. Estrutura aceita o tipo, contagem
 *                       de prioridade respeita o slot.
 *   3. start_session  — todayTournamentsTotal > 0 + nao DAY OFF + sem sessao
 *                       /grind aberta. CTA -> /grind?open=quickstart (modal
 *                       Inicio Rapido — wired no GrindSession.tsx desde
 *                       home-reform-5 item 3).
 *
 * Returns null quando nenhum gancho atende.
 *
 * Service NAO toca DB. Recebe inputs prontos do route handler.
 */

export type ImmediateActionKind = 'pending_hand' | 'focus_stat' | 'start_session';

export interface ImmediateActionPendingHand {
  kind: 'pending_hand';
  count: number;
  ctaHref: string;
}

export interface ImmediateActionFocusStat {
  kind: 'focus_stat';
  statName: string;
  daysSince: number;
  ctaHref: string;
}

export interface ImmediateActionStartSession {
  kind: 'start_session';
  plannedCount: number;
  activeProfilesLabel: string | null;
  ctaHref: string;
}

export type ImmediateActionData =
  | ImmediateActionPendingHand
  | ImmediateActionFocusStat
  | ImmediateActionStartSession;

export interface FocusStatPending {
  statName: string;
  daysSince: number;
  ctaHref: string;
}

export interface BuildImmediateActionInput {
  pendingHandsCount: number;
  /** Slot dormante. Backend passa null ate Stats Analyzer entregar destaque. */
  focusStatPending: FocusStatPending | null;
  todayTournamentsTotal: number;
  isDayOff: boolean;
  hasActiveGrindSession: boolean;
  /** Rotulo dos perfis ativos para exibir no CTA (ex: "B", "A + B"). */
  activeProfilesLabel: string | null;
}

export function buildImmediateAction(
  input: BuildImmediateActionInput,
): ImmediateActionData | null {
  const pendingCount = Math.max(0, Math.floor(Number(input.pendingHandsCount ?? 0)));
  if (pendingCount > 0) {
    return {
      kind: 'pending_hand',
      count: pendingCount,
      ctaHref: '/estudos',
    };
  }

  const focus = input.focusStatPending;
  if (focus && typeof focus.statName === 'string' && focus.statName.length > 0) {
    return {
      kind: 'focus_stat',
      statName: focus.statName,
      daysSince: Number.isFinite(focus.daysSince) ? Number(focus.daysSince) : 0,
      ctaHref: typeof focus.ctaHref === 'string' && focus.ctaHref.length > 0
        ? focus.ctaHref
        : '/estudos',
    };
  }

  const total = Math.max(0, Math.floor(Number(input.todayTournamentsTotal ?? 0)));
  if (total > 0 && !input.isDayOff && !input.hasActiveGrindSession) {
    return {
      kind: 'start_session',
      plannedCount: total,
      activeProfilesLabel:
        typeof input.activeProfilesLabel === 'string' && input.activeProfilesLabel.length > 0
          ? input.activeProfilesLabel
          : null,
      ctaHref: '/grind?open=quickstart',
    };
  }

  return null;
}
