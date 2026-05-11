/**
 * RF-01 — /api/home/overview (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-01, §RNF-01, §RNF-08, §RNF-10
 * ADR-099, ADR-100, ADR-101, ADR-102.
 *
 * Comportamento:
 *   - Auth: 401 se userPlatformId ausente.
 *   - Cache: in-memory Map<userId, { data, expiresAt }>, TTL 30s (D4).
 *   - Subqueries: Promise.allSettled com timeout 800ms cada (D5, ADR-102 §2.1.4).
 *   - userState: empty se totalTournaments<50 OR totalSessions<5 (D7).
 *   - Banner priority: client-side (D9). Backend retorna ambos quando ativos.
 *   - News: delega ao fetchNewsItems (Onda 1 stub vazio).
 *   - meta.subqueryTimingsMs: timing por subquery + cacheHit flag (RNF-08).
 */

import type { Express, Response } from 'express';
import { requireAuth } from '../auth';
import { storage } from '../storage';
import { fetchNewsItems } from './news';
import type { NewsItem } from '@shared/types/news';
import { computeHeuristics } from '../services/homeHeuristics';
import { getSessionsRegisteredSummary } from '../services/sessionsRegistered';
import { fxResolver as homeFxResolver } from '../services/fxResolver';
import { getCurrencyForSite as homeGetCurrencyForSite } from '@shared/platform-currency';
import { getHomeEvolution, parseMonthIso } from '../services/homeEvolution';
// Sprint home-reform-5 item 7 — Dashboard All Time + grafico evolucao all-time.
import {
  getDashboardAllTimeSummary,
  getHomeEvolutionAllTime,
} from '../services/dashboardAllTime';
import { getGradeTodaySummary, type GradeProfile } from '../services/gradeToday';
import { buildHeaderStrip, type HeaderStripData } from '../services/homeHeader';
import { buildCoachContext, type CoachContextData } from '../services/coachContext';
import { buildImmediateAction, type ImmediateActionData } from '../services/immediateAction';

// =============================================================================
// Cache in-memory per-userId — D4 / ADR-102 §2.3
// =============================================================================

interface CacheEntry {
  data: HomeOverviewBody;
  expiresAt: number;
}

const TTL_MS = 30_000;
const SUBQUERY_TIMEOUT_MS = 800;
const CACHE_MAX_ENTRIES = 5000;
const cache = new Map<string, CacheEntry>();

function evictExpired(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  if (cache.size > CACHE_MAX_ENTRIES) {
    const overflow = cache.size - CACHE_MAX_ENTRIES;
    let removed = 0;
    for (const k of cache.keys()) {
      if (removed >= overflow) break;
      cache.delete(k);
      removed++;
    }
  }
}

export function clearHomeOverviewCache(userId?: string): void {
  if (userId) {
    cache.delete(userId);
  } else {
    cache.clear();
  }
}

// Wave E (Fase 3 perf) — alias por naming convention (focusStats usa
// `invalidateFocusStatsCache`). Mutations chamam este nome em handlers
// novos pra clareza.
export const invalidateHomeOverviewCache = clearHomeOverviewCache;

/** Test-only: reset completo. Mesma semantica de clearHomeOverviewCache(undefined). */
export function _resetHomeOverviewCacheForTests(): void {
  cache.clear();
}

// =============================================================================
// Schema da resposta — RF-01
// =============================================================================

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

// Sprint home-reform-1-5 RF-25.1: profile + profileMeta.
type PlayerProfile = 'upload-only' | 'session-only' | 'hybrid' | 'new';

interface ProfileMeta {
  totalUploads: number;
  totalSessions: number;
  sessionTournamentCount: number;
  detectedAt: string;
}

interface HomeOverviewBody {
  userState: 'empty' | 'power';
  profile: PlayerProfile;
  profileMeta: ProfileMeta;
  statusStrip: {
    banca: BancaKpi | null;
    roi30d: RoiKpi | null;
    today: TodayKpi | null;
    pendencias: PendenciasKpi | null;
  };
  // Sprint home-reform-5 item 2 — bloco novo Header Strip (Banca/Hoje/ROI 30D/Pendencia).
  // Coexiste com statusStrip durante migracao: HeaderStrip eh a nova UI; Home
  // antiga ainda renderiza statusStrip (deprecated, vai sair quando Onda 2
  // limpar componentes obsoletos).
  headerStrip: HeaderStripData;
  // Sprint home-reform-5 item 3 — Pergunte ao Coach + Iniciar Sessao.
  coachContext: CoachContextData;
  // Sprint home-reform-5 item 4 — Acao Imediata (pending_hand|focus_stat|start_session).
  // Slot focus_stat fica DORMENTE ate Stats Analyzer destaque (Sprint Stats-V*).
  immediateAction: ImmediateActionData | null;
  today: {
    profile: 'A' | 'B' | 'C' | 'OFF' | null;
    plannedCount: number;
    firstStartTime: string | null;
    stopLoss: { amount: number; currency: string } | null;
    stopTime: string | null;
    hasWarmupToday: boolean;
  } | null;
  banners: {
    cooldown: { active: boolean; until: string; type: 'stop-loss' | 'time-stop' | 'manual' } | null;
    flight: {
      active: boolean;
      seriesTitle: string;
      nextDayStartTime: string;
      currentStackBb: number;
      day: number;
    } | null;
  };
  nextTournament: {
    startTime: string;
    name: string;
    buyin: number;
    currency: string;
    platform: string;
  } | null;
  lifetime: {
    totalTournaments: number;
    totalSessions: number;
    activeDays: number;
    currentStreakDays: number;
  };
  recentSessions: Array<{
    id: string;
    date: string;
    pnlUsd: number;
    tournamentCount: number;
    primaryPlatform: string;
    status: 'live' | 'ended' | 'finalized';
    // Sprint home-reform-5 item 6 — KPIs por sessao (FX-normalizado USD).
    investedUsd: number;
    roi: number | null;
    itm: number;
    finalTables: number;
    wins: number;
  }> | null;
  // Sprint home-reform-5 item 6 — Card "Sessoes Registradas" (renome "Performance").
  sessionsRegistered: {
    tournaments: number;
    profit: number;
    invested: number;
    roi: number | null;
    itm: number;
    finalTables: number;
    wins: number;
  } | null;
  performance: {
    roi: number;
    itm: number;
    cash: number;
    sparkline: number[];
    period: '7d' | '30d' | '90d' | 'ytd';
  } | null;
  pendingHands: Array<{
    id: string;
    hero: string;
    context: string;
    tag: string;
    ageRelative: string;
  }>;
  news: { enabled: boolean; items: NewsItem[] };
  // Sprint home-reform-2 Onda 2 — RF-29 / RF-30 / RF-31 / RF-34 / RF-35.
  topDeltas: Array<{
    stat: string;
    statLabel: string;
    baseline: number;
    current: number;
    delta: number;
    deltaAbs: number;
    severity: 'high' | 'medium' | 'low';
    direction: 'positive' | 'negative' | 'neutral';
    period: '30d';
  }>;
  variance: {
    sessionsCount: number;
    actualUsd: number;
    expectedUsd: number;
    expectedSource: 'primedope-cache' | 'fallback-zero';
    deviationUsd: number;
    sigmaUsd: number;
    sigmaMultiple: number;
    status: 'lucky' | 'normal' | 'unlucky';
    period: '90d';
  } | null;
  heuristics: Array<{
    id: string;
    message: string;
    severity: 'info' | 'caution' | 'positive';
    ctaHref: string | null;
  }>;
  // Sprint home-reform-5 item 7 — Dashboard All Time (uploads/historico, all-time).
  dashboardAllTime: {
    tournaments: number;
    profit: number;
    invested: number;
    roi: number | null;
    itm: number;
    finalTables: number;
    wins: number;
  } | null;
  meta: {
    generatedAt: string;
    cacheHit: boolean;
    subqueryTimingsMs: Record<string, number>;
    userTimezone: string; // Sprint home-reform-2 RF-33.
  };
}

// =============================================================================
// Helper: timeout 800ms por subquery (D5 / ADR-102 §2.1.4)
// =============================================================================

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`subquery timeout ${ms}ms`));
    }, ms);
    p.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function timed<T>(
  key: string,
  fn: () => Promise<T>,
  timings: Record<string, number>,
): Promise<T | null> {
  const t0 = Date.now();
  try {
    const result = await withTimeout(fn(), SUBQUERY_TIMEOUT_MS);
    timings[key] = Date.now() - t0;
    return result;
  } catch (err) {
    timings[key] = Date.now() - t0;
    console.error(`[home/overview] subquery "${key}" failed:`, err);
    return null;
  }
}

// =============================================================================
// userState threshold (D7)
// =============================================================================

function computeUserState(
  quickStats: { totalTournaments?: number; totalSessions?: number } | null,
  walletsConfigured: boolean,
): 'empty' | 'power' {
  const tournaments = quickStats?.totalTournaments ?? 0;
  const sessions = quickStats?.totalSessions ?? 0;
  // Power state = qualquer sinal de atividade real:
  // CSV importado, sessao iniciada OU wallets configuradas.
  // Empty state apenas para users 100% novos.
  if (tournaments >= 1 || sessions >= 1 || walletsConfigured) return 'power';
  return 'empty';
}

// =============================================================================
// Handler principal
// =============================================================================

export async function handleHomeOverview(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const now = Date.now();
    evictExpired(now);

    // Cache hit per-userId (D4 / RNF-10).
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now) {
      const cachedBody: HomeOverviewBody = {
        ...cached.data,
        meta: {
          ...cached.data.meta,
          cacheHit: true,
          generatedAt: new Date().toISOString(),
          subqueryTimingsMs: { cached: 0 },
        },
      };
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.status(200).json(cachedBody);
      return;
    }

    const t0 = Date.now();
    const timings: Record<string, number> = {};

    // Sprint home-reform-2 RF-33 (B11) — timezone-aware.
    // Le users.timezone (cached). Fallback America/Sao_Paulo. Timezone invalido
    // (Intl.DateTimeFormat throw) tambem cai no fallback.
    let userTimezone = 'America/Sao_Paulo';
    try {
      const tz = await (storage as any).getUserTimezone?.(userId);
      if (typeof tz === 'string' && tz.length > 0) {
        userTimezone = tz;
      }
    } catch (tzErr) {
      console.error('[home/overview] getUserTimezone failed:', tzErr);
    }

    const formatToTzDateParts = (tz: string): { todayIso: string; dayOfWeek: number } => {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = fmt.formatToParts(new Date());
      const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
      const m = parts.find((p) => p.type === 'month')?.value ?? '01';
      const d = parts.find((p) => p.type === 'day')?.value ?? '01';
      const iso = `${y}-${m}-${d}`;
      return { todayIso: iso, dayOfWeek: new Date(`${iso}T12:00:00Z`).getUTCDay() };
    };

    let todayIso: string;
    let dayOfWeek: number;
    try {
      ({ todayIso, dayOfWeek } = formatToTzDateParts(userTimezone));
    } catch (fmtErr) {
      console.error(`[home/overview] Intl.DateTimeFormat failed (tz=${userTimezone}), fallback Sao_Paulo:`, fmtErr);
      userTimezone = 'America/Sao_Paulo';
      ({ todayIso, dayOfWeek } = formatToTzDateParts(userTimezone));
    }

    // IStorage interface ainda nao expoe alguns metodos especificos da Home;
    // alias local reduz ruido visual ate sprint debt declarar todos.
    const s = storage as any;

    // Promise.allSettled — graceful degradation por subquery (D5 / ADR-102 §2.1.4).
    // Sprint home-reform-2 RF-29/30/31/34: 4 subqueries novas + perf60d.
    const settled = await Promise.allSettled([
      timed('quickStats', () => s.getQuickStats(userId), timings),
      timed('performance', () => s.getDashboardPerformance(userId, '30d'), timings),
      timed('recentSessions', () => s.getRecentSessions(userId, 5), timings),
      // Sprint home-reform-2 RF-34: heuristicas day-of-week precisam >=60 sessoes
      // (ADR-108). Subquery dedicada paralela; nao reusa recentSessions(5).
      timed('recentSessions60', () => s.getRecentSessions(userId, 60), timings),
      timed('pendingHands', () => s.getPendingStarredHands(userId, 5), timings),
      timed('planned', () => s.getPlannedTournamentsForDate(userId, todayIso), timings),
      timed('profile', () => s.getProfileStateForDay(userId, dayOfWeek), timings),
      timed('bankroll', () => s.getCurrentBankroll(userId), timings),
      timed('cooldown', () => s.getActiveCooldown(userId), timings),
      timed('flight', () => s.getActiveFlightSeries(userId), timings),
      timed('news', () => fetchNewsItems('poker-software', 5), timings),
      // Sprint home-reform-1-5 RF-25.3: subquery profile-detect.
      timed('profileDetect', () => s.detectPlayerProfile(userId), timings),
      // Sprint home-reform-2 — Onda 2 novas subqueries.
      timed('performance60d', () => s.getDashboardPerformance(userId, '60d'), timings),
      timed('topDeltas', () => s.getStatsTopDeltas(userId, 3), timings),
      timed('variance', () => s.getVarianceVsExpected(userId), timings),
      // Sprint home-reform-5 item 2 — Header Strip subqueries.
      timed('lastBankrollMovementAt', () => s.getLatestBankrollMovementAt(userId), timings),
      timed('lastTournamentUploadAt', () => s.getLatestTournamentUploadAt(userId), timings),
      timed('oldestPendingSpotAt', () => s.getOldestPendingSpotAt(userId), timings),
      timed('bankrollSnapshots30d', () =>
        s.getBankrollSnapshots(userId, {
          from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          limit: 500,
        }), timings),
      timed('bankrollSnapshotPrior30d', () =>
        s.getBankrollSnapshots(userId, {
          to: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          limit: 1,
        }), timings),
      // Sprint home-reform-5 item 4 — Acao Imediata (start_session check).
      timed('hasActiveGrindSession', () => s.hasActiveGrindSession(userId), timings),
      // Sprint home-reform-5 item 6 — Sessoes Registradas + RecentSessions com KPIs.
      timed('sessionsRegistered', () => getSessionsRegisteredSummary(userId), timings),
      timed('recentSessionsKpis', () => s.getRecentSessionsWithKpis(userId, 5), timings),
      // Sprint home-reform-5 item 7 — Dashboard All Time (uploads/historico).
      timed('dashboardAllTime', () => getDashboardAllTimeSummary(userId), timings),
      // FX rates resolvidos em paralelo (consumido por recentSessionsKpis -> USD).
      timed('fxRates', () => homeFxResolver.resolveExchangeRates(userId), timings),
    ]);

    const unwrap = <T,>(idx: number): T | null => {
      const r = settled[idx];
      return r.status === 'fulfilled' ? (r.value as T) : null;
    };
    const quickStats = unwrap<any>(0);
    const performance = unwrap<any>(1);
    const recentSessions = unwrap<any[]>(2);
    const recentSessions60 = unwrap<any[]>(3);
    const pendingHands = unwrap<any[]>(4);
    const plannedToday = unwrap<any[]>(5);
    const profileState = unwrap<any>(6);
    const bankroll = unwrap<any>(7);
    const cooldown = unwrap<any>(8);
    const flightSeries = unwrap<any>(9);
    const newsItemsResult = unwrap<NewsItem[]>(10);
    const profileDetectResult = unwrap<{
      profile: PlayerProfile;
      totalUploads: number;
      totalSessions: number;
      sessionTournamentCount: number;
      detectedAt: string;
    }>(11);
    const performance60d = unwrap<any>(12);
    const topDeltasResult = unwrap<any[]>(13);
    const varianceResult = unwrap<any>(14);
    const lastBankrollMovementAtResult = unwrap<Date>(15);
    const lastTournamentUploadAtResult = unwrap<Date>(16);
    const oldestPendingSpotAtResult = unwrap<Date>(17);
    const bankrollSnapshots30dResult = unwrap<any[]>(18);
    const bankrollSnapshotPrior30dResult = unwrap<any[]>(19);
    const hasActiveGrindSessionResult = unwrap<boolean>(20) ?? false;
    const sessionsRegisteredResult = unwrap<any>(21);
    const recentSessionsKpisResult = unwrap<any[]>(22);
    const dashboardAllTimeResult = unwrap<any>(23);
    const fxRatesResult = unwrap<{ rates: Record<string, number> }>(24);

    // Tipos usados localmente (cast porque mocks retornam any).
    const qs = quickStats as any;
    const perf = performance as any;
    const recent = recentSessions as any[] | null;
    const pending = (pendingHands as any[]) ?? [];
    const planned = (plannedToday as any[]) ?? [];
    const profile = profileState as any;
    const bank = bankroll as any;
    const cool = cooldown as any;
    const flight = flightSeries as any;

    const walletsConfigured = !!bank;
    const userState = computeUserState(qs, walletsConfigured);

    // Status Strip
    const banca: BancaKpi | null = bank
      ? {
          totalUsd: typeof bank.totalUsd === 'number' ? bank.totalUsd : 0,
          bisAvailable: bank.bisAvailable ?? null,
          deltaPct7d: bank.deltaPct7d ?? null,
          sparkline: Array.isArray(bank.sparkline) ? bank.sparkline : [],
        }
      : null;

    const roi30d: RoiKpi | null = perf
      ? {
          value: typeof perf.roi === 'number' ? perf.roi : 0,
          sparkline: Array.isArray(perf.sparkline) ? perf.sparkline : [],
        }
      : null;

    // S1 today KPI: planejados ou PnL realizado.
    let firstStartTime: string | null = null;
    if (planned.length > 0) {
      const sorted = [...planned].sort((a, b) => {
        const sa = a?.startTime ?? a?.start_time ?? '';
        const sb = b?.startTime ?? b?.start_time ?? '';
        return String(sa).localeCompare(String(sb));
      });
      firstStartTime = sorted[0]?.startTime ?? sorted[0]?.start_time ?? null;
    }
    const todayKpi: TodayKpi | null = {
      plannedCount: planned.length,
      firstStartTime,
      realizedPnlUsd: null,
    };

    // Pendencias (starred + cooldown count)
    const cooldownAlerts = cool && cool.active ? 1 : 0;
    const pendencias: PendenciasKpi | null = {
      starredHands: pending.length,
      cooldownAlerts,
    };

    // S2 today completo
    const todayBlock: HomeOverviewBody['today'] = {
      profile: profile?.profile ?? null,
      plannedCount: planned.length,
      firstStartTime,
      stopLoss:
        profile?.stopLoss && typeof profile.stopLoss.amount === 'number'
          ? { amount: profile.stopLoss.amount, currency: profile.stopLoss.currency ?? 'USD' }
          : null,
      stopTime: profile?.stopTime ?? null,
      hasWarmupToday: !!profile?.hasWarmupToday,
    };

    // Banners
    const cooldownBanner =
      cool && cool.active
        ? {
            active: true as const,
            until: String(cool.until ?? ''),
            type: (cool.type as 'stop-loss' | 'time-stop' | 'manual') ?? 'manual',
          }
        : null;

    const flightBanner =
      flight && flight.active
        ? {
            active: true as const,
            seriesTitle: String(flight.seriesTitle ?? ''),
            nextDayStartTime: String(flight.nextDayStartTime ?? ''),
            currentStackBb: Number(flight.currentStackBb ?? 0),
            day: Number(flight.day ?? 2),
          }
        : null;

    // Next tournament
    let nextTournament: HomeOverviewBody['nextTournament'] = null;
    const nowIso = new Date().toISOString();
    const upcoming = planned
      .filter((p) => {
        const t = p?.startTime ?? p?.start_time ?? '';
        return t && String(t) >= nowIso;
      })
      .sort((a, b) => {
        const sa = a?.startTime ?? a?.start_time ?? '';
        const sb = b?.startTime ?? b?.start_time ?? '';
        return String(sa).localeCompare(String(sb));
      });
    if (upcoming.length > 0) {
      const u = upcoming[0];
      nextTournament = {
        startTime: String(u.startTime ?? u.start_time ?? ''),
        name: String(u.name ?? u.title ?? ''),
        buyin: Number(u.buyin ?? u.buyIn ?? 0),
        currency: String(u.currency ?? 'USD'),
        platform: String(u.platform ?? u.site ?? ''),
      };
    }

    const lifetime: HomeOverviewBody['lifetime'] = {
      totalTournaments: Number(qs?.totalTournaments ?? 0),
      totalSessions: Number(qs?.totalSessions ?? 0),
      activeDays: Number(qs?.activeDays ?? 0),
      currentStreakDays: Number(qs?.currentStreakDays ?? 0),
    };

    // Sprint home-reform-5 item 6 — RecentSessions com KPIs.
    // Substitui recent (placeholder) por recentSessionsKpisResult quando
    // disponivel + aplica FX por site -> USD por sessao.
    let recentSessionsOut: HomeOverviewBody['recentSessions'] = null;
    if (Array.isArray(recentSessionsKpisResult) && recentSessionsKpisResult.length > 0) {
      try {
        const rates = fxRatesResult?.rates ?? {};
        recentSessionsOut = recentSessionsKpisResult.map((s: any) => {
          const sites: any[] = Array.isArray(s?.sites) ? s.sites : [];
          let count = 0;
          let invested = 0;
          let returns = 0;
          let itm = 0;
          let finalTables = 0;
          let wins = 0;
          let primary = '';
          let primaryCount = -1;
          for (const r of sites) {
            const currency = homeGetCurrencyForSite(r.site).code;
            const rate = rates[currency] ?? 1;
            const safeRate = rate > 0 ? rate : 1;
            const inv = (parseFloat(r.investedNative ?? '0') || 0) / safeRate;
            const ret = (parseFloat(r.returnsNative ?? '0') || 0) / safeRate;
            const c = Number(r.count) || 0;
            count += c;
            invested += inv;
            returns += ret;
            itm += Number(r.itmCount) || 0;
            finalTables += Number(r.finalTablesCount) || 0;
            wins += Number(r.winsCount) || 0;
            if (c > primaryCount) { primary = String(r.site ?? ''); primaryCount = c; }
          }
          const pnlUsd = returns - invested;
          const roi = invested > 0 ? (pnlUsd / invested) * 100 : null;
          const created = s?.createdAt instanceof Date ? s.createdAt : (s?.createdAt ? new Date(s.createdAt) : null);
          const dateIso = created ? created.toISOString().slice(0, 10) : '';
          const statusRaw = String(s?.status ?? 'finalized');
          const status = (statusRaw === 'live' || statusRaw === 'ended' || statusRaw === 'finalized'
            ? statusRaw : 'finalized') as 'live' | 'ended' | 'finalized';
          return {
            id: String(s?.sessionId ?? ''),
            date: dateIso,
            pnlUsd,
            tournamentCount: count,
            primaryPlatform: primary,
            status,
            investedUsd: invested,
            roi,
            itm,
            finalTables,
            wins,
          };
        });
      } catch (errFx) {
        console.error('[home/overview] recentSessionsKpis FX resolution failed:', errFx);
        recentSessionsOut = null;
      }
    }
    if (recentSessionsOut === null && recent !== null) {
      // Fallback legacy (sem KPIs reais — placeholders zero).
      recentSessionsOut = recent.map((s: any) => ({
        id: String(s?.id ?? ''),
        date: String(s?.date ?? ''),
        pnlUsd: Number(s?.pnlUsd ?? 0),
        tournamentCount: Number(s?.tournamentCount ?? 0),
        primaryPlatform: String(s?.primaryPlatform ?? ''),
        status: (s?.status as 'live' | 'ended' | 'finalized') ?? 'finalized',
        investedUsd: 0,
        roi: null,
        itm: 0,
        finalTables: 0,
        wins: 0,
      }));
    }

    const performanceOut: HomeOverviewBody['performance'] = perf
      ? {
          roi: Number(perf.roi ?? 0),
          itm: Number(perf.itm ?? 0),
          cash: Number(perf.cash ?? 0),
          sparkline: Array.isArray(perf.sparkline) ? perf.sparkline : [],
          period: (perf.period as '7d' | '30d' | '90d' | 'ytd') ?? '30d',
        }
      : null;

    const pendingHandsOut: HomeOverviewBody['pendingHands'] = pending.map((h: any) => ({
      id: String(h?.id ?? ''),
      hero: String(h?.hero ?? ''),
      context: String(h?.context ?? ''),
      tag: String(h?.tag ?? ''),
      ageRelative: String(h?.ageRelative ?? ''),
    }));

    const newsItems = (newsItemsResult as NewsItem[] | null) ?? [];
    const news = {
      enabled: false, // Onda 1: sempre false (D17 / spec §12)
      items: newsItems,
    };

    const totalElapsed = Date.now() - t0;

    // RF-25.3: defensive fallback se subquery falhar — default seguro 'hybrid'.
    const playerProfile: PlayerProfile = profileDetectResult?.profile ?? 'hybrid';
    const playerProfileMeta: ProfileMeta = {
      totalUploads: profileDetectResult?.totalUploads ?? 0,
      totalSessions: profileDetectResult?.totalSessions ?? 0,
      sessionTournamentCount: profileDetectResult?.sessionTournamentCount ?? 0,
      detectedAt: profileDetectResult?.detectedAt ?? new Date().toISOString(),
    };

    // Sprint home-reform-2 — Onda 2 novos campos no payload (RF-35).
    // topDeltas: array max 3, [] em fallback.
    const topDeltasOut: HomeOverviewBody['topDeltas'] = (Array.isArray(topDeltasResult) ? topDeltasResult : [])
      .slice(0, 3)
      .map((d: any) => ({
        stat: String(d?.stat ?? ''),
        statLabel: String(d?.statLabel ?? d?.stat ?? ''),
        baseline: Number(d?.baseline ?? 0),
        current: Number(d?.current ?? 0),
        delta: Number(d?.delta ?? 0),
        deltaAbs: Number(d?.deltaAbs ?? Math.abs(Number(d?.delta ?? 0))),
        severity: ((d?.severity === 'high' || d?.severity === 'medium' || d?.severity === 'low') ? d.severity : 'low') as
          'high' | 'medium' | 'low',
        direction: ((d?.direction === 'positive' || d?.direction === 'negative' || d?.direction === 'neutral') ? d.direction : 'neutral') as
          'positive' | 'negative' | 'neutral',
        period: '30d',
      }));

    // variance: passa shape inteiro OU null.
    const varianceOut: HomeOverviewBody['variance'] = varianceResult && typeof varianceResult === 'object'
      ? {
          sessionsCount: Number(varianceResult.sessionsCount ?? 0),
          actualUsd: Number(varianceResult.actualUsd ?? 0),
          expectedUsd: Number(varianceResult.expectedUsd ?? 0),
          expectedSource: (varianceResult.expectedSource === 'fallback-zero' ? 'fallback-zero' : 'primedope-cache') as
            'primedope-cache' | 'fallback-zero',
          deviationUsd: Number(varianceResult.deviationUsd ?? 0),
          sigmaUsd: Number(varianceResult.sigmaUsd ?? 0),
          sigmaMultiple: Number(varianceResult.sigmaMultiple ?? 0),
          status: ((varianceResult.status === 'lucky' || varianceResult.status === 'unlucky') ? varianceResult.status : 'normal') as
            'lucky' | 'normal' | 'unlucky',
          period: '90d',
        }
      : null;

    // heuristics: orchestrator agrega inputs e chama servico puro.
    let heuristicsOut: HomeOverviewBody['heuristics'] = [];
    try {
      // RF-34: heuristicas day-of-week precisam >= 60 sessoes (ADR-108 RECENT_SESSIONS_MIN).
      // Usa subquery dedicada recentSessions60 (nao reusa recentSessions=5).
      const recent60 = Array.isArray(recentSessions60) ? recentSessions60 : [];
      const recentForHeu: Array<{ date: string; pnlUsd: number }> = recent60.map((s: any) => ({
        date: String(s?.date ?? ''),
        pnlUsd: Number(s?.pnlUsd ?? 0),
      }));
      // Lifetime cash: nao temos campo dedicado em quickStats Onda 2; usar perf.cash 30d
      // como proxy temporario. monthsLifetime = activeDays/30. Quando getQuickStats
      // expor lifetimeCash real (Onda 3), trocar aqui.
      const monthsLifetime = Number(qs?.activeDays ?? 0) / 30;
      const lifetimeCashProxy = monthsLifetime > 0 ? Number(perf?.cash ?? 0) : 0;
      const computed = computeHeuristics({
        userId,
        quickStats: qs ?? null,
        performance30d: perf ? { roi: Number(perf.roi ?? 0), itm: Number(perf.itm ?? 0), cash: Number(perf.cash ?? 0) } : null,
        performance60d: performance60d
          ? { roi: Number(performance60d.roi ?? 0), itm: Number(performance60d.itm ?? 0), cash: Number(performance60d.cash ?? 0) }
          : null,
        recentSessions: recentForHeu,
        variance: varianceOut
          ? { status: varianceOut.status, sigmaMultiple: varianceOut.sigmaMultiple }
          : null,
        todayDayOfWeek: dayOfWeek,
        lifetime: { cash: lifetimeCashProxy, monthsLifetime },
      });
      heuristicsOut = (Array.isArray(computed) ? computed : []).map((h: any) => ({
        id: String(h?.id ?? ''),
        message: String(h?.message ?? ''),
        severity: ((h?.severity === 'caution' || h?.severity === 'positive' || h?.severity === 'info') ? h.severity : 'info') as
          'info' | 'caution' | 'positive',
        ctaHref: typeof h?.ctaHref === 'string' ? h.ctaHref : null,
      }));
    } catch (heErr) {
      console.error('[home/overview] computeHeuristics failed:', heErr);
      heuristicsOut = [];
    }

    // Sprint home-reform-5 item 2 — Header Strip.
    // Calcula bankroll prior 30d + invested 30d a partir dos snapshots.
    const headerStripData: HeaderStripData = (() => {
      try {
        const bankrollUsd = bank && typeof bank.totalUsd === 'number' ? bank.totalUsd : null;

        const snapshots30d = Array.isArray(bankrollSnapshots30dResult) ? bankrollSnapshots30dResult : [];
        const snapshotPrior = Array.isArray(bankrollSnapshotPrior30dResult) && bankrollSnapshotPrior30dResult[0]
          ? bankrollSnapshotPrior30dResult[0]
          : null;

        const parseDec = (v: any): number => {
          if (v == null) return 0;
          if (typeof v === 'number') return v;
          const n = parseFloat(String(v));
          return Number.isFinite(n) ? n : 0;
        };

        const bankrollAmount30dAgoUsd = snapshotPrior
          ? parseDec(snapshotPrior.newAmount)
          : (snapshots30d.length > 0 ? 0 : null);

        // Sum absoluto de deltas com reason='deposit' nos ultimos 30d.
        const invested30dUsd = snapshots30d.reduce((acc: number, s: any) => {
          if (s?.reason === 'deposit') return acc + Math.abs(parseDec(s.delta));
          return acc;
        }, 0);

        const hasBankrollData30d = snapshots30d.length > 0 || snapshotPrior !== null;

        const activeProfileRaw = profile?.profile;
        const activeProfile: 'A' | 'B' | 'C' | 'OFF' | null =
          activeProfileRaw === 'A' || activeProfileRaw === 'B' || activeProfileRaw === 'C' || activeProfileRaw === 'OFF'
            ? activeProfileRaw
            : null;

        return buildHeaderStrip({
          bankrollUsd,
          activeProfile,
          plannedTournaments: planned,
          bankrollAmount30dAgoUsd,
          invested30dUsd,
          hasBankrollData30d,
          lastBankrollMovementAt: lastBankrollMovementAtResult ?? null,
          lastTournamentUploadAt: lastTournamentUploadAtResult ?? null,
          oldestPendingSpotAt: oldestPendingSpotAtResult ?? null,
          // Features futuras — Item 2 spec: "reservar slot, nao quebrar se vazio".
          hasUnreviewedCoachReport: false,
          focusStatPendingDaysSince: null,
        });
      } catch (hsErr) {
        console.error('[home/overview] buildHeaderStrip failed:', hsErr);
        return {
          banca: null,
          today: { profile: null, plannedCount: 0, isOff: true },
          roi30d: { value: null, hasData: false },
          pendency: null,
        };
      }
    })();

    // Sprint home-reform-5 item 3 — coachContext (Pergunte ao Coach + Iniciar Sessao).
    const coachContextData: CoachContextData = (() => {
      try {
        const activeProfileRaw = profile?.profile;
        return buildCoachContext({
          activeProfile:
            activeProfileRaw === 'A'
              || activeProfileRaw === 'B'
              || activeProfileRaw === 'C'
              || activeProfileRaw === 'OFF'
              ? activeProfileRaw
              : null,
          plannedTournaments: planned,
        });
      } catch (ccErr) {
        console.error('[home/overview] buildCoachContext failed:', ccErr);
        return { activeProfiles: [], todayTournamentsTotal: 0, isDayOff: true };
      }
    })();

    // Sprint home-reform-5 item 4 — Acao Imediata (prioridade pending>focus>start).
    // focusStatPending DORMENTE: backend passa null ate Stats Analyzer destaque
    // ser entregue (Sprint Stats-V*). Estrutura aceita o tipo.
    const immediateActionData: ImmediateActionData | null = (() => {
      try {
        const activeProfilesLabel = coachContextData.activeProfiles.length > 0
          ? coachContextData.activeProfiles.join(' + ')
          : null;
        return buildImmediateAction({
          pendingHandsCount: pending.length,
          focusStatPending: null,
          todayTournamentsTotal: coachContextData.todayTournamentsTotal,
          isDayOff: coachContextData.isDayOff,
          hasActiveGrindSession: hasActiveGrindSessionResult,
          activeProfilesLabel,
        });
      } catch (iaErr) {
        console.error('[home/overview] buildImmediateAction failed:', iaErr);
        return null;
      }
    })();

    const body: HomeOverviewBody = {
      userState,
      profile: playerProfile,
      profileMeta: playerProfileMeta,
      statusStrip: {
        banca,
        roi30d,
        today: todayKpi,
        pendencias,
      },
      headerStrip: headerStripData,
      coachContext: coachContextData,
      immediateAction: immediateActionData,
      today: todayBlock,
      banners: {
        cooldown: cooldownBanner,
        flight: flightBanner,
      },
      nextTournament,
      lifetime,
      recentSessions: recentSessionsOut,
      performance: performanceOut,
      pendingHands: pendingHandsOut,
      news,
      // Sprint home-reform-2 Onda 2.
      topDeltas: topDeltasOut,
      variance: varianceOut,
      heuristics: heuristicsOut,
      // Sprint home-reform-5 item 6 — Sessoes Registradas.
      sessionsRegistered: sessionsRegisteredResult && typeof sessionsRegisteredResult === 'object'
        ? {
            tournaments: Number(sessionsRegisteredResult.tournaments ?? 0),
            profit: Number(sessionsRegisteredResult.profit ?? 0),
            invested: Number(sessionsRegisteredResult.invested ?? 0),
            roi: sessionsRegisteredResult.roi == null ? null : Number(sessionsRegisteredResult.roi),
            itm: Number(sessionsRegisteredResult.itm ?? 0),
            finalTables: Number(sessionsRegisteredResult.finalTables ?? 0),
            wins: Number(sessionsRegisteredResult.wins ?? 0),
          }
        : null,
      // Sprint home-reform-4 item 1.
      // Sprint home-reform-5 item 7 — Dashboard All Time (6 KPIs).
      dashboardAllTime: dashboardAllTimeResult && typeof dashboardAllTimeResult === 'object'
        ? {
            tournaments: Number(dashboardAllTimeResult.tournaments ?? 0),
            profit: Number(dashboardAllTimeResult.profit ?? 0),
            invested: Number(dashboardAllTimeResult.invested ?? 0),
            roi: dashboardAllTimeResult.roi == null ? null : Number(dashboardAllTimeResult.roi),
            itm: Number(dashboardAllTimeResult.itm ?? 0),
            finalTables: Number(dashboardAllTimeResult.finalTables ?? 0),
            wins: Number(dashboardAllTimeResult.wins ?? 0),
          }
        : null,
      meta: {
        generatedAt: new Date().toISOString(),
        cacheHit: false,
        subqueryTimingsMs: timings,
        userTimezone,
      },
    };

    // Log estruturado (RNF-08)
    console.log(
      `[home/overview] userId=${userId} total=${totalElapsed}ms cacheHit=false subqueries=${JSON.stringify(timings)}`,
    );

    // Salva no cache (D4) + evict expired/overflow.
    cache.set(userId, {
      data: body,
      expiresAt: now + TTL_MS,
    });
    evictExpired(now);

    res.setHeader('Cache-Control', 'private, max-age=30');
    res.status(200).json(body);
  } catch (err) {
    console.error('[home/overview] fatal failure:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}

// =============================================================================
// Sprint home-reform-4 item 10 + home-reform-5 item 7 — /api/home/evolution
// =============================================================================
//
// Spec: Docs/specs/home-reform-4.md item 10 (mes) + Docs/specs/home-reform-5.md
// item 7 (all-time). Grafico evolucao do mes selecionado OU all-time agrupado
// por mes.
//
// Query:
//   - ?month=YYYY-MM (default mes corrente UTC): retorna serie diaria do mes.
//   - ?scope=all: retorna serie mensal continua all-time (item 7).
// Mes invalido -> 400.
export async function handleHomeEvolution(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const scopeRaw = typeof req?.query?.scope === 'string' ? req.query.scope : null;
    if (scopeRaw === 'all') {
      const summary = await getHomeEvolutionAllTime(userId);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.status(200).json(summary);
      return;
    }
    const monthRaw = typeof req?.query?.month === 'string' ? req.query.month : null;
    if (monthRaw && !parseMonthIso(monthRaw)) {
      res.status(400).json({ message: 'Invalid month format. Expected YYYY-MM.' });
      return;
    }
    const summary = await getHomeEvolution(userId, monthRaw);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.status(200).json(summary);
  } catch (err) {
    console.error('[home/evolution] fatal failure:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}

// =============================================================================
// Sprint home-reform-4 item 5 — /api/home/grade-today
// =============================================================================
//
// Spec: Docs/specs/home-reform-4.md item 5. Card "Grade do dia" com chips
// A|B|C + count/totalInvestmentUsd/abi para os torneios planejados no dia
// selecionado (default hoje no timezone do user).
// Query: ?profile=A|B|C (default A) &date=YYYY-MM-DD (default hoje BRT).
export async function handleHomeGradeToday(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const profileRaw = typeof req?.query?.profile === 'string' ? req.query.profile.toUpperCase() : 'A';
    const profile: GradeProfile = (profileRaw === 'A' || profileRaw === 'B' || profileRaw === 'C') ? profileRaw : 'A';

    const dateRaw = typeof req?.query?.date === 'string' ? req.query.date : null;
    if (dateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      res.status(400).json({ message: 'Invalid date format. Expected YYYY-MM-DD.' });
      return;
    }

    let userTimezone = 'America/Sao_Paulo';
    try {
      const tz = await (storage as any).getUserTimezone?.(userId);
      if (typeof tz === 'string' && tz.length > 0) userTimezone = tz;
    } catch {
      // fallback
    }

    const computeTzDate = (tz: string): string => {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = fmt.formatToParts(new Date());
      const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
      const m = parts.find((p) => p.type === 'month')?.value ?? '01';
      const d = parts.find((p) => p.type === 'day')?.value ?? '01';
      return `${y}-${m}-${d}`;
    };

    let date: string;
    if (dateRaw) {
      date = dateRaw;
    } else {
      try {
        date = computeTzDate(userTimezone);
      } catch {
        date = computeTzDate('America/Sao_Paulo');
      }
    }
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();

    const summary = await getGradeTodaySummary(userId, { date, dayOfWeek, profile });
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.status(200).json(summary);
  } catch (err) {
    console.error('[home/grade-today] fatal failure:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}

export function registerHomeRoutes(app: Express): void {
  app.get('/api/home/overview', requireAuth, handleHomeOverview);
  app.get('/api/home/evolution', requireAuth, handleHomeEvolution);
  app.get('/api/home/grade-today', requireAuth, handleHomeGradeToday);
}
