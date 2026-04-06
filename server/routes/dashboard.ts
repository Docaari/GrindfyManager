import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { tournaments, grindSessions, plannedTournaments } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { parseFiltersParam, mapFiltersToBackendFormat } from "./helpers";

export function registerDashboardRoutes(app: Express): void {
  // Dashboard routes with filters
  app.get('/api/dashboard/stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);

      // Map frontend filters to backend format
      const filters = mapFiltersToBackendFormat(rawFilters);


      const stats = await storage.getDashboardStats(userId, period, filters);


      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Quick stats for Home page
  app.get('/api/dashboard/quick-stats', requireAuth, async (req: any, res) => {
    try {
      const userPlatformId = req.user.userPlatformId;

      // Get basic tournament stats (prize = net profit, não subtrair buyIn)
      const tournamentStats = await db.select({
        totalTournaments: sql<number>`COUNT(*)::int`,
        totalProfit: sql<number>`COALESCE(SUM(prize::numeric), 0)`,
        lastSessionDate: sql<string>`MAX(date_played)`
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userPlatformId));

      // Get grind sessions count
      const sessionCount = await db.select({
        count: sql<number>`COUNT(*)::int`
      })
      .from(grindSessions)
      .where(and(eq(grindSessions.userId, userPlatformId), eq(grindSessions.status, 'completed')));

      // Get planned tournaments count (distinct days with tournaments)
      const gradeCount = await db.select({
        count: sql<number>`COUNT(DISTINCT day_of_week)::int`
      })
      .from(plannedTournaments)
      .where(eq(plannedTournaments.userId, userPlatformId));

      // Get current streak (consecutive profitable days)
      const recentDays = await db.select({
        profit: sql<number>`SUM(prize::numeric)`,
        date: sql<string>`DATE(date_played)`
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userPlatformId))
      .groupBy(sql`DATE(date_played)`)
      .orderBy(desc(sql`DATE(date_played)`))
      .limit(10);

      let currentStreak = 0;
      for (const day of recentDays) {
        if (Number(day.profit) > 0) {
          currentStreak++;
        } else {
          break;
        }
      }

      const stats = tournamentStats[0];

      res.json({
        totalTournaments: stats.totalTournaments || 0,
        totalProfit: stats.totalProfit || 0,
        lastSessionDate: stats.lastSessionDate || null,
        currentStreak,
        totalSessions: sessionCount[0]?.count || 0,
        totalGradeDays: gradeCount[0]?.count || 0,
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar estatísticas rápidas' });
    }
  });

  app.get('/api/dashboard/performance', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const filters = parseFiltersParam(req.query.filters);
      const performance = await storage.getPerformanceByPeriod(userId, period, filters);
      res.json(performance);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch performance data" });
    }
  });
}
