import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  insertStudyCardSchema,
  insertStudyMaterialSchema,
  insertStudyNoteSchema,
  insertStudySessionSchema,
  insertStudyScheduleSchema,
  studyNotes,
  studyMaterials,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerStudiesRoutes(app: Express): void {
  // Study Cards API routes
  app.get('/api/study-cards', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCards = await storage.getStudyCards(userId);
      res.json(studyCards);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study cards" });
    }
  });

  app.post('/api/study-cards', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCardData = insertStudyCardSchema.parse({
        ...req.body,
        userId: userId
      });

      const studyCard = await storage.createStudyCard(studyCardData);
      res.json(studyCard);
    } catch (error) {
      res.status(400).json({ message: "Failed to create study card" });
    }
  });

  app.get('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCard = await storage.getStudyCard(req.params.id, userId);
      if (!studyCard) {
        return res.status(404).json({ message: "Study card not found" });
      }
      res.json(studyCard);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study card" });
    }
  });

  app.patch('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      const studyCard = await storage.updateStudyCard(req.params.id, req.body);
      res.json(studyCard);
    } catch (error) {
      res.status(400).json({ message: "Failed to update study card" });
    }
  });

  app.delete('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      await storage.deleteStudyCard(req.params.id);
      res.json({ message: "Study card deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete study card" });
    }
  });

  // Study Materials API routes
  app.get('/api/study-cards/:id/materials', requireAuth, async (req: any, res) => {
    try {
      const materials = await storage.getStudyMaterials(req.params.id);
      res.json(materials);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study materials" });
    }
  });

  app.post('/api/study-cards/:id/materials', requireAuth, async (req: any, res) => {
    try {
      const materialData = insertStudyMaterialSchema.parse({
        ...req.body,
        studyCardId: req.params.id
      });
      const material = await storage.createStudyMaterial(materialData);
      res.json(material);
    } catch (error) {
      res.status(400).json({ message: "Failed to create study material" });
    }
  });

  // Study Notes API routes
  app.get('/api/study-cards/:id/notes', requireAuth, async (req: any, res) => {
    try {
      const notes = await storage.getStudyNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study notes" });
    }
  });

  app.post('/api/study-cards/:id/notes', requireAuth, async (req: any, res) => {
    try {
      const noteData = insertStudyNoteSchema.parse({
        ...req.body,
        studyCardId: req.params.id
      });
      const note = await storage.createStudyNote(noteData);
      res.json(note);
    } catch (error) {
      res.status(400).json({ message: "Failed to create study note" });
    }
  });



  app.delete('/api/study-notes/:id', requireAuth, async (req: any, res) => {
    try {
      await db.delete(studyNotes).where(eq(studyNotes.id, req.params.id));
      res.json({ message: "Note deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  app.delete('/api/study-materials/:id', requireAuth, async (req: any, res) => {
    try {
      await db.delete(studyMaterials).where(eq(studyMaterials.id, req.params.id));
      res.json({ message: "Material deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete material" });
    }
  });

  // Study Sessions API routes
  app.get('/api/study-sessions', requireAuth, async (req: any, res) => {
    try {
      const sessions = await storage.getStudySessions(req.user.userPlatformId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study sessions" });
    }
  });

  app.post('/api/study-sessions', requireAuth, async (req: any, res) => {
    try {
      const sessionData = insertStudySessionSchema.parse({
        ...req.body,
        userId: req.user.userPlatformId
      });
      const session = await storage.createStudySession(sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "Failed to create study session" });
    }
  });

  // Study Correlation and Progress Tracking
  app.get('/api/study-correlation/:studyCardId', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCard = await storage.getStudyCard(req.params.studyCardId, userId);
      if (!studyCard) {
        return res.status(404).json({ message: "Study card not found" });
      }

      // Get tournament data for correlation analysis
      const tournaments = await storage.getTournaments(userId);
      const studyStartDate = new Date(studyCard.createdAt || new Date());

      // Split tournaments into before and after study start
      const beforeStudy = tournaments.filter(t => new Date(t.datePlayed) < studyStartDate);
      const afterStudy = tournaments.filter(t => new Date(t.datePlayed) >= studyStartDate);

      // Calculate performance metrics
      const calculateMetrics = (tournamentList: any[]) => {
        if (tournamentList.length === 0) return { roi: 0, profit: 0, count: 0 };

        const totalProfit = tournamentList.reduce((sum, t) => sum + parseFloat(t.prize || '0'), 0);
        const totalBuyins = tournamentList.reduce((sum, t) => sum + parseFloat(t.buyIn || '0'), 0);
        const roi = totalBuyins > 0 ? (totalProfit / totalBuyins) * 100 : 0;

        return {
          roi: Math.round(roi * 100) / 100,
          profit: Math.round(totalProfit * 100) / 100,
          count: tournamentList.length
        };
      };

      const beforeMetrics = calculateMetrics(beforeStudy);
      const afterMetrics = calculateMetrics(afterStudy);

      // Calculate correlation insight
      const roiImprovement = afterMetrics.roi - beforeMetrics.roi;
      const profitImprovement = afterMetrics.profit - beforeMetrics.profit;

      res.json({
        studyCard,
        before: beforeMetrics,
        after: afterMetrics,
        improvement: {
          roi: roiImprovement,
          profit: profitImprovement,
          timeInvested: studyCard.timeInvested || 0,
          knowledgeScore: studyCard.knowledgeScore || 0
        },
        insight: {
          hasImprovement: roiImprovement > 0 || profitImprovement > 0,
          significantImprovement: roiImprovement > 5 || profitImprovement > 100,
          category: studyCard.category
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch study correlation" });
    }
  });

  app.post('/api/study-cards/:id/progress', requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { timeToAdd, knowledgeScore } = req.body;
      const studyCard = await storage.getStudyCard(req.params.id, userId);

      if (!studyCard) {
        return res.status(404).json({ message: "Study card not found" });
      }

      const updatedCard = await storage.updateStudyCard(req.params.id, {
        timeInvested: (studyCard.timeInvested || 0) + (timeToAdd || 0),
        knowledgeScore: knowledgeScore !== undefined ? knowledgeScore : studyCard.knowledgeScore,
      } as any);

      res.json(updatedCard);
    } catch (error) {
      res.status(400).json({ message: "Failed to update study progress" });
    }
  });

  // Study schedules
  app.get('/api/study-schedules', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const schedules = await storage.getStudySchedules(userId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch study schedules' });
    }
  });

  app.post('/api/study-schedules', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const scheduleData = insertStudyScheduleSchema.parse({
        ...req.body,
        userId
      });

      const schedule = await storage.createStudySchedule(scheduleData);
      res.json(schedule);
    } catch (error) {
      res.status(400).json({ message: 'Failed to create study schedule' });
    }
  });
}
