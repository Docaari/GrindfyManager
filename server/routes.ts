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
          // Get session tournaments
          const sessionTournaments = await storage.getSessionTournaments(userId, session.id);
          
          // Get session date and day of week
          const sessionDate = new Date(session.date);
          const dayOfWeek = sessionDate.getDay();
          
          // Get planned tournaments that were played during this session
          const sessionPlannedTournaments = await db
            .select()
            .from(plannedTournaments)
            .where(
              and(
                eq(plannedTournaments.userId, userId),
                eq(plannedTournaments.dayOfWeek, dayOfWeek),
                eq(plannedTournaments.status, 'finished')
              )
            );
          
          // Convert planned tournaments to session tournament format for calculation
          const formattedPlannedTournaments = sessionPlannedTournaments.map(t => ({
            ...t,
            sessionId: session.id,
            result: t.result || '0',
            bounty: t.bounty || '0',
            rebuys: t.rebuys || 0
          }));
          
          // Combine all tournaments for statistics calculation
          const allSessionTournaments = [...sessionTournaments, ...formattedPlannedTournaments];
          
          const sessionBreaks = await storage.getBreakFeedbacks(userId, session.id);

          // Calculate session statistics using all tournaments
          const volume = allSessionTournaments.length;
          const totalBuyins = allSessionTournaments.reduce((sum, t) => {
            const buyIn = parseFloat(t.buyIn) || 0;
            const rebuys = t.rebuys || 0;
            return sum + buyIn + (buyIn * rebuys);
          }, 0);
          
          const totalResult = allSessionTournaments.reduce((sum, t) => {
            const result = parseFloat(t.result) || 0;
            const bounty = parseFloat(t.bounty) || 0;
            return sum + result + bounty;
          }, 0);
          
          const profit = totalResult - totalBuyins;
          const abiMed = volume > 0 ? totalBuyins / volume : 0;
          const roi = totalBuyins > 0 ? ((profit / totalBuyins) * 100) : 0;
          
          const fts = allSessionTournaments.filter(t => {
            const position = t.position;
            const fieldSize = t.fieldSize || 100;
            return position && (position <= 9 || position <= Math.ceil(fieldSize * 0.1));
          }).length;
          
          const cravadas = allSessionTournaments.filter(t => {
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
      const sessionData = insertGrindSessionSchema.parse({ ...req.body, userId });
      const session = await storage.createGrindSession(sessionData);
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
      
      // Also delete related session tournaments and break feedbacks
      await db.delete(sessionTournaments).where(eq(sessionTournaments.sessionId, id));
      await db.delete(breakFeedbacks).where(eq(breakFeedbacks.sessionId, id));
      
      await storage.deleteGrindSession(id);
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
      
      // Convert breakTime string to Date object if needed
      const processedData = { ...req.body, userId };
      if (processedData.breakTime && typeof processedData.breakTime === 'string') {
        processedData.breakTime = new Date(processedData.breakTime);
      }
      
      const feedbackData = insertBreakFeedbackSchema.parse(processedData);
      const feedback = await storage.createBreakFeedback(feedbackData);
      res.json(feedback);
    } catch (error) {
      console.error("Error creating break feedback:", error);
      res.status(400).json({ message: "Failed to create break feedback" });
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
      
      // Clean and prepare data
      const cleanData = {
        ...req.body,
        userId,
        status: req.body.status || 'upcoming',
        rebuys: req.body.rebuys || 0,
        result: req.body.result || '0',
        fieldSize: req.body.fieldSize ? parseInt(req.body.fieldSize) : null,
        position: req.body.position ? parseInt(req.body.position) : null,
        fromPlannedTournament: req.body.fromPlannedTournament || false
      };
      
      const tournamentData = insertSessionTournamentSchema.parse(cleanData);
      const tournament = await storage.createSessionTournament(tournamentData);
      res.json(tournament);
    } catch (error) {
      console.error("Error creating session tournament:", error);
      res.status(400).json({ message: "Failed to create session tournament", details: error.message });
    }
  });

  app.put('/api/session-tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
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

  const httpServer = createServer(app);
  return httpServer;
}