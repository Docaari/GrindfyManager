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

interface HomeOverviewBody {
  userState: 'empty' | 'power';
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
  meta: {
    generatedAt: string;
    cacheHit: boolean;
    subqueryTimingsMs: Record<string, number>;
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
): 'empty' | 'power' {
  if (!quickStats) return 'empty';
  const tournaments = quickStats.totalTournaments ?? 0;
  const sessions = quickStats.totalSessions ?? 0;
  if (tournaments < 50 || sessions < 5) return 'empty';
  return 'power';
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

    // Calcular dayOfWeek baseado em fuso (D14). Onda 1: fallback America/Sao_Paulo.
    // Implementacao minima: usa servidor local Date.
    const today = new Date();
    const dayOfWeek = today.getDay();
    const todayIso = today.toISOString().slice(0, 10); // YYYY-MM-DD

    // Promise.allSettled — graceful degradation por subquery (D5 / ADR-102 §2.1.4).
    // timed() ja captura erros e retorna null; allSettled garante semantica explicita
    // mesmo se algum timed() futuro deixar de catch.
    const settled = await Promise.allSettled([
      timed('quickStats', () => (storage as any).getQuickStats(userId), timings),
      timed('performance', () => (storage as any).getDashboardPerformance(userId, '30d'), timings),
      timed('recentSessions', () => (storage as any).getRecentSessions(userId, 5), timings),
      timed('pendingHands', () => (storage as any).getPendingStarredHands(userId, 5), timings),
      timed('planned', () => (storage as any).getPlannedTournamentsForDate(userId, todayIso), timings),
      timed('profile', () => (storage as any).getProfileStateForDay(userId, dayOfWeek), timings),
      timed('bankroll', () => (storage as any).getCurrentBankroll(userId), timings),
      timed('cooldown', () => (storage as any).getActiveCooldown(userId), timings),
      timed('flight', () => (storage as any).getActiveFlightSeries(userId), timings),
      timed('news', () => fetchNewsItems('poker-software', 5), timings),
    ]);

    const unwrap = <T,>(idx: number): T | null => {
      const r = settled[idx];
      return r.status === 'fulfilled' ? (r.value as T) : null;
    };
    const quickStats = unwrap<any>(0);
    const performance = unwrap<any>(1);
    const recentSessions = unwrap<any[]>(2);
    const pendingHands = unwrap<any[]>(3);
    const plannedToday = unwrap<any[]>(4);
    const profileState = unwrap<any>(5);
    const bankroll = unwrap<any>(6);
    const cooldown = unwrap<any>(7);
    const flightSeries = unwrap<any>(8);
    const newsItemsResult = unwrap<NewsItem[]>(9);

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

    const userState = computeUserState(qs);

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

    const body: HomeOverviewBody = {
      userState,
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
      meta: {
        generatedAt: new Date().toISOString(),
        cacheHit: false,
        subqueryTimingsMs: timings,
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
