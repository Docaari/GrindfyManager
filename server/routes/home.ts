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
import { handleTournamentSelector } from './tournament-selector';
import { computeHeuristics } from '../services/homeHeuristics';

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
  }> | null;
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
  tournamentRecommendations: Array<{
    id: string;
    name: string;
    buyinUsd: number;
    buyinNative: number;
    currency: string;
    score: number;
    grade: 'S' | 'A' | 'B';
    startTime: string;
    platform: string;
    alreadyInGrid: boolean;
  }>;
  heuristics: Array<{
    id: string;
    message: string;
    severity: 'info' | 'caution' | 'positive';
    ctaHref: string | null;
  }>;
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

    // Promise.allSettled — graceful degradation por subquery (D5 / ADR-102 §2.1.4).
    // Sprint home-reform-2 RF-29/30/31/34: 4 subqueries novas + perf60d.
    const settled = await Promise.allSettled([
      timed('quickStats', () => (storage as any).getQuickStats(userId), timings),
      timed('performance', () => (storage as any).getDashboardPerformance(userId, '30d'), timings),
      timed('recentSessions', () => (storage as any).getRecentSessions(userId, 5), timings),
      // Sprint home-reform-2 RF-34: heuristicas day-of-week precisam >=60 sessoes
      // (ADR-108). Subquery dedicada paralela; nao reusa recentSessions(5).
      timed('recentSessions60', () => (storage as any).getRecentSessions(userId, 60), timings),
      timed('pendingHands', () => (storage as any).getPendingStarredHands(userId, 5), timings),
      timed('planned', () => (storage as any).getPlannedTournamentsForDate(userId, todayIso), timings),
      timed('profile', () => (storage as any).getProfileStateForDay(userId, dayOfWeek), timings),
      timed('bankroll', () => (storage as any).getCurrentBankroll(userId), timings),
      timed('cooldown', () => (storage as any).getActiveCooldown(userId), timings),
      timed('flight', () => (storage as any).getActiveFlightSeries(userId), timings),
      timed('news', () => fetchNewsItems('poker-software', 5), timings),
      // Sprint home-reform-1-5 RF-25.3: subquery profile-detect.
      timed('profileDetect', () => (storage as any).detectPlayerProfile(userId), timings),
      // Sprint home-reform-2 — Onda 2 novas subqueries.
      timed('performance60d', () => (storage as any).getDashboardPerformance(userId, '60d'), timings),
      timed('topDeltas', () => (storage as any).getStatsTopDeltas(userId, 3), timings),
      timed('variance', () => (storage as any).getVarianceVsExpected(userId), timings),
      timed('tournamentRecs', () =>
        handleTournamentSelector({
          userId,
          date: todayIso,
          sources: 'suprema,library',
          minScore: 70,
          bankrollFilter: false,
          lookbackDays: 180,
        } as any).catch((selErr) => {
          console.error('[home/overview] handleTournamentSelector failed:', selErr);
          return { tournaments: [] };
        }), timings),
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
    const tournamentSelectorResult = unwrap<any>(15);

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

    const recentSessionsOut: HomeOverviewBody['recentSessions'] =
      recent === null ? null : recent.map((s: any) => ({
        id: String(s?.id ?? ''),
        date: String(s?.date ?? ''),
        pnlUsd: Number(s?.pnlUsd ?? 0),
        tournamentCount: Number(s?.tournamentCount ?? 0),
        primaryPlatform: String(s?.primaryPlatform ?? ''),
        status: (s?.status as 'live' | 'ended' | 'finalized') ?? 'finalized',
      }));

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

    // tournamentRecommendations: filtra grade in [S, A, B], top 3 score DESC + startTime ASC.
    const allRecs: any[] = Array.isArray(tournamentSelectorResult?.tournaments)
      ? tournamentSelectorResult.tournaments
      : [];
    const nowIsoForRecs = new Date().toISOString();
    const filteredRecs = allRecs
      .filter((t: any) =>
        t
        && (t.grade === 'S' || t.grade === 'A' || t.grade === 'B')
        && Number(t?.score ?? 0) >= 70
        && (typeof t?.startTime !== 'string' || t.startTime >= nowIsoForRecs),
      )
      .sort((a: any, b: any) => {
        const sb = Number(b?.score ?? 0) - Number(a?.score ?? 0);
        if (sb !== 0) return sb;
        return String(a?.startTime ?? '').localeCompare(String(b?.startTime ?? ''));
      })
      .slice(0, 3);
    const tournamentRecommendationsOut: HomeOverviewBody['tournamentRecommendations'] = filteredRecs.map((t: any) => ({
      id: String(t?.id ?? ''),
      name: String(t?.name ?? ''),
      buyinUsd: Number(t?.buyinUsd ?? 0),
      buyinNative: Number(t?.buyinNative ?? t?.buyinUsd ?? 0),
      currency: String(t?.currency ?? 'USD'),
      score: Number(t?.score ?? 0),
      grade: t.grade as 'S' | 'A' | 'B',
      startTime: String(t?.startTime ?? ''),
      platform: String(t?.platform ?? ''),
      alreadyInGrid: !!t?.alreadyInGrid,
    }));

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
      tournamentRecommendations: tournamentRecommendationsOut,
      heuristics: heuristicsOut,
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

export function registerHomeRoutes(app: Express): void {
  app.get('/api/home/overview', requireAuth, handleHomeOverview);
}
