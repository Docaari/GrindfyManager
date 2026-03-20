import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  userActivity,
  users,
} from "@shared/schema";
import { nanoid } from "nanoid";
import { eq, and, desc, gte, sql, count, avg, max, sum } from "drizzle-orm";
import { z } from "zod";
import { parseFiltersParam, mapFiltersToBackendFormat, calculateStartDate } from "./helpers";

export function registerAnalyticsRoutes(app: Express): void {
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
      const filters = parseFiltersParam(req.query.filters);
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
      res.status(500).json({ message: 'Erro ao rastrear atividade' });
    }
  });
}
