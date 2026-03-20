import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import EmailService from "../emailService";
import {
  insertCustomGroupSchema,
  insertCoachingInsightSchema,
  insertUserSettingsSchema,
  profileStates,
} from "@shared/schema";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";

export function registerMiscRoutes(app: Express): void {
  // Email template preview routes
  app.get('/api/email-templates/:type', requirePermission('admin_full'), async (req: any, res) => {
    try {
      const { type } = req.params;

      let htmlTemplate = '';

      switch (type) {
        case 'verification':
          htmlTemplate = EmailService.getEmailVerificationTemplate('https://grindfyapp.com/verify-email?token=DEMO_TOKEN');
          break;
        case 'welcome':
          htmlTemplate = EmailService.getWelcomeEmailTemplate('João');
          break;
        case 'password-reset':
          htmlTemplate = EmailService.getPasswordResetTemplate('https://grindfyapp.com/reset-password?token=DEMO_TOKEN');
          break;
        default:
          return res.status(400).json({ message: 'Invalid email template type' });
      }

      res.setHeader('Content-Type', 'text/html');
      res.send(htmlTemplate);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch email template' });
    }
  });

  // Custom group routes
  app.get('/api/custom-groups', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const groups = await storage.getCustomGroups(userId);
      res.json(groups);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch custom groups" });
    }
  });

  app.post('/api/custom-groups', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const groupData = insertCustomGroupSchema.parse({ ...req.body, userId });
      const group = await storage.createCustomGroup(groupData);
      res.json(group);
    } catch (error) {
      res.status(400).json({ message: "Failed to create custom group" });
    }
  });

  // Coaching insight routes
  app.get('/api/coaching-insights', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const insights = await storage.getCoachingInsights(userId);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coaching insights" });
    }
  });

  app.post('/api/coaching-insights', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const insightData = insertCoachingInsightSchema.parse({ ...req.body, userId });
      const insight = await storage.createCoachingInsight(insightData);
      res.json(insight);
    } catch (error) {
      res.status(400).json({ message: "Failed to create coaching insight" });
    }
  });

  app.put('/api/coaching-insights/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const insightData = insertCoachingInsightSchema.partial().parse(req.body);
      const insight = await storage.updateCoachingInsight(id, insightData);
      res.json(insight);
    } catch (error) {
      res.status(400).json({ message: "Failed to update coaching insight" });
    }
  });

  // User settings routes
  app.get('/api/user-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const settings = await storage.getUserSettings(userId);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user settings" });
    }
  });

  app.post('/api/user-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      // The insertUserSettingsSchema now includes exchangeRates due to shared/schema.ts update
      const settingsData = insertUserSettingsSchema.parse({ ...req.body, userId });
      const settings = await storage.upsertUserSettings(settingsData);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(400).json({ message: "Failed to update user settings" });
    }
  });

  // User stats endpoint for Home page
  app.get('/api/user/stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Get user statistics from tournaments and sessions
      const tournaments = await storage.getTournaments(userId);
      const sessions = await storage.getGrindSessions(userId);

      const totalTournaments = tournaments.length;
      const totalSessions = sessions.length;
      const totalProfit = tournaments.reduce((sum, t) => sum + (parseFloat(t.prize || '0') - parseFloat(t.buyIn)), 0);
      const totalBuyIn = tournaments.reduce((sum, t) => sum + parseFloat(t.buyIn), 0);
      const roi = totalBuyIn > 0 ? (totalProfit / totalBuyIn) * 100 : 0;
      const averageBuyIn = totalTournaments > 0 ? totalBuyIn / totalTournaments : 0;
      const itm = totalTournaments > 0 ? (tournaments.filter(t => t.position && t.position <= Math.ceil(totalTournaments * 0.15)).length / totalTournaments) * 100 : 0;
      const finalTables = tournaments.filter(t => t.finalTable).length;
      const bigHits = tournaments.filter(t => t.bigHit).length;

      const lastActivity = tournaments.length > 0 ?
        tournaments.sort((a, b) => new Date(b.datePlayed).getTime() - new Date(a.datePlayed).getTime())[0].datePlayed :
        new Date();

      // Calculate weekly progress
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weeklyProgress = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        return sessionDate >= weekStart && sessionDate <= weekEnd;
      }).length;

      const stats = {
        totalSessions,
        totalTournaments,
        totalProfit,
        roi,
        averageBuyIn,
        itm,
        finalTables,
        bigHits,
        lastActivity,
        weeklyGoal: 5, // Default weekly goal
        weeklyProgress
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar estatísticas do usuário' });
    }
  });

  // Profile States API endpoints
  app.get('/api/profile-states', requireAuth, async (req, res) => {
    try {
      const userPlatformId = req.user!.userPlatformId;

      const states = await db
        .select()
        .from(profileStates)
        .where(eq(profileStates.userId, userPlatformId))
        .orderBy(profileStates.dayOfWeek);

      res.json(states);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar estados dos perfis' });
    }
  });

  // Update profile state for a specific day
  app.put('/api/profile-states/:dayOfWeek', requireAuth, async (req, res) => {
    try {
      const userPlatformId = req.user!.userPlatformId;
      const dayOfWeek = parseInt(req.params.dayOfWeek);
      const { activeProfile, profileAData, profileBData } = req.body;

      if (dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ message: 'Dia da semana deve ser entre 0 e 6' });
      }

      if (activeProfile !== null && !['A', 'B', 'C'].includes(activeProfile)) {
        return res.status(400).json({ message: 'Perfil ativo deve ser A, B, C ou null' });
      }

      // Check if profile state exists
      const existing = await db
        .select()
        .from(profileStates)
        .where(and(
          eq(profileStates.userId, userPlatformId),
          eq(profileStates.dayOfWeek, dayOfWeek)
        ))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(profileStates)
          .set({
            activeProfile,
            updatedAt: new Date()
          } as any)
          .where(and(
            eq(profileStates.userId, userPlatformId),
            eq(profileStates.dayOfWeek, dayOfWeek)
          ));
      } else {
        // Create new
        await db
          .insert(profileStates)
          .values({
            id: nanoid(),
            userId: userPlatformId,
            dayOfWeek,
            activeProfile,
            createdAt: new Date(),
            updatedAt: new Date()
          });
      }

      res.json({ message: 'Estado do perfil atualizado com sucesso' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao atualizar estado do perfil' });
    }
  });

  // Webhook preparation endpoint for payment gateway
  app.post('/api/webhooks/payment', (_req, res) => {
    res.status(503).json({ message: 'Payment webhooks not yet configured' });
  });
}
