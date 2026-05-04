/**
 * homeHeader — Sprint home-reform-5 item 2.
 *
 * Spec: Docs/specs/home-reform-5.md item 2 (Header Sessao).
 *
 * Builder PURO dos 4 KPIs do strip do topo da Home:
 *   2.1 Banca       — saldo consolidado USD (com FX upstream).
 *   2.2 Hoje        — torneios planejados pro perfil ativo do dia.
 *   2.3 ROI 30D     — (saldoAtual - saldo30dAtras) / investido30d * 100.
 *   2.4 Pendencias  — top-1 pendencia (5 prioridades, ordem fixa).
 *
 * Service NAO toca DB. Recebe inputs prontos (bankroll/wallet ja resolvidos
 * upstream pelo route handler). Testavel sem mock de Drizzle.
 */

export type HeaderProfile = 'A' | 'B' | 'C';

export interface HeaderBankaKpi {
  totalUsd: number;
  currency: 'USD';
}

export interface HeaderTodayKpi {
  profile: HeaderProfile | null;
  plannedCount: number;
  isOff: boolean;
}

export interface HeaderRoiKpi {
  value: number | null;
  hasData: boolean;
}

export type HeaderPendencyKind =
  | 'bankroll_check'
  | 'coach_report'
  | 'upload_tournaments'
  | 'spot_review'
  | 'focus_stat';

export interface HeaderPendency {
  kind: HeaderPendencyKind;
  label: string;
  ctaHref: string;
  daysSince: number | null;
}

export interface HeaderStripData {
  banca: HeaderBankaKpi | null;
  today: HeaderTodayKpi;
  roi30d: HeaderRoiKpi;
  pendency: HeaderPendency | null;
}

export interface BuildHeaderStripInput {
  /** Banca atual em USD (consolidada via walletService). null = nao configurada. */
  bankrollUsd: number | null;
  /** Perfil ativo no dia (profile_states.activeProfile). null/'OFF' -> DAY OFF. */
  activeProfile: HeaderProfile | 'OFF' | null;
  /** Planned tournaments do dia atual (filtra por profile aqui). */
  plannedTournaments: Array<{ profile?: string | null } | null | undefined>;
  /** Saldo USD 30 dias atras (newAmount do ultimo snapshot < now-30d). null se sem dados. */
  bankrollAmount30dAgoUsd: number | null;
  /** Soma absoluta dos deposits 30d (USD). Denominador da formula ROI 30D. */
  invested30dUsd: number;
  /** Tem pelo menos 1 snapshot relevante nos ultimos 30d. */
  hasBankrollData30d: boolean;
  /** Ultima movimentacao em bankroll_snapshots (qualquer reason). null se zero. */
  lastBankrollMovementAt: Date | null;
  /** Max(createdAt) tournaments WHERE grind_session_id IS NULL. null se zero uploads. */
  lastTournamentUploadAt: Date | null;
  /** Min(createdAt) starred_hands WHERE status='pending'. null se nao ha pendentes. */
  oldestPendingSpotAt: Date | null;
  /** Feature futura — relatorio Coach IA semanal nao revisado. */
  hasUnreviewedCoachReport?: boolean;
  /** Feature futura — focus stat pin >7d sem revisar (dias passados, null = OK). */
  focusStatPendingDaysSince?: number | null;
  /** Override pra testes determinismo. */
  now?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PENDENCY_BANKROLL_DAYS = 7;
const PENDENCY_UPLOAD_DAYS = 7;
const PENDENCY_SPOT_DAYS = 3;
const PENDENCY_FOCUS_STAT_DAYS = 7;

function daysBetween(from: Date | null, now: Date): number | null {
  if (!from) return null;
  const ms = now.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / MS_PER_DAY);
}

function buildBanca(bankrollUsd: number | null): HeaderBankaKpi | null {
  if (bankrollUsd == null || !Number.isFinite(bankrollUsd)) return null;
  return { totalUsd: bankrollUsd, currency: 'USD' };
}

function buildToday(
  activeProfile: HeaderProfile | 'OFF' | null,
  plannedTournaments: BuildHeaderStripInput['plannedTournaments'],
): HeaderTodayKpi {
  if (activeProfile === null || activeProfile === 'OFF') {
    return { profile: null, plannedCount: 0, isOff: true };
  }
  const count = (plannedTournaments ?? []).filter((t) => t?.profile === activeProfile).length;
  return { profile: activeProfile, plannedCount: count, isOff: false };
}

function buildRoi30d(
  bankrollUsd: number | null,
  bankrollAmount30dAgoUsd: number | null,
  invested30dUsd: number,
  hasData: boolean,
): HeaderRoiKpi {
  if (!hasData) return { value: null, hasData: false };
  if (bankrollUsd == null || bankrollAmount30dAgoUsd == null) {
    return { value: null, hasData: false };
  }
  if (!Number.isFinite(invested30dUsd) || invested30dUsd <= 0) {
    return { value: null, hasData: false };
  }
  const gain = bankrollUsd - bankrollAmount30dAgoUsd;
  const roi = (gain / invested30dUsd) * 100;
  if (!Number.isFinite(roi)) return { value: null, hasData: false };
  return { value: Number(roi.toFixed(2)), hasData: true };
}

function buildPendency(
  input: BuildHeaderStripInput,
  now: Date,
): HeaderPendency | null {
  const lastBankrollDays = daysBetween(input.lastBankrollMovementAt, now);
  if (lastBankrollDays === null || lastBankrollDays > PENDENCY_BANKROLL_DAYS) {
    return {
      kind: 'bankroll_check',
      label: 'Verificar valores das bancas',
      ctaHref: '/bankroll',
      daysSince: lastBankrollDays,
    };
  }

  if (input.hasUnreviewedCoachReport === true) {
    return {
      kind: 'coach_report',
      label: 'Analisar relatorio semanal',
      ctaHref: '/coach',
      daysSince: null,
    };
  }

  const lastUploadDays = daysBetween(input.lastTournamentUploadAt, now);
  if (lastUploadDays === null || lastUploadDays > PENDENCY_UPLOAD_DAYS) {
    return {
      kind: 'upload_tournaments',
      label: 'Subir torneios para o dashboard',
      ctaHref: '/upload',
      daysSince: lastUploadDays,
    };
  }

  const oldestSpotDays = daysBetween(input.oldestPendingSpotAt, now);
  if (oldestSpotDays !== null && oldestSpotDays > PENDENCY_SPOT_DAYS) {
    return {
      kind: 'spot_review',
      label: 'Spot pendente para revisar',
      ctaHref: '/estudos',
      daysSince: oldestSpotDays,
    };
  }

  const focusDays = input.focusStatPendingDaysSince;
  if (typeof focusDays === 'number' && focusDays > PENDENCY_FOCUS_STAT_DAYS) {
    return {
      kind: 'focus_stat',
      label: 'Stats em destaque sem revisar',
      ctaHref: '/dashboard',
      daysSince: focusDays,
    };
  }

  return null;
}

export function buildHeaderStrip(input: BuildHeaderStripInput): HeaderStripData {
  const now = input.now ?? new Date();
  return {
    banca: buildBanca(input.bankrollUsd),
    today: buildToday(input.activeProfile, input.plannedTournaments),
    roi30d: buildRoi30d(
      input.bankrollUsd,
      input.bankrollAmount30dAgoUsd,
      input.invested30dUsd,
      input.hasBankrollData30d,
    ),
    pendency: buildPendency(input, now),
  };
}
