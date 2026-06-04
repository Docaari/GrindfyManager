import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  userActivity,
  users,
  grindSessions,
  breakFeedbacks,
  sessionTournaments,
} from "@shared/schema";
import { nanoid } from "nanoid";
import { eq, and, desc, gte, lte, sql, count, avg, max, sum } from "drizzle-orm";
import { z } from "zod";
import { parseFiltersParam, mapFiltersToBackendFormat, calculateStartDate } from "./helpers";
import { playerBundleCache } from "../services/playerBundle";
import {
  COLD_START_PURE_THRESHOLD,
  COLD_START_PARTIAL_THRESHOLD,
} from "../scoring/scoringConstants";
import type { ColdStartLevel } from "../../shared/scoring";

// =============================================================================
// RF-03: GET /api/analytics/player-bundle (handler exposto p/ tests + Express)
// =============================================================================

export interface PlayerBundleRequest {
  userId: string;
  lookbackDays: number;
}

export async function handlePlayerBundle(req: PlayerBundleRequest): Promise<any> {
  if (!req.userId) {
    throw new Error("Unauthorized: missing userId");
  }
  const lookbackDays = req.lookbackDays ?? 180;
  const bundle = await playerBundleCache.getOrLoad(req.userId, lookbackDays);

  let coldStart: ColdStartLevel = false;
  if (bundle.totalTournaments < COLD_START_PURE_THRESHOLD) coldStart = "pure";
  else if (bundle.totalTournaments < COLD_START_PARTIAL_THRESHOLD) coldStart = "partial";

  return {
    ...bundle,
    coldStart,
    cacheHit: (bundle as any).cacheHit ?? false,
  };
}

// =============================================================================
// Sprint Flight-1 RF-16 + RF-17: handleByModifier — substitui filter
// `is_flight=true` (deprecado ADR-031) por `seriesId IS NOT NULL` (ADR-090).
// =============================================================================
export async function handleByModifier(req: any, res: any): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const modifier = String(req?.query?.modifier ?? "");
    const result = await (storage as any).getAnalyticsByModifier(userId, {
      modifier,
      // Implementer nota (ADR-090): para modifier='flight', a query interna
      // usa WHERE seriesId IS NOT NULL (substitui is_flight=true legado).
    });
    res.status(200).json(result ?? []);
  } catch (err) {
    console.error("[handleByModifier] failed:", err);
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
}

export function registerAnalyticsRoutes(app: Express): void {
  // Sprint Flight-1 RF-16/RF-17: substitui filter is_flight=true legado por seriesId IS NOT NULL.
  app.get('/api/analytics/by-modifier', requireAuth, handleByModifier);

  // Analytics dashboard stats endpoint (frontend compatibility)
  app.get('/api/analytics/dashboard-stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const filters = parseFiltersParam(req.query.filters);


      const stats = await storage.getDashboardStats(userId, period, filters);


      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics dashboard stats" });
    }
  });

  // Profile-based dashboard stats endpoint
  app.get('/api/analytics/profile-dashboard-stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const filters = parseFiltersParam(req.query.filters);

      // Force profile-based filtering
      filters.profileBased = true;


      const stats = await storage.getDashboardStats(userId, period, filters);


      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile dashboard stats" });
    }
  });

  // Advanced analytics routes with filters
  app.get('/api/analytics/by-site', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await storage.getAnalyticsBySite(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch site analytics" });
    }
  });

  app.get('/api/analytics/by-buyin', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await storage.getAnalyticsByBuyinRange(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch buyin analytics" });
    }
  });

  app.get('/api/analytics/by-category', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);

      const analytics = await storage.getAnalyticsByCategory(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category analytics" });
    }
  });

  app.get('/api/analytics/by-day', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await storage.getAnalyticsByDayOfWeek(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch day analytics" });
    }
  });

  // ETAPA 4: Analytics por velocidade
  app.get('/api/analytics/by-speed', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await storage.getAnalyticsBySpeed(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch speed analytics" });
    }
  });

  // ETAPA 5: Analytics mensais
  app.get('/api/analytics/by-month', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await storage.getAnalyticsByMonth(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch month analytics" });
    }
  });

  // ETAPA 5: Analytics por faixa de field
  app.get('/api/analytics/by-field', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await storage.getAnalyticsByField(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch field analytics" });
    }
  });

  // ETAPA 5: Analytics de posições finais
  app.get('/api/analytics/final-table', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await storage.getFinalTableAnalytics(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch final table analytics" });
    }
  });

  // User Analytics - ETAPA 2.1
  app.get('/api/analytics/users', requireAuth, requirePermission('user_analytics'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const userId = req.user!.userPlatformId;
      const startDate = calculateStartDate(period as string);

      // Get user analytics data using Drizzle ORM
      const userAnalytics = await db
        .select({
          userId: users.userPlatformId,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          totalSessions: count(userActivity.id),
          totalDuration: sum(userActivity.duration),
          avgSessionDuration: avg(userActivity.duration),
          lastActivity: max(userActivity.createdAt),
          isActive: sql<boolean>`${max(userActivity.createdAt)} > (NOW() - INTERVAL '7 days')`
        })
        .from(users)
        .leftJoin(userActivity, and(
          eq(users.userPlatformId, userActivity.userId),
          gte(userActivity.createdAt, startDate)
        ))
        .where(eq(users.status, 'active'))
        .groupBy(users.userPlatformId, users.email, users.firstName, users.lastName)
        .orderBy(desc(count(userActivity.id)));

      // Transform data for response
      const transformedAnalytics = userAnalytics.map(user => ({
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        totalSessions: Number(user.totalSessions) || 0,
        totalDuration: Number(user.totalDuration) || 0,
        avgSessionDuration: Number(user.avgSessionDuration) || 0,
        lastActivity: user.lastActivity?.toISOString() || new Date().toISOString(),
        pagesVisited: [], // Will be populated separately if needed
        featuresUsed: [], // Will be populated separately if needed
        loginCount: 0, // Will be calculated separately if needed
        uploadCount: 0, // Will be calculated separately if needed
        grindSessionsCreated: 0, // Will be calculated separately if needed
        warmupSessionsCompleted: 0, // Will be calculated separately if needed
        isActive: user.isActive || false
      }));

      res.json(transformedAnalytics);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar analytics de usuários' });
    }
  });

  // Feature Analytics - ETAPA 2.2
  app.get('/api/analytics/features', requireAuth, requirePermission('analytics_access'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const startDate = calculateStartDate(period as string);

      // Get feature analytics data using Drizzle ORM
      const featureAnalytics = await db
        .select({
          feature: sql<string>`COALESCE(${userActivity.feature}, 'page_view')`,
          page: userActivity.page,
          usageCount: count(userActivity.id),
          uniqueUsers: sql<number>`COUNT(DISTINCT ${userActivity.userId})`,
          avgDuration: sql<number>`COALESCE(AVG(${userActivity.duration}), 0)`,
          lastUsed: max(userActivity.createdAt)
        })
        .from(userActivity)
        .where(gte(userActivity.createdAt, startDate))
        .groupBy(userActivity.feature, userActivity.page)
        .orderBy(desc(count(userActivity.id)));

      res.json(featureAnalytics);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar analytics de funcionalidades' });
    }
  });

  // Executive Reports - ETAPA 2.3
  app.get('/api/analytics/executive', requireAuth, requirePermission('executive_reports'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const startDate = calculateStartDate(period as string);

      // Get executive statistics using Drizzle ORM
      const [totalUsersResult, activeUsersResult, totalSessionsResult, avgSessionResult] = await Promise.all([
        db.select({ total: count() }).from(users).where(eq(users.status, 'active')),
        db.select({ active: sql<number>`COUNT(DISTINCT ${userActivity.userId})` }).from(userActivity).where(gte(userActivity.createdAt, startDate)),
        db.select({ total: count() }).from(userActivity).where(gte(userActivity.createdAt, startDate)),
        db.select({ avgDuration: sql<number>`COALESCE(AVG(${userActivity.duration}), 0)` }).from(userActivity).where(and(gte(userActivity.createdAt, startDate), sql`${userActivity.duration} > 0`))
      ]);

      // Get top pages
      const topPagesResult = await db
        .select({
          page: userActivity.page,
          visits: count()
        })
        .from(userActivity)
        .where(gte(userActivity.createdAt, startDate))
        .groupBy(userActivity.page)
        .orderBy(desc(count()))
        .limit(10);

      // Get top features
      const topFeaturesResult = await db
        .select({
          feature: sql<string>`COALESCE(${userActivity.feature}, 'page_view')`,
          usage: count()
        })
        .from(userActivity)
        .where(gte(userActivity.createdAt, startDate))
        .groupBy(userActivity.feature)
        .orderBy(desc(count()))
        .limit(10);

      // Get peak hours
      const peakHoursResult = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${userActivity.createdAt})`,
          activity: count()
        })
        .from(userActivity)
        .where(gte(userActivity.createdAt, startDate))
        .groupBy(sql`EXTRACT(HOUR FROM ${userActivity.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${userActivity.createdAt})`);

      // Get growth trends (last 7 days)
      const growthTrendsResult = await db
        .select({
          date: sql<string>`DATE(${userActivity.createdAt})`,
          users: sql<number>`COUNT(DISTINCT ${userActivity.userId})`,
          sessions: count()
        })
        .from(userActivity)
        .where(gte(userActivity.createdAt, startDate))
        .groupBy(sql`DATE(${userActivity.createdAt})`)
        .orderBy(sql`DATE(${userActivity.createdAt})`);

      const executiveStats = {
        totalUsers: Number(totalUsersResult[0]?.total || 0),
        activeUsers: Number(activeUsersResult[0]?.active || 0),
        totalSessions: Number(totalSessionsResult[0]?.total || 0),
        avgSessionDuration: Number(avgSessionResult[0]?.avgDuration || 0),
        topPages: topPagesResult.map(row => ({
          page: row.page,
          visits: Number(row.visits)
        })),
        topFeatures: topFeaturesResult.map(row => ({
          feature: row.feature,
          usage: Number(row.usage)
        })),
        peakHours: peakHoursResult.map(row => ({
          hour: Number(row.hour),
          activity: Number(row.activity)
        })),
        growthTrends: growthTrendsResult.map(row => ({
          date: row.date,
          users: Number(row.users),
          sessions: Number(row.sessions)
        }))
      };

      res.json(executiveStats);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar relatórios executivos' });
    }
  });

  // User Activity Log - for detailed tracking
  app.get('/api/analytics/activity', requireAuth, requirePermission('user_analytics'), async (req, res) => {
    try {
      const { period = '30d', userId = 'all' } = req.query;
      const startDate = calculateStartDate(period as string);

      // Using Drizzle ORM instead of raw SQL
      let whereConditions = [gte(userActivity.createdAt, startDate)];

      if (userId !== 'all') {
        whereConditions.push(eq(userActivity.userId, userId as string));
      }

      const activityResult = await db
        .select({
          id: userActivity.id,
          userId: userActivity.userId,
          page: userActivity.page,
          action: userActivity.action,
          feature: userActivity.feature,
          duration: userActivity.duration,
          metadata: userActivity.metadata,
          createdAt: userActivity.createdAt,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName
        })
        .from(userActivity)
        .leftJoin(users, eq(userActivity.userId, users.userPlatformId))
        .where(and(...whereConditions))
        .orderBy(desc(userActivity.createdAt))
        .limit(1000);

      const activities = activityResult.map(row => ({
        id: row.id,
        userId: row.userId,
        page: row.page,
        action: row.action,
        feature: row.feature,
        duration: row.duration,
        metadata: row.metadata,
        createdAt: row.createdAt,
        user: {
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName
        }
      }));

      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar atividade de usuários' });
    }
  });

  // FP-13: Mental correlation — ROI by mental metrics bands
  app.get('/api/analytics/mental-correlation', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Issue 1: Parse and validate date filters from query params
      const startDateParam = req.query.startDate as string | undefined;
      const endDateParam = req.query.endDate as string | undefined;

      const sessionWhereConditions = [eq(grindSessions.userId, userId)];
      if (startDateParam) {
        const parsed = new Date(startDateParam);
        if (!isNaN(parsed.getTime())) {
          sessionWhereConditions.push(gte(grindSessions.date, parsed));
        }
      }
      if (endDateParam) {
        const parsed = new Date(endDateParam);
        if (!isNaN(parsed.getTime())) {
          sessionWhereConditions.push(lte(grindSessions.date, parsed));
        }
      }

      // Issue 2: Parallelize the 3 queries with Promise.all
      const [sessions, feedbacks, tournaments] = await Promise.all([
        db.select({
          id: grindSessions.id,
          date: grindSessions.date,
          profitLoss: grindSessions.profitLoss,
        }).from(grindSessions)
          .where(and(...sessionWhereConditions)),

        db.select({
          sessionId: breakFeedbacks.sessionId,
          foco: breakFeedbacks.foco,
          energia: breakFeedbacks.energia,
          confianca: breakFeedbacks.confianca,
        }).from(breakFeedbacks)
          .where(eq(breakFeedbacks.userId, userId)),

        db.select({
          sessionId: sessionTournaments.sessionId,
          buyIn: sessionTournaments.buyIn,
          prize: sessionTournaments.prize,
          rebuys: sessionTournaments.rebuys,
          reentries: sessionTournaments.reentries,
          addOnTaken: sessionTournaments.addOnTaken,
          addOnCost: sessionTournaments.addOnCost,
          bounty: sessionTournaments.bounty,
          result: sessionTournaments.result,
        }).from(sessionTournaments)
          .where(eq(sessionTournaments.userId, userId)),
      ]);

      // Filter feedbacks and tournaments to only include those from filtered sessions
      const filteredSessionIds = new Set(sessions.map(s => s.id));

      // Group feedbacks by session (only for filtered sessions)
      const feedbacksBySession = new Map<string, Array<{ foco: number; energia: number; confianca: number }>>();
      for (const f of feedbacks) {
        if (!f.sessionId || !filteredSessionIds.has(f.sessionId)) continue;
        const arr = feedbacksBySession.get(f.sessionId) || [];
        arr.push({ foco: f.foco, energia: f.energia, confianca: f.confianca });
        feedbacksBySession.set(f.sessionId, arr);
      }

      // Group tournaments by session (only for filtered sessions).
      // ADR-014: ROI considera investimento total incluindo rebuys, reentries e add-on.
      // Retorno considera prize + bounty (jogador pensa em resultado total, nao so prize).
      interface SessionTournamentFinancial {
        buyIn: number;
        prize: number;
        result: number;
        bounty: number;
        rebuys: number;
        reentries: number;
        addOnTaken: boolean;
        addOnCost: number;
      }
      const tournamentsBySession = new Map<string, SessionTournamentFinancial[]>();
      for (const t of tournaments) {
        if (!t.sessionId || !filteredSessionIds.has(t.sessionId)) continue;
        const arr = tournamentsBySession.get(t.sessionId) || [];
        arr.push({
          buyIn: parseFloat(t.buyIn as string) || 0,
          prize: parseFloat((t as any).prize as string) || 0,
          result: parseFloat((t as any).result as string) || 0,
          bounty: parseFloat((t as any).bounty as string) || 0,
          rebuys: parseInt(String((t as any).rebuys ?? 0)) || 0,
          reentries: parseInt(String((t as any).reentries ?? 0)) || 0,
          addOnTaken: Boolean((t as any).addOnTaken),
          addOnCost: parseFloat((t as any).addOnCost as string) || 0,
        });
        tournamentsBySession.set(t.sessionId, arr);
      }

      // Build session data with average mental metrics and ROI
      const sessionData: Array<{
        date: Date | null;
        avgFoco: number;
        avgEnergia: number;
        avgConfianca: number;
        roi: number;
      }> = [];

      for (const session of sessions) {
        const fbs = feedbacksBySession.get(session.id);
        if (!fbs || fbs.length === 0) continue;

        const avgFoco = fbs.reduce((a, f) => a + f.foco, 0) / fbs.length;
        const avgEnergia = fbs.reduce((a, f) => a + f.energia, 0) / fbs.length;
        const avgConfianca = fbs.reduce((a, f) => a + f.confianca, 0) / fbs.length;

        const sessionTourns = tournamentsBySession.get(session.id) || [];
        // ADR-014: totalInvested = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)
        const totalInvested = sessionTourns.reduce(
          (a, t) => a + t.buyIn * (1 + t.rebuys + t.reentries) + (t.addOnTaken ? t.addOnCost : 0),
          0
        );
        // Retorno inclui prize (aka result) + bounty; fallback para t.prize quando result=0
        const totalReturn = sessionTourns.reduce((a, t) => {
          const primary = t.result > 0 ? t.result : t.prize;
          return a + primary + t.bounty;
        }, 0);
        const roi = totalInvested > 0 ? ((totalReturn - totalInvested) / totalInvested) * 100 : 0;

        sessionData.push({ date: session.date, avgFoco, avgEnergia, avgConfianca, roi });
      }

      if (sessionData.length < 5) {
        return res.json({
          roiHighFocus: null,
          roiLowFocus: null,
          roiHighEnergy: null,
          roiLowEnergy: null,
          roiHighConfidence: null,
          roiLowConfidence: null,
          sampleSize: sessionData.length,
          insufficient: true,
          bestSession: null,
          worstSession: null,
        });
      }

      function avgROI(items: Array<{ roi: number }>): number | null {
        if (items.length === 0) return null;
        return items.reduce((a, i) => a + i.roi, 0) / items.length;
      }

      const highFocus = sessionData.filter(d => d.avgFoco >= 7);
      const lowFocus = sessionData.filter(d => d.avgFoco < 5);
      const highEnergy = sessionData.filter(d => d.avgEnergia >= 7);
      const lowEnergy = sessionData.filter(d => d.avgEnergia < 5);
      const highConf = sessionData.filter(d => d.avgConfianca >= 7);
      const lowConf = sessionData.filter(d => d.avgConfianca < 5);

      // Issue 4: Compute bestSession and worstSession by ROI
      const sortedByROI = [...sessionData].sort((a, b) => b.roi - a.roi);
      const best = sortedByROI[0];
      const worst = sortedByROI[sortedByROI.length - 1];

      const formatSessionSummary = (s: typeof best) => ({
        date: s.date ? (s.date instanceof Date ? s.date.toISOString().split('T')[0] : String(s.date)) : null,
        avgFocus: Math.round(s.avgFoco * 10) / 10,
        avgEnergy: Math.round(s.avgEnergia * 10) / 10,
        roi: Math.round(s.roi * 10) / 10,
      });

      res.json({
        roiHighFocus: avgROI(highFocus),
        roiLowFocus: avgROI(lowFocus),
        roiHighEnergy: avgROI(highEnergy),
        roiLowEnergy: avgROI(lowEnergy),
        roiHighConfidence: avgROI(highConf),
        roiLowConfidence: avgROI(lowConf),
        sampleSize: sessionData.length,
        insufficient: false,
        bestSession: formatSessionSummary(best),
        worstSession: formatSessionSummary(worst),
      });
    } catch (error) {
      console.error("Failed to fetch mental correlation:", error);
      res.status(500).json({ message: "Failed to fetch mental correlation" });
    }
  });

  // Track user activity (POST endpoint for logging activity)
  app.post('/api/analytics/track', requireAuth, async (req, res) => {
    try {
      const trackSchema = z.object({
        page: z.string().max(100),
        action: z.string().max(50),
        feature: z.string().max(100).optional().nullable(),
        duration: z.number().int().min(0).max(86400).optional().nullable(),
        metadata: z.record(z.unknown()).optional().nullable(),
      });

      const parsed = trackSchema.parse(req.body);
      const { page, action, feature, duration, metadata } = parsed;
      const userId = req.user!.userPlatformId;

      // Insert activity record
      await db.insert(userActivity).values({
        id: nanoid(),
        userId,
        page,
        action,
        feature,
        duration,
        metadata,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        createdAt: new Date()
      });

      res.json({ message: 'Activity tracked successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Dados inválidos', issues: error.issues });
      }
      res.status(500).json({ message: 'Erro ao rastrear atividade' });
    }
  });

  // RF-03: Player Bundle aggregator (Tournament Selector)
  app.get('/api/analytics/player-bundle', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const lookbackDays = req.query.lookbackDays
        ? parseInt(String(req.query.lookbackDays), 10)
        : 180;
      const out = await handlePlayerBundle({ userId, lookbackDays });
      res.json(out);
    } catch (error: any) {
      const msg = error?.message ?? '';
      if (msg.startsWith('Unauthorized')) {
        return res.status(401).json({ message: msg });
      }
      console.error('player-bundle failed:', error);
      res.status(500).json({ message: 'Failed to fetch player bundle' });
    }
  });

  // RF-06 (opcional): GET /api/analytics/by-time-of-day
  app.get('/api/analytics/by-time-of-day', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = (req.query.period as string) || '30d';
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);
      const analytics = await (storage as any).getAnalyticsByTimeOfDay(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch time-of-day analytics' });
    }
  });
}
