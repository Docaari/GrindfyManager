import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./replitAuth";
import { AuthService, requireAuth, requirePermission } from "./auth";
import { subscriptionService } from "./subscriptionService";
import { NotificationService } from "./notificationService";
import { 
  checkSubscriptionStatus, 
  requireSubscriptionFeature, 
  restrictExpiredUsers, 
  addSubscriptionInfo, 
  trackSessionStart, 
  setupSubscriptionProcessing 
} from "./subscriptionMiddleware";
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
  insertBugReportSchema,
  insertUploadHistorySchema,
  loginSchema,
  createUserSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  updateUserSchema,
  users,
  permissions,
  userPermissions,
  accessLogs,
  userActivity,
  analyticsDaily,
  uploadHistory,
  insertUserActivitySchema,
  insertAnalyticsDailySchema,
} from "@shared/schema";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import { PokerCSVParser } from "./csvParser";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "./db";
import { eq, and, inArray, desc, gte, sql, count, avg, max, sum, or } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import OAuthService from "./oauth";
import EmailService from "./emailService";

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
  // ETAPA 3: SECURITY MIDDLEWARE IMPLEMENTATION
  
  // 1. Security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // 2. Rate limiting for authentication endpoints
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
      message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Rate limit by IP + email if available
      const email = req.body?.email || '';
      return `${req.ip}:${email}`;
    }
  });

  // 3. General API rate limiting
  const apiRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
    message: {
      message: 'Muitas requisições. Tente novamente em alguns minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for static assets
      return req.url.includes('/assets/') || req.url.includes('/favicon.ico');
    }
  });

  // Apply rate limiting to all API routes
  app.use('/api', apiRateLimit);

  // Auth middleware
  // await setupAuth(app); // COMENTADO: Replit Auth removido para evitar conflito com sistema JWT

  // SUBSCRIPTION SYSTEM IMPLEMENTATION
  // Configure subscription processing
  setupSubscriptionProcessing();

  // Console.log para debugar middlewares
  console.log('🔧 DEBUG: Configurando middlewares - ordem correta aplicada');

  // Auth routes
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Manual authentication routes (for custom auth system)
  app.post('/api/auth/register', authRateLimit, async (req, res) => {
    try {
      const userData = registerSchema.parse(req.body);
      
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

      // Create user with pending verification status
      const [newUser] = await db.insert(users).values({
        id: nanoid(),
        email: userData.email,
        name: userData.name,
        username: userData.email.split('@')[0] + '_' + nanoid(4), // Generate unique username
        password: hashedPassword,
        status: 'pending_verification',
        emailVerified: false,
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Generate email verification token
      const verificationToken = EmailService.generateEmailVerificationToken(newUser.id, newUser.email!);
      
      // Send verification email
      await EmailService.sendEmailVerification(newUser.email!, verificationToken);
      
      // Log registration
      await AuthService.logAccess(newUser.id, 'user_registered', undefined, req);

      res.status(201).json({
        message: 'Conta criada com sucesso! Verifique seu email para ativá-la.',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          status: newUser.status,
          emailVerified: newUser.emailVerified,
        },
        requiresVerification: true
      });
    } catch (error) {
      console.error('Registration error:', error);
      if (error.issues) {
        return res.status(400).json({ 
          message: 'Dados inválidos', 
          errors: error.issues 
        });
      }
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // TEST: Login route without ANY middleware
  app.post('/api/auth/login-test', async (req, res) => {
    console.log('🔐 TEST: Login test route called - NO MIDDLEWARE');
    console.log('🔐 TEST: Request body:', req.body);
    console.log('🔐 TEST: Headers:', req.headers);
    
    try {
      const loginData = loginSchema.parse(req.body);
      console.log('🔐 TEST: Login data parsed successfully:', { email: loginData.email, hasPassword: !!loginData.password });
      
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
        await AuthService.logAccess(user.userPlatformId, 'login_failed', undefined, req);
        return res.status(401).json({ 
          message: 'Credenciais inválidas' 
        });
      }

      // Generate tokens
      const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);
      
      // Log successful login
      await AuthService.logAccess(user.userPlatformId, 'login_success', undefined, req);

      res.json({
        message: 'Login realizado com sucesso',
        user: {
          id: user.userPlatformId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        ...tokens
      });
    } catch (error) {
      console.error('🔐 TEST: Login error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/login', authRateLimit, async (req, res) => {
    console.log('🔐 DEBUG: Login route called');
    console.log('🔐 DEBUG: Request body:', req.body);
    console.log('🔐 DEBUG: Headers:', req.headers);
    
    try {
      const loginData = loginSchema.parse(req.body);
      console.log('🔐 DEBUG: Login data parsed successfully:', { email: loginData.email, hasPassword: !!loginData.password });
      
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
        await AuthService.logAccess(user.userPlatformId, 'login_failed', undefined, req);
        return res.status(401).json({ 
          message: 'Credenciais inválidas' 
        });
      }

      // Check user status
      if (user.status === 'blocked') {
        await AuthService.logAccess(user.userPlatformId, 'login_blocked', undefined, req);
        return res.status(403).json({ 
          message: 'Conta bloqueada. Entre em contato com o suporte.' 
        });
      }

      // Check email verification
      if (!user.emailVerified) {
        await AuthService.logAccess(user.userPlatformId, 'login_unverified', undefined, req);
        return res.status(403).json({ 
          message: 'Email não verificado. Verifique sua caixa de entrada.',
          requiresVerification: true,
          email: user.email
        });
      }

      // Get user permissions
      const userPermissionsList = await db.select({
        permissionName: permissions.name
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(and(
        eq(userPermissions.userId, user.userPlatformId),
        eq(userPermissions.granted, true)
      ));

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.userPlatformId, user.userPlatformId));

      // Generate tokens
      const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);
      
      // Log successful login
      await AuthService.logAccess(user.userPlatformId, 'login_success', undefined, req);

      res.json({
        message: 'Login realizado com sucesso',
        success: true,
        user: {
          id: user.userPlatformId,
          email: user.email,
          name: user.name,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
          permissions: userPermissionsList.map(p => p.permissionName)
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
      const tokens = AuthService.generateTokens(payload.userId, payload.userPlatformId, payload.email);
      
      res.json(tokens);
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      // Log logout
      await AuthService.logAccess(req.user!.userPlatformId, 'logout', undefined, req);
      
      res.json({ message: 'Logout realizado com sucesso' });
    } catch (error) {
      console.error('Logout error:', error);
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

  // Email verification routes
  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = verifyEmailSchema.parse(req.body);
      
      const success = await EmailService.verifyUserEmail(token);
      
      if (success) {
        res.json({ message: 'Email verificado com sucesso' });
      } else {
        res.status(400).json({ message: 'Token inválido ou expirado' });
      }
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/resend-verification', async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      
      const success = await EmailService.resendEmailVerification(email);
      
      if (success) {
        res.json({ message: 'Email de verificação reenviado' });
      } else {
        res.status(400).json({ message: 'Email não encontrado ou já verificado' });
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // Password reset routes
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      
      // Find user
      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email));
      
      if (!user) {
        // Don't reveal that user doesn't exist
        return res.json({ message: 'Se o email existir, um link de redefinição foi enviado' });
      }

      // Generate reset token
      const resetToken = EmailService.generatePasswordResetToken(user.userPlatformId, email);
      
      // Send reset email
      await EmailService.sendPasswordReset(email, resetToken);
      
      res.json({ message: 'Se o email existir, um link de redefinição foi enviado' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);
      
      // Verify reset token
      const tokenData = EmailService.verifyPasswordResetToken(token);
      
      if (!tokenData) {
        return res.status(400).json({ message: 'Token inválido ou expirado' });
      }

      // Hash new password
      const hashedPassword = await AuthService.hashPassword(password);
      
      // Update user password
      await db.update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, tokenData.userId));

      // Log password reset - 🚨 ETAPA 2.5 FIX: usar userPlatformId
      await AuthService.logAccess(tokenData.userPlatformId, 'password_reset', undefined, req);
      
      res.json({ message: 'Senha redefinida com sucesso' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // SUBSCRIPTION ROUTES
  // Get subscription status
  app.get('/api/subscription/status', requireAuth, async (req, res) => {
    try {
      const subscriptionStatus = await subscriptionService.checkSubscriptionStatus(req.user.userPlatformId);
      const engagementMetrics = await subscriptionService.getEngagementMetrics(req.user.userPlatformId);
      
      res.json({
        ...subscriptionStatus,
        metrics: engagementMetrics
      });
    } catch (error) {
      console.error('Subscription status error:', error);
      res.status(500).json({ message: 'Erro ao verificar status da assinatura' });
    }
  });

  // Create subscription
  app.post('/api/subscription/create', requireAuth, async (req, res) => {
    try {
      const { planType, durationDays, paymentMethodId, autoRenewal } = req.body;
      
      const subscription = await subscriptionService.createSubscription({
        userId: req.user.userPlatformId,
        planType,
        durationDays,
        paymentMethodId,
        autoRenewal
      });

      res.json({
        message: 'Assinatura criada com sucesso',
        subscription
      });
    } catch (error) {
      console.error('Create subscription error:', error);
      res.status(500).json({ message: 'Erro ao criar assinatura' });
    }
  });

  // Get subscription history
  app.get('/api/subscription/history', requireAuth, async (req, res) => {
    try {
      const history = await subscriptionService.getUserSubscriptionHistory(req.user.userPlatformId);
      res.json(history);
    } catch (error) {
      console.error('Subscription history error:', error);
      res.status(500).json({ message: 'Erro ao buscar histórico de assinaturas' });
    }
  });

  // Check feature access
  app.get('/api/subscription/feature/:feature', requireAuth, async (req, res) => {
    try {
      const { feature } = req.params;
      const hasAccess = await subscriptionService.checkFeatureAccess(req.user.userPlatformId, feature);
      
      res.json({
        feature,
        hasAccess
      });
    } catch (error) {
      console.error('Feature access error:', error);
      res.status(500).json({ message: 'Erro ao verificar acesso à funcionalidade' });
    }
  });

  // Update engagement metrics
  app.post('/api/subscription/engagement', requireAuth, async (req, res) => {
    try {
      const metrics = await subscriptionService.updateEngagementMetrics(req.user.userPlatformId, req.body);
      res.json(metrics);
    } catch (error) {
      console.error('Engagement metrics error:', error);
      res.status(500).json({ message: 'Erro ao atualizar métricas de engajamento' });
    }
  });

  // Admin routes
  const createUserSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3),
    password: z.string().min(6),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    permissions: z.array(z.string()).default([]),
    status: z.enum(['active', 'inactive', 'blocked']).default('active')
  });

  const updateUserSchema = z.object({
    email: z.string().email().optional(),
    username: z.string().min(3).optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    permissions: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive', 'blocked']).optional()
  });

  // Get all users (admin only)
  app.get('/api/admin/users', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      console.log('🔍 ADMIN USERS DEBUG - Iniciando busca de usuários');
      
      const allUsers = await db.select({
        id: users.userPlatformId,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        status: users.status,
        createdAt: users.createdAt
      }).from(users);

      console.log('🔍 ADMIN USERS DEBUG - Usuários encontrados:', allUsers.length);

      // Get permissions for each user
      const usersWithPermissions = await Promise.all(
        allUsers.map(async (user) => {
          const userPermissionsResult = await db.select({
            permissionName: permissions.name
          })
          .from(userPermissions)
          .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
          .where(eq(userPermissions.userId, user.userPlatformId));

          const permissionNames = userPermissionsResult.map(p => p.permissionName);
          console.log(`🔍 ADMIN USERS DEBUG - Usuário ${user.email} tem permissões:`, permissionNames);

          return {
            ...user,
            permissions: permissionNames
          };
        })
      );

      console.log('🔍 ADMIN USERS DEBUG - Resposta final:', usersWithPermissions.length, 'usuários');
      res.json(usersWithPermissions);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Erro ao buscar usuários' });
    }
  });

  // Create user (admin only)
  app.post('/api/admin/users', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const userData = createUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await db.select()
        .from(users)
        .where(eq(users.email, userData.email));
      
      if (existingUser.length > 0) {
        return res.status(400).json({ 
          message: 'Usuário já existe' 
        });
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(userData.password);

      // Create user
      const [newUser] = await db.insert(users)
        .values({
          id: nanoid(),
          email: userData.email,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
          password: hashedPassword,
          status: userData.status
        })
        .returning();

      // Add permissions
      if (userData.permissions.length > 0) {
        // Get permission IDs
        const permissionRecords = await db.select()
          .from(permissions)
          .where(inArray(permissions.name, userData.permissions));

        if (permissionRecords.length > 0) {
          const userPermissionData = permissionRecords.map(perm => ({
            id: nanoid(),
            userId: newUser.id,
            permissionId: perm.id
          }));

          await db.insert(userPermissions).values(userPermissionData);
        }
      }

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          status: newUser.status,
          permissions: userData.permissions
        }
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Erro ao criar usuário' });
    }
  });

  // Update user (admin only)
  app.put('/api/admin/users/:id', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const userId = req.params.id;
      const userData = updateUserSchema.parse(req.body);
      
      // Update user
      const [updatedUser] = await db.update(users)
        .set({
          email: userData.email,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
          status: userData.status
        })
        .where(eq(users.userPlatformId, userId))
        .returning();

      // Update permissions if provided
      if (userData.permissions) {
        // Remove existing permissions
        await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

        // Add new permissions
        if (userData.permissions.length > 0) {
          const permissionRecords = await db.select()
            .from(permissions)
            .where(inArray(permissions.name, userData.permissions));

          if (permissionRecords.length > 0) {
            const userPermissionData = permissionRecords.map(perm => ({
              id: nanoid(),
              userId: userId,
              permissionId: perm.id
            }));

            await db.insert(userPermissions).values(userPermissionData);
          }
        }
      }

      res.json({
        message: 'Usuário atualizado com sucesso',
        user: {
          ...updatedUser,
          permissions: userData.permissions || []
        }
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: 'Erro ao atualizar usuário' });
    }
  });

  // Toggle user status (admin only)
  app.patch('/api/admin/users/:id/status', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const userId = req.params.id;
      const { status } = req.body;
      
      const [updatedUser] = await db.update(users)
        .set({ status })
        .where(eq(users.userPlatformId, userId))
        .returning();

      res.json({
        message: 'Status do usuário atualizado',
        user: updatedUser
      });
    } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({ message: 'Erro ao atualizar status' });
    }
  });

  // Get access logs (admin only) - 🎯 ETAPA 3.3: Updated to include userPlatformId
  app.get('/api/admin/access-logs', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const logs = await db.select({
        id: accessLogs.id,
        userId: accessLogs.userId,
        action: accessLogs.action,
        ipAddress: accessLogs.ipAddress,
        userAgent: accessLogs.userAgent,
        metadata: accessLogs.metadata,
        createdAt: accessLogs.createdAt,
        // 🎯 ETAPA 3.3: Join with users table to get userPlatformId
        userPlatformId: users.userPlatformId
      })
        .from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .orderBy(desc(accessLogs.createdAt))
        .limit(100);

      // 🎯 ETAPA 3.3: Format logs to match frontend interface
      const formattedLogs = logs.map(log => ({
        id: log.id,
        userId: log.userId,
        userPlatformId: log.userPlatformId,
        action: log.action,
        status: log.action?.includes('success') ? 'success' : 'failed',
        ipAddress: log.ipAddress,
        timestamp: log.createdAt,
        userAgent: log.userAgent,
        details: log.metadata ? JSON.stringify(log.metadata) : null
      }));

      res.json(formattedLogs);
    } catch (error) {
      console.error('Error fetching access logs:', error);
      res.status(500).json({ message: 'Erro ao buscar logs de acesso' });
    }
  });

  // ETAPA 3: V2.0 PREPARATION ENDPOINTS
  
  // OAuth Google authentication
  app.get('/api/auth/google', async (req, res) => {
    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      const authUrl = OAuthService.generateAuthUrl('google', redirectUri);
      
      res.json({ 
        authUrl,
        message: 'Redirecione para esta URL para autenticação com Google' 
      });
    } catch (error) {
      console.error('Google OAuth error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ message: 'Código ou estado ausente' });
      }

      if (!OAuthService.validateState(state as string)) {
        return res.status(400).json({ message: 'Estado inválido ou expirado' });
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      
      // Exchange code for token
      const tokenData = await OAuthService.exchangeCodeForToken('google', code as string, redirectUri);
      
      // Get user info
      const userInfo = await OAuthService.getUserInfo('google', tokenData.accessToken);
      
      // Create or update user
      const user = await OAuthService.createOrUpdateOAuthUser('google', userInfo);
      
      // Generate JWT tokens
      const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);
      
      // Log successful OAuth login
      await AuthService.logAccess(user.userPlatformId, 'oauth_login_success', undefined, req);

      res.json({
        message: 'Login OAuth realizado com sucesso',
        user: {
          id: user.userPlatformId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        ...tokens
      });
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // Email verification endpoints
  app.post('/api/auth/send-verification', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: 'E-mail é obrigatório' });
      }

      const sent = await EmailService.resendEmailVerification(email);
      
      if (sent) {
        res.json({ message: 'E-mail de verificação enviado' });
      } else {
        res.status(400).json({ message: 'Usuário não encontrado ou e-mail já verificado' });
      }
    } catch (error) {
      console.error('Send verification error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: 'Token é obrigatório' });
      }

      const verified = await EmailService.verifyUserEmail(token);
      
      if (verified) {
        res.json({ message: 'E-mail verificado com sucesso' });
      } else {
        res.status(400).json({ message: 'Token inválido ou expirado' });
      }
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // Password reset endpoints
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: 'E-mail é obrigatório' });
      }

      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email));

      if (!user) {
        // Don't reveal if user exists for security
        return res.json({ message: 'Se o e-mail existir, um link de recuperação será enviado' });
      }

      const token = EmailService.generatePasswordResetToken(user.userPlatformId, email);
      const sent = await EmailService.sendPasswordReset(email, token);
      
      if (sent) {
        res.json({ message: 'Se o e-mail existir, um link de recuperação será enviado' });
      } else {
        res.status(500).json({ message: 'Erro ao enviar e-mail de recuperação' });
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token e nova senha são obrigatórios' });
      }

      const tokenData = EmailService.verifyPasswordResetToken(token);
      if (!tokenData) {
        return res.status(400).json({ message: 'Token inválido ou expirado' });
      }

      // Hash new password
      const hashedPassword = await AuthService.hashPassword(newPassword);
      
      // Update user password
      await db.update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, tokenData.userId));

      // Log password reset - 🚨 ETAPA 2.5 FIX: usar userPlatformId
      await AuthService.logAccess(tokenData.userPlatformId, 'password_reset', undefined, req);

      res.json({ message: 'Senha redefinida com sucesso' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // 🧪 ENDPOINT DE DEBUG RADICAL PARA TESTAR userPlatformId
  app.get('/api/debug-user', requireAuth, async (req: any, res) => {
    try {
      console.log('🧪 DEBUG RADICAL - TESTE ESPECÍFICO DE userPlatformId:', {
        'req.user completo': req.user,
        'req.user.userPlatformId': req.user.userPlatformId,
        'req.user.id': req.user.id,
        'req.user.email': req.user.email,
        'req.user.username': req.user.username,
        'typeof req.user.userPlatformId': typeof req.user.userPlatformId,
        'JSON.stringify(req.user)': JSON.stringify(req.user),
        'timestamp': new Date().toISOString()
      });

      // Teste direto da variável
      const userPlatformId = req.user.userPlatformId;
      console.log('🧪 DEBUG RADICAL - userPlatformId extraído:', userPlatformId);

      // Retorno simples para validação
      res.json({ 
        userPlatformId: userPlatformId,
        email: req.user.email,
        username: req.user.username,
        fullUser: req.user,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('🧪 DEBUG RADICAL - Erro no endpoint:', error);
      res.status(500).json({ error: 'Erro no debug endpoint' });
    }
  });

  // 🚨 ENDPOINT DE TESTE CRÍTICO DE SEGURANÇA - VALIDAÇÃO COMPLETA
  app.post('/api/debug-upload-security', requireAuth, async (req: any, res) => {
    try {
      console.log('🚨 TESTE CRÍTICO DE SEGURANÇA - INÍCIO:', {
        'timestamp': new Date().toISOString(),
        'req.user completo': req.user,
        'req.user.userPlatformId': req.user.userPlatformId,
        'req.user.email': req.user.email,
        'req.user.username': req.user.username
      });

      // Simular exatamente o que o endpoint de upload faz
      const userPlatformId = req.user?.userPlatformId;
      
      console.log('🚨 TESTE CRÍTICO - Validação userPlatformId:', {
        'userPlatformId extraído': userPlatformId,
        'tipo': typeof userPlatformId,
        'válido': userPlatformId && userPlatformId.startsWith('USER-'),
        'email': req.user?.email
      });

      // Testar função de duplicatas
      const testTournament = {
        name: 'TEST Security Tournament',
        datePlayed: new Date(),
        buyIn: 10.00,
        position: 1,
        fieldSize: 100,
        site: 'Test'
      };

      console.log('🚨 TESTE CRÍTICO - Testando verificação de duplicatas:', {
        'userPlatformId usado': userPlatformId,
        'testTournament': testTournament
      });

      const isDuplicate = await storage.isDuplicateTournament(userPlatformId, testTournament);
      
      console.log('🚨 TESTE CRÍTICO - Resultado da verificação:', {
        'isDuplicate': isDuplicate,
        'userPlatformId confirmado': userPlatformId
      });

      // Testar contagem de torneios existentes
      const existingTournaments = await storage.getTournaments(userPlatformId);
      
      console.log('🚨 TESTE CRÍTICO - Torneios existentes:', {
        'count': existingTournaments.length,
        'userPlatformId': userPlatformId,
        'primeiros 3 torneios': existingTournaments.slice(0, 3).map(t => ({ 
          id: t.id, 
          name: t.name, 
          userId: t.userId,
          datePlayed: t.datePlayed 
        }))
      });

      res.json({
        success: true,
        userPlatformId: userPlatformId,
        email: req.user.email,
        username: req.user.username,
        existingTournamentsCount: existingTournaments.length,
        isDuplicateTest: isDuplicate,
        validUserPlatformId: userPlatformId && userPlatformId.startsWith('USER-'),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('🚨 TESTE CRÍTICO - Erro:', error);
      res.status(500).json({ error: 'Erro no teste de segurança' });
    }
  });

  // Debug endpoint para verificar faixa de datas
  app.get("/api/debug/date-range", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const dateRange = await storage.getDateRange(userId);
      res.json(dateRange);
    } catch (error) {
      console.error("Error fetching date range:", error);
      res.status(500).json({ message: "Failed to fetch date range" });
    }
  });

  // Dashboard routes with filters
  app.get('/api/dashboard/stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      
      // 🚨 ETAPA 2 DEBUG - Verificação crítica no endpoint
      console.log('🚨 ETAPA 2 DEBUG - Dashboard endpoint chamado');
      console.log('🚨 ETAPA 2 DEBUG - req.user completo:', req.user);
      console.log('🚨 ETAPA 2 DEBUG - userId extraído:', userId);
      console.log('🚨 ETAPA 2 DEBUG - Tipo do userId:', typeof userId);
      console.log('🚨 ETAPA 2 DEBUG - Period:', period);
      console.log('🚨 ETAPA 2 DEBUG - Filters:', filters);
      
      const stats = await storage.getDashboardStats(userId, period, filters);
      
      // 🚨 ETAPA 2 DEBUG - Verificar resultado
      console.log('🚨 ETAPA 2 DEBUG - Stats retornadas:', {
        count: stats.count,
        totalProfit: stats.totalProfit,
        totalBuyins: stats.totalBuyins,
        hasData: stats.count > 0
      });
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get('/api/dashboard/performance', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/analytics/by-site', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      console.log('🚨 CRITICAL DEBUG - /api/analytics/by-site - userId do req.user:', userId);
      console.log('🚨 CRITICAL DEBUG - /api/analytics/by-site - req.user completo:', req.user);
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsBySite(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching site analytics:", error);
      res.status(500).json({ message: "Failed to fetch site analytics" });
    }
  });

  app.get('/api/analytics/by-buyin', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      const analytics = await storage.getAnalyticsByBuyinRange(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching buyin analytics:", error);
      res.status(500).json({ message: "Failed to fetch buyin analytics" });
    }
  });

  app.get('/api/analytics/by-category', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      console.log('🚨 CRITICAL DEBUG - /api/analytics/by-category - userId do req.user:', userId);
      console.log('🚨 CRITICAL DEBUG - /api/analytics/by-category - req.user completo:', req.user);
      console.log('🚨 CRITICAL DEBUG - /api/analytics/by-category - req.user.email:', req.user.email);
      const period = req.query.period as string || "30d";
      const filters = req.query.filters ? JSON.parse(req.query.filters) : {};
      
      const analytics = await storage.getAnalyticsByCategory(userId, period, filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching category analytics:", error);
      res.status(500).json({ message: "Failed to fetch category analytics" });
    }
  });

  app.get('/api/analytics/by-day', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/analytics/by-speed', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/analytics/by-month', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/analytics/by-field', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/analytics/final-table', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/coaching/recommendations', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const recommendations = await storage.getCoachingRecommendations(userId);
      res.json(recommendations);
    } catch (error) {
      console.error("Error fetching coaching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch coaching recommendations" });
    }
  });

  // Tournament routes
  app.get("/api/tournaments", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      console.log('🚨 CRITICAL DEBUG - /api/tournaments - userId do req.user:', userId);
      console.log('🚨 CRITICAL DEBUG - /api/tournaments - req.user completo:', req.user);
      const limit = parseInt(req.query.limit as string) || 50;
      const period = req.query.period as string;
      const filters = req.query.filters ? JSON.parse(req.query.filters as string) : {};

      const tournaments = await storage.getTournaments(userId, limit, undefined, period, filters);
      console.log('🚨 CRITICAL DEBUG - /api/tournaments - Número de torneios retornados:', tournaments.length);
      res.json(tournaments);
    } catch (error) {
      console.error("Error fetching tournaments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk delete tournaments with granular filtering
  app.post('/api/tournaments/bulk-delete', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.post('/api/tournaments/bulk-delete/preview', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/tournaments/sites', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sites = await storage.getUniqueSites(userId);
      res.json(sites);
    } catch (error) {
      console.error('Error fetching sites:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Clear all tournaments for user
  app.delete('/api/tournaments/clear', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      await storage.clearAllTournaments(userId);
      res.json({ message: "All tournaments cleared successfully" });
    } catch (error) {
      console.error("Error clearing tournaments:", error);
      res.status(500).json({ message: "Failed to clear tournaments" });
    }
  });

  app.post('/api/tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const tournamentData = insertTournamentSchema.parse({ ...req.body, userId });
      const tournament = await storage.createTournament(tournamentData);
      res.json(tournament);
    } catch (error) {
      console.error("Error creating tournament:", error);
      res.status(400).json({ message: "Failed to create tournament" });
    }
  });

  app.put('/api/tournaments/:id', requireAuth, async (req: any, res) => {
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

  app.delete('/api/tournaments/:id', requireAuth, async (req: any, res) => {
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
  app.get('/api/tournament-library', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/tournament-templates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const templates = await storage.getTournamentTemplates(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching tournament templates:", error);
      res.status(500).json({ message: "Failed to fetch tournament templates" });
    }
  });

  app.post('/api/tournament-templates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const templateData = insertTournamentTemplateSchema.parse({ ...req.body, userId });
      const template = await storage.createTournamentTemplate(templateData);
      res.json(template);
    } catch (error) {
      console.error("Error creating tournament template:", error);
      res.status(400).json({ message: "Failed to create tournament template" });
    }
  });

  // 🎯 ETAPA 2: Planned tournament routes com suporte para integração com Grade Planner
  app.get('/api/planned-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const dayOfWeek = req.query.dayOfWeek;
      
      console.log('🎯 ETAPA 2: BUSCANDO TORNEIOS PRÓPRIOS - User:', userId);
      console.log('📅 Filtro por dia da semana:', dayOfWeek);
      
      let tournaments;
      
      if (dayOfWeek !== undefined) {
        // 🔄 Buscar torneios específicos para o dia da semana
        const dayNumber = parseInt(dayOfWeek);
        console.log('🔄 Buscando torneios para o dia:', dayNumber);
        
        tournaments = await storage.getSessionTournamentsByDay(userId, dayNumber);
        console.log(`✅ Encontrados ${tournaments.length} torneios para o dia ${dayNumber}`);
      } else {
        // 📋 Buscar todos os torneios se não especificar dia
        tournaments = await storage.getPlannedTournaments(userId);
        console.log('🔍 TORNEIOS ENCONTRADOS:', tournaments.length, 'para user', userId);
      }
      
      // Validação adicional de segurança: garantir que todos os torneios pertencem ao usuário
      const validTournaments = tournaments.filter(t => t.userId === userId);
      console.log('🔍 VALIDAÇÃO FRONTEND: todos', validTournaments.length, 'torneios pertencem ao user', userId);
      
      if (validTournaments.length !== tournaments.length) {
        console.error('🚨 ISOLAMENTO BREACH: Encontrados torneios que não pertencem ao usuário!');
        console.error('🚨 Total encontrados:', tournaments.length, 'Válidos:', validTournaments.length);
      }
      
      res.json(validTournaments);
    } catch (error) {
      console.error("❌ ETAPA 2 Error fetching planned tournaments:", error);
      res.status(500).json({ message: "Failed to fetch planned tournaments" });
    }
  });

  // Endpoint separado para sugestões globais (pool comum)
  app.get('/api/tournament-suggestions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      console.log('🔍 GERANDO SUGESTÕES - Pool global');
      
      const allTournaments = await storage.getAllPlannedTournaments(); // Pool global
      console.log('🔍 SUGESTÕES - Pool global:', allTournaments.length, 'torneios');
      
      // Filtrar apenas torneios de outros usuários para sugestões
      const suggestions = allTournaments.filter(t => t.userId !== userId);
      console.log('🔍 SUGESTÕES FILTRADAS:', suggestions.length, 'sugestões relevantes');
      
      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching tournament suggestions:", error);
      res.status(500).json({ message: "Failed to fetch tournament suggestions" });
    }
  });

  app.post('/api/planned-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      console.log('🔍 ANTES DE SALVAR - userPlatformId do backend:', userId);
      console.log('🔍 DADOS ENVIADOS - Payload recebido no backend:', req.body);

      const tournamentData = insertPlannedTournamentSchema.parse({ ...req.body, userId });
      console.log('🔍 DADOS VALIDADOS - Dados após validação:', tournamentData);

      const tournament = await storage.createPlannedTournament(tournamentData);
      console.log('🔍 TORNEIO SALVO NO BANCO - Resultado:', tournament);
      console.log('🔍 TORNEIO SALVO NO BANCO - ID gerado:', tournament.id);

      res.json(tournament);
    } catch (error) {
      console.error("🔍 ERRO AO SALVAR - Error completo:", error);
      console.error("🔍 ERRO AO SALVAR - Detalhes do erro:", {
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

  app.put('/api/planned-tournaments/:id', requireAuth, async (req: any, res) => {
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

  app.delete('/api/planned-tournaments/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userPlatformId = req.user.userPlatformId;
      
      console.log(`🔍 TENTATIVA EXCLUSÃO - User: ${userPlatformId}, Torneio: ${id}`);
      
      // Verificar se o torneio pertence ao usuário antes de deletar
      const tournament = await storage.getPlannedTournament(id);
      if (!tournament) {
        console.log(`🚨 DELETE ERROR - Tournament ${id} not found`);
        return res.status(404).json({ message: "Tournament not found" });
      }
      
      console.log(`🔍 TENTATIVA EXCLUSÃO - Torneio: ${id}, Owner: ${tournament.userId}`);
      
      if (tournament.userId !== userPlatformId) {
        console.log(`🚨 TENTATIVA EXCLUSÃO INDEVIDA - User ${userPlatformId} tentou excluir torneio ${id} do usuário ${tournament.userId}`);
        return res.status(403).json({ message: "Unauthorized to delete this tournament" });
      }
      
      await storage.deletePlannedTournament(id);
      console.log(`✅ EXCLUSÃO AUTORIZADA - Tournament ${id} excluído com sucesso pelo proprietário ${userPlatformId}`);
      res.json({ message: "Planned tournament deleted successfully", id });
    } catch (error) {
      console.error("🚨 DELETE ERROR - Error deleting planned tournament:", error);
      res.status(500).json({ message: "Failed to delete planned tournament" });
    }
  });

  // Weekly plan routes
  app.get('/api/weekly-plans', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const plans = await storage.getWeeklyPlans(userId);
      res.json(plans);
    } catch (error) {
      console.error("Error fetching weekly plans:", error);
      res.status(500).json({ message: "Failed to fetch weekly plans" });
    }
  });

  app.post('/api/weekly-plans', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const planData = insertWeeklyPlanSchema.parse({ ...req.body, userId });
      const plan = await storage.createWeeklyPlan(planData);
      res.json(plan);
    } catch (error) {
      console.error("Error creating weekly plan:", error);
      res.status(400).json({ message: "Failed to create weekly plan" });
    }
  });

  // Grind session routes
  app.get('/api/grind-sessions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/grind-sessions/history', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.post("/api/grind-sessions/reset-tournaments", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const currentDayOfWeek = new Date().getDay();

      console.log('Resetting all tournaments for user:', user.userPlatformId, 'day:', currentDayOfWeek);

      await storage.resetPlannedTournamentsForSession(user.userPlatformId, currentDayOfWeek);

      res.json({ message: "Tournaments reset successfully" });
    } catch (error) {
      console.error("Error resetting tournaments:", error);
      res.status(500).json({ message: "Failed to reset tournaments" });
    }
  });

  // 🎯 ETAPA 3: Enhanced grind session creation endpoint com integração completa com Grade Planner
  app.post('/api/grind-sessions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { resetTournaments, replaceExisting, dayOfWeek, loadFromGradePlanner, ...sessionDataRaw } = req.body;

      console.log('🔍 INICIANDO SESSÃO - User:', userId);
      console.log('🔍 DIA ATUAL DETECTADO:', dayOfWeek || new Date().getDay(), '(0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado)');
      console.log('🔍 PARÂMETROS RECEBIDOS:', { userId, dayOfWeek, loadFromGradePlanner, resetTournaments });

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

      // 🎯 ETAPA 3: Integração completa com Grade Planner
      const currentDayOfWeek = dayOfWeek || new Date().getDay() || 7; // Use provided day or current day
      
      console.log(`📅 Integrando com Grade Planner para o dia: ${currentDayOfWeek}`);

      // If resetTournaments flag is set, reset all planned tournaments for today first
      if (resetTournaments) {
        console.log(`🔄 Resetting planned tournaments for clean session start - User: ${userId}, Day: ${currentDayOfWeek}`);
        await storage.resetPlannedTournamentsForSession(userId, currentDayOfWeek);
      }

      // 🔄 ETAPA 3: Carregar torneios do Grade Planner se solicitado
      if (loadFromGradePlanner) {
        console.log(`🔍 BUSCANDO TORNEIOS - User: ${userId}, Dia: ${currentDayOfWeek}`);
        
        // Get all planned tournaments for today from Grade Planner
        const plannedTournaments = await storage.getPlannedTournaments(userId, currentDayOfWeek);
        
        console.log(`🔍 TORNEIOS ENCONTRADOS: ${plannedTournaments.length} torneios`);
        console.log(`🔍 DADOS DOS TORNEIOS:`, plannedTournaments.map(t => ({
          id: t.id,
          userId: t.userId,
          dayOfWeek: t.dayOfWeek,
          site: t.site,
          name: t.name,
          time: t.time,
          type: t.type,
          speed: t.speed,
          buyIn: t.buyIn
        })));
        
        // Create session tournaments from planned tournaments
        let createdTournaments = 0;
        for (const planned of plannedTournaments) {
          try {
            // Create session tournament from planned tournament
            const sessionTournament = {
              userId: userId,
              sessionId: session.id,
              site: planned.site,
              name: planned.name,
              buyIn: parseFloat(planned.buyIn) || 0,
              rebuys: 0,
              result: "0",
              bounty: "0",
              status: "upcoming",
              fromPlannedTournament: true,
              plannedTournamentId: planned.id,
              fieldSize: null,
              position: null,
              startTime: null,
              endTime: null,
              time: planned.time,
              type: planned.type,
              speed: planned.speed,
              guaranteed: planned.guaranteed ? parseFloat(planned.guaranteed) : null
            };
            
            await storage.createSessionTournament(sessionTournament);
            createdTournaments++;
            console.log(`🔗 Torneio ${planned.id} (${planned.name}) criado na sessão ${session.id}`);
          } catch (error) {
            console.error(`❌ Erro ao criar torneio da sessão para torneio planejado ${planned.id}:`, error);
          }
        }

        console.log(`🔍 CRIANDO SESSÃO COM: ${createdTournaments} torneios vinculados`);
        console.log(`🔍 SESSÃO CRIADA - ID: ${session.id}, User: ${userId}`);
        
        // Return session with tournament count info
        res.json({
          ...session,
          linkedTournaments: createdTournaments,
          dayOfWeek: currentDayOfWeek
        });
      } else {
        // Legacy behavior for backward compatibility
        const plannedTournaments = await storage.getSessionTournamentsByDay(userId, currentDayOfWeek);
        
        // Update each planned tournament to link it to this session
        for (const tournament of plannedTournaments) {
          if (tournament.id.startsWith('planned-')) {
            const actualId = tournament.id.replace('planned-', '');
            await storage.updatePlannedTournament(actualId, { sessionId: session.id });
          }
        }

        console.log(`Session ${session.id} created with ${plannedTournaments.length} linked tournaments`);
        res.json(session);
      }
    } catch (error) {
      console.error("❌ ETAPA 3 Error creating grind session:", error);
      res.status(400).json({ message: "Failed to create grind session" });
    }
  });

  app.put('/api/grind-sessions/:id', requireAuth, async (req: any, res) => {
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

  app.delete('/api/grind-sessions/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userPlatformId;

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
  app.get('/api/preparation-logs', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const logs = await storage.getPreparationLogs(userId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching preparation logs:", error);
      res.status(500).json({ message: "Failed to fetch preparation logs" });
    }
  });

  app.post('/api/preparation-logs', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const logData = insertPreparationLogSchema.parse({ ...req.body, userId });
      const log = await storage.createPreparationLog(logData);
      res.json(log);
    } catch (error) {
      console.error("Error creating preparation log:", error);
      res.status(400).json({ message: "Failed to create preparation log" });
    }
  });

  // Custom group routes
  app.get('/api/custom-groups', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const groups = await storage.getCustomGroups(userId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching custom groups:", error);
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
      console.error("Error creating custom group:", error);
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
      console.error("Error fetching coaching insights:", error);
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
      console.error("Error creating coaching insight:", error);
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
      console.error("Error updating coaching insight:", error);
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
      console.error("Error fetching user settings:", error);
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
      console.error("Error updating user settings:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(400).json({ message: "Failed to update user settings" });
    }
  });

  // File upload route with intelligent CSV parsing
  app.post('/api/upload-history', requireAuth, upload.single('file'), async (req: any, res) => {
    try {
      // 🚨 DEBUG CRÍTICO COMPLETO: RASTREAMENTO DO PROBLEMA USER-0001
      console.log('🚨 UPLOAD DEBUG CRÍTICO - Estado completo do req.user:', {
        'req.user objeto completo': req.user,
        'req.user.id': req.user?.id,
        'req.user.userId': req.user?.userId,
        'req.user.userPlatformId': req.user?.userPlatformId,
        'req.user.email': req.user?.email,
        'req.user.username': req.user?.username,
        'typeof req.user': typeof req.user,
        'hasUser': !!req.user,
        'Object.keys(req.user)': req.user ? Object.keys(req.user) : 'no user'
      });

      // 🚨 VALIDAÇÃO CRÍTICA DE SEGURANÇA - userPlatformId
      const userPlatformId = req.user?.userPlatformId;
      
      console.log('🚨 UPLOAD SECURITY CHECK - userPlatformId validation:', {
        'userPlatformId extraído': userPlatformId,
        'tipo do userPlatformId': typeof userPlatformId,
        'começa com USER-': userPlatformId?.startsWith('USER-'),
        'é string válida': typeof userPlatformId === 'string' && userPlatformId.length > 0,
        'email do usuário': req.user?.email,
        'username do usuário': req.user?.username
      });

      if (!userPlatformId || !userPlatformId.startsWith('USER-')) {
        console.error('🚨 UPLOAD ERROR - userPlatformId inválido:', userPlatformId);
        return res.status(401).json({ message: 'Invalid user platform ID' });
      }

      // 🚨 VALIDAÇÃO FINAL ANTES DO UPLOAD
      console.log('🚨 UPLOAD FINAL VALIDATION - Dados finais que serão usados:', {
        'userPlatformId que será usado': userPlatformId,
        'email que será usado': req.user?.email,
        'timestamp': new Date().toISOString()
      });

      if (!req.user) {
        console.error('🚨 UPLOAD ERROR - req.user is null/undefined');
        return res.status(401).json({ message: 'User not authenticated - req.user is null' });
      }

      if (!req.user.userPlatformId) {
        console.error('🚨 UPLOAD ERROR - req.user.userPlatformId is missing:', req.user.userPlatformId);
        return res.status(401).json({ message: 'User not authenticated - missing userPlatformId' });
      }

      const userId = userPlatformId; // Use userPlatformId consistently
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

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
          console.log(`🔍 UPLOAD DEBUG - Parsing Bodog XLSX com userPlatformId: ${userPlatformId}`);
          tournaments = await PokerCSVParser.parseBodogXLSX(file.buffer, userPlatformId, exchangeRates);
          
          // Check for duplicates in parsed tournaments
          const validTournaments = [];
          for (const tournament of tournaments) {
            const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);
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
            console.log(`🔍 UPLOAD DEBUG - Parsing Coin TXT com userPlatformId: ${userPlatformId}`);
            tournaments = await PokerCSVParser.parseCoinTXT(fileContent, userPlatformId, exchangeRates);
            
            // Check for duplicates in parsed tournaments
            const validTournaments = [];
            for (const tournament of tournaments) {
              const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);
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
            console.log(`🔍 UPLOAD DEBUG - Parsing CoinPoker CSV com userPlatformId: ${userPlatformId}`);
            tournaments = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);
            
            // Check for duplicates in parsed tournaments
            const validTournaments = [];
            for (const tournament of tournaments) {
              const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);
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
            console.log(`🔍 UPLOAD DEBUG - Parsing CSV genérico com userPlatformId: ${userPlatformId}`);
            const parseResult = await PokerCSVParser.parseCSVWithDuplicateCheck(fileContent, userPlatformId, exchangeRates, storage);
            
            // Check if there are duplicates
            if (parseResult.duplicateCount > 0) {
              // Return analysis with duplicates for user decision
              const duplicatesBySite = parseResult.duplicateTournaments.reduce((acc, tournament) => {
                acc[tournament.site] = (acc[tournament.site] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              
              return res.json({
                status: 'duplicates_found',
                validTournaments: parseResult.validTournaments,
                duplicateTournaments: parseResult.duplicateTournaments,
                duplicateCount: parseResult.duplicateCount,
                totalProcessed: parseResult.totalProcessed,
                duplicatesBySite,
                message: `Encontrados ${parseResult.duplicateCount} torneios duplicados de ${parseResult.totalProcessed} torneios processados`
              });
            }
            
            tournaments = parseResult.validTournaments;
            duplicatesIgnored = parseResult.duplicateCount;
            duplicateIds = parseResult.duplicateIds;
          }
        }

        if (tournaments.length === 0) {
          const debugInfo = isBodogFormat(file.originalname) 
            ? `Excel file: ${file.originalname}` 
            : `File content (first 500 chars): ${file.buffer.toString('utf-8').substring(0,500)}`;
          
          // 🚨 DEBUG CRÍTICO: LOG QUANDO NÃO HÁ TORNEIOS
          console.log(`🚨 UPLOAD DEBUG CRÍTICO - Nenhum torneio extraído:`, {
            'userPlatformId': userPlatformId,
            'duplicatesIgnored': duplicatesIgnored,
            'file.originalname': file.originalname,
            'CONFIRMAÇÃO': `USER ATUAL: ${userPlatformId}`
          });
          
          if (duplicatesIgnored > 0) {
            console.log(`🚨 UPLOAD DEBUG CRÍTICO - Duplicatas encontradas para user ${userPlatformId}: ${duplicatesIgnored} duplicates found`);
            return res.status(400).json({ 
              message: `No new tournaments to import. Found ${duplicatesIgnored} duplicate tournaments that were already imported to your account. If you want to re-import, please delete the existing data first.`,
              duplicatesIgnored: duplicatesIgnored,
              duplicateIds: duplicateIds.slice(0, 10) // Show first 10 duplicate IDs
            });
          } else {
            console.log(`🚨 UPLOAD DEBUG CRÍTICO - Nenhum dado válido encontrado para user ${userPlatformId}`);
            return res.status(400).json({ 
              message: "No valid tournament data found in file. Please ensure the file is from a supported poker site and contains valid tournament data.",
              // suggestion: "Please ensure your CSV has columns like: Tournament/Name, Buy-in, Prize/Winnings, Position, Date" // Original suggestion
            });
          }
        }

        // Remove duplicates and save tournaments to database
        const savedTournaments = [];
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // 🔍 FASE 1.4: VERIFICAR SE TOURNAMENTS TÊM USERID CORRETO
        const invalidTournaments = tournaments.filter(t => t.userId !== userPlatformId);
        if (invalidTournaments.length > 0) {
          console.error(`🚨 UPLOAD ERROR - Found ${invalidTournaments.length} tournaments with wrong userId:`, invalidTournaments.slice(0, 3));
          return res.status(500).json({ message: 'Internal error: Tournament data contains incorrect user identification' });
        }

        console.log(`✅ UPLOAD DEBUG - All ${tournaments.length} tournaments have correct userId: ${userPlatformId}`);

        for (const tournament of tournaments) {
          try {
            let isDuplicate = false;

            // 🎯 ETAPA 2.3 - CORRIGIR SISTEMA DE DUPLICATAS: usar userPlatformId
            // Special handling for Bodog Reference ID verification
            if (tournament.site === 'Bodog') {
              // Extract Reference ID from tournament name format: "MTT Bodog [REF123]"
              const refIdMatch = tournament.name.match(/\[([^\]]+)\]/);
              if (refIdMatch) {
                const referenceId = refIdMatch[1];
                isDuplicate = await storage.isBodogTournamentExists(userPlatformId, referenceId);

                if (isDuplicate) {
                  console.log(`✓ Skipped: Bodog tournament with Reference ID ${referenceId} already exists for ${userPlatformId}`);
                  skippedCount++;
                  continue;
                }
              }
            } else {
              // Use standard duplicate check for other sites
              isDuplicate = await storage.isDuplicateTournament(userPlatformId, {
                name: tournament.name,
                datePlayed: tournament.datePlayed,
                buyIn: tournament.buyIn,
                position: tournament.position,
                fieldSize: tournament.fieldSize,
                site: tournament.site
              });
            }

            if (!isDuplicate) {
              // 🔍 FASE 1.5: FORÇAR ASSOCIAÇÃO COM USUÁRIO LOGADO
              // Convert ParsedTournament to InsertTournament format
              const tournamentData = {
                userId: userPlatformId, // 🔍 SEMPRE usar userPlatformId do token JWT, nunca dados do CSV
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

        // 📊 PERSISTÊNCIA DO UPLOAD HISTORY - Salvar no banco de dados
        try {
          console.log('✅ UPLOAD DEBUG - Saving upload history for user:', userPlatformId);
          
          // 🔍 FASE 1.6: USAR userPlatformId para isolamento de dados
          // Limpar registros antigos primeiro - manter apenas os últimos 4
          const existingHistory = await db
            .select()
            .from(uploadHistory)
            .where(eq(uploadHistory.userId, userPlatformId))
            .orderBy(desc(uploadHistory.uploadDate));
          
          if (existingHistory.length >= 5) {
            const toDelete = existingHistory.slice(4);
            for (const record of toDelete) {
              await db
                .delete(uploadHistory)
                .where(eq(uploadHistory.id, record.id));
            }
            console.log('📊 Cleaned up old history records:', toDelete.length);
          }
          
          // Criar novo registro
          const [newRecord] = await db
            .insert(uploadHistory)
            .values({
              id: nanoid(),
              userId: userPlatformId, // 🔍 FASE 1.6: Sempre usar userPlatformId
              filename: file.originalname,
              status: successCount > 0 ? 'success' : 'error',
              tournamentsCount: successCount,
              errorMessage: errorCount > 0 ? `${errorCount} erros de salvamento` : null,
              uploadDate: new Date(),
            })
            .returning();
          
          console.log(`✅ UPLOAD DEBUG - Upload history saved: ${file.originalname} - ${successCount} tournaments`);
        } catch (historyError) {
          console.error('🚨 UPLOAD ERROR - Error saving upload history:', historyError);
          // Não bloquear a resposta se houver erro no histórico
        }

        console.log(`✅ UPLOAD DEBUG - Upload completed for user ${userPlatformId}: ${successCount} tournaments imported, ${skippedCount} duplicates skipped`);
        
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
        console.error(`🚨 UPLOAD ERROR - CSV parsing error for user ${userPlatformId}:`, parseError.message, parseError.stack);
        // Log file information for debugging
        const debugInfo = isBodogFormat(file.originalname) 
          ? `Excel file: ${file.originalname}` 
          : `File content (first 500 chars): ${file.buffer.toString('utf-8').substring(0,500)}`;
        console.error(`🚨 UPLOAD ERROR - Problematic file for user ${userPlatformId}: ${debugInfo}`);
        
        // 📊 PERSISTÊNCIA DO UPLOAD HISTORY - Salvar erro no banco
        try {
          console.log('🔍 UPLOAD DEBUG - Saving error upload history for user:', userPlatformId);
          
          // 🔍 FASE 1.7: USAR userPlatformId para isolamento de dados
          // Limpar registros antigos primeiro
          const existingHistory = await db
            .select()
            .from(uploadHistory)
            .where(eq(uploadHistory.userId, userPlatformId))
            .orderBy(desc(uploadHistory.uploadDate));
          
          if (existingHistory.length >= 5) {
            const toDelete = existingHistory.slice(4);
            for (const record of toDelete) {
              await db
                .delete(uploadHistory)
                .where(eq(uploadHistory.id, record.id));
            }
          }
          
          // Criar registro de erro
          await db
            .insert(uploadHistory)
            .values({
              id: nanoid(),
              userId: userPlatformId, // 🔍 FASE 1.7: Sempre usar userPlatformId
              filename: file.originalname,
              status: 'error',
              tournamentsCount: 0,
              errorMessage: parseError instanceof Error ? parseError.message : "Unknown parsing error",
              uploadDate: new Date(),
            });
          
          console.log(`✓ Upload history saved (error): ${file.originalname}`);
        } catch (historyError) {
          console.error('Error saving upload history:', historyError);
        }

        res.status(400).json({ 
          message: "Failed to parse CSV file. Please ensure it is a valid CSV and the format is supported.",
          error: parseError instanceof Error ? parseError.message : "Unknown parsing error.",
          suggestion: "Verify encoding (UTF-8 preferred), delimiter (comma expected), and that all necessary columns are present."
        });
      }
    } catch (error: any) {
      console.error(`🚨 UPLOAD ERROR - General error during file upload for user ${req.user?.userPlatformId || 'unknown'}:`, error.message, error.stack);
      res.status(500).json({
        message: "Failed to upload file due to a server error.",
        error: error.message
      });
    }
  });

  // New endpoint for handling duplicate decisions
  app.post('/api/upload-with-duplicates', requireAuth, async (req: any, res) => {
    try {
      const userPlatformId = req.user?.userPlatformId;
      
      if (!userPlatformId || !userPlatformId.startsWith('USER-')) {
        return res.status(401).json({ message: 'Invalid user platform ID' });
      }

      const { action, validTournaments, duplicateTournaments, fileName } = req.body;
      
      console.log(`🔍 UPLOAD WITH DUPLICATES - User ${userPlatformId} escolheu: ${action}`);
      console.log(`🔍 UPLOAD WITH DUPLICATES - Válidos: ${validTournaments.length}, Duplicatas: ${duplicateTournaments.length}`);

      let tournamentsToSave = [];
      let actionMessage = '';

      switch (action) {
        case 'importNew':
          tournamentsToSave = validTournaments;
          actionMessage = `Importados apenas ${validTournaments.length} torneios novos. ${duplicateTournaments.length} duplicatas ignoradas.`;
          break;
          
        case 'importAll':
          // First, delete existing duplicates
          for (const duplicate of duplicateTournaments) {
            if (duplicate.tournamentId) {
              await db.delete(tournaments)
                .where(and(
                  eq(tournaments.userId, userPlatformId),
                  eq(tournaments.tournamentId, duplicate.tournamentId)
                ));
            } else {
              // Fallback deletion by name + date + buyin
              await db.delete(tournaments)
                .where(and(
                  eq(tournaments.userId, userPlatformId),
                  eq(tournaments.name, duplicate.name),
                  eq(tournaments.datePlayed, duplicate.datePlayed),
                  sql`ABS(CAST(${tournaments.buyIn} AS DECIMAL) - ${duplicate.buyIn}) < 0.01`
                ));
            }
          }
          tournamentsToSave = [...validTournaments, ...duplicateTournaments];
          actionMessage = `Importados ${tournamentsToSave.length} torneios (${duplicateTournaments.length} duplicatas sobrescritas).`;
          break;
          
        case 'cancel':
          return res.json({
            success: true,
            message: 'Importação cancelada pelo usuário.',
            tournamentsImported: 0,
            duplicatesProcessed: 0
          });
          
        default:
          return res.status(400).json({ message: 'Ação inválida' });
      }

      // Save tournaments to database
      const savedTournaments = [];
      let successCount = 0;
      let errorCount = 0;

      for (const tournament of tournamentsToSave) {
        try {
          const savedTournament = await storage.createTournament(tournament);
          savedTournaments.push(savedTournament);
          successCount++;
        } catch (error) {
          console.error(`Error saving tournament: ${tournament.name}`, error);
          errorCount++;
        }
      }

      // Save upload history
      const uploadData = {
        id: nanoid(),
        userId: userPlatformId,
        fileName: fileName || 'unknown',
        fileType: 'csv',
        status: 'completed',
        tournamentsImported: successCount,
        duplicatesFound: duplicateTournaments.length,
        processingTime: 0,
        createdAt: new Date()
      };

      await storage.createUploadHistory(uploadData);
      
      console.log(`🔍 UPLOAD WITH DUPLICATES - Resultado: ${successCount} salvos, ${errorCount} erros`);

      res.json({
        success: true,
        message: actionMessage,
        tournamentsImported: successCount,
        duplicatesProcessed: duplicateTournaments.length,
        errors: errorCount
      });

    } catch (error) {
      console.error('Error in upload-with-duplicates:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Exchange rates endpoints
  app.post('/api/settings/exchange-rates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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
  app.get('/api/settings/exchange-rates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const settings = await storage.getUserSettings(userId);

      const exchangeRates = settings?.exchangeRates || { CNY: 7.20, EUR: 0.92 };
      res.json(exchangeRates);
    } catch (error) {
      console.error('Get exchange rates error:', error);
      res.status(500).json({ message: 'Failed to get exchange rates' });
    }
  });

  // 📊 UPLOAD HISTORY ENDPOINTS - Persistência do histórico de upload
  app.get('/api/upload-history', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      console.log('📊 Fetching upload history for user:', userId);
      
      // Buscar os últimos 5 registros diretamente do banco
      const history = await db
        .select()
        .from(uploadHistory)
        .where(eq(uploadHistory.userId, userId))
        .orderBy(desc(uploadHistory.uploadDate))
        .limit(5);
      
      console.log('📊 Upload history found:', history.length, 'records');
      res.json(history);
    } catch (error) {
      console.error('Error fetching upload history:', error);
      res.status(500).json({ message: 'Failed to fetch upload history' });
    }
  });

  app.delete('/api/upload-history/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;
      
      const deleted = await storage.deleteUploadHistory(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: 'Upload history not found' });
      }
      
      res.json({ message: 'Upload history deleted successfully' });
    } catch (error) {
      console.error('Error deleting upload history:', error);
      res.status(500).json({ message: 'Failed to delete upload history' });
    }
  });

  // Break feedback routes
  app.get('/api/break-feedbacks', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sessionId = req.query.sessionId;
      const feedbacks = await storage.getBreakFeedbacks(userId, sessionId);
      res.json(feedbacks);
    } catch (error) {
      console.error("Error fetching break feedbacks:", error);
      res.status(500).json({ message: "Failed to fetch break feedbacks" });
    }
  });

  app.post('/api/break-feedbacks', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

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
  app.get('/api/session-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sessionId = req.query.sessionId;
      
      console.log('🔍 SESSION TOURNAMENTS DEBUG - Request received');
      console.log('🔍 SESSION TOURNAMENTS DEBUG - userId:', userId);
      console.log('🔍 SESSION TOURNAMENTS DEBUG - sessionId:', sessionId);
      console.log('🔍 SESSION TOURNAMENTS DEBUG - query params:', req.query);
      
      const tournaments = await storage.getSessionTournaments(userId, sessionId);
      
      console.log('🔍 SESSION TOURNAMENTS DEBUG - Tournaments found:', tournaments.length);
      console.log('🔍 SESSION TOURNAMENTS DEBUG - Tournaments data:', tournaments);
      
      res.json(tournaments);
    } catch (error) {
      console.error("Error fetching session tournaments:", error);
      res.status(500).json({ message: "Failed to fetch session tournaments" });
    }
  });

  app.get('/api/session-tournaments/by-day/:dayOfWeek', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const dayOfWeek = parseInt(req.params.dayOfWeek);
      
      console.log('🔍 ENDPOINT - session-tournaments/by-day called with:', { userId, dayOfWeek });
      
      const tournaments = await storage.getSessionTournamentsByDay(userId, dayOfWeek);
      
      console.log('🔍 ENDPOINT - Tournaments returned by storage:', tournaments.length);
      console.log('🔍 ENDPOINT - Sample tournament data:', tournaments[0] || 'none');
      
      res.json(tournaments);
    } catch (error) {
      console.error("Error fetching session tournaments by day:", error);
      res.status(500).json({ message: "Failed to fetch session tournaments" });
    }
  });

  app.post('/api/session-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

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

  app.put('/api/session-tournaments/:id', requireAuth, async (req: any, res) => {
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

  app.delete('/api/session-tournaments/:id', requireAuth, async (req: any, res) => {
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
      console.error("Error fetching study cards:", error);
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
      console.error("Error creating study card:", error);
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
      console.error("Error fetching study card:", error);
      res.status(500).json({ message: "Failed to fetch study card" });
    }
  });

  app.patch('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      const studyCard = await storage.updateStudyCard(req.params.id, req.body);
      res.json(studyCard);
    } catch (error) {
      console.error("Error updating study card:", error);
      res.status(400).json({ message: "Failed to update study card" });
    }
  });

  app.delete('/api/study-cards/:id', requireAuth, async (req: any, res) => {
    try {
      await storage.deleteStudyCard(req.params.id);
      res.json({ message: "Study card deleted successfully" });
    } catch (error) {
      console.error("Error deleting study card:", error);
      res.status(500).json({ message: "Failed to delete study card" });
    }
  });

  // Study Materials API routes
  app.get('/api/study-cards/:id/materials', requireAuth, async (req: any, res) => {
    try {
      const materials = await storage.getStudyMaterials(req.params.id);
      res.json(materials);
    } catch (error) {
      console.error("Error fetching study materials:", error);
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
      console.error("Error creating study material:", error);
      res.status(400).json({ message: "Failed to create study material" });
    }
  });

  // Study Notes API routes
  app.get('/api/study-cards/:id/notes', requireAuth, async (req: any, res) => {
    try {
      const notes = await storage.getStudyNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching study notes:", error);
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
      console.error("Error creating study note:", error);
      res.status(400).json({ message: "Failed to create study note" });
    }
  });



  // Study Sessions API routes
  app.get('/api/study-sessions', requireAuth, async (req: any, res) => {
    try {
      const sessions = await storage.getStudySessions(req.user.userPlatformId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching study sessions:", error);
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
      console.error("Error creating study session:", error);
      res.status(400).json({ message: "Failed to create study session" });
    }
  });

  // Active Days API routes
  app.get('/api/active-days', requireAuth, async (req: any, res) => {
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

  app.post('/api/active-days/toggle', requireAuth, async (req: any, res) => {
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
        updatedAt: new Date(),
      });

      res.json(updatedCard);
    } catch (error) {
      console.error("Error updating study progress:", error);
      res.status(400).json({ message: "Failed to update study progress" });
    }
  });

  // Calendário Inteligente routes
  app.get('/api/weekly-routine', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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

  app.post('/api/weekly-routine/generate', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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

  app.get('/api/study-schedules', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const schedules = await storage.getStudySchedules(userId);
      res.json(schedules);
    } catch (error) {
      console.error('Error fetching study schedules:', error);
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
      console.error('Error creating study schedule:', error);
      res.status(400).json({ message: 'Failed to create study schedule' });
    }
  });

  // Calendar Categories routes
  app.get('/api/calendar-categories', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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

  app.post('/api/calendar-categories', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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

  app.put('/api/calendar-categories/:id', requireAuth, async (req: any, res) => {
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

  app.delete('/api/calendar-categories/:id', requireAuth, async (req: any, res) => {
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
  app.get('/api/calendar-events', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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

  app.post('/api/calendar-events', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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

  app.put('/api/calendar-events/:id', requireAuth, async (req: any, res) => {
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
        const event = await storage.getCalendarEvents(req.user.userPlatformId);
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

  app.delete('/api/calendar-events/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { deleteType } = req.query; // 'single' or 'series'

      if (deleteType === 'series') {
        // Find the parent event ID
        const events = await storage.getCalendarEvents(req.user.userPlatformId);
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
  app.get('/api/session-tournaments/weekly-suggestions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
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

  // ===== BUG REPORTS ROUTES =====

  // Create bug report
  app.post('/api/bug-reports', requireAuth, async (req, res) => {
    try {
      const bugReportData = insertBugReportSchema.parse({
        ...req.body,
        userId: req.user!.userPlatformId
      });
      
      const bugReport = await storage.createBugReport(bugReportData);
      console.log('🐛 Bug report created:', bugReport.id);
      res.status(201).json(bugReport);
    } catch (error) {
      console.error('Error creating bug report:', error);
      res.status(500).json({ message: 'Falha ao criar relatório de bug' });
    }
  });

  // Get all bug reports (admin only)
  app.get('/api/bug-reports', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const bugReports = await storage.getBugReports();
      res.json(bugReports);
    } catch (error) {
      console.error('Error fetching bug reports:', error);
      res.status(500).json({ message: 'Falha ao buscar relatórios de bug' });
    }
  });

  // Get user's bug reports
  app.get('/api/bug-reports/my', requireAuth, async (req, res) => {
    try {
      const bugReports = await storage.getBugReportsByUser(req.user!.userPlatformId);
      res.json(bugReports);
    } catch (error) {
      console.error('Error fetching user bug reports:', error);
      res.status(500).json({ message: 'Falha ao buscar seus relatórios de bug' });
    }
  });

  // Get bug report statistics (admin only) - MUST come before /:id route
  app.get('/api/bug-reports/stats', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      console.log('📊 Buscando estatísticas de bug reports...');
      const stats = await storage.getBugReportStats();
      console.log('📊 Estatísticas encontradas:', stats);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching bug report stats:', error);
      res.status(500).json({ message: 'Falha ao buscar estatísticas de bug reports' });
    }
  });

  // Get bug report by ID
  app.get('/api/bug-reports/:id', requireAuth, async (req, res) => {
    try {
      const bugReport = await storage.getBugReportById(req.params.id);
      if (!bugReport) {
        return res.status(404).json({ message: 'Relatório de bug não encontrado' });
      }
      
      // Users can only see their own reports, admins can see all
      const hasPermission = req.user!.permissions.includes('admin_full') || 
                           bugReport.userId === req.user!.userPlatformId;
      
      if (!hasPermission) {
        return res.status(403).json({ message: 'Acesso negado' });
      }
      
      res.json(bugReport);
    } catch (error) {
      console.error('Error fetching bug report:', error);
      res.status(500).json({ message: 'Falha ao buscar relatório de bug' });
    }
  });

  // Update bug report (admin only)
  app.put('/api/bug-reports/:id', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const updates = req.body;
      const bugReport = await storage.updateBugReport(req.params.id, updates);
      console.log('🐛 Bug report updated:', bugReport.id);
      res.json(bugReport);
    } catch (error) {
      console.error('Error updating bug report:', error);
      res.status(500).json({ message: 'Falha ao atualizar relatório de bug' });
    }
  });

  // Delete bug report (admin only)
  app.delete('/api/bug-reports/:id', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      await storage.deleteBugReport(req.params.id);
      console.log('🐛 Bug report deleted:', req.params.id);
      res.json({ message: 'Relatório de bug excluído com sucesso' });
    } catch (error) {
      console.error('Error deleting bug report:', error);
      res.status(500).json({ message: 'Falha ao excluir relatório de bug' });
    }
  });

  // The stats route has been moved above the /:id route to fix routing conflict

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

      // Generate user platform ID
      const userPlatformId = await AuthService.generateNextUserPlatformId();

      // Create user
      const [newUser] = await db.insert(users).values({
        id: nanoid(),
        userPlatformId,
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
      const { accessToken, refreshToken } = AuthService.generateTokens(newUser.id, newUser.userPlatformId!, newUser.email);

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
        payload.userPlatformId,
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
      await AuthService.logAccess(req.user!.userPlatformId, 'logout', 'success');
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ message: 'Logout failed' });
    }
  });

  // ============== ANALYTICS ENDPOINTS ==============

  // User Analytics - ETAPA 2.1
  app.get('/api/analytics/users', requireAuth, requirePermission('user_analytics'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const userId = req.user!.userPlatformId;
      
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch(period) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

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
          isActive: sql<boolean>`${max(userActivity.createdAt)} > NOW() - INTERVAL '7 days'`
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
      console.error('Error fetching user analytics:', error);
      res.status(500).json({ message: 'Erro ao buscar analytics de usuários' });
    }
  });

  // Feature Analytics - ETAPA 2.2
  app.get('/api/analytics/features', requireAuth, requirePermission('analytics_access'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch(period) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

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
      console.error('Error fetching feature analytics:', error);
      res.status(500).json({ message: 'Erro ao buscar analytics de funcionalidades' });
    }
  });

  // Executive Reports - ETAPA 2.3
  app.get('/api/analytics/executive', requireAuth, requirePermission('executive_reports'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch(period) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

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
      console.error('Error fetching executive analytics:', error);
      res.status(500).json({ message: 'Erro ao buscar relatórios executivos' });
    }
  });

  // User Activity Log - for detailed tracking
  app.get('/api/analytics/activity', requireAuth, requirePermission('user_analytics'), async (req, res) => {
    try {
      const { period = '30d', userId = 'all' } = req.query;
      
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch(period) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

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
        .leftJoin(users, eq(userActivity.userId, users.id))
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
      console.error('Error fetching user activity:', error);
      res.status(500).json({ message: 'Erro ao buscar atividade de usuários' });
    }
  });

  // Track user activity (POST endpoint for logging activity)
  app.post('/api/analytics/track', requireAuth, async (req, res) => {
    try {
      const { page, action, feature, duration, metadata } = req.body;
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
      console.error('Error tracking activity:', error);
      res.status(500).json({ message: 'Erro ao rastrear atividade' });
    }
  });

  // FASE 3: UX ADMIN OTIMIZADA - ETAPA 3.1: Dashboard Admin Intuitivo
  app.get('/api/admin/dashboard-stats', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Estatísticas básicas de usuários
      const [totalUsers, activeUsers, inactiveUsers, blockedUsers] = await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(users).where(eq(users.status, 'active')),
        db.select({ count: count() }).from(users).where(eq(users.status, 'inactive')),
        db.select({ count: count() }).from(users).where(eq(users.status, 'blocked'))
      ]);
      
      // Usuários criados nas últimas 24h e 7 dias
      const [newUsers24h, newUsers7d] = await Promise.all([
        db.select({ count: count() }).from(users).where(gte(users.createdAt, last24h)),
        db.select({ count: count() }).from(users).where(gte(users.createdAt, last7d))
      ]);
      
      // Usuários online agora (atividade nos últimos 5 minutos)
      const last5min = new Date(now.getTime() - 5 * 60 * 1000);
      const onlineUsers = await db.select({
        userId: sql<string>`DISTINCT ${userActivity.userId}`,
        count: count()
      }).from(userActivity)
        .where(gte(userActivity.createdAt, last5min))
        .groupBy(userActivity.userId);
      
      // Atividade por hora nas últimas 24h
      const hourlyActivity = await db.select({
        hour: sql<number>`EXTRACT(HOUR FROM ${userActivity.createdAt})`,
        activity: count()
      }).from(userActivity)
        .where(gte(userActivity.createdAt, last24h))
        .groupBy(sql`EXTRACT(HOUR FROM ${userActivity.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${userActivity.createdAt})`);
      
      // Top usuários mais ativos
      const topActiveUsers = await db.select({
        userId: userActivity.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        activityCount: count(userActivity.id)
      }).from(userActivity)
        .leftJoin(users, eq(userActivity.userId, users.id))
        .where(gte(userActivity.createdAt, last7d))
        .groupBy(userActivity.userId, users.email, users.firstName, users.lastName)
        .orderBy(desc(count(userActivity.id)))
        .limit(10);
      
      res.json({
        totalUsers: Number(totalUsers[0]?.count || 0),
        activeUsers: Number(activeUsers[0]?.count || 0),
        inactiveUsers: Number(inactiveUsers[0]?.count || 0),
        blockedUsers: Number(blockedUsers[0]?.count || 0),
        newUsers24h: Number(newUsers24h[0]?.count || 0),
        newUsers7d: Number(newUsers7d[0]?.count || 0),
        onlineUsers: onlineUsers.length,
        onlineUsersList: onlineUsers,
        hourlyActivity: hourlyActivity.map(item => ({
          hour: Number(item.hour),
          activity: Number(item.activity)
        })),
        topActiveUsers: topActiveUsers.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          activityCount: Number(user.activityCount)
        }))
      });
    } catch (error) {
      console.error('Error fetching admin dashboard stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas do painel admin' });
    }
  });

  // ETAPA 3.2: Gestão Rápida de Permissões - Profiles predefinidos
  app.get('/api/admin/permission-profiles', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const profiles = {
        'basico': {
          name: 'Básico',
          description: 'Funcionalidades essenciais para usuários iniciantes',
          permissions: ['dashboard_access', 'upload_access', 'performance_access'],
          color: '#10B981'
        },
        'premium': {
          name: 'Premium',
          description: 'Acesso completo a ferramentas de análise e estudos',
          permissions: [
            'dashboard_access', 'upload_access', 'performance_access',
            'studies_access', 'grind_access', 'warm_up_access',
            'grade_planner_access', 'weekly_planner_access',
            'mental_prep_access', 'grind_session_access'
          ],
          color: '#3B82F6'
        },
        'pro': {
          name: 'Pro',
          description: 'Todas as funcionalidades incluindo analytics avançados',
          permissions: [
            'dashboard_access', 'upload_access', 'performance_access',
            'studies_access', 'grind_access', 'warm_up_access',
            'grade_planner_access', 'weekly_planner_access',
            'mental_prep_access', 'grind_session_access',
            'analytics_access', 'user_analytics'
          ],
          color: '#8B5CF6'
        },
        'admin': {
          name: 'Admin',
          description: 'Acesso administrativo completo ao sistema',
          permissions: [
            'admin_full', 'user_management', 'system_config',
            'dashboard_access', 'analytics_access', 'user_analytics',
            'executive_reports', 'studies_access', 'grind_access',
            'warm_up_access', 'upload_access', 'grade_planner_access',
            'weekly_planner_access', 'performance_access',
            'mental_prep_access', 'grind_session_access'
          ],
          color: '#EF4444'
        }
      };
      
      res.json(profiles);
    } catch (error) {
      console.error('Error fetching permission profiles:', error);
      res.status(500).json({ message: 'Erro ao buscar perfis de permissões' });
    }
  });

  // Aplicar perfil de permissões em lote
  app.post('/api/admin/apply-permissions-batch', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userIds, profileName, permissions } = req.body;
      
      console.log('🔧 BATCH PERMISSIONS DEBUG - Dados recebidos:');
      console.log('📋 User IDs:', userIds);
      console.log('📋 Profile Name:', profileName);
      console.log('📋 Permissions:', permissions);
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'Lista de usuários é obrigatória' });
      }
      
      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ message: 'Lista de permissões é obrigatória' });
      }
      
      // ETAPA 1: Filtrar permissões válidas
      const validPermissions = permissions.filter(p => p !== null && p !== undefined && p !== '');
      console.log('✅ Permissões válidas após filtro:', validPermissions);
      
      if (validPermissions.length === 0) {
        return res.status(400).json({ message: 'Nenhuma permissão válida fornecida' });
      }
      
      // ETAPA 2: Buscar IDs das permissões na tabela permissions usando SQL raw
      console.log('🔍 QUERY DEBUG - Buscando permissões com nomes:', validPermissions);
      
      // Solução definitiva: usar SQL raw para contornar problemas do Drizzle ORM
      const permissionNames = validPermissions.map(name => `'${name}'`).join(', ');
      const query = `SELECT id, name, description, created_at FROM permissions WHERE name IN (${permissionNames})`;
      console.log('🔍 SQL DEBUG - Query executada:', query);
      
      const permissionResult = await db.execute(sql.raw(query));
      const permissionRows = permissionResult.rows || permissionResult;
      
      console.log('🔍 Permissões encontradas no banco:', permissionRows);
      
      if (permissionRows.length !== validPermissions.length) {
        const foundNames = permissionRows.map((p: any) => p.name);
        const missingNames = validPermissions.filter(name => !foundNames.includes(name));
        console.log('❌ Permissões não encontradas:', missingNames);
        return res.status(400).json({ 
          message: 'Algumas permissões não foram encontradas no sistema',
          missing: missingNames
        });
      }
      
      // ETAPA 3: Remover permissões existentes dos usuários usando SQL raw
      console.log('🗑️ Removendo permissões existentes...');
      
      for (const userId of userIds) {
        console.log(`🗑️ Removendo permissões do usuário: ${userId}`);
        const deleteQuery = `DELETE FROM user_permissions WHERE user_id = '${userId}'`;
        await db.execute(sql.raw(deleteQuery));
      }
      
      // ETAPA 4: Inserir novas permissões usando SQL raw
      console.log('✅ Inserindo novas permissões...');
      
      let insertedCount = 0;
      for (const userId of userIds) {
        for (const permissionRecord of permissionRows) {
          const insertQuery = `
            INSERT INTO user_permissions (id, user_id, permission_id, granted, created_at, updated_at)
            VALUES ('${nanoid()}', '${userId}', '${permissionRecord.id}', true, NOW(), NOW())
          `;
          await db.execute(sql.raw(insertQuery));
          insertedCount++;
        }
      }
      
      console.log(`✅ ${insertedCount} permissões inseridas com sucesso via SQL raw`);
      
      // ETAPA 6: Log da ação
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: 'batch_permission_update',
        status: 'success',
        ipAddress: req.ip || 'unknown',
        timestamp: new Date(),
        details: `Aplicou perfil ${profileName} para ${userIds.length} usuários`
      });
      
      res.json({ 
        message: `Permissões aplicadas com sucesso para ${userIds.length} usuários`,
        updatedUsers: userIds.length,
        profile: profileName,
        appliedPermissions: validPermissions
      });
    } catch (error) {
      console.error('💥 Error applying permissions batch:', error);
      res.status(500).json({ message: 'Erro ao aplicar permissões em lote' });
    }
  });

  // ETAPA 3.3: Painel de Monitoramento - Sistema de alerts CORRIGIDO
  app.get('/api/admin/monitoring', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const now = new Date();
      const last5min = new Date(now.getTime() - 5 * 60 * 1000);
      const last1h = new Date(now.getTime() - 60 * 60 * 1000);
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Usuários online agora - CORRIGIDO
      const onlineUsers = await db.select({
        userId: userActivity.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        lastActivity: max(userActivity.createdAt)
      }).from(userActivity)
        .leftJoin(users, eq(userActivity.userId, users.id))
        .where(gte(userActivity.createdAt, last5min))
        .groupBy(userActivity.userId, users.email, users.firstName, users.lastName)
        .orderBy(desc(max(userActivity.createdAt)));
      
      // Atividade em tempo real (últimos 5 minutos) - CORRIGIDO
      const realtimeActivity = await db.select({
        id: userActivity.id,
        userId: userActivity.userId,
        email: users.email,
        page: userActivity.page,
        action: userActivity.action,
        feature: userActivity.feature,
        createdAt: userActivity.createdAt
      }).from(userActivity)
        .leftJoin(users, eq(userActivity.userId, users.id))
        .where(gte(userActivity.createdAt, last5min))
        .orderBy(desc(userActivity.createdAt))
        .limit(20);
      
      // Detecção de problemas/alerts - CORRIGIDO
      const alerts = [];
      
      // Alert: Muitos usuários inativos - CORRIGIDO
      const inactiveCount = await db.select({ count: count() }).from(users)
        .where(eq(users.status, 'inactive'));
      if (Number(inactiveCount[0]?.count || 0) > 10) {
        alerts.push({
          type: 'warning',
          title: 'Muitos usuários inativos',
          message: `${inactiveCount[0]?.count} usuários estão com status inativo`,
          timestamp: now
        });
      }
      
      // Alert: Baixa atividade nas últimas 24h - CORRIGIDO
      const activityLast24h = await db.select({ count: count() }).from(userActivity)
        .where(gte(userActivity.createdAt, last24h));
      if (Number(activityLast24h[0]?.count || 0) < 50) {
        alerts.push({
          type: 'info',
          title: 'Baixa atividade detectada',
          message: `Apenas ${activityLast24h[0]?.count} ações nas últimas 24h`,
          timestamp: now
        });
      }
      
      // Performance do sistema - contagem de erros - CORRIGIDO
      const errorLogs = await db.select({ count: count() }).from(accessLogs)
        .where(and(
          eq(accessLogs.status, 'failed'),
          gte(accessLogs.timestamp, last1h)
        ));
        
      if (Number(errorLogs[0]?.count || 0) > 10) {
        alerts.push({
          type: 'error',
          title: 'Muitos erros detectados',
          message: `${errorLogs[0]?.count} erros na última hora`,
          timestamp: now
        });
      }
      
      // Métricas do sistema - CORRIGIDO SEPARADAMENTE
      const totalUsersResult = await db.select({ count: count() }).from(users);
      const activeUsersResult = await db.select({ count: count() }).from(users).where(eq(users.status, 'active'));
      const activityLast1hResult = await db.select({ count: count() }).from(userActivity).where(gte(userActivity.createdAt, last1h));
      
      res.json({
        onlineUsers: onlineUsers.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          lastActivity: user.lastActivity
        })),
        realtimeActivity: realtimeActivity.map(activity => ({
          id: activity.id,
          userId: activity.userId,
          email: activity.email,
          page: activity.page,
          action: activity.action,
          feature: activity.feature,
          createdAt: activity.createdAt
        })),
        alerts,
        systemHealth: {
          totalUsers: totalUsersResult,
          activeUsers: activeUsersResult,
          activityLast1h: activityLast1hResult,
          errorRate: Number(errorLogs[0]?.count || 0)
        }
      });
    } catch (error) {
      console.error('Error fetching monitoring data:', error);
      res.status(500).json({ message: 'Erro ao buscar dados de monitoramento' });
    }
  });

  // ===== SUBSCRIPTION MANAGEMENT ROUTES =====
  
  // Get all subscription plans
  app.get('/api/subscription-plans', async (req, res) => {
    try {
      const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
      res.json(plans);
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
      res.status(500).json({ message: 'Erro ao buscar planos de assinatura' });
    }
  });

  // Get user's current subscription
  app.get('/api/subscriptions/current', requireAuth, async (req, res) => {
    try {
      const subscription = await db.select({
        id: userSubscriptions.id,
        planId: userSubscriptions.planId,
        status: userSubscriptions.status,
        startDate: userSubscriptions.startDate,
        endDate: userSubscriptions.endDate,
        autoRenew: userSubscriptions.autoRenew,
        planName: subscriptionPlans.name,
        planDescription: subscriptionPlans.description,
        planPrice: subscriptionPlans.price,
        planFeatures: subscriptionPlans.features
      })
      .from(userSubscriptions)
      .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(eq(userSubscriptions.userId, req.user!.userPlatformId))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

      if (subscription.length === 0) {
        return res.json({ subscription: null });
      }

      res.json({ subscription: subscription[0] });
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      res.status(500).json({ message: 'Erro ao buscar assinatura do usuário' });
    }
  });

  // Create new subscription
  app.post('/api/subscriptions', requireAuth, async (req, res) => {
    try {
      const { planId, paymentMethod, paymentId } = req.body;
      
      // Validate plan exists
      const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
      if (plan.length === 0) {
        return res.status(404).json({ message: 'Plano não encontrado' });
      }

      // Calculate end date
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + plan[0].durationDays);

      // Create subscription
      const subscriptionData = {
        id: nanoid(),
        userId: req.user!.userPlatformId,
        planId,
        status: 'active',
        startDate,
        endDate,
        autoRenew: false,
        paymentMethod,
        paymentId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.insert(userSubscriptions).values(subscriptionData);

      // Apply plan permissions to user
      await applyPlanPermissions(req.user!.userPlatformId, planId);

      console.log('✅ Subscription created:', subscriptionData.id);
      res.status(201).json({ message: 'Assinatura criada com sucesso', subscriptionId: subscriptionData.id });
    } catch (error) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ message: 'Erro ao criar assinatura' });
    }
  });

  // Update subscription
  app.put('/api/subscriptions/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { autoRenew } = req.body;

      // Verify subscription belongs to user
      const subscription = await db.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.id, id), eq(userSubscriptions.userId, req.user!.userPlatformId)));

      if (subscription.length === 0) {
        return res.status(404).json({ message: 'Assinatura não encontrada' });
      }

      // Update subscription
      await db.update(userSubscriptions)
        .set({ autoRenew, updatedAt: new Date() })
        .where(eq(userSubscriptions.id, id));

      res.json({ message: 'Assinatura atualizada com sucesso' });
    } catch (error) {
      console.error('Error updating subscription:', error);
      res.status(500).json({ message: 'Erro ao atualizar assinatura' });
    }
  });

  // Cancel subscription
  app.delete('/api/subscriptions/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verify subscription belongs to user
      const subscription = await db.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.id, id), eq(userSubscriptions.userId, req.user!.userPlatformId)));

      if (subscription.length === 0) {
        return res.status(404).json({ message: 'Assinatura não encontrada' });
      }

      // Update subscription status to cancelled
      await db.update(userSubscriptions)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(userSubscriptions.id, id));

      // Remove permissions
      await removeUserPermissions(req.user!.userPlatformId);

      res.json({ message: 'Assinatura cancelada com sucesso' });
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      res.status(500).json({ message: 'Erro ao cancelar assinatura' });
    }
  });

  // Check subscription expiration (cron job endpoint)
  app.post('/api/subscriptions/check-expiration', async (req, res) => {
    try {
      const now = new Date();
      
      // Find expired subscriptions
      const expiredSubscriptions = await db.select()
        .from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.status, 'active'),
          lte(userSubscriptions.endDate, now)
        ));

      console.log(`🔍 Found ${expiredSubscriptions.length} expired subscriptions`);

      for (const subscription of expiredSubscriptions) {
        if (subscription.autoRenew) {
          // Handle auto-renewal logic here
          console.log(`🔄 Auto-renewing subscription ${subscription.id}`);
          // Implementation depends on payment provider
        } else {
          // Expire subscription
          await db.update(userSubscriptions)
            .set({ status: 'expired', updatedAt: new Date() })
            .where(eq(userSubscriptions.id, subscription.id));

          // Update user permissions to expired
          await db.update(userPermissions)
            .set({ status: 'expired', updatedAt: new Date() })
            .where(eq(userPermissions.userId, subscription.userId));

          console.log(`⏰ Subscription ${subscription.id} expired`);
        }
      }

      res.json({ 
        message: 'Verificação de expiração concluída', 
        processed: expiredSubscriptions.length 
      });
    } catch (error) {
      console.error('Error checking subscription expiration:', error);
      res.status(500).json({ message: 'Erro ao verificar expiração de assinaturas' });
    }
  });

  // Admin: Get all subscriptions
  app.get('/api/admin/subscriptions', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const subscriptions = await db.select({
        id: userSubscriptions.id,
        userId: userSubscriptions.userId,
        userEmail: users.email,
        planId: userSubscriptions.planId,
        planName: subscriptionPlans.name,
        status: userSubscriptions.status,
        startDate: userSubscriptions.startDate,
        endDate: userSubscriptions.endDate,
        autoRenew: userSubscriptions.autoRenew,
        paymentMethod: userSubscriptions.paymentMethod,
        createdAt: userSubscriptions.createdAt
      })
      .from(userSubscriptions)
      .leftJoin(users, eq(userSubscriptions.userId, users.userPlatformId))
      .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .orderBy(desc(userSubscriptions.createdAt));

      res.json(subscriptions);
    } catch (error) {
      console.error('Error fetching admin subscriptions:', error);
      res.status(500).json({ message: 'Erro ao buscar assinaturas' });
    }
  });

  // Helper function to apply plan permissions
  async function applyPlanPermissions(userId: string, planId: string) {
    try {
      // Get plan permissions
      const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
      if (plan.length === 0) return;

      const planPermissions = plan[0].permissions;
      if (!planPermissions || planPermissions.length === 0) return;

      // Remove existing permissions
      await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

      // Get permission IDs from names
      const permissionRecords = await db.select()
        .from(permissions)
        .where(inArray(permissions.name, planPermissions));

      // Calculate expiration date
      const startDate = new Date();
      const expirationDate = new Date(startDate);
      expirationDate.setDate(expirationDate.getDate() + plan[0].durationDays);

      // Add new permissions
      const permissionsToInsert = permissionRecords.map(permission => ({
        id: nanoid(),
        userId,
        permissionId: permission.id,
        granted: true,
        status: 'active',
        expirationDate,
        subscriptionPlan: planId,
        autoRenew: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      if (permissionsToInsert.length > 0) {
        await db.insert(userPermissions).values(permissionsToInsert);
      }

      console.log(`✅ Applied ${permissionsToInsert.length} permissions for plan ${planId}`);
    } catch (error) {
      console.error('Error applying plan permissions:', error);
      throw error;
    }
  }

  // Helper function to remove user permissions
  async function removeUserPermissions(userId: string) {
    try {
      await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
      console.log(`🗑️ Removed permissions for user ${userId}`);
    } catch (error) {
      console.error('Error removing user permissions:', error);
      throw error;
    }
  }

  // Notifications API endpoints
  app.get('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const notifications = await NotificationService.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error('Error getting user notifications:', error);
      res.status(500).json({ message: 'Erro ao buscar notificações' });
    }
  });

  app.get('/api/notifications/unread-count', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const count = await NotificationService.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      console.error('Error getting unread count:', error);
      res.status(500).json({ message: 'Erro ao buscar contagem de notificações' });
    }
  });

  app.post('/api/notifications/:id/mark-read', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      await NotificationService.markAsRead(id);
      res.json({ message: 'Notificação marcada como lida' });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: 'Erro ao marcar notificação como lida' });
    }
  });

  app.post('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const notificationData = {
        userId,
        type: req.body.type,
        title: req.body.title,
        message: req.body.message,
        priority: req.body.priority,
        daysUntilExpiration: req.body.daysUntilExpiration,
        scheduledFor: req.body.scheduledFor ? new Date(req.body.scheduledFor) : undefined
      };

      const notification = await NotificationService.createNotification(notificationData);
      res.json(notification);
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({ message: 'Erro ao criar notificação' });
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
      const totalProfit = tournaments.reduce((sum, t) => sum + (parseFloat(t.prize) - parseFloat(t.buyIn)), 0);
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
      console.error('Error getting user stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas do usuário' });
    }
  });

  // ====== PARTE 3: ADMIN BILLING & SUBSCRIPTION ENDPOINTS ======

  // Get subscription statistics for admin dashboard
  app.get('/api/admin/subscription-stats', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // Get basic subscription stats
      const [totalUsers, activeUsers, expiredUsers] = await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(users).where(eq(users.status, 'active')),
        db.select({ count: count() }).from(users).where(eq(users.status, 'blocked'))
      ]);
      
      // Mock data for demonstration (will be replaced with real subscription data)
      const stats = {
        totalSubscriptions: Number(totalUsers[0]?.count || 0),
        activeSubscriptions: Number(activeUsers[0]?.count || 0),
        expiredSubscriptions: Number(expiredUsers[0]?.count || 0),
        expiringThisWeek: 5, // Mock data
        monthlyRevenue: 4850, // Mock data
        planDistribution: {
          basico: users.length > 0 ? Math.floor(users.length * 0.4) : 0,
          premium: users.length > 0 ? Math.floor(users.length * 0.35) : 0,
          pro: users.length > 0 ? Math.floor(users.length * 0.25) : 0
        }
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching subscription stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas de assinaturas' });
    }
  });

  // Get subscription details for all users
  app.get('/api/admin/subscription-details', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const allUsers = await db.select().from(users);
      
      // Get user permissions for each user
      const userPermissionsData = await Promise.all(
        allUsers.map(async (user) => {
          const userPerms = await db.select({ permissionName: permissions.name })
            .from(userPermissions)
            .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
            .where(eq(userPermissions.userId, user.userPlatformId));
          
          return {
            ...user,
            permissions: userPerms.map(p => p.permissionName)
          };
        })
      );
      
      res.json(userPermissionsData);
    } catch (error) {
      console.error('Error fetching subscription details:', error);
      res.status(500).json({ message: 'Erro ao buscar detalhes das assinaturas' });
    }
  });

  // Extend user subscription
  app.post('/api/admin/extend-subscription', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId, days } = req.body;
      
      if (!userId || !days) {
        return res.status(400).json({ message: 'ID do usuário e número de dias são obrigatórios' });
      }
      
      // For now, we'll just update the user status to active
      // In a real implementation, this would extend the subscription expiration date
      await db.update(users)
        .set({ 
          status: 'active',
          updatedAt: new Date()
        })
        .where(eq(users.userPlatformId, userId));
      
      // Log the action
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: `Extended subscription for user ${userId} by ${days} days`,
        status: 'success',
        ipAddress: req.ip,
        timestamp: new Date(),
        userAgent: req.get('User-Agent'),
        details: `Admin extended subscription by ${days} days`
      });
      
      res.json({ message: 'Assinatura estendida com sucesso' });
    } catch (error) {
      console.error('Error extending subscription:', error);
      res.status(500).json({ message: 'Erro ao estender assinatura' });
    }
  });

  // Update user subscription plan
  app.post('/api/admin/update-subscription-plan', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId, planId } = req.body;
      
      if (!userId || !planId) {
        return res.status(400).json({ message: 'ID do usuário e plano são obrigatórios' });
      }
      
      // Apply new plan permissions
      await applyPlanPermissions(userId, planId);
      
      // Log the action
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: `Updated subscription plan for user ${userId} to ${planId}`,
        status: 'success',
        ipAddress: req.ip,
        timestamp: new Date(),
        userAgent: req.get('User-Agent'),
        details: `Admin changed subscription plan to ${planId}`
      });
      
      res.json({ message: 'Plano de assinatura atualizado com sucesso' });
    } catch (error) {
      console.error('Error updating subscription plan:', error);
      res.status(500).json({ message: 'Erro ao atualizar plano de assinatura' });
    }
  });

  // Get subscription renewal history
  app.get('/api/admin/subscription-history', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId } = req.query;
      
      let query = db.select({
        id: accessLogs.id,
        userId: accessLogs.userId,
        action: accessLogs.action,
        status: accessLogs.status,
        timestamp: accessLogs.timestamp,
        details: accessLogs.details,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName
      }).from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .where(
          or(
            sql`${accessLogs.action} LIKE '%subscription%'`,
            sql`${accessLogs.action} LIKE '%plan%'`,
            sql`${accessLogs.action} LIKE '%Extended%'`
          )
        );
      
      if (userId) {
        query = query.where(eq(accessLogs.userId, userId as string));
      }
      
      const history = await query.orderBy(desc(accessLogs.timestamp)).limit(100);
      
      res.json(history);
    } catch (error) {
      console.error('Error fetching subscription history:', error);
      res.status(500).json({ message: 'Erro ao buscar histórico de assinaturas' });
    }
  });

  // Create subscription renewal
  app.post('/api/admin/renew-subscription', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId, planId, paymentMethod } = req.body;
      
      if (!userId || !planId) {
        return res.status(400).json({ message: 'ID do usuário e plano são obrigatórios' });
      }
      
      // Apply plan permissions
      await applyPlanPermissions(userId, planId);
      
      // Update user status to active
      await db.update(users)
        .set({ 
          status: 'active',
          updatedAt: new Date()
        })
        .where(eq(users.userPlatformId, userId));
      
      // Log the renewal
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: `Manual subscription renewal for user ${userId}`,
        status: 'success',
        ipAddress: req.ip,
        timestamp: new Date(),
        userAgent: req.get('User-Agent'),
        details: `Admin renewed subscription: Plan ${planId}, Payment: ${paymentMethod || 'Manual'}`
      });
      
      res.json({ message: 'Assinatura renovada com sucesso' });
    } catch (error) {
      console.error('Error renewing subscription:', error);
      res.status(500).json({ message: 'Erro ao renovar assinatura' });
    }
  });

  // Get billing reports
  app.get('/api/admin/billing-reports', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      
      let dateFilter = new Date();
      switch (period) {
        case '7d':
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case '30d':
          dateFilter.setDate(dateFilter.getDate() - 30);
          break;
        case '90d':
          dateFilter.setDate(dateFilter.getDate() - 90);
          break;
        case '1y':
          dateFilter.setFullYear(dateFilter.getFullYear() - 1);
          break;
        default:
          dateFilter.setDate(dateFilter.getDate() - 30);
      }
      
      // Get user creation stats for the period
      const newSubscriptions = await db.select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, dateFilter));
      
      // Get activity stats
      const activityStats = await db.select({
        month: sql<string>`DATE_TRUNC('month', ${users.createdAt})`,
        count: count()
      }).from(users)
        .where(gte(users.createdAt, dateFilter))
        .groupBy(sql`DATE_TRUNC('month', ${users.createdAt})`)
        .orderBy(sql`DATE_TRUNC('month', ${users.createdAt})`);
      
      // Mock revenue data (will be replaced with real payment data)
      const mockRevenue = {
        total: 4850,
        byPlan: {
          basico: 1470,  // 30 users × R$ 49
          premium: 1940, // 20 users × R$ 97
          pro: 1440      // 10 users × R$ 197
        },
        growth: 12.5 // Mock growth percentage
      };
      
      res.json({
        newSubscriptions: Number(newSubscriptions[0]?.count || 0),
        activityStats: activityStats.map(stat => ({
          month: stat.month,
          count: Number(stat.count)
        })),
        revenue: mockRevenue,
        period
      });
    } catch (error) {
      console.error('Error fetching billing reports:', error);
      res.status(500).json({ message: 'Erro ao buscar relatórios de billing' });
    }
  });

  // Webhook preparation endpoint for payment gateway
  app.post('/api/webhooks/payment', async (req, res) => {
    try {
      // This is a placeholder for future payment gateway integration
      const { event, data } = req.body;
      
      console.log('📦 WEBHOOK RECEIVED:', event, data);
      
      // Handle different webhook events
      switch (event) {
        case 'payment.success':
          // Handle successful payment
          console.log('✅ Payment successful:', data);
          break;
        case 'payment.failed':
          // Handle failed payment
          console.log('❌ Payment failed:', data);
          break;
        case 'subscription.cancelled':
          // Handle subscription cancellation
          console.log('🚫 Subscription cancelled:', data);
          break;
        default:
          console.log('🔄 Unhandled webhook event:', event);
      }
      
      res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ message: 'Erro ao processar webhook' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}