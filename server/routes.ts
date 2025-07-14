import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { AuthService, requireAuth, requirePermission } from "./auth";
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
  insertStudySessionSchema,
  insertActiveDaySchema,
  insertWeeklyRoutineSchema,
  insertStudyScheduleSchema,
  insertCalendarCategorySchema,
  insertCalendarEventSchema,
  loginSchema,
  createUserSchema,
  users,
  permissions,
  userPermissions,
} from "@shared/schema";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import { PokerCSVParser } from "./csvParser";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "./db";
import { eq } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage() });

// Helper function to create timestamp from week start, day of week, and time string
function createTimestamp(weekStart: Date, dayOfWeek: number, timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);

  // Validate input values
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.error('Invalid time string:', timeString);
    throw new Error(`Invalid time format: ${timeString}`);
  }

  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOfWeek);

  // Se o horário é antes das 06:00, assume que é no dia seguinte
  if (hours < 6) {
    date.setDate(date.getDate() + 1);
  }

  date.setHours(hours, minutes, 0, 0);

  // Validate the resulting date
  if (isNaN(date.getTime())) {
    console.error('Invalid date created from:', { weekStart, dayOfWeek, timeString, hours, minutes });
    throw new Error(`Invalid date created from inputs: weekStart=${weekStart}, dayOfWeek=${dayOfWeek}, timeString=${timeString}`);
  }

  return date;
}

// Helper function to validate timestamp before database operations
function validateTimestamp(timestamp: Date, context: string): Date {
  if (!(timestamp instanceof Date)) {
    console.error(`Invalid timestamp type for ${context}:`, timestamp);
    throw new Error(`Expected Date object for ${context}, got ${typeof timestamp}`);
  }

  if (isNaN(timestamp.getTime())) {
    console.error(`Invalid timestamp value for ${context}:`, timestamp);
    throw new Error(`Invalid timestamp value for ${context}: ${timestamp}`);
  }

  return timestamp;
}

// Função para gerar rotina semanal automaticamente
async function generateWeeklyRoutine(userId: string, weekStart: Date) {
  const blocks: any[] = [];
  const conflicts: any[] = [];

  // 1. Buscar dados da Grade (weekly-plans com tournaments)
  const weeklyPlans = await storage.getWeeklyPlans(userId);
  console.log('Weekly plans found:', weeklyPlans.length);

  // 2. Buscar dados dos Estudos - cronogramas e cartões com planejamento
  const studyCards = await storage.getStudyCards(userId);
  const studySchedules = await storage.getStudySchedules(userId);
  console.log('Study cards found:', studyCards.length);
  console.log('Study schedules found:', studySchedules.length);

  // 3. Limpar eventos existentes gerados pela rotina inteligente
  const existingEvents = await storage.getCalendarEvents(userId);
  const routineEvents = existingEvents.filter(event => event.source === 'intelligent_routine');
  console.log('Cleaning up existing routine events:', routineEvents.length);

  for (const event of routineEvents) {
    await storage.deleteCalendarEvent(event.id);
  }

  console.log('Generate routine data:', {
    weeklyPlans: weeklyPlans.length,
    studyCards: studyCards.length,
    cleanedEvents: routineEvents.length
  });

  // 4. Processar cada dia da semana
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const currentDate = new Date(weekStart);
    currentDate.setDate(currentDate.getDate() + dayOfWeek);

    // Buscar torneios planejados para este dia na Grade
    const plannedTournaments = await storage.getPlannedTournaments(userId);

    console.log(`Day ${dayOfWeek} (${currentDate.toDateString()}): Checking planned tournaments`);
    console.log(`Total planned tournaments found: ${plannedTournaments.length}`);

    if (plannedTournaments.length > 0) {
      console.log('First few tournaments:', plannedTournaments.slice(0, 3).map(t => ({
        id: t.id,
        date: t.date,
        time: t.time,
        dayOfWeek: t.dayOfWeek,
        name: t.name
      })));
    }

    const dayTournaments = plannedTournaments.filter(tournament => {
      const matches = tournament.dayOfWeek === dayOfWeek;

      if (matches) {
        console.log(`Found matching tournament for day ${dayOfWeek}:`, {
          name: tournament.name,
          dayOfWeek: tournament.dayOfWeek,
          time: tournament.time,
          buyIn: tournament.buyIn
        });
      }

      return matches;
    });

    console.log(`Day ${dayOfWeek}: ${dayTournaments.length} tournaments planned`);

    // Se há torneios planejados, criar sessão de grind
    if (dayTournaments.length > 0) {
      try {
        // Ordenar torneios por horário
        const sortedTournaments = dayTournaments.sort((a, b) => {
          const timeA = a.time || '20:00';
          const timeB = b.time || '20:00';
          return timeA.localeCompare(timeB);
        });

        const firstTournament = sortedTournaments[0];
        const lastTournament = sortedTournaments[sortedTournaments.length - 1];

        // Calcular ABI médio
        const totalBuyIn = dayTournaments.reduce((sum, t) => sum + parseFloat(t.buyIn), 0);
        const averageBuyIn = totalBuyIn / dayTournaments.length;

        // Calcular horários da sessão (igual à lógica da Grade)
        const sessionStart = firstTournament.time;
        const sessionEnd = addHours(lastTournament.time, 3);

        // Criar horário de warm-up (15 min antes)
        const warmupStart = addMinutes(sessionStart, -15);
        const warmupEnd = sessionStart;

        console.log(`Creating grind session for day ${dayOfWeek}:`, {
          sessionStart, sessionEnd, warmupStart, warmupEnd,
          tournamentCount: dayTournaments.length,
          averageBuyIn: averageBuyIn.toFixed(2),
          tournamentTimes: dayTournaments.map(t => `${t.name}: ${t.time}`),
          firstTournament: { name: firstTournament.name, time: firstTournament.time },
          lastTournament: { name: lastTournament.name, time: lastTournament.time }
        });

        // Criar timestamps
        const warmupStartTime = createTimestamp(weekStart, dayOfWeek, warmupStart);
        const warmupEndTime = createTimestamp(weekStart, dayOfWeek, warmupEnd);
        const sessionStartTime = createTimestamp(weekStart, dayOfWeek, sessionStart);
        const sessionEndTime = createTimestamp(weekStart, dayOfWeek, sessionEnd);

        console.log(`Final timestamps for day ${dayOfWeek}:`, {
          warmupStartTime: warmupStartTime.toISOString(),
          warmupEndTime: warmupEndTime.toISOString(),
          sessionStartTime: sessionStartTime.toISOString(),
          sessionEndTime: sessionEndTime.toISOString()
        });

        // Adicionar Warm-up
        blocks.push({
          type: 'warmup',
          title: 'Warm-up',
          startTime: warmupStartTime,
          endTime: warmupEndTime,
          dayOfWeek,
          source: 'grade'
        });

        // Adicionar Grind com informações detalhadas
        blocks.push({
          type: 'grind',
          title: 'Grind',
          description: `${dayTournaments.length} torneios • ABI Med: $${averageBuyIn.toFixed(2)}`,
          startTime: sessionStartTime,
          endTime: sessionEndTime,
          dayOfWeek,
          source: 'grade'
        });

        console.log(`✓ Created grind session for day ${dayOfWeek}: ${sessionStart}-${sessionEnd} with ${dayTournaments.length} tournaments`);

      } catch (error) {
        console.error('Error creating grind session for day', dayOfWeek, ':', error);
        continue;
      }
    }

    // Buscar estudos planejados para este dia
    // 1. Buscar cronogramas de estudo da tabela studySchedules
    const dayStudySchedules = studySchedules.filter(schedule => schedule.dayOfWeek === dayOfWeek);

    // 2. Buscar cartões de estudo com configurações de planejamento
    const studyCardsForDay = studyCards.filter(card => {
      if (!card.studyDays || !Array.isArray(card.studyDays)) return false;
      return card.studyDays.includes(dayOfWeek);
    });

    console.log(`Day ${dayOfWeek}: ${dayStudySchedules.length} study schedules + ${studyCardsForDay.length} study cards planned`);

    // Processar cronogramas de estudo
    for (const schedule of dayStudySchedules) {
      try {
        const studyStart = schedule.startTime;
        const studyEnd = addMinutes(studyStart, schedule.duration);

        const studyStartTime = createTimestamp(weekStart, dayOfWeek, studyStart);
        const studyEndTime = createTimestamp(weekStart, dayOfWeek, studyEnd);

        // Buscar o cartão relacionado para obter o título
        const relatedCard = studyCards.find(card => card.id === schedule.studyCardId);
        const title = schedule.description || relatedCard?.title || 'Sessão de Estudo';

        blocks.push({
          type: 'study',
          title: title,
          startTime: studyStartTime,
          endTime: studyEndTime,
          dayOfWeek,
          source: 'estudos'
        });

        console.log(`Created study session for day ${dayOfWeek}: ${studyStart}-${studyEnd} - ${title}`);

      } catch (error) {
        console.error('Error creating study timestamps for day', dayOfWeek, 'schedule:', schedule.description, error);
      }
    }

    // Processar cartões de estudo com configurações de planejamento
    for (const studyCard of studyCardsForDay) {
      if (!studyCard.studyStartTime || !studyCard.studyDuration) continue;

      try {
        const studyStart = String(studyCard.studyStartTime);
        const studyEnd = addMinutes(studyStart, studyCard.studyDuration);

        const studyStartTime = createTimestamp(weekStart, dayOfWeek, studyStart);
        const studyEndTime = createTimestamp(weekStart, dayOfWeek, studyEnd);

        blocks.push({
          type: 'study',
          title: studyCard.studyDescription || studyCard.title,
          startTime: studyStartTime,
          endTime: studyEndTime,
          dayOfWeek,
          source: 'estudos'
        });

        console.log(`Created study session for day ${dayOfWeek}: ${studyStart}-${studyEnd} - ${studyCard.title}`);

      } catch (error) {
        console.error('Error creating study timestamps for day', dayOfWeek, 'study:', studyCard.title, error);
      }
    }
  }

  // 5. Criar eventos no calendário baseados nos blocos
  const categoryMappings = {
    'warmup': 'cat-2', // Warm-up
    'grind': 'cat-1',  // Grind
    'study': 'cat-3',  // Estudos
    'rest': 'cat-4'    // Descanso
  };

  console.log('Creating calendar events from blocks:', blocks.length);

  for (const block of blocks) {
    try {
      const categoryId = categoryMappings[block.type] || 'cat-1';

      const eventData = {
        userId,
        categoryId,
        title: block.title,
        description: block.description || `Gerado automaticamente pela rotina inteligente - ${block.source}`,
        startTime: block.startTime,
        endTime: block.endTime,
        dayOfWeek: block.dayOfWeek,
        isRecurring: false,
        recurrenceType: 'none',
        source: 'intelligent_routine'
      };

      console.log(`Creating ${block.type} event for day ${block.dayOfWeek}:`, block.title);
      await storage.createCalendarEvent(eventData);

    } catch (error) {
      console.error('Error creating calendar event for block:', block.title, error);
    }
  }

  // 6. Retornar rotina com estatísticas
  const routine = {
    blocks,
    conflicts: [],
    weekStart,
    stats: {
      totalBlocks: blocks.length,
      grindSessions: blocks.filter(b => b.type === 'grind').length,
      studySessions: blocks.filter(b => b.type === 'study').length,
      warmupSessions: blocks.filter(b => b.type === 'warmup').length
    }
  };

  return routine;
}

// Helper functions
function addHours(timeString: string, hours: number): string {
  const [h, m] = timeString.split(':').map(Number);
  let newHours = h + hours;
  let newMinutes = m;

  // Handle day overflow
  if (newHours >= 24) {
    newHours = newHours % 24;
  }
  if (newHours < 0) {
    newHours = 24 + newHours;
  }

  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

function addMinutes(timeString: string, minutes: number): string {
  const [h, m] = timeString.split(':').map(Number);
  let totalMinutes = h * 60 + m + minutes;

  // Handle day overflow
  if (totalMinutes >= 24 * 60) {
    totalMinutes = totalMinutes % (24 * 60);
  }
  if (totalMinutes < 0) {
    totalMinutes = 24 * 60 + totalMinutes;
  }

  const newHours = Math.floor(totalMinutes / 60);
  const newMinutes = totalMinutes % 60;

  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

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

  // Manual authentication routes (for custom auth system)
  app.post('/api/auth/register', async (req, res) => {
    try {
      const userData = createUserSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await db.select()
        .from(users)
        .where(eq(users.email, userData.email));
      
      if (existingUser.length > 0) {
        return res.status(400).json({ 
          message: 'E-mail já está em uso' 
        });
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(userData.password);

      // Create user
      const [newUser] = await db.insert(users).values({
        id: nanoid(),
        email: userData.email,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        password: hashedPassword,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Generate tokens
      const tokens = AuthService.generateTokens(newUser.id, newUser.email!);
      
      // Log registration
      await AuthService.logAccess(newUser.id, 'user_registered', undefined, req);

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
        ...tokens
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const loginData = loginSchema.parse(req.body);
      
      // Find user
      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, loginData.email));
      
      if (!user) {
        await AuthService.logAccess(null, 'login_failed', undefined, req);
        return res.status(401).json({ 
          message: 'Credenciais inválidas' 
        });
      }

      // Check password
      const isPasswordValid = await AuthService.verifyPassword(
        loginData.password, 
        user.password!
      );
      
      if (!isPasswordValid) {
        await AuthService.logAccess(user.id, 'login_failed', undefined, req);
        return res.status(401).json({ 
          message: 'Credenciais inválidas' 
        });
      }

      // Check user status
      if (user.status !== 'active') {
        await AuthService.logAccess(user.id, 'login_blocked', undefined, req);
        return res.status(403).json({ 
          message: 'Conta bloqueada ou pendente' 
        });
      }

      // Generate tokens
      const tokens = AuthService.generateTokens(user.id, user.email!);
      
      // Log successful login
      await AuthService.logAccess(user.id, 'login_success', undefined, req);

      res.json({
        message: 'Login realizado com sucesso',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        ...tokens
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ message: 'Token de atualização necessário' });
      }

      const payload = AuthService.verifyRefreshToken(refreshToken);
      if (!payload) {
        return res.status(401).json({ message: 'Token de atualização inválido' });
      }

      // Generate new tokens
      const tokens = AuthService.generateTokens(payload.userId, payload.email);
      
      res.json(tokens);
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      res.json(req.user);
    } catch (error) {
      console.error('Me endpoint error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // Debug endpoint para verificar faixa de datas
  app.get("/api/debug/date-range", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dateRange = await storage.getDateRange(userId);
      res.json(dateRange);
    } catch (error) {
      console.error("Error fetching date range:", error);
      res.status(500).json({ message: "Failed to fetch date range" });
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

  // ETAPA 4: Analytics por velocidade
  app.get('/api/analytics/by-speed', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsBySpeed(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching speed analytics:", error);
      res.status(500).json({ message: "Failed to fetch speed analytics" });
    }
  });

  // ETAPA 5: Analytics mensais
  app.get('/api/analytics/by-month', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsByMonth(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching month analytics:", error);
      res.status(500).json({ message: "Failed to fetch month analytics" });
    }
  });

  // ETAPA 5: Analytics por faixa de field
  app.get('/api/analytics/by-field', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsByField(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching field analytics:", error);
      res.status(500).json({ message: "Failed to fetch field analytics" });
    }
  });

  // ETAPA 5: Analytics de posições finais
  app.get('/api/analytics/final-table', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getFinalTableAnalytics(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching final table analytics:", error);
      res.status(500).json({ message: "Failed to fetch final table analytics" });
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

  // Bulk delete tournaments with granular filtering
  app.post('/api/tournaments/bulk-delete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sites, dateFrom, dateTo, confirmation } = req.body;

      // Validate confirmation
      if (confirmation !== 'CONFIRMAR') {
        return res.status(400).json({ error: 'Confirmation required. Type "CONFIRMAR" to proceed.' });
      }

      // Validate at least one filter is provided
      if (!sites?.length && !dateFrom && !dateTo) {
        return res.status(400).json({ error: 'At least one filter (site or date range) is required.' });
      }

      // Get preview count first
      const previewCount = await storage.getFilteredTournamentsCount(userId, {
        sites: sites || [],
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null
      });

      // Safety limit
      const MAX_DELETE_LIMIT = 5000;
      if (previewCount > MAX_DELETE_LIMIT) {
        return res.status(400).json({ 
          error: `Cannot delete more than ${MAX_DELETE_LIMIT} tournaments at once. Found ${previewCount} tournaments matching criteria.` 
        });
      }

      // Perform bulk deletion
      const deletedCount = await storage.bulkDeleteTournaments(userId, {
        sites: sites || [],
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null
      });

      // Log the operation
      console.log(`🗑️ BULK DELETE - User ${userId} deleted ${deletedCount} tournaments. Filters: Sites=[${sites?.join(', ') || 'all'}], DateFrom=${dateFrom || 'none'}, DateTo=${dateTo || 'none'}`);

      res.json({
        message: `Successfully deleted ${deletedCount} tournaments`,
        deletedCount,
        filters: {
          sites: sites || [],
          dateFrom,
          dateTo
        }
      });
    } catch (error) {
      console.error('Error in bulk delete:', error);
      res.status(500).json({ error: 'Internal server error during bulk deletion' });
    }
  });

  // Get preview count for bulk delete
  app.post('/api/tournaments/bulk-delete/preview', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sites, dateFrom, dateTo } = req.body;

      const count = await storage.getFilteredTournamentsCount(userId, {
        sites: sites || [],
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null
      });

      res.json({ count });
    } catch (error) {
      console.error('Error in bulk delete preview:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get unique sites for bulk delete dropdown
  app.get('/api/tournaments/sites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sites = await storage.getUniqueSites(userId);
      res.json(sites);
    } catch (error) {
      console.error('Error fetching sites:', error);
      res.status(500).json({ error: 'Internal server error' });
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
      console.log('POST /api/planned-tournaments called with:', { userId, body: req.body });

      const tournamentData = insertPlannedTournamentSchema.parse({ ...req.body, userId });
      console.log('Parsed tournament data:', tournamentData);

      const tournament = await storage.createPlannedTournament(tournamentData);
      console.log('Created planned tournament:', tournament);

      res.json(tournament);
    } catch (error) {
      console.error("Error creating planned tournament:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body
      });
      res.status(400).json({ 
        message: "Failed to create planned tournament",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put('/api/planned-tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      console.log('PUT /api/planned-tournaments/:id called with:', { id, body: req.body });

      // Parse the request body manually to handle all field types correctly
      const updates: any = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (key === 'dayOfWeek') {
          updates[key] = typeof value === 'number' ? value : parseInt(String(value)) || 0;
        } else if (key === 'position') {
          updates[key] = value === null || value === undefined ? null : parseInt(String(value));
        } else if (key === 'rebuys') {
          updates[key] = parseInt(String(value)) || 0;
        } else if (key === 'prioridade') {
          updates[key] = parseInt(String(value)) || 2; // Default to 2 (Média) if invalid
        } else if (key === 'result' || key === 'bounty') {
          // Handle comma decimal separator for result and bounty fields
          if (value === null || value === undefined) {
            updates[key] = '0';
          } else {
            // Convert comma decimal separator to dot
            const normalizedValue = String(value).replace(',', '.');
            updates[key] = normalizedValue;
          }
        } else if (key === 'buyIn' || key === 'guaranteed') {
          updates[key] = String(value || '0');
        } else if (key === 'startTime' || key === 'endTime') {
          updates[key] = value === null || value === undefined ? null : (value ? new Date(String(value)) : null);
        } else if (key === 'site' || key === 'time' || key === 'type' || key === 'speed' || key === 'name') {
          updates[key] = String(value || '');
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
        tournamentId: req.params.id
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
      
      // 🔧 CLEANUP: Check for multiple active sessions and fix
      const activeSessions = sessions.filter(s => s.status === "active");
      if (activeSessions.length > 1) {
        console.log("🔧 CLEANUP: Found multiple active sessions, fixing...");
        console.log("🔧 Active sessions:", activeSessions.map(s => ({ id: s.id, date: s.date, status: s.status })));
        
        // Keep only the most recent active session
        const mostRecentActive = activeSessions.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];
        
        console.log("🔧 Keeping most recent active session:", { id: mostRecentActive.id, date: mostRecentActive.date });
        
        // Mark all other active sessions as completed
        for (const session of activeSessions) {
          if (session.id !== mostRecentActive.id) {
            console.log(`🔧 CLEANUP: Marking session ${session.id} (${session.date}) as completed`);
            await storage.updateGrindSession(session.id, userId, { status: "completed" });
          }
        }
        
        // Fetch updated sessions
        const updatedSessions = await storage.getGrindSessions(userId);
        res.json(updatedSessions);
      } else {
        res.json(sessions);
      }
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

      console.log('DEBUG: History endpoint - Found completed sessions:', completedSessions.map(s => ({ id: s.id, date: s.date, status: s.status })));

      // Get statistics for each completed session
      const sessionsWithStats = await Promise.all(
        completedSessions.map(async (session) => {
          console.log(`DEBUG: Processing history for session ${session.id}`);

          const sessionTournaments = await storage.getSessionTournaments(userId, session.id);

          // ALSO get tournaments from planned tournaments linked to this session
          const plannedTournaments = await storage.getPlannedTournamentsBySession(userId, session.id);

          console.log(`DEBUG: Session ${session.id} data:`, {
            sessionTournaments: sessionTournaments.length,
            plannedTournaments: plannedTournaments.length,
            plannedTournamentIds: plannedTournaments.map(t => ({ id: t.id, name: t.name, status: t.status, result: t.result }))
          });

          // FILTER OUT tournaments that don't actually belong to this session
          // Only include tournaments that were actually played during this session
          const validPlannedTournaments = plannedTournaments.filter(t => {
            // Include only tournaments that have been completed/finished or registered during this session
            const isCompleted = t.status === 'completed' || t.status === 'finished';
            const isRegistered = t.status === 'registered';
            const hasResults = parseFloat(t.result || '0') > 0;
            const hasBounties = parseFloat(t.bounty || '0') > 0;

            // Tournament belongs to this session if it was actually played (has results, bounties, or was registered during session)
            return isCompleted || isRegistered || hasResults || hasBounties;
          });

          console.log(`DEBUG: After filtering - Valid tournaments for session ${session.id}:`, validPlannedTournaments.length);

          // Combine both types of tournaments
          const allTournaments = [...sessionTournaments, ...validPlannedTournaments];

          console.log(`Session ${session.id}: found ${sessionTournaments.length} session tournaments, ${validPlannedTournaments.length} valid planned tournaments`);

          const sessionBreaks = await storage.getBreakFeedbacks(userId, session.id);

          // Use session data directly instead of recalculating
          const volume = session.volume || 0;
          const profit = parseFloat(session.profit) || 0;
          const abiMed = parseFloat(session.abiMed) || 0;
          const roi = parseFloat(session.roi) || 0;
          const fts = session.fts || 0;
          const cravadas = session.cravadas || 0;

          console.log(`HISTORY ENDPOINT - Session ${session.id}: Using saved data - volume=${volume}, profit=${profit}, abiMed=${abiMed}, roi=${roi}, fts=${fts}, cravadas=${cravadas}`);

          // Use session data directly for mental averages
          const energiaMedia = parseFloat(session.energiaMedia) || 0;
          const focoMedio = parseFloat(session.focoMedio) || 0;
          const confiancaMedia = parseFloat(session.confiancaMedia) || 0;
          const inteligenciaEmocionalMedia = parseFloat(session.inteligenciaEmocionalMedia) || 0;
          const interferenciasMedia = parseFloat(session.interferenciasMedia) || 0;

          console.log(`HISTORY ENDPOINT - Session ${session.id}: Using saved mental data - energia=${energiaMedia}, foco=${focoMedio}, confianca=${confiancaMedia}, emocional=${inteligenciaEmocionalMedia}, interferencias=${interferenciasMedia}`);

          // Calculate tournament type percentages
          console.log(`DEBUG: Session ${session.id} - Tournament data for percentages:`, allTournaments.map(t => ({ 
            id: t.id, 
            name: t.name, 
            type: t.type, 
            category: t.category, 
            speed: t.speed 
          })));

          const tournamentTypes = allTournaments.reduce((types, tournament) => {
            // Priority: type field first, then category field, then default to Vanilla
            const type = tournament.type || tournament.category || 'Vanilla';
            types[type] = (types[type] || 0) + 1;
            return types;
          }, {} as Record<string, number>);

          console.log(`DEBUG: Session ${session.id} - Tournament types breakdown:`, tournamentTypes);

          const vanillaPercentage = volume > 0 
            ? Number(Math.round(((tournamentTypes['Vanilla'] || 0) / volume) * 100))
            : 0;
          const pkoPercentage = volume > 0 
            ? Number(Math.round(((tournamentTypes['PKO'] || 0) / volume) * 100))
            : 0;
          const mysteryPercentage = volume > 0 
            ? Number(Math.round(((tournamentTypes['Mystery'] || 0) / volume) * 100))
            : 0;

          // Calculate tournament speed percentages
          const tournamentSpeeds = allTournaments.reduce((speeds, tournament) => {
            const speed = tournament.speed || 'Normal';
            speeds[speed] = (speeds[speed] || 0) + 1;
            return speeds;
          }, {} as Record<string, number>);

          console.log(`DEBUG: Session ${session.id} - Tournament speeds breakdown:`, tournamentSpeeds);

          const normalSpeedPercentage = volume > 0 
            ? Number(Math.round(((tournamentSpeeds['Normal'] || 0) / volume) * 100))
            : 0;
          const turboSpeedPercentage = volume > 0 
            ? Number(Math.round(((tournamentSpeeds['Turbo'] || 0) / volume) * 100))
            : 0;
          const hyperSpeedPercentage = volume > 0 
            ? Number(Math.round(((tournamentSpeeds['Hyper'] || 0) / volume) * 100))
            : 0;

          console.log(`DEBUG: Session ${session.id} - Final percentages (calculated):`, {
            vanillaPercentage,
            pkoPercentage,
            mysteryPercentage,
            normalSpeedPercentage,
            turboSpeedPercentage,
            hyperSpeedPercentage
          });

          console.log(`DEBUG: Session ${session.id} - Returning session data with percentages`);

          // Store percentages in session data for verification
          const sessionPercentages = {
            vanillaPercentage,
            pkoPercentage,
            mysteryPercentage,
            normalSpeedPercentage,
            turboSpeedPercentage,
            hyperSpeedPercentage
          };

          console.log(`DEBUG: Session ${session.id} - Session percentages object (final):`, sessionPercentages);
          console.log(`DEBUG: Session ${session.id} - Percentages data types:`, {
            vanillaType: typeof vanillaPercentage,
            pkoType: typeof pkoPercentage,
            mysteryType: typeof mysteryPercentage,
            normalType: typeof normalSpeedPercentage,
            turboType: typeof turboSpeedPercentage,
            hyperType: typeof hyperSpeedPercentage
          });

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
            breakCount: sessionBreaks.length,
            // Tournament type percentages
            vanillaPercentage,
            pkoPercentage,
            mysteryPercentage,
            // Tournament speed percentages
            normalSpeedPercentage,
            turboSpeedPercentage,
            hyperSpeedPercentage
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

      // 🔒 CRITICAL FIX: Check for ACTIVE sessions first - never delete active sessions!
      const existingSessions = await storage.getGrindSessions(userId);
      const activeSession = existingSessions.find(session => session.status === "active");
      
      // If there's an active session, return it instead of creating a new one
      if (activeSession) {
        console.log(`🔒 ACTIVE SESSION FOUND: ${activeSession.id} (${activeSession.date}) - Returning existing session instead of creating new`);
        return res.json(activeSession);
      }

      // Only check for completed sessions on the same day
      const existingSessionsToday = existingSessions.filter(session => {
        const sessionDate = new Date(session.date).toISOString().split('T')[0];
        return sessionDate === newSessionDate && session.status === "completed";
      });

      // Delete only COMPLETED sessions for the same day (never delete active sessions)
      if (existingSessionsToday.length > 0) {
        console.log(`🔒 Found ${existingSessionsToday.length} COMPLETED sessions for date ${newSessionDate}. Deleting completed sessions only...`);

        for (const existingSession of existingSessionsToday) {
          console.log(`🔒 Deleting completed session ${existingSession.id} from ${newSessionDate}`);
          await storage.deleteGrindSession(existingSession.id);
        }

        console.log(`🔒 Successfully deleted ${existingSessionsToday.length} completed sessions for date ${newSessionDate}`);
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
            startTime: null
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
        let duplicatesIgnored = 0;
        let duplicateIds: string[] = [];

        if (isBodogFormat(file.originalname)) {
          // Handle Excel files from Bodog
          tournaments = await PokerCSVParser.parseBodogXLSX(file.buffer, userId, exchangeRates);
          
          // Check for duplicates in parsed tournaments
          const validTournaments = [];
          for (const tournament of tournaments) {
            const isDuplicate = await storage.isDuplicateTournament(userId, tournament);
            if (isDuplicate) {
              duplicatesIgnored++;
              duplicateIds.push(tournament.tournamentId || `${tournament.name} (${tournament.datePlayed.toISOString().split('T')[0]})`);
              console.log(`🔍 DUPLICATE CHECK - Skipping duplicate Bodog tournament: ${tournament.name}`);
            } else {
              validTournaments.push(tournament);
            }
          }
          tournaments = validTournaments;
        } else {
          // Handle text-based files (CSV/TXT)
          const fileContent = file.buffer.toString('utf-8');

          if (isCoinFormat(fileContent)) {
            tournaments = await PokerCSVParser.parseCoinTXT(fileContent, userId, exchangeRates);
            
            // Check for duplicates in parsed tournaments
            const validTournaments = [];
            for (const tournament of tournaments) {
              const isDuplicate = await storage.isDuplicateTournament(userId, tournament);
              if (isDuplicate) {
                duplicatesIgnored++;
                duplicateIds.push(tournament.tournamentId || `${tournament.name} (${tournament.datePlayed.toISOString().split('T')[0]})`);
                console.log(`🔍 DUPLICATE CHECK - Skipping duplicate Coin tournament: ${tournament.name}`);
              } else {
                validTournaments.push(tournament);
              }
            }
            tournaments = validTournaments;
          } else if (isCoinPokerFormat(fileContent)) {
            tournaments = await PokerCSVParser.parseCoinPokerCSV(fileContent, userId, exchangeRates);
            
            // Check for duplicates in parsed tournaments
            const validTournaments = [];
            for (const tournament of tournaments) {
              const isDuplicate = await storage.isDuplicateTournament(userId, tournament);
              if (isDuplicate) {
                duplicatesIgnored++;
                duplicateIds.push(tournament.tournamentId || `${tournament.name} (${tournament.datePlayed.toISOString().split('T')[0]})`);
                console.log(`🔍 DUPLICATE CHECK - Skipping duplicate CoinPoker tournament: ${tournament.name}`);
              } else {
                validTournaments.push(tournament);
              }
            }
            tournaments = validTournaments;
          } else {
            // Use optimized CSV parsing with batch duplicate checking
            const parseResult = await PokerCSVParser.parseCSVWithDuplicateCheck(fileContent, userId, exchangeRates, storage);
            tournaments = parseResult.tournaments;
            duplicatesIgnored = parseResult.duplicatesIgnored;
            duplicateIds = parseResult.duplicateIds;
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
                reentries: tournament.reentries || 0,
                tournamentId: tournament.tournamentId || null
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
        // Handle comma decimal separator for result field
        const resultStr = String(processedData.result || '0').replace(',', '.');
        processedData.result = resultStr;
      }
      if (processedData.bounty !== undefined) {
        // Handle comma decimal separator for bounty field
        const bountyStr = String(processedData.bounty || '0').replace(',', '.');
        processedData.bounty = bountyStr;
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
        tournamentId: req.params.id
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

  // Active Days API routes
  app.get('/api/active-days', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const activeDays = await storage.getActiveDays(userId);
      res.json(activeDays);
    } catch (error) {
      console.error("Error fetching active days:", error);
      res.status(500).json({ message: "Failed to fetch active days" });
    }
  });

  app.post('/api/active-days/toggle', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub || user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { dayOfWeek } = req.body;

      if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week (0-6)" });
      }

      const activeDay = await storage.toggleActiveDay(userId, dayOfWeek);
      res.json(activeDay);
    } catch (error) {
      console.error("Error toggling active day:", error);
      res.status(500).json({ message: "Failed to toggle active day" });
    }
  });

  // Study Correlation and Progress Tracking
  app.get('/api/study-correlation/:studyCardId', isAuthenticated, async (req: any, res) => {
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
      const studyStartDate = new Date(studyCard.createdAt);

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
      console.error("Error fetching study correlation:", error);
      res.status(500).json({ message: "Failed to fetch study correlation" });
    }
  });

  app.post('/api/study-cards/:id/progress', isAuthenticated, async (req: any, res) => {
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
        updatedAt: new Date(),
      });

      res.json(updatedCard);
    } catch (error) {
      console.error("Error updating study progress:", error);
      res.status(400).json({ message: "Failed to update study progress" });
    }
  });

  // Calendário Inteligente routes
  app.get('/api/weekly-routine', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { weekStart } = req.query;

      if (!weekStart) {
        return res.status(400).json({ message: 'weekStart is required' });
      }

      const routine = await storage.getWeeklyRoutine(userId, new Date(weekStart));
      res.json(routine);
    } catch (error) {
      console.error('Error fetching weekly routine:', error);
      res.status(500).json({ message: 'Failed to fetch weekly routine' });
    }
  });

  app.post('/api/weekly-routine/generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { weekStart } = req.body;

      console.log('Generate routine request:', { userId, weekStart });

      if (!weekStart) {
        return res.status(400).json({ message: 'weekStart is required' });
      }

      // Limpar eventos gerados automaticamente da rotina inteligente
      await storage.deleteCalendarEventsBySource(userId, 'intelligent_routine');

      // Gerar rotina automaticamente baseada nos dados da Grade e Estudos
      const routine = await generateWeeklyRoutine(userId, new Date(weekStart));

      // Converter blocos da rotina para eventos do calendário avançado
      if (routine.blocks && routine.blocks.length > 0) {
        const categories = await storage.getCalendarCategories(userId);
        const categoryMap = new Map(categories.map(cat => [cat.name.toLowerCase(), cat.id]));

        // Mapeamento de tipos de bloco para categorias
        const blockTypeToCategory = {
          'grind': 'grind',
          'warmup': 'warm up',
          'rest': 'cooldown',
          'study': 'estudo'
        };

        for (const block of routine.blocks) {
          const categoryName = blockTypeToCategory[block.type] || 'grind';
          const categoryId = categoryMap.get(categoryName) || categories[0]?.id;

          if (categoryId) {
            const startDate = new Date(weekStart);
            startDate.setDate(startDate.getDate() + block.dayOfWeek);

            // Verificar se startTime e endTime são Date objects ou strings
            let startTime, endTime;

            if (block.startTime instanceof Date) {
              startTime = block.startTime;
            } else if (typeof block.startTime === 'string' && block.startTime.includes(':')) {
              const [startHour, startMinute] = block.startTime.split(':').map(Number);
              if (!isNaN(startHour) && !isNaN(startMinute)) {
                startTime = new Date(startDate);
                startTime.setHours(startHour, startMinute, 0, 0);
              } else {
                console.error('Invalid startTime format:', block.startTime);
                continue; // Skip this block
              }
            } else {
              console.error('Invalid startTime type:', block.startTime);
              continue; // Skip this block
            }

            if (block.endTime instanceof Date) {
              endTime = block.endTime;
            } else if (typeof block.endTime === 'string' && block.endTime.includes(':')) {
              const [endHour, endMinute] = block.endTime.split(':').map(Number);
              if (!isNaN(endHour) && !isNaN(endMinute)) {
                endTime = new Date(startDate);
                endTime.setHours(endHour, endMinute, 0, 0);
              } else {
                console.error('Invalid endTime format:', block.endTime);
                continue; // Skip this block
              }
            } else {
              console.error('Invalid endTime type:', block.endTime);
              continue; // Skip this block
            }

            // Validate timestamps before creating event data
            const validatedStartTime = validateTimestamp(startTime, `${block.title} startTime`);
            const validatedEndTime = validateTimestamp(endTime, `${block.title} endTime`);

            const eventData = {
              userId,
              categoryId,
              title: block.title,
              description: `Gerado automaticamente pela rotina inteligente${block.source ? ` - ${block.source}` : ''}`,
              startTime: validatedStartTime,
              endTime: validatedEndTime,
              dayOfWeek: block.dayOfWeek,
              isRecurring: false,
              recurrenceType: 'none',
              source: 'intelligent_routine'
            };

            console.log('Creating calendar event:', eventData);
            await storage.createCalendarEvent(eventData);
          }
        }
      }

      res.json(routine);
    } catch (error) {
      console.error('Error generating weekly routine:', error);
      res.status(500).json({ message: 'Failed to generate weekly routine' });
    }
  });

  app.get('/api/study-schedules', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const schedules = await storage.getStudySchedules(userId);
      res.json(schedules);
    } catch (error) {
      console.error('Error fetching study schedules:', error);
      res.status(500).json({ message: 'Failed to fetch study schedules' });
    }
  });

  app.post('/api/study-schedules', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const scheduleData = insertStudyScheduleSchema.parse({
        ...req.body,
        userId
      });

      const schedule = await storage.createStudySchedule(scheduleData);
      res.json(schedule);
    } catch (error) {
      console.error('Error creating study schedule:', error);
      res.status(400).json({ message: 'Failed to create study schedule' });
    }
  });

  // Calendar Categories routes
  app.get('/api/calendar-categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categories = await storage.getCalendarCategories(userId);

      // Create default categories if none exist
      if (categories.length === 0) {
        const defaultCategories = [
          { name: 'Atividade Física', color: '#22c55e', icon: 'activity', isDefault: true },
          { name: 'Warm Up', color: '#f59e0b', icon: 'flame', isDefault: true },
          { name: 'Grind', color: '#ef4444', icon: 'target', isDefault: true },
          { name: 'Estudo', color: '#3b82f6', icon: 'book-open', isDefault: true },
          { name: 'Cooldown', color: '#8b5cf6', icon: 'wind', isDefault: true },
          { name: 'Sono', color: '#1f2937', icon: 'moon', isDefault: true },
        ];

        for (const category of defaultCategories) {
          await storage.createCalendarCategory({
            ...category,
            userId,
          });
        }

        const newCategories = await storage.getCalendarCategories(userId);
        res.json(newCategories);
      } else {
        res.json(categories);
      }
    } catch (error) {
      console.error('Error getting calendar categories:', error);
      res.status(500).json({ message: 'Failed to get calendar categories' });
    }
  });

  app.post('/api/calendar-categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categoryData = insertCalendarCategorySchema.parse({
        ...req.body,
        userId
      });

      const category = await storage.createCalendarCategory(categoryData);
      res.json(category);
    } catch (error) {
      console.error('Error creating calendar category:', error);
      res.status(400).json({ message: 'Failed to create calendar category' });
    }
  });

  app.put('/api/calendar-categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const categoryData = insertCalendarCategorySchema.partial().parse(req.body);

      const category = await storage.updateCalendarCategory(id, categoryData);
      res.json(category);
    } catch (error) {
      console.error('Error updating calendar category:', error);
      res.status(400).json({ message: 'Failed to update calendar category' });
    }
  });

  app.delete('/api/calendar-categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCalendarCategory(id);
      res.json({ message: 'Calendar category deleted successfully' });
    } catch (error) {
      console.error('Error deleting calendar category:', error);
      res.status(500).json({ message: 'Failed to delete calendar category' });
    }
  });

  // Calendar Events routes
  app.get('/api/calendar-events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { weekStart, weekEnd } = req.query;

      const events = await storage.getCalendarEvents(
        userId,
        weekStart ? new Date(weekStart as string) : undefined,
        weekEnd ? new Date(weekEnd as string) : undefined
      );
      res.json(events);
    } catch (error) {
      console.error('Error getting calendar events:', error);
      res.status(500).json({ message: 'Failed to get calendar events' });
    }
  });

  app.post('/api/calendar-events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const eventData = insertCalendarEventSchema.parse({
        ...req.body,
        userId,
        startTime: new Date(req.body.startTime),
        endTime: new Date(req.body.endTime)
      });

      // Handle recurrence creation
      if (eventData.isRecurring && eventData.recurrenceType !== 'none') {
        // Create parent event
        const parentEvent = await storage.createCalendarEvent(eventData);

        // Create recurring instances based on recurrence pattern
        const recurringEvents = [];
        const { recurrenceType, recurrencePattern } = eventData;

        if (recurrenceType === 'daily') {
          // Generate daily events for the next 90 days
          for (let i = 1; i <= 90; i++) {
            const eventDate = new Date(eventData.startTime);
            eventDate.setDate(eventDate.getDate() + i);

            const endDate = new Date(eventData.endTime);
            endDate.setDate(endDate.getDate() + i);

            const recurringEvent = await storage.createCalendarEvent({
              ...eventData,
              startTime: eventDate,
              endTime: endDate,
              parentEventId: parentEvent.id,
              dayOfWeek: eventDate.getDay()
            });
            recurringEvents.push(recurringEvent);
          }
        } else if (recurrenceType === 'weekly') {
          // Generate weekly events for the next 52 weeks
          for (let i = 1; i <= 52; i++) {
            const eventDate = new Date(eventData.startTime);
            eventDate.setDate(eventDate.getDate() + (i * 7));

            const endDate = new Date(eventData.endTime);
            endDate.setDate(endDate.getDate() + (i * 7));

            const recurringEvent = await storage.createCalendarEvent({
              ...eventData,
              startTime: eventDate,
              endTime: endDate,
              parentEventId: parentEvent.id,
              dayOfWeek: eventDate.getDay()
            });
            recurringEvents.push(recurringEvent);
          }
        }

        res.json({ parentEvent, recurringEvents });
      } else {
        const event = await storage.createCalendarEvent(eventData);
        res.json(event);
      }
    } catch (error) {
      console.error('Error creating calendar event:', error);
      res.status(400).json({ message: 'Failed to create calendar event' });
    }
  });

  app.put('/api/calendar-events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { editType } = req.body; // 'single' or 'series'
      const eventData = insertCalendarEventSchema.partial().parse({
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined
      });

      if (editType === 'series') {
        // Find the parent event ID
        const event = await storage.getCalendarEvents(req.user.claims.sub);
        const currentEvent = event.find(e => e.id === id);
        const parentId = currentEvent?.parentEventId || id;

        await storage.updateRecurringEventSeries(parentId, eventData);
        res.json({ message: 'Recurring series updated successfully' });
      } else {
        const event = await storage.updateCalendarEvent(id, eventData);
        res.json(event);
      }
    } catch (error) {
      console.error('Error updating calendar event:', error);
      res.status(400).json({ message: 'Failed to update calendar event' });
    }
  });

  app.delete('/api/calendar-events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { deleteType } = req.query; // 'single' or 'series'

      if (deleteType === 'series') {
        // Find the parent event ID
        const events = await storage.getCalendarEvents(req.user.claims.sub);
        const currentEvent = events.find(e => e.id === id);
        const parentId = currentEvent?.parentEventId || id;

        await storage.deleteRecurringEventSeries(parentId);
        res.json({ message: 'Recurring series deleted successfully' });
      } else {
        await storage.deleteCalendarEvent(id);
        res.json({ message: 'Calendar event deleted successfully' });
      }
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      res.status(500).json({ message: 'Failed to delete calendar event' });
    }
  });

  // ===== ETAPA 2: ENDPOINT PARA SUGESTÕES SEMANAIS =====
  app.get('/api/session-tournaments/weekly-suggestions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log('Fetching weekly suggestions for user:', userId);

      // Buscar todos os torneios planejados do usuário
      const allPlannedTournaments = await storage.getPlannedTournaments(userId);
      console.log('Found planned tournaments:', allPlannedTournaments.length);

      // Se não houver torneios planejados, retornar array vazio
      if (!allPlannedTournaments || allPlannedTournaments.length === 0) {
        console.log('No planned tournaments found');
        return res.json([]);
      }

      // Agrupar por combinação site+type+speed+buyIn para calcular frequência
      const suggestionMap = new Map();

      allPlannedTournaments.forEach(tournament => {
        const key = `${tournament.site}-${tournament.type || tournament.category}-${tournament.speed}-${tournament.buyIn}`;

        if (suggestionMap.has(key)) {
          suggestionMap.get(key).frequency += 1;
        } else {
          suggestionMap.set(key, {
            site: tournament.site,
            type: tournament.type || tournament.category || 'Vanilla',
            speed: tournament.speed || 'Normal',
            buyIn: tournament.buyIn,
            guaranteed: tournament.guaranteed,
            time: tournament.time,
            frequency: 1,
            sampleName: tournament.name
          });
        }
      });

      // Converter para array e ordenar por frequência
      const suggestions = Array.from(suggestionMap.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10); // Top 10 sugestões

      console.log('Generated suggestions:', suggestions.length);
      res.json(suggestions);
    } catch (error) {
      console.error('Error fetching weekly suggestions:', error);
      res.status(500).json({ message: 'Failed to fetch weekly suggestions' });
    }
  });

  // Authentication routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, username, firstName, lastName } = createUserSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await db.select().from(users).where(eq(users.email, email));
      if (existingUser.length > 0) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(password);

      // Create user
      const [newUser] = await db.insert(users).values({
        id: nanoid(),
        email,
        password: hashedPassword,
        username,
        firstName,
        lastName,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();

      // Generate tokens
      const { accessToken, refreshToken } = AuthService.generateTokens(newUser.id, newUser.email);

      // Log access
      await AuthService.logAccess(newUser.id, 'register', 'success');

      res.status(201).json({
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          status: newUser.status,
          permissions: []
        },
        accessToken,
        refreshToken
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(400).json({ message: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      // Find user
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        await AuthService.logAccess(null, 'login', 'failed', undefined, 'User not found');
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Verify password
      const isValidPassword = await AuthService.verifyPassword(password, user.password);
      if (!isValidPassword) {
        await AuthService.logAccess(user.id, 'login', 'failed', undefined, 'Invalid password');
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Get user with permissions
      const userWithPermissions = await AuthService.getUserWithPermissions(user.id);
      if (!userWithPermissions) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Generate tokens
      const { accessToken, refreshToken } = AuthService.generateTokens(user.id, user.email);

      // Log successful access
      await AuthService.logAccess(user.id, 'login', 'success');

      res.json({
        user: userWithPermissions,
        accessToken,
        refreshToken
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(400).json({ message: 'Login failed' });
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh token required' });
      }

      const payload = AuthService.verifyRefreshToken(refreshToken);
      if (!payload) {
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = AuthService.generateTokens(
        payload.userId,
        payload.email
      );

      res.json({
        accessToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({ message: 'Token refresh failed' });
    }
  });

  app.get('/api/auth/user', requireAuth, async (req, res) => {
    try {
      const user = await AuthService.getUserWithPermissions(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ message: 'Failed to get user' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      await AuthService.logAccess(req.user!.id, 'logout', 'success');
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ message: 'Logout failed' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}