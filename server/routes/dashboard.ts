import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { tournaments } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
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

      // Get basic tournament stats
      const tournamentStats = await db.select({
        totalTournaments: sql<number>`COUNT(*)::int`,
        totalProfit: sql<number>`COALESCE(SUM(prize::numeric - buy_in::numeric), 0)`,
        lastSessionDate: sql<string>`MAX(date_played)`
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userPlatformId));

      // Get current streak (consecutive profitable sessions)
      const recentSessions = await db.select({
        profit: sql<number>`prize::numeric - buy_in::numeric`,
        date: tournaments.datePlayed
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userPlatformId))
      .orderBy(desc(tournaments.datePlayed))
      .limit(10);

      // Calculate streak
      let currentStreak = 0;
      for (const session of recentSessions) {
        if (session.profit > 0) {
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
        currentStreak: currentStreak
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
