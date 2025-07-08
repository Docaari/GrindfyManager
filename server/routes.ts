import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertTournamentSchema,
  insertTournamentTemplateSchema,
  insertWeeklyPlanSchema,
  insertGrindSessionSchema,
  insertPreparationLogSchema,
  insertCustomGroupSchema,
  insertCoachingInsightSchema,
  insertUserSettingsSchema,
  insertPlannedTournamentSchema,
  insertBreakFeedbackSchema,
  insertSessionTournamentSchema,
  insertStudyCardSchema,
  insertStudyMaterialSchema,
  insertStudyNoteSchema,
  insertStudyFlashCardSchema,
  insertStudySessionSchema,
} from "@shared/schema";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import { PokerCSVParser } from "./csvParser";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

// Helper function to detect Coin network TXT format
function isCoinFormat(fileContent: string): boolean {
  // Coin format should contain these specific patterns
  return fileContent.includes('Withdrawal') && 
         fileContent.includes('Deposit') && 
         fileContent.includes('USDT') &&
         fileContent.includes('AccountAction') &&
         fileContent.includes('NL Hold\'em');
}

// Helper function to detect CoinPoker CSV format
function isCoinPokerFormat(fileContent: string): boolean {
  // CoinPoker CSV format should contain these specific patterns
  const lines = fileContent.split('\n');
  if (lines.length < 2) return false;
  
  // Check header contains expected columns
  const header = lines[0].toLowerCase();
  const hasExpectedColumns = header.includes('type') && 
                            header.includes('description') && 
                            header.includes('amount') && 
                            header.includes('date');
  
  // Check first few data lines contain NL Hold'em tournaments
  const hasNLHoldem = lines.slice(1, 5).some(line => 
    line.includes('NL Hold\'em') && line.includes('USDT')
  );
  
  return hasExpectedColumns && hasNLHoldem;
}

// Helper function to detect Bodog Excel format
function isBodogFormat(filename: string): boolean {
  return filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls');
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard routes with filters
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const stats = await storage.getDashboardStats(userId, period, filters);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get('/api/dashboard/performance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const performance = await storage.getPerformanceByPeriod(userId, period, filters);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching performance data:", error);
      res.status(500).json({ message: "Failed to fetch performance data" });
    }
  });

  // Advanced analytics routes with filters
  app.get('/api/analytics/by-site', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsBySite(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching site analytics:", error);
      res.status(500).json({ message: "Failed to fetch site analytics" });
    }
  });

  app.get('/api/analytics/by-buyin', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsByBuyinRange(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching buyin analytics:", error);
      res.status(500).json({ message: "Failed to fetch buyin analytics" });
    }
  });

  app.get('/api/analytics/by-category', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsByCategory(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching category analytics:", error);
      res.status(500).json({ message: "Failed to fetch category analytics" });
    }
  });

  app.get('/api/analytics/by-day', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsByDayOfWeek(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching day analytics:", error);
      res.status(500).json({ message: "Failed to fetch day analytics" });
    }
  });

  // Grade Coach route
  app.get('/api/coaching/recommendations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const recommendations = await storage.getCoachingRecommendations(userId);
      res.json(recommendations);
    } catch (error) {
      console.error("Error fetching coaching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch coaching recommendations" });
    }
  });

  // Tournament routes
  app.get("/api/tournaments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 50;
      const period = req.query.period as string;
      const filters = req.query.filters ? JSON.parse(req.query.filters as string) : {};

      const tournaments = await storage.getTournaments(userId, limit, undefined, period, filters);
      res.json(tournaments);
    } catch (error) {
      console.error("Error fetching tournaments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Clear all tournaments for user
  app.delete('/api/tournaments/clear', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.clearAllTournaments(userId);
      res.json({ message: "All tournaments cleared successfully" });
    } catch (error) {
      console.error("Error clearing tournaments:", error);
      res.status(500).json({ message: "Failed to clear tournaments" });
    }
  });

  app.post('/api/tournaments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tournamentData = insertTournamentSchema.parse({ ...req.body, userId });
      const tournament = await storage.createTournament(tournamentData);
      res.json(tournament);
    } catch (error) {
      console.error("Error creating tournament:", error);
      res.status(400).json({ message: "Failed to create tournament" });
    }
  });

  app.put('/api/tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const tournamentData = insertTournamentSchema.partial().parse(req.body);
      const tournament = await storage.updateTournament(id, tournamentData);
      res.json(tournament);
    } catch (error) {
      console.error("Error updating tournament:", error);
      res.status(400).json({ message: "Failed to update tournament" });
    }
  });

  app.delete('/api/tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTournament(id);
      res.json({ message: "Tournament deleted successfully" });
    } catch (error) {
      console.error("Error deleting tournament:", error);
      res.status(500).json({ message: "Failed to delete tournament" });
    }
  });

  // Tournament Library - Agrupamento Inteligente
  app.get('/api/tournament-library', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "all";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      
      const library = await storage.getTournamentLibrary(userId, period, filters);
      res.json(library);
    } catch (error) {
      console.error("Error fetching tournament library:", error);
      res.status(500).json({ message: "Failed to fetch tournament library" });
    }
  });

  // Tournament template routes
  app.get('/api/tournament-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templates = await storage.getTournamentTemplates(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching tournament templates:", error);
      res.status(500).json({ message: "Failed to fetch tournament templates" });
    }
  });

  app.post('/api/tournament-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateData = insertTournamentTemplateSchema.parse({ ...req.body, userId });
      const template = await storage.createTournamentTemplate(templateData);
      res.json(template);
    } catch (error) {
      console.error("Error creating tournament template:", error);
      res.status(400).json({ message: "Failed to create tournament template" });
    }
  });

  // Planned tournament routes
  app.get('/api/planned-tournaments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tournaments = await storage.getPlannedTournaments(userId);
      res.json(tournaments);
    } catch (error) {
      console.error("Error fetching planned tournaments:", error);
      res.status(500).json({ message: "Failed to fetch planned tournaments" });
    }
  });

  app.post('/api/planned-tournaments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tournamentData = insertPlannedTournamentSchema.parse({ ...req.body, userId });
      const tournament = await storage.createPlannedTournament(tournamentData);
      res.json(tournament);
    } catch (error) {
      console.error("Error creating planned tournament:", error);
      res.status(400).json({ message: "Failed to create planned tournament" });
    }
  });

  app.put('/api/planned-tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      console.log('PUT /api/planned-tournaments/:id called with:', { id, body: req.body });
      
      // Parse the request body manually to handle all field types correctly
      const updates: any = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (key === 'position') {
          updates[key] = value === null ? null : parseInt(value as string);
        } else if (key === 'rebuys') {
          updates[key] = parseInt(value as string) || 0;
        } else if (key === 'result' || key === 'bounty') {
          updates[key] = value === null ? '0' : String(value);
        } else if (key === 'startTime' || key === 'endTime') {
          updates[key] = value === null ? null : (value ? new Date(value as string) : null);
        } else {
          updates[key] = value;
        }
      }
      
      console.log('Parsed tournament data:', updates);
      const tournament = await storage.updatePlannedTournament(id, updates);
      console.log('Updated tournament result:', tournament);
      res.json(tournament);
    } catch (error) {
      console.error("Error updating planned tournament:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        requestBody: req.body,
        tournamentId: id
      });
      res.status(400).json({ 
        message: "Failed to update planned tournament",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/planned-tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deletePlannedTournament(id);
      res.json({ message: "Planned tournament deleted successfully" });
    } catch (error) {
      console.error("Error deleting planned tournament:", error);
      res.status(500).json({ message: "Failed to delete planned tournament" });
    }
  });

  // Weekly plan routes
  app.get('/api/weekly-plans', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const plans = await storage.getWeeklyPlans(userId);
      res.json(plans);
    } catch (error) {
      console.error("Error fetching weekly plans:", error);
      res.status(500).json({ message: "Failed to fetch weekly plans" });
    }
  });

  app.post('/api/weekly-plans', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const planData = insertWeeklyPlanSchema.parse({ ...req.body, userId });
      const plan = await storage.createWeeklyPlan(planData);
      res.json(plan);
    } catch (error) {
      console.error("Error creating weekly plan:", error);
      res.status(400).json({ message: "Failed to create weekly plan" });
    }
  });

  // Grind session routes
  app.get('/api/grind-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessions = await storage.getGrindSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching grind sessions:", error);
      res.status(500).json({ message: "Failed to fetch grind sessions" });
    }
  });

  // Get grind session history with complete statistics
  app.get('/api/grind-sessions/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessions = await storage.getGrindSessions(userId);
      const completedSessions = sessions.filter(s => s.status === "completed");
      
      // Get statistics for each completed session
      const sessionsWithStats = await Promise.all(
        completedSessions.map(async (session) => {
          const sessionTournaments = await storage.getSessionTournaments(userId, session.id);
          
          // ALSO get tournaments from planned tournaments linked to this session
          const plannedTournaments = await storage.getPlannedTournamentsBySession(userId, session.id);
          
          // Combine both types of tournaments
          const allTournaments = [...sessionTournaments, ...plannedTournaments];
          
          console.log(`Session ${session.id}: found ${sessionTournaments.length} session tournaments, ${plannedTournaments.length} planned tournaments`);
          
          const sessionBreaks = await storage.getBreakFeedbacks(userId, session.id);

          // Calculate session statistics
          const volume = allTournaments.length;
          const totalBuyins = allTournaments.reduce((sum, t) => {
            const buyIn = parseFloat(t.buyIn) || 0;
            const rebuys = t.rebuys || 0;
            return sum + buyIn + (buyIn * rebuys);
          }, 0);
          
          const totalResult = allTournaments.reduce((sum, t) => sum + (parseFloat(t.result) || 0), 0);
          const profit = totalResult - totalBuyins;
          const abiMed = volume > 0 ? totalBuyins / volume : 0;
          const roi = totalBuyins > 0 ? ((profit / totalBuyins) * 100) : 0;
          
          const fts = allTournaments.filter(t => {
            const position = t.position;
            const fieldSize = t.fieldSize || 100;
            return position && (position <= 9 || position <= Math.ceil(fieldSize * 0.1));
          }).length;
          
          const cravadas = allTournaments.filter(t => {
            const buyIn = parseFloat(t.buyIn) || 0;
            const result = parseFloat(t.result) || 0;
            const invested = buyIn * (1 + (t.rebuys || 0));
            return (result - invested) > (buyIn * 10);
          }).length;

          // Calculate break averages
          const energiaMedia = sessionBreaks.length > 0 
            ? sessionBreaks.reduce((sum, b) => sum + b.energia, 0) / sessionBreaks.length 
            : 0;
          const focoMedio = sessionBreaks.length > 0 
            ? sessionBreaks.reduce((sum, b) => sum + b.foco, 0) / sessionBreaks.length 
            : 0;
          const confiancaMedia = sessionBreaks.length > 0 
            ? sessionBreaks.reduce((sum, b) => sum + b.confianca, 0) / sessionBreaks.length 
            : 0;
          const inteligenciaEmocionalMedia = sessionBreaks.length > 0 
            ? sessionBreaks.reduce((sum, b) => sum + b.inteligenciaEmocional, 0) / sessionBreaks.length 
            : 0;
          const interferenciasMedia = sessionBreaks.length > 0 
            ? sessionBreaks.reduce((sum, b) => sum + b.interferencias, 0) / sessionBreaks.length 
            : 0;

          // Calculate session duration
          let duration = undefined;
          if (session.startTime && session.endTime) {
            const start = new Date(session.startTime);
            const end = new Date(session.endTime);
            const durationMs = end.getTime() - start.getTime();
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            duration = `${hours}h ${minutes}m`;
          }

          return {
            ...session,
            duration,
            volume,
            profit,
            abiMed,
            roi,
            fts,
            cravadas,
            energiaMedia,
            focoMedio,
            confiancaMedia,
            inteligenciaEmocionalMedia,
            interferenciasMedia,
            breakCount: sessionBreaks.length
          };
        })
      );

      res.json(sessionsWithStats);
    } catch (error) {
      console.error("Error fetching session history:", error);
      res.status(500).json({ message: "Failed to fetch session history" });
    }
  });

  // Reset all tournaments for new session
  app.post("/api/grind-sessions/reset-tournaments", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const currentDayOfWeek = new Date().getDay();
      
      console.log('Resetting all tournaments for user:', user.claims.sub, 'day:', currentDayOfWeek);
      
      await storage.resetPlannedTournamentsForSession(user.claims.sub, currentDayOfWeek);
      
      res.json({ message: "Tournaments reset successfully" });
    } catch (error) {
      console.error("Error resetting tournaments:", error);
      res.status(500).json({ message: "Failed to reset tournaments" });
    }
  });

  app.post('/api/grind-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { resetTournaments, replaceExisting, ...sessionDataRaw } = req.body;
      
      // Parse the session date to get the day
      const newSessionDate = new Date(sessionDataRaw.date).toISOString().split('T')[0];
      
      // Always check for existing sessions on the same day and delete them
      // This ensures clean session creation regardless of replaceExisting flag
      const existingSessions = await storage.getGrindSessions(userId);
      const existingSessionsToday = existingSessions.filter(session => {
        const sessionDate = new Date(session.date).toISOString().split('T')[0];
        return sessionDate === newSessionDate;
      });
      
      // Delete ALL existing sessions for the same day
      if (existingSessionsToday.length > 0) {
        console.log(`Found ${existingSessionsToday.length} existing sessions for date ${newSessionDate}. Deleting all...`);
        
        for (const existingSession of existingSessionsToday) {
          console.log(`Deleting existing session ${existingSession.id} from ${newSessionDate}`);
          await storage.deleteGrindSession(existingSession.id);
        }
        
        console.log(`Successfully deleted all ${existingSessionsToday.length} existing sessions for date ${newSessionDate}`);
      }
      
      const sessionData = insertGrindSessionSchema.parse({ ...sessionDataRaw, userId });
      const session = await storage.createGrindSession(sessionData);
      
      // Get current day of week for tournament operations
      const today = new Date();
      const dayOfWeek = today.getDay() || 7; // Convert Sunday (0) to 7, keep others as is
      
      // If resetTournaments flag is set, reset all planned tournaments for today first
      if (resetTournaments) {
        console.log(`Resetting planned tournaments for clean session start - User: ${userId}, Day: ${dayOfWeek}`);
        await storage.resetPlannedTournamentsForSession(userId, dayOfWeek);
      }
      
      // Get all planned tournaments for today that are active
      const plannedTournaments = await storage.getSessionTournamentsByDay(userId, dayOfWeek);
      
      // Update each planned tournament to link it to this session
      for (const tournament of plannedTournaments) {
        if (tournament.id.startsWith('planned-')) {
          const actualId = tournament.id.replace('planned-', '');
          await storage.updatePlannedTournament(actualId, { sessionId: session.id });
        }
      }
      
      console.log(`Session ${session.id} created with ${plannedTournaments.length} linked tournaments`);
      res.json(session);
    } catch (error) {
      console.error("Error creating grind session:", error);
      res.status(400).json({ message: "Failed to create grind session" });
    }
  });

  app.put('/api/grind-sessions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const sessionData = insertGrindSessionSchema.partial().parse(req.body);
      const session = await storage.updateGrindSession(id, sessionData);
      res.json(session);
    } catch (error) {
      console.error("Error updating grind session:", error);
      res.status(400).json({ message: "Failed to update grind session" });
    }
  });

  app.delete('/api/grind-sessions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      console.log(`Attempting to delete session ${id} for user ${userId}`);
      
      // First verify the session belongs to the user
      const session = await storage.getGrindSession(id);
      if (!session || session.userId !== userId) {
        console.log(`Session ${id} not found or doesn't belong to user ${userId}`);
        return res.status(404).json({ message: "Session not found" });
      }

      console.log(`Session ${id} found, proceeding with deletion`);

      // Delete related data first
      try {
        // Delete planned tournaments associated with this session (reset them back to no sessionId)
        const plannedTournaments = await storage.getPlannedTournamentsBySession(userId, id);
        console.log(`Found ${plannedTournaments.length} planned tournaments to reset`);
        
        for (const tournament of plannedTournaments) {
          await storage.updatePlannedTournament(tournament.id, { 
            sessionId: null,
            status: 'upcoming',
            result: '0',
            bounty: '0',
            position: null,
            rebuys: 0,
            startTime: null,
            endTime: null
          });
        }
        
        // Delete session tournaments
        const sessionTournaments = await storage.getSessionTournaments(userId, id);
        console.log(`Found ${sessionTournaments.length} session tournaments to delete`);
        
        for (const tournament of sessionTournaments) {
          await storage.deleteSessionTournament(tournament.id);
        }
        
        // Delete break feedbacks
        const breakFeedbackList = await storage.getBreakFeedbacks(userId, id);
        console.log(`Found ${breakFeedbackList.length} break feedbacks to delete`);
        
        for (const feedback of breakFeedbackList) {
          // Use the storage method instead of direct db access
          await storage.deleteBreakFeedback(feedback.id);
        }
        
        console.log(`All related data cleaned up for session ${id}`);
        
      } catch (cleanupError) {
        console.error("Error during session cleanup:", cleanupError);
        // Continue with session deletion even if cleanup fails partially
      }
      
      // Finally delete the session
      await storage.deleteGrindSession(id);
      console.log(`Session ${id} deleted successfully`);
      
      res.json({ message: "Grind session deleted successfully" });
    } catch (error) {
      console.error("Error deleting grind session:", error);
      res.status(500).json({ message: "Failed to delete grind session" });
    }
  });

  // Preparation log routes
  app.get('/api/preparation-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const logs = await storage.getPreparationLogs(userId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching preparation logs:", error);
      res.status(500).json({ message: "Failed to fetch preparation logs" });
    }
  });

  app.post('/api/preparation-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const logData = insertPreparationLogSchema.parse({ ...req.body, userId });
      const log = await storage.createPreparationLog(logData);
      res.json(log);
    } catch (error) {
      console.error("Error creating preparation log:", error);
      res.status(400).json({ message: "Failed to create preparation log" });
    }
  });

  // Custom group routes
  app.get('/api/custom-groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groups = await storage.getCustomGroups(userId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching custom groups:", error);
      res.status(500).json({ message: "Failed to fetch custom groups" });
    }
  });

  app.post('/api/custom-groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groupData = insertCustomGroupSchema.parse({ ...req.body, userId });
      const group = await storage.createCustomGroup(groupData);
      res.json(group);
    } catch (error) {
      console.error("Error creating custom group:", error);
      res.status(400).json({ message: "Failed to create custom group" });
    }
  });

  // Coaching insight routes
  app.get('/api/coaching-insights', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const insights = await storage.getCoachingInsights(userId);
      res.json(insights);
    } catch (error) {
      console.error("Error fetching coaching insights:", error);
      res.status(500).json({ message: "Failed to fetch coaching insights" });
    }
  });

  app.post('/api/coaching-insights', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const insightData = insertCoachingInsightSchema.parse({ ...req.body, userId });
      const insight = await storage.createCoachingInsight(insightData);
      res.json(insight);
    } catch (error) {
      console.error("Error creating coaching insight:", error);
      res.status(400).json({ message: "Failed to create coaching insight" });
    }
  });

  app.put('/api/coaching-insights/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const insightData = insertCoachingInsightSchema.partial().parse(req.body);
      const insight = await storage.updateCoachingInsight(id, insightData);
      res.json(insight);
    } catch (error) {
      console.error("Error updating coaching insight:", error);
      res.status(400).json({ message: "Failed to update coaching insight" });
    }
  });

  // User settings routes
  app.get('/api/user-settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ message: "Failed to fetch user settings" });
    }
  });

  app.post('/api/user-settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // The insertUserSettingsSchema now includes exchangeRates due to shared/schema.ts update
      const settingsData = insertUserSettingsSchema.parse({ ...req.body, userId });
      const settings = await storage.upsertUserSettings(settingsData);
      res.json(settings);
    } catch (error) {
      console.error("Error updating user settings:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(400).json({ message: "Failed to update user settings" });
    }
  });

  // File upload route with intelligent CSV parsing
  app.post('/api/upload-history', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Fetch user settings to get exchange rates
      const userSettings = await storage.getUserSettings(userId);
      const exchangeRates = userSettings?.exchangeRates || {};

      try {
        // Detect file format and use appropriate parser
        let tournaments;
        
        if (isBodogFormat(file.originalname)) {
          // Handle Excel files from Bodog
          tournaments = await PokerCSVParser.parseBodogXLSX(file.buffer, userId, exchangeRates);
        } else {
          // Handle text-based files (CSV/TXT)
          const fileContent = file.buffer.toString('utf-8');
          
          if (isCoinFormat(fileContent)) {
            tournaments = await PokerCSVParser.parseCoinTXT(fileContent, userId, exchangeRates);
          } else if (isCoinPokerFormat(fileContent)) {
            tournaments = await PokerCSVParser.parseCoinPokerCSV(fileContent, userId, exchangeRates);
          } else {
            tournaments = await PokerCSVParser.parseCSV(fileContent, userId, exchangeRates);
          }
        }

        if (tournaments.length === 0) {
          const debugInfo = isBodogFormat(file.originalname) 
            ? `Excel file: ${file.originalname}` 
            : `File content (first 500 chars): ${file.buffer.toString('utf-8').substring(0,500)}`;
          console.warn(`User ${userId} uploaded a file, but no tournaments were extracted. ${debugInfo}`);
          return res.status(400).json({ 
            message: "No valid tournament data found in file. Please ensure the file is from a supported poker site and contains valid tournament data.",
            // suggestion: "Please ensure your CSV has columns like: Tournament/Name, Buy-in, Prize/Winnings, Position, Date" // Original suggestion
          });
        }

        // Remove duplicates and save tournaments to database
        const savedTournaments = [];
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (const tournament of tournaments) {
          try {
            let isDuplicate = false;
            
            // Special handling for Bodog Reference ID verification
            if (tournament.site === 'Bodog') {
              // Extract Reference ID from tournament name format: "MTT Bodog [REF123]"
              const refIdMatch = tournament.name.match(/\[([^\]]+)\]/);
              if (refIdMatch) {
                const referenceId = refIdMatch[1];
                isDuplicate = await storage.isBodogTournamentExists(userId, referenceId);
                
                if (isDuplicate) {
                  console.log(`✓ Skipped: Bodog tournament with Reference ID ${referenceId} already exists`);
                  skippedCount++;
                  continue;
                }
              }
            } else {
              // Use standard duplicate check for other sites
              isDuplicate = await storage.isDuplicateTournament(userId, {
                name: tournament.name,
                datePlayed: tournament.datePlayed,
                buyIn: tournament.buyIn,
                position: tournament.position,
                fieldSize: tournament.fieldSize,
                site: tournament.site
              });
            }

            if (!isDuplicate) {
              // Convert ParsedTournament to InsertTournament format
              const tournamentData = {
                userId: tournament.userId,
                name: tournament.name.trim(),
                buyIn: tournament.buyIn.toString(),
                prize: tournament.prize?.toString() || "0",
                position: tournament.position || null,
                datePlayed: tournament.datePlayed,
                site: tournament.site,
                format: tournament.format,
                category: tournament.category,
                speed: tournament.speed,
                fieldSize: tournament.fieldSize || null,
                finalTable: tournament.finalTable || false,
                bigHit: tournament.bigHit || false,
                currency: tournament.currency || "USD",
                prizePool: tournament.prizePool?.toString() || null,
                reentries: tournament.reentries || 0
              };

              const saved = await storage.createTournament(tournamentData);
              savedTournaments.push(saved);
              successCount++;
              console.log(`✓ Imported: ${tournament.name} - ${tournament.datePlayed.toDateString()} - $${tournament.buyIn}`);
            } else {
              skippedCount++;
              console.log(`⚠ Skipped duplicate: ${tournament.name} - ${tournament.datePlayed.toDateString()} - $${tournament.buyIn}`);
            }
          } catch (error) {
            console.error("Error saving individual tournament:", error);
            console.error("Tournament data:", tournament);
            errorCount++;
          }
        }

        // Note: Tournament templates will be updated automatically by the analytics system

        res.json({ 
          message: `${successCount} tournaments uploaded successfully${skippedCount > 0 ? `, ${skippedCount} duplicates skipped` : ''}${errorCount > 0 ? `, ${errorCount} failed to save` : ''}`,
          count: successCount,
          parsed: tournaments.length,
          skipped: skippedCount,
          databaseErrors: errorCount,
          tournaments: savedTournaments.slice(0, 5), // Return first 5 for preview
          sites: Array.from(new Set(tournaments.map(t => t.site))), // Show detected sites
          formats: Array.from(new Set(tournaments.map(t => t.format))), // Show detected formats
        });
      } catch (parseError: any) {
        console.error(`CSV parsing error for user ${userId}:`, parseError.message, parseError.stack);
        // Log file information for debugging
        const debugInfo = isBodogFormat(file.originalname) 
          ? `Excel file: ${file.originalname}` 
          : `File content (first 500 chars): ${file.buffer.toString('utf-8').substring(0,500)}`;
        console.error(`Problematic file for user ${req.user?.claims?.sub || 'unknown'}: ${debugInfo}`);
        res.status(400).json({ 
          message: "Failed to parse CSV file. Please ensure it is a valid CSV and the format is supported.",
          error: parseError instanceof Error ? parseError.message : "Unknown parsing error.",
          suggestion: "Verify encoding (UTF-8 preferred), delimiter (comma expected), and that all necessary columns are present."
        });
      }
    } catch (error: any) {
      const userId = req.user?.claims?.sub || 'unknown';
      console.error(`General error during file upload for user ${userId}:`, error.message, error.stack);
      res.status(500).json({
        message: "Failed to upload file due to a server error.",
        error: error.message
      });
    }
  });

  // Exchange rates endpoints
  app.post('/api/settings/exchange-rates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { CNY, EUR } = req.body;

      if (!CNY || !EUR || CNY <= 0 || EUR <= 0) {
        return res.status(400).json({ message: 'Invalid exchange rates provided' });
      }

      await storage.upsertUserSettings({
        userId,
        exchangeRates: { CNY, EUR }
      });

      res.json({ message: 'Exchange rates updated successfully' });
    } catch (error) {
      console.error('Exchange rates error:', error);
      res.status(500).json({ message: 'Failed to save exchange rates' });
    }
  });

  // Get exchange rates endpoint
  app.get('/api/settings/exchange-rates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);

      const exchangeRates = settings?.exchangeRates || { CNY: 7.20, EUR: 0.92 };
      res.json(exchangeRates);
    } catch (error) {
      console.error('Get exchange rates error:', error);
      res.status(500).json({ message: 'Failed to get exchange rates' });
    }
  });

  // Break feedback routes
  app.get('/api/break-feedbacks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessionId = req.query.sessionId;
      const feedbacks = await storage.getBreakFeedbacks(userId, sessionId);
      res.json(feedbacks);
    } catch (error) {
      console.error("Error fetching break feedbacks:", error);
      res.status(500).json({ message: "Failed to fetch break feedbacks" });
    }
  });

  app.post('/api/break-feedbacks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Ensure all required fields are present and properly typed
      const processedData = {
        userId,
        sessionId: req.body.sessionId,
        breakTime: new Date(req.body.breakTime || new Date().toISOString()),
        foco: parseInt(req.body.foco) || 5,
        energia: parseInt(req.body.energia) || 5,
        confianca: parseInt(req.body.confianca) || 5,
        inteligenciaEmocional: parseInt(req.body.inteligenciaEmocional) || 5,
        interferencias: parseInt(req.body.interferencias) || 5,
        notes: req.body.notes || null,
      };
      
      console.log('Processing break feedback data:', processedData);
      
      const feedbackData = insertBreakFeedbackSchema.parse(processedData);
      const feedback = await storage.createBreakFeedback(feedbackData);
      res.json(feedback);
    } catch (error) {
      console.error("Error creating break feedback:", error);
      console.error("Request body:", req.body);
      res.status(400).json({ 
        message: "Failed to create break feedback",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Session tournament routes
  app.get('/api/session-tournaments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessionId = req.query.sessionId;
      const tournaments = await storage.getSessionTournaments(userId, sessionId);
      res.json(tournaments);
    } catch (error) {
      console.error("Error fetching session tournaments:", error);
      res.status(500).json({ message: "Failed to fetch session tournaments" });
    }
  });

  app.get('/api/session-tournaments/by-day/:dayOfWeek', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dayOfWeek = parseInt(req.params.dayOfWeek);
      const tournaments = await storage.getSessionTournamentsByDay(userId, dayOfWeek);
      res.json(tournaments);
    } catch (error) {
      console.error("Error fetching session tournaments by day:", error);
      res.status(500).json({ message: "Failed to fetch session tournaments" });
    }
  });

  app.post('/api/session-tournaments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log('Creating session tournament with body:', req.body);
      
      // Validate required fields
      if (!req.body.site || !req.body.buyIn) {
        return res.status(400).json({ 
          message: "Site and buyIn are required fields" 
        });
      }
      
      // Clean and prepare data
      const cleanData = {
        userId,
        sessionId: req.body.sessionId,
        site: req.body.site,
        name: req.body.name || `${req.body.site} Tournament`,
        buyIn: req.body.buyIn,
        status: req.body.status || 'upcoming',
        rebuys: req.body.rebuys || 0,
        result: req.body.result || '0',
        bounty: req.body.bounty || '0',
        fieldSize: req.body.fieldSize ? parseInt(req.body.fieldSize) : null,
        position: req.body.position ? parseInt(req.body.position) : null,
        fromPlannedTournament: req.body.fromPlannedTournament || false,
        startTime: req.body.startTime || null,
        endTime: req.body.endTime || null,
        time: req.body.time,
        type: req.body.type,
        speed: req.body.speed,
        guaranteed: req.body.guaranteed
      };
      
      console.log('Processed tournament data:', cleanData);
      
      const tournamentData = insertSessionTournamentSchema.parse(cleanData);
      const tournament = await storage.createSessionTournament(tournamentData);
      
      console.log('Created tournament:', tournament);
      res.json(tournament);
    } catch (error) {
      console.error("Error creating session tournament:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : 'Unknown error',
        body: req.body
      });
      res.status(400).json({ 
        message: "Failed to create session tournament", 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put('/api/session-tournaments/:id', isAuthenticated, async (req: any, res) => {
    const { id } = req.params;
    try {
      console.log('PUT /api/session-tournaments/:id called with:', { id, body: req.body });
      
      // Convert string numbers to actual numbers for validation
      const processedData = { ...req.body };
      if (processedData.buyIn && typeof processedData.buyIn === 'string') {
        processedData.buyIn = parseFloat(processedData.buyIn);
      }
      if (processedData.position && typeof processedData.position === 'string') {
        processedData.position = parseInt(processedData.position);
      }
      if (processedData.fieldSize && typeof processedData.fieldSize === 'string') {
        processedData.fieldSize = parseInt(processedData.fieldSize);
      }
      if (processedData.rebuys !== undefined) {
        processedData.rebuys = parseInt(String(processedData.rebuys)) || 0;
      }
      if (processedData.result !== undefined) {
        processedData.result = String(processedData.result || '0');
      }
      if (processedData.bounty !== undefined) {
        processedData.bounty = String(processedData.bounty || '0');
      }
      
      // Convert timestamp strings to Date objects
      if (processedData.startTime && typeof processedData.startTime === 'string') {
        processedData.startTime = new Date(processedData.startTime);
      }
      if (processedData.endTime && typeof processedData.endTime === 'string') {
        processedData.endTime = new Date(processedData.endTime);
      }
      
      // Remove validation for updates to avoid conflicts
      delete processedData.id;
      delete processedData.userId;
      delete processedData.createdAt;
      delete processedData.updatedAt;
      
      console.log('Processed tournament data:', processedData);
      const tournament = await storage.updateSessionTournament(id, processedData);
      console.log('Updated session tournament result:', tournament);
      res.json(tournament);
    } catch (error) {
      console.error("Error updating session tournament:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        requestBody: req.body,
        tournamentId: id
      });
      res.status(400).json({ 
        message: "Failed to update session tournament",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/session-tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteSessionTournament(id);
      res.json({ message: "Session tournament deleted successfully" });
    } catch (error) {
      console.error("Error deleting session tournament:", error);
      res.status(500).json({ message: "Failed to delete session tournament" });
    }
  });

  // Study Cards API routes
  app.get('/api/study-cards', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const studyCards = await storage.getStudyCards(userId);
      res.json(studyCards);
    } catch (error) {
      console.error("Error fetching study cards:", error);
      res.status(500).json({ message: "Failed to fetch study cards" });
    }
  });

  app.post('/api/study-cards', isAuthenticated, async (req: any, res) => {
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
      console.error("Error creating study card:", error);
      res.status(400).json({ message: "Failed to create study card" });
    }
  });

  app.get('/api/study-cards/:id', isAuthenticated, async (req: any, res) => {
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
      console.error("Error fetching study card:", error);
      res.status(500).json({ message: "Failed to fetch study card" });
    }
  });

  app.patch('/api/study-cards/:id', isAuthenticated, async (req: any, res) => {
    try {
      const studyCard = await storage.updateStudyCard(req.params.id, req.body);
      res.json(studyCard);
    } catch (error) {
      console.error("Error updating study card:", error);
      res.status(400).json({ message: "Failed to update study card" });
    }
  });

  app.delete('/api/study-cards/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteStudyCard(req.params.id);
      res.json({ message: "Study card deleted successfully" });
    } catch (error) {
      console.error("Error deleting study card:", error);
      res.status(500).json({ message: "Failed to delete study card" });
    }
  });

  // Study Materials API routes
  app.get('/api/study-cards/:id/materials', isAuthenticated, async (req: any, res) => {
    try {
      const materials = await storage.getStudyMaterials(req.params.id);
      res.json(materials);
    } catch (error) {
      console.error("Error fetching study materials:", error);
      res.status(500).json({ message: "Failed to fetch study materials" });
    }
  });

  app.post('/api/study-cards/:id/materials', isAuthenticated, async (req: any, res) => {
    try {
      const materialData = insertStudyMaterialSchema.parse({
        ...req.body,
        studyCardId: req.params.id
      });
      const material = await storage.createStudyMaterial(materialData);
      res.json(material);
    } catch (error) {
      console.error("Error creating study material:", error);
      res.status(400).json({ message: "Failed to create study material" });
    }
  });

  // Study Notes API routes
  app.get('/api/study-cards/:id/notes', isAuthenticated, async (req: any, res) => {
    try {
      const notes = await storage.getStudyNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching study notes:", error);
      res.status(500).json({ message: "Failed to fetch study notes" });
    }
  });

  app.post('/api/study-cards/:id/notes', isAuthenticated, async (req: any, res) => {
    try {
      const noteData = insertStudyNoteSchema.parse({
        ...req.body,
        studyCardId: req.params.id
      });
      const note = await storage.createStudyNote(noteData);
      res.json(note);
    } catch (error) {
      console.error("Error creating study note:", error);
      res.status(400).json({ message: "Failed to create study note" });
    }
  });

  // Study Flash Cards API routes
  app.get('/api/study-cards/:id/flashcards', isAuthenticated, async (req: any, res) => {
    try {
      const flashcards = await storage.getStudyFlashCards(req.params.id);
      res.json(flashcards);
    } catch (error) {
      console.error("Error fetching study flashcards:", error);
      res.status(500).json({ message: "Failed to fetch study flashcards" });
    }
  });

  app.post('/api/study-cards/:id/flashcards', isAuthenticated, async (req: any, res) => {
    try {
      const flashcardData = insertStudyFlashCardSchema.parse({
        ...req.body,
        studyCardId: req.params.id
      });
      const flashcard = await storage.createStudyFlashCard(flashcardData);
      res.json(flashcard);
    } catch (error) {
      console.error("Error creating study flashcard:", error);
      res.status(400).json({ message: "Failed to create study flashcard" });
    }
  });

  // Study Sessions API routes
  app.get('/api/study-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const sessions = await storage.getStudySessions(req.user.id);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching study sessions:", error);
      res.status(500).json({ message: "Failed to fetch study sessions" });
    }
  });

  app.post('/api/study-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const sessionData = insertStudySessionSchema.parse({
        ...req.body,
        userId: req.user.id
      });
      const session = await storage.createStudySession(sessionData);
      res.json(session);
    } catch (error) {
      console.error("Error creating study session:", error);
      res.status(400).json({ message: "Failed to create study session" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}