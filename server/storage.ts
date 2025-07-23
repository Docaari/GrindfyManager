import {
  users,
  tournaments,
  tournamentTemplates,
  weeklyPlans,
  grindSessions,
  preparationLogs,
  customGroups,
  coachingInsights,
  userSettings,
  plannedTournaments,
  breakFeedbacks,
  sessionTournaments,
  studyCards,
  studyMaterials,
  studyNotes,
  studySessions,
  activeDays,
  weeklyRoutines,
  studySchedules,
  calendarCategories,
  calendarEvents,
  bugReports,
  type User,
  type UpsertUser,
  type Tournament,
  type InsertTournament,
  type TournamentTemplate,
  type InsertTournamentTemplate,
  type WeeklyPlan,
  type InsertWeeklyPlan,
  type GrindSession,
  type InsertGrindSession,
  type PreparationLog,
  type InsertPreparationLog,
  type CustomGroup,
  type InsertCustomGroup,
  type CoachingInsight,
  type InsertCoachingInsight,
  type UserSettings,
  type InsertUserSettings,
  type PlannedTournament,
  type InsertPlannedTournament,
  type BreakFeedback,
  type InsertBreakFeedback,
  type SessionTournament,
  type InsertSessionTournament,
  type StudyCard,
  type InsertStudyCard,
  type StudyMaterial,
  type InsertStudyMaterial,
  type StudyNote,
  type InsertStudyNote,

  type StudySession,
  type InsertStudySession,
  type ActiveDay,
  type InsertActiveDay,
  type WeeklyRoutine,
  type InsertWeeklyRoutine,
  type StudySchedule,
  type InsertStudySchedule,
  type CalendarCategory,
  type InsertCalendarCategory,
  type CalendarEvent,
  type InsertCalendarEvent,
  type BugReport,
  type InsertBugReport,
  uploadHistory,
  type UploadHistory,
  type InsertUploadHistory,
  profileStates,
  type ProfileState,
  type InsertProfileState,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql, like, not, inArray, gt, isNotNull, count } from "drizzle-orm";
import { nanoid } from "nanoid";

// Utility function to build period conditions with custom date range support
function buildPeriodCondition(period: string, filters: any) {
  const conditions: any[] = [];



  if (period === 'custom' && filters && filters.dateFrom && filters.dateTo) {
    console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Filtro personalizado detectado');
    console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Data De:', filters.dateFrom);
    console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Data Até:', filters.dateTo);

    const startDate = new Date(filters.dateFrom);
    const endDate = new Date(filters.dateTo);

    console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Data De convertida:', startDate);
    console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Data Até convertida:', endDate);

    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      // Certificar que passamos objetos Date válidos para o Drizzle
      conditions.push(gte(tournaments.datePlayed, startDate));
      conditions.push(lte(tournaments.datePlayed, endDate));
      console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Filtros de data aplicados com sucesso');
    } else {
      console.log('🚨 BACKEND DEBUG - buildPeriodCondition - Datas inválidas detectadas');
    }
  } else if (period !== 'all') {
    // Standard period filters
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '365d':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      // New period options
      case 'current_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'last_3_months':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'last_6_months':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'current_year':
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      case 'last_12_months':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'last_24_months':
        startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        break;
      case 'last_36_months':
        startDate = new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    if (!isNaN(startDate.getTime())) {
      // Certificar que passamos objeto Date válido para o Drizzle
      conditions.push(gte(tournaments.datePlayed, startDate));
    }
  }

  console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Final conditions:', conditions);
  console.log('🔍 BACKEND DEBUG - buildPeriodCondition - Conditions length:', conditions.length);
  console.log('🚨 CRITICAL DEBUG - buildPeriodCondition - Conditions DEPOIS:', conditions.length);
  console.log('🚨 CRITICAL DEBUG - buildPeriodCondition - RETORNANDO:', conditions);

  return conditions;
}

// Utility function to build SQL filters from dashboard filters
function buildFilters(filters: any) {
  const conditions: any[] = [];

  console.log('🔍 BACKEND DEBUG - buildFilters - Filters recebidos:', filters);

  // Date range filter
  if (filters.dateRange?.from) {
    conditions.push(gte(tournaments.datePlayed, new Date(filters.dateRange.from)));
  }
  if (filters.dateRange?.to) {
    conditions.push(lte(tournaments.datePlayed, new Date(filters.dateRange.to)));
  }

  // Sites filter
  if (filters.sites?.length > 0) {
    conditions.push(inArray(tournaments.site, filters.sites));
  }

  // Categories filter
  if (filters.categories?.length > 0) {
    conditions.push(inArray(tournaments.category, filters.categories));
  }

  // Speeds filter
  if (filters.speeds?.length > 0) {
    conditions.push(inArray(tournaments.speed, filters.speeds));
  }

  // Buy-in range filter
  if (filters.buyinRange?.min !== null && filters.buyinRange?.min !== undefined) {
    conditions.push(gte(tournaments.buyIn, filters.buyinRange.min));
  }
  if (filters.buyinRange?.max !== null && filters.buyinRange?.max !== undefined) {
    conditions.push(lte(tournaments.buyIn, filters.buyinRange.max));
  }

  // Field size range filter
  if (filters.fieldSizeRange?.min !== null && filters.fieldSizeRange?.min !== undefined) {
    conditions.push(gte(tournaments.fieldSize, filters.fieldSizeRange.min));
  }
  if (filters.fieldSizeRange?.max !== null && filters.fieldSizeRange?.max !== undefined) {
    conditions.push(lte(tournaments.fieldSize, filters.fieldSizeRange.max));
  }

  // Keyword filter
  if (filters.keywordFilter?.type === 'contains' && filters.keywordFilter?.keyword) {
    conditions.push(like(tournaments.name, `%${filters.keywordFilter.keyword}%`));
  }
  if (filters.keywordFilter?.type === 'not_contains' && filters.keywordFilter?.keyword) {
    conditions.push(not(like(tournaments.name, `%${filters.keywordFilter.keyword}%`)));
  }

  // Participant range filter (field size) - support both naming conventions
  if (filters.participantMin !== null && filters.participantMin !== undefined) {
    conditions.push(gte(tournaments.fieldSize, filters.participantMin));
  }
  if (filters.participantMax !== null && filters.participantMax !== undefined) {
    conditions.push(lte(tournaments.fieldSize, filters.participantMax));
  }
  
  // Legacy support for old naming convention
  if (filters.participantsFrom !== null && filters.participantsFrom !== undefined) {
    conditions.push(gte(tournaments.fieldSize, filters.participantsFrom));
  }
  if (filters.participantsTo !== null && filters.participantsTo !== undefined) {
    conditions.push(lte(tournaments.fieldSize, filters.participantsTo));
  }

  console.log('🔍 BACKEND DEBUG - buildFilters - Conditions finais:', conditions);
  console.log('🔍 BACKEND DEBUG - buildFilters - Conditions length:', conditions.length);

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Tournament operations
  getTournaments(userId: string, limit?: number, offset?: number, period?: string, filters?: any): Promise<Tournament[]>;
  getTournament(id: string): Promise<Tournament | undefined>;
  createTournament(tournament: InsertTournament): Promise<Tournament>;
  updateTournament(id: string, tournament: Partial<InsertTournament>): Promise<Tournament>;
  deleteTournament(id: string): Promise<void>;
  // 🎯 ETAPA 2.3 - CORREÇÃO: userId agora é userPlatformId (USER-XXXX)
  isDuplicateTournament(userId: string, tournamentData: {
    name: string;
    datePlayed: Date;
    buyIn: number;
    position?: number;
    fieldSize?: number;
  }): Promise<boolean>;

  // Tournament template operations
  getTournamentTemplates(userId: string): Promise<TournamentTemplate[]>;
  getTournamentTemplate(id: string): Promise<TournamentTemplate | undefined>;
  createTournamentTemplate(template: InsertTournamentTemplate): Promise<TournamentTemplate>;
  updateTournamentTemplate(id: string, template: Partial<InsertTournamentTemplate>): Promise<TournamentTemplate>;
  deleteTournamentTemplate(id: string): Promise<void>;

  // Weekly plan operations
  getWeeklyPlans(userId: string): Promise<WeeklyPlan[]>;
  getWeeklyPlan(id: string): Promise<WeeklyPlan | undefined>;
  createWeeklyPlan(plan: InsertWeeklyPlan): Promise<WeeklyPlan>;
  updateWeeklyPlan(id: string, plan: Partial<InsertWeeklyPlan>): Promise<WeeklyPlan>;
  deleteWeeklyPlan(id: string): Promise<void>;

  // Grind session operations
  getGrindSessions(userId: string): Promise<GrindSession[]>;
  getGrindSession(id: string): Promise<GrindSession | undefined>;
  createGrindSession(session: InsertGrindSession): Promise<GrindSession>;
  updateGrindSession(id: string, session: Partial<InsertGrindSession>): Promise<GrindSession>;
  deleteGrindSession(id: string): Promise<void>;

  // Preparation log operations
  getPreparationLogs(userId: string): Promise<PreparationLog[]>;
  createPreparationLog(log: InsertPreparationLog): Promise<PreparationLog>;

  // Custom group operations
  getCustomGroups(userId: string): Promise<CustomGroup[]>;
  createCustomGroup(group: InsertCustomGroup): Promise<CustomGroup>;
  updateCustomGroup(id: string, group: Partial<InsertCustomGroup>): Promise<CustomGroup>;
  deleteCustomGroup(id: string): Promise<void>;

  // Coaching insight operations
  getCoachingInsights(userId: string): Promise<CoachingInsight[]>;
  createCoachingInsight(insight: InsertCoachingInsight): Promise<CoachingInsight>;
  updateCoachingInsight(id: string, insight: Partial<InsertCoachingInsight>): Promise<CoachingInsight>;

  // User settings operations
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings>;

  // Analytics operations
  getDashboardStats(userId: string, period?: string, filters?: any): Promise<any>;
  getPerformanceByPeriod(userId: string, period: string, filters?: any): Promise<any>;
  getAnalyticsByDayOfWeek(userId: string, period?: string, filters?: any[]): Promise<any[]>;

  // Tournament Library operations
  getTournamentLibrary(userId: string, period?: string, filters?: any): Promise<any[]>;

  // Planned tournament operations
  getPlannedTournaments(userId: string, dayOfWeek?: number): Promise<PlannedTournament[]>;
  getPlannedTournament(id: string): Promise<PlannedTournament | null>;
  createPlannedTournament(tournament: InsertPlannedTournament): Promise<PlannedTournament>;
  updatePlannedTournament(id: string, tournament: Partial<InsertPlannedTournament>): Promise<PlannedTournament>;
  deletePlannedTournament(id: string): Promise<void>;
  getPlannedTournamentsBySession(userId: string, sessionId: string): Promise<PlannedTournament[]>;

  // Break feedback operations
  getBreakFeedbacks(userId: string, sessionId?: string): Promise<BreakFeedback[]>;
  createBreakFeedback(feedback: InsertBreakFeedback): Promise<BreakFeedback>;
  deleteBreakFeedback(id: string): Promise<void>;

  // Session tournament operations
  getSessionTournaments(userId: string, sessionId?: string): Promise<SessionTournament[]>;
  createSessionTournament(tournament: InsertSessionTournament): Promise<SessionTournament>;
  updateSessionTournament(id: string, tournament: Partial<InsertSessionTournament>): Promise<SessionTournament>;
  deleteSessionTournament(id: string): Promise<void>;
  getSessionTournamentsByDay(userId: string, dayOfWeek: number): Promise<SessionTournament[]>;

  // Study card operations
  getStudyCards(userId: string): Promise<StudyCard[]>;
  createStudyCard(studyCard: InsertStudyCard): Promise<StudyCard>;
  getStudyCard(id: string, userId: string): Promise<StudyCard | undefined>;
  updateStudyCard(id: string, studyCard: Partial<InsertStudyCard>): Promise<StudyCard>;
  deleteStudyCard(id: string): Promise<void>;

  // Study material operations
  getStudyMaterials(studyCardId: string): Promise<StudyMaterial[]>;
  createStudyMaterial(material: InsertStudyMaterial): Promise<StudyMaterial>;

  // Study note operations
  getStudyNotes(studyCardId: string): Promise<StudyNote[]>;
  createStudyNote(note: InsertStudyNote): Promise<StudyNote>;




  // Study session operations
  getStudySessions(userId: string): Promise<StudySession[]>;
  createStudySession(session: InsertStudySession): Promise<StudySession>;

  // Active days operations
  getActiveDays(userId: string): Promise<ActiveDay[]>;
  toggleActiveDay(userId: string, dayOfWeek: number): Promise<ActiveDay>;

  // Calendário Inteligente
  getWeeklyRoutine(userId: string, weekStart: Date): Promise<WeeklyRoutine | null>;
  createWeeklyRoutine(routine: InsertWeeklyRoutine): Promise<WeeklyRoutine>;
  updateWeeklyRoutine(id: string, routine: Partial<InsertWeeklyRoutine>): Promise<WeeklyRoutine>;
  deleteWeeklyRoutine(id: string): Promise<void>;

  getStudySchedules(userId: string): Promise<StudySchedule[]>;
  createStudySchedule(schedule: InsertStudySchedule): Promise<StudySchedule>;
  updateStudySchedule(id: string, schedule: Partial<InsertStudySchedule>): Promise<StudySchedule>;
  deleteStudySchedule(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Tournament operations
  async getTournaments(userId: string, limit: number = 50, offset?: number, period?: string, filters?: any, sortBy?: string): Promise<Tournament[]> {
    console.log('🚨 CRITICAL DEBUG - getTournaments - userId recebido:', userId);
    console.log('🚨 CRITICAL DEBUG - getTournaments - Período recebido:', period);
    console.log('🚨 CRITICAL DEBUG - getTournaments - Filtros recebidos:', filters);
    const baseConditions = [eq(tournaments.userId, userId)];

    // Apply period filter
    if (period && period !== 'all') {
      console.log('🔍 BACKEND DEBUG - Período recebido:', period);
      console.log('🔍 BACKEND DEBUG - Filtros recebidos:', filters);

      // Check if it's a custom date range
      if (period === 'custom' && filters && filters.dateFrom && filters.dateTo) {
        console.log('🔍 BACKEND DEBUG - Filtro personalizado detectado');
        console.log('🔍 BACKEND DEBUG - Data De:', filters.dateFrom);
        console.log('🔍 BACKEND DEBUG - Data Até:', filters.dateTo);

        const startDate = new Date(filters.dateFrom);
        const endDate = new Date(filters.dateTo);

        console.log('🔍 BACKEND DEBUG - Data De convertida:', startDate);
        console.log('🔍 BACKEND DEBUG - Data Até convertida:', endDate);

        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          baseConditions.push(gte(tournaments.datePlayed, startDate));
          baseConditions.push(lte(tournaments.datePlayed, endDate));
          console.log('🔍 BACKEND DEBUG - Filtros de data aplicados com sucesso');
        } else {
          console.log('🚨 BACKEND DEBUG - Datas inválidas detectadas');
        }
      } else {
        // Standard period filters
        const now = new Date();
        let startDate: Date;

        switch (period) {
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case '365d':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            break;
          default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (!isNaN(startDate.getTime())) {
          baseConditions.push(gte(tournaments.datePlayed, startDate));
        }
      }
    }

    // Apply dashboard filters
    if (filters) {
      const dashboardFilters = buildFilters(filters);
      if (dashboardFilters) {
        baseConditions.push(dashboardFilters);
      }
    }

    // Para ordenação por profit, usar apenas filtro de userId sem outros filtros
    let queryConditions: any[] = baseConditions;
    if (sortBy === 'profit-high' || sortBy === 'profit-low') {
      console.log('🚨 SORT DEBUG - REMOVENDO filtros de período para busca completa');
      console.log('🚨 SORT DEBUG - Condições base antes de remover período:', baseConditions.length);
      // Manter apenas filtro de userId, remover período e outros filtros
      queryConditions = [eq(tournaments.userId, userId)];
      console.log('🚨 SORT DEBUG - Condições após remover filtros:', queryConditions.length);
    }

    const whereCondition = and(...queryConditions);

    // Configure ordenação baseada no sortBy
    let orderByClause;
    console.log('🚨 SORT DEBUG - sortBy recebido:', sortBy);
    switch (sortBy) {
      case 'date':
        orderByClause = desc(tournaments.datePlayed);
        break;
      case 'profit-high':
        // Para maiores lucros: ordenar pelo profit calculado (prize - buyIn) DESC
        orderByClause = [desc(sql`CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL)`)];
        console.log('🚨 SORT DEBUG - Ordenando por maiores lucros (profit = prize - buyIn DESC)');
        break;
      case 'profit-low':
        // Para maiores perdas: ordenar pelo profit calculado (prize - buyIn) ASC
        orderByClause = [sql`CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL)`];
        console.log('🚨 SORT DEBUG - Ordenando por maiores perdas (profit = prize - buyIn ASC)');
        break;
      default:
        orderByClause = desc(tournaments.datePlayed);
    }

    const result = await db
      .select()
      .from(tournaments)
      .where(whereCondition)
      .orderBy(orderByClause)
      .limit(limit);

    // Debug adicional para ordenação de lucros
    if (sortBy === 'profit-high' || sortBy === 'profit-low') {
      console.log('🚨 SORT DEBUG - Quantidade de torneios encontrados:', result.length);
      if (result.length > 0) {
        const maxProfit = Math.max(...result.map(t => parseFloat(t.prize || '0')));
        const minProfit = Math.min(...result.map(t => parseFloat(t.prize || '0')));
        console.log('🚨 SORT DEBUG - Maior lucro encontrado:', maxProfit);
        console.log('🚨 SORT DEBUG - Menor lucro encontrado:', minProfit);
        console.log('🚨 SORT DEBUG - Primeiro torneio (deve ser o maior/menor):', {
          name: result[0].name,
          profit: result[0].prize,
          date: result[0].datePlayed
        });
      }
    }

    return result;
  }

  async getTournament(id: string): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    return tournament;
  }

  async createTournament(tournament: InsertTournament): Promise<Tournament> {
    const [newTournament] = await db
      .insert(tournaments)
      .values({ ...tournament, id: nanoid() })
      .returning();
    return newTournament;
  }

  async updateTournament(id: string, tournament: Partial<InsertTournament>): Promise<Tournament> {
    const [updatedTournament] = await db
      .update(tournaments)
      .set({ ...tournament, updatedAt: new Date() })
      .where(eq(tournaments.id, id))
      .returning();
    return updatedTournament;
  }

  async deleteTournament(id: string): Promise<void> {
    await db.delete(tournaments).where(eq(tournaments.id, id));
  }

  // Clear all tournaments for a user
  async clearAllTournaments(userId: string): Promise<void> {
    await db.delete(tournaments).where(eq(tournaments.userId, userId));
  }

  // 🎯 ETAPA 2.3 - CORRIGIR SISTEMA DE DUPLICATAS: userId agora é userPlatformId
  // Check if tournament is duplicate by Tournament ID (preferred) or fallback to multiple criteria
  async isDuplicateTournament(userId: string, tournamentData: {
    tournamentId?: string;
    name: string;
    datePlayed: Date;
    buyIn: number;
    position?: number;
    fieldSize?: number;
    site?: string;
  }): Promise<boolean> {
    // Priority 1: Check by Tournament ID if available
    if (tournamentData.tournamentId && tournamentData.tournamentId.trim() !== '') {
      console.log(`🔍 DUPLICATE CHECK - Checking Tournament ID: ${tournamentData.tournamentId} for user: ${userId}`);
      console.log(`🔍 DUPLICATE CHECK - Query: WHERE tournaments.user_id = '${userId}' AND tournaments.tournament_id = '${tournamentData.tournamentId.trim()}'`);

      const existingTournament = await db
        .select()
        .from(tournaments)
        .where(
          and(
            eq(tournaments.userId, userId),
            eq(tournaments.tournamentId, tournamentData.tournamentId.trim())
          )
        )
        .limit(1);

      console.log(`🔍 DUPLICATE CHECK - Query result: ${existingTournament.length} tournaments found`);
      if (existingTournament.length > 0) {
        console.log(`🔍 DUPLICATE CHECK - Found duplicate by Tournament ID: ${tournamentData.tournamentId} for user: ${userId}`);
        console.log(`🔍 DUPLICATE CHECK - Existing tournament: ${JSON.stringify(existingTournament[0])}`);
        return true;
      } else {
        console.log(`🔍 DUPLICATE CHECK - No duplicate found for Tournament ID: ${tournamentData.tournamentId} for user: ${userId}`);
      }
    }

    // Priority 2: Fallback to traditional duplicate check (name + date + buy-in)
    // For Bodog, use a more specific check combining site, name, date and buy-in
    if (tournamentData.site === 'Bodog') {
      const existingTournament = await db
        .select()
        .from(tournaments)
        .where(
          and(
            eq(tournaments.userId, userId),
            eq(tournaments.site, 'Bodog'),
            eq(tournaments.name, tournamentData.name.trim()),
            eq(tournaments.datePlayed, tournamentData.datePlayed),
            sql`ABS(CAST(${tournaments.buyIn} AS DECIMAL) - ${tournamentData.buyIn}) < 0.01`
          )
        )
        .limit(1);

      return existingTournament.length > 0;
    }

    // Default check for other sites
    const existingTournament = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          eq(tournaments.name, tournamentData.name.trim()),
          eq(tournaments.datePlayed, tournamentData.datePlayed),
          sql`ABS(CAST(${tournaments.buyIn} AS DECIMAL) - ${tournamentData.buyIn}) < 0.01`
        )
      )
      .limit(1);

    return existingTournament.length > 0;
  }

  // Batch check for duplicates by Tournament IDs (performance optimization)
  async batchCheckDuplicateTournamentIds(userId: string, tournamentIds: string[]): Promise<Set<string>> {
    if (tournamentIds.length === 0) return new Set();

    console.log(`🔍 BATCH DUPLICATE CHECK - Checking ${tournamentIds.length} Tournament IDs for user: ${userId}`);

    const validIds = tournamentIds.filter(id => id && id.trim() !== '');
    if (validIds.length === 0) return new Set();

    // Use inArray for better PostgreSQL compatibility
    const existingTournaments = await db
      .select({ tournamentId: tournaments.tournamentId })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          inArray(tournaments.tournamentId, validIds)
        )
      );

    const duplicateIds = new Set(existingTournaments.map(t => t.tournamentId).filter((id): id is string => Boolean(id)));
    console.log(`🔍 BATCH DUPLICATE CHECK - Found ${duplicateIds.size} existing Tournament IDs`);

    return duplicateIds;
  }

  // 🎯 ETAPA 2.3 - CORREÇÃO: userId agora é userPlatformId (USER-XXXX)
  // Check if Bodog tournament exists by Reference ID (embedded in tournament name)
  async isBodogTournamentExists(userId: string, referenceId: string): Promise<boolean> {
    const existingTournament = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          eq(tournaments.site, 'Bodog'),
          eq(tournaments.name, `MTT Bodog [${referenceId}]`)
        )
      )
      .limit(1);

    return existingTournament.length > 0;
  }

  // Get filtered tournaments count for preview
  async getFilteredTournamentsCount(userId: string, filters: {
    sites?: string[];
    dateFrom?: Date | null;
    dateTo?: Date | null;
  }): Promise<number> {
    const conditions = [eq(tournaments.userId, userId)];

    if (filters.sites && filters.sites.length > 0) {
      conditions.push(inArray(tournaments.site, filters.sites));
    }

    if (filters.dateFrom) {
      conditions.push(gte(tournaments.datePlayed, filters.dateFrom));
    }

    if (filters.dateTo) {
      conditions.push(lte(tournaments.datePlayed, filters.dateTo));
    }

    const result = await db
      .select({ count: count() })
      .from(tournaments)
      .where(and(...conditions));

    return result[0]?.count || 0;
  }

  // Bulk delete tournaments with granular filtering
  async bulkDeleteTournaments(userId: string, filters: {
    sites?: string[];
    dateFrom?: Date | null;
    dateTo?: Date | null;
  }): Promise<number> {
    const conditions = [eq(tournaments.userId, userId)];

    if (filters.sites && filters.sites.length > 0) {
      conditions.push(inArray(tournaments.site, filters.sites));
    }

    if (filters.dateFrom) {
      conditions.push(gte(tournaments.datePlayed, filters.dateFrom));
    }

    if (filters.dateTo) {
      conditions.push(lte(tournaments.datePlayed, filters.dateTo));
    }

    const result = await db
      .delete(tournaments)
      .where(and(...conditions))
      .returning({ id: tournaments.id });

    return result.length;
  }

  // Get unique sites with tournament counts for bulk delete
  async getUniqueSites(userId: string): Promise<Array<{ site: string; count: number }>> {
    const result = await db
      .select({
        site: tournaments.site,
        count: count()
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId))
      .groupBy(tournaments.site)
      .orderBy(desc(count()));

    return result.map(row => ({
      site: row.site,
      count: Number(row.count) || 0
    }));
  }

  // Tournament template operations
  async getTournamentTemplates(userId: string): Promise<TournamentTemplate[]> {
    return await db
      .select()
      .from(tournamentTemplates)
      .where(eq(tournamentTemplates.userId, userId))
      .orderBy(desc(tournamentTemplates.totalPlayed));
  }

  async getTournamentTemplate(id: string): Promise<TournamentTemplate | undefined> {
    const [template] = await db.select().from(tournamentTemplates).where(eq(tournamentTemplates.id, id));
    return template;
  }

  async createTournamentTemplate(template: InsertTournamentTemplate): Promise<TournamentTemplate> {
    const templateData = {
      ...template,
      id: nanoid(),
      createdAt: new Date(),
      updatedAt: new Date(),
      // Ensure dayOfWeek is a proper array
      dayOfWeek: Array.isArray(template.dayOfWeek) ? template.dayOfWeek : 
                 (template.dayOfWeek !== undefined && template.dayOfWeek !== null ? [template.dayOfWeek] : []),
      // Ensure startTime is a proper array  
      startTime: Array.isArray(template.startTime) ? template.startTime : 
                 (template.startTime !== undefined && template.startTime !== null ? [template.startTime] : [])
    };

    const [newTemplate] = await db
      .insert(tournamentTemplates)
      .values(templateData)
      .returning();
    return newTemplate;
  }

  async updateTournamentTemplate(id: string, template: Partial<InsertTournamentTemplate>): Promise<TournamentTemplate> {
    const updateData: any = {
      ...template,
      updatedAt: new Date()
    };

    // Ensure dayOfWeek is properly handled if it exists
    if (template.dayOfWeek) {
      updateData.dayOfWeek = Array.isArray(template.dayOfWeek) ? template.dayOfWeek : 
                             [template.dayOfWeek as number];
    }

    // Ensure startTime is properly handled if it exists
    if (template.startTime) {
      updateData.startTime = Array.isArray(template.startTime) ? template.startTime : 
                             [template.startTime as string];
    }

    const [updatedTemplate] = await db
      .update(tournamentTemplates)
      .set(updateData)
      .where(eq(tournamentTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async deleteTournamentTemplate(id: string): Promise<void> {
    await db.delete(tournamentTemplates).where(eq(tournamentTemplates.id, id));
  }

  // Weekly plan operations
  async getWeeklyPlans(userId: string): Promise<WeeklyPlan[]> {
    return await db
      .select()
      .from(weeklyPlans)
      .where(eq(weeklyPlans.userId, userId))
      .orderBy(desc(weeklyPlans.weekStart));
  }

  async getWeeklyPlan(id: string): Promise<WeeklyPlan | undefined> {
    const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id));
    return plan;
  }

  async createWeeklyPlan(plan: InsertWeeklyPlan): Promise<WeeklyPlan> {
    const [newPlan] = await db
      .insert(weeklyPlans)
      .values({ ...plan, id: nanoid() })
      .returning();
    return newPlan;
  }

  async updateWeeklyPlan(id: string, plan: Partial<InsertWeeklyPlan>): Promise<WeeklyPlan> {
    const [updatedPlan] = await db
      .update(weeklyPlans)
      .set({ ...plan, updatedAt: new Date() })
      .where(eq(weeklyPlans.id, id))
      .returning();
    return updatedPlan;
  }

  async deleteWeeklyPlan(id: string): Promise<void> {
    await db.delete(weeklyPlans).where(eq(weeklyPlans.id, id));
  }

  // Grind session operations
  async getGrindSessions(userId: string): Promise<GrindSession[]> {
    return await db
      .select()
      .from(grindSessions)
      .where(eq(grindSessions.userId, userId))
      .orderBy(desc(grindSessions.date));
  }

  async getGrindSession(id: string): Promise<GrindSession | undefined> {
    const [session] = await db.select().from(grindSessions).where(eq(grindSessions.id, id));
    return session;
  }

  async createGrindSession(session: InsertGrindSession): Promise<GrindSession> {
    const [newSession] = await db
      .insert(grindSessions)
      .values({ ...session, id: nanoid() })
      .returning();
    return newSession;
  }

  async updateGrindSession(id: string, session: Partial<InsertGrindSession>): Promise<GrindSession> {
    const [updatedSession] = await db
      .update(grindSessions)
      .set({ ...session, updatedAt: new Date() })
      .where(eq(grindSessions.id, id))
      .returning();
    return updatedSession;
  }

  async deleteGrindSession(id: string): Promise<void> {
    await db.delete(grindSessions).where(eq(grindSessions.id, id));
  }

  // Preparation log operations
  async getPreparationLogs(userId: string): Promise<PreparationLog[]> {
    return await db
      .select()
      .from(preparationLogs)
      .where(eq(preparationLogs.userId, userId))
      .orderBy(desc(preparationLogs.createdAt));
  }

  async createPreparationLog(log: InsertPreparationLog): Promise<PreparationLog> {
    const logData = {
      ...log,
      id: nanoid(),
      createdAt: new Date(),
      // Ensure exercisesCompleted is properly formatted as array
      exercisesCompleted: Array.isArray(log.exercisesCompleted) ? log.exercisesCompleted : 
                         (log.exercisesCompleted !== undefined && log.exercisesCompleted !== null ? [log.exercisesCompleted as string] : [])
    };

    const [newLog] = await db
      .insert(preparationLogs)
      .values(logData)
      .returning();
    return newLog;
  }

  // Custom group operations
  async getCustomGroups(userId: string): Promise<CustomGroup[]> {
    return await db
      .select()
      .from(customGroups)
      .where(eq(customGroups.userId, userId))
      .orderBy(desc(customGroups.createdAt));
  }

  async createCustomGroup(group: InsertCustomGroup): Promise<CustomGroup> {
    const [newGroup] = await db
      .insert(customGroups)
      .values({ ...group, id: nanoid() })
      .returning();
    return newGroup;
  }

  async updateCustomGroup(id: string, group: Partial<InsertCustomGroup>): Promise<CustomGroup> {
    const [updatedGroup] = await db
      .update(customGroups)
      .set({ ...group, updatedAt: new Date() })
      .where(eq(customGroups.id, id))
      .returning();
    return updatedGroup;
  }

  async deleteCustomGroup(id: string): Promise<void> {
    await db.delete(customGroups).where(eq(customGroups.id, id));
  }

  // Coaching insight operations
  async getCoachingInsights(userId: string): Promise<CoachingInsight[]> {
    return await db
      .select()
      .from(coachingInsights)
      .where(eq(coachingInsights.userId, userId))
      .orderBy(desc(coachingInsights.priority), desc(coachingInsights.createdAt));
  }

  async createCoachingInsight(insight: InsertCoachingInsight): Promise<CoachingInsight> {
    const [newInsight] = await db
      .insert(coachingInsights)
      .values({ ...insight, id: nanoid() })
      .returning();
    return newInsight;
  }

  async updateCoachingInsight(id: string, insight: Partial<InsertCoachingInsight>): Promise<CoachingInsight> {
    const [updatedInsight] = await db
      .update(coachingInsights)
      .set(insight)
      .where(eq(coachingInsights.id, id))
      .returning();
    return updatedInsight;
  }

  // Usersettings operations
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    try {
      console.log('🚨 STORAGE DEBUG - getUserSettings chamado para userId:', userId);
      const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      console.log('🚨 STORAGE DEBUG - getUserSettings resultado:', {
        'settings encontrado': !!settings,
        'settings completo': settings,
        'exchange_rates': settings?.exchangeRates,
        'tipo exchange_rates': typeof settings?.exchangeRates
      });
      return settings;
    } catch (error: any) {
      console.error('🚨 STORAGE DEBUG - Erro no getUserSettings:', error);
      // If exchange_rates column doesn't exist, return undefined to use fallback
      if (error.code === '42703' && error.message.includes('exchange_rates')) {
        console.warn('exchange_rates column not found, using empty exchange rates');
        return undefined;
      }
      throw error;
    }
  }

  async upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const [upsertedSettings] = await db
      .insert(userSettings)
      .values({ ...settings, id: nanoid() })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          ...settings,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upsertedSettings;
  }

  // Grade Coach analytics
  async getCoachingRecommendations(userId: string): Promise<any> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get template performance data
    const templatePerformance = await db
      .select({
        templateId: tournaments.templateId,
        templateName: sql<string>`COALESCE(${tournamentTemplates.name}, 'Unknown')`,
        count: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(${tournaments.prize} - ${tournaments.buyIn})`,
        buyins: sql<number>`SUM(${tournaments.buyIn})`,
        roi: sql<number>`CASE WHEN SUM(${tournaments.buyIn}) > 0 THEN (SUM(${tournaments.prize}) / SUM(${tournaments.buyIn}) - 1) * 100 ELSE 0 END`,
        avgProfit: sql<number>`AVG(${tournaments.prize} - ${tournaments.buyIn})`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
        site: sql<string>`COALESCE(${tournamentTemplates.site}, ${tournaments.site})`,
        category: sql<string>`COALESCE(${tournamentTemplates.category}, ${tournaments.category})`,
        avgBuyin: sql<number>`AVG(${tournaments.buyIn})`,
      })
      .from(tournaments)
      .leftJoin(tournamentTemplates, eq(tournaments.templateId, tournamentTemplates.id))
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, thirtyDaysAgo)
        )
      )
      .groupBy(tournaments.templateId, tournamentTemplates.name, tournamentTemplates.site, tournamentTemplates.category, tournaments.site, tournaments.category)
      .having(sql`COUNT(*) >= 3`) // Only templates with 3+ tournaments
      .orderBy(sql`SUM(${tournaments.prize} - ${tournaments.buyIn}) DESC`);

    // Generate recommendations based on performance
    const recommendations = templatePerformance.map((template: any) => {
      const insights = [];

      // Ensure numeric values for calculations
      const roi = Number(template.roi) || 0;
      const count = Number(template.count) || 0;
      const finalTables = Number(template.finalTables) || 0;

      if (roi > 20) {
        insights.push({
          type: 'positive',
          title: 'High ROI Template',
          description: `Excellent ${roi.toFixed(1)}% ROI. Consider increasing volume.`,
          priority: 'high'
        });
      } else if (roi < -10) {
        insights.push({
          type: 'negative',
          title: 'Underperforming Template',
          description: `${roi.toFixed(1)}% ROI is concerning. Review or reduce volume.`,
          priority: 'high'
        });
      }

      if (count > 20 && roi < 5) {
        insights.push({
          type: 'warning',
          title: 'High Volume, Low ROI',
          description: 'Playing frequently but with marginal returns.',
          priority: 'medium'
        });
      }

      if (finalTables === 0 && count > 10) {
        insights.push({
          type: 'warning',
          title: 'No Final Tables',
          description: 'No final tables despite significant volume.',
          priority: 'medium'
        });
      }

      return {
        ...template,
        roi, // Use the converted number
        count, // Use the converted number
        finalTables, // Use the converted number
        insights
      };
    });

    return recommendations;
  }

  // Analytics operations
  async getAnalyticsBySite(userId: string, period = "30d", filters: any = {}): Promise<any> {
  try {
    console.log('🚨 CRITICAL DEBUG - getAnalyticsBySite - userId recebido:', userId);
    console.log('🚨 CRITICAL DEBUG - getAnalyticsBySite - Período recebido:', period);
    console.log('🚨 CRITICAL DEBUG - getAnalyticsBySite - Filtros recebidos:', filters);

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const analytics = await db
      .select({
        site: tournaments.site,
        volume: sql<string>`COUNT(*)`,
        profit: sql<string>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<string>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<string>`CASE 
          WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 
          THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100
          ELSE 0 
        END`
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.site)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);

    // Log para debug - verificar se os valores estão corretos
    console.log('DEBUG Site Analytics - Raw data:', analytics);

    // Calcular totais para verificação
    const totalProfit = analytics.reduce((sum, item) => sum + parseFloat(item.profit || '0'), 0);
    const totalVolume = analytics.reduce((sum, item) => sum + parseInt(item.volume || '0'), 0);
    console.log('DEBUG Site Analytics - Totals:', { totalProfit, totalVolume });

    return analytics;
  } catch (error) {
    console.error('Error fetching site analytics:', error);
    return [];
  }
}

  async getAnalyticsByBuyinRange(userId: string, period = "30d", filters: any = {}): Promise<any> {
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    return await db
      .select({
        buyinRange: sql<string>`
          CASE 
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 5 THEN '$0-$5'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 10 THEN '$5-$10'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 20 THEN '$11-$20'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 32 THEN '$21-$32'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 45 THEN '$33-$45'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 60 THEN '$46-$60'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 99 THEN '$60-$99'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 160 THEN '$100-$160'
            ELSE '$161+'
          END
        `,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        avgBuyin: sql<number>`AVG(CAST(${tournaments.buyIn} AS DECIMAL))`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`
        CASE 
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 5 THEN '$0-$5'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 10 THEN '$5-$10'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 20 THEN '$11-$20'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 32 THEN '$21-$32'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 45 THEN '$33-$45'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 60 THEN '$46-$60'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 99 THEN '$60-$99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 160 THEN '$100-$160'
          ELSE '$161+'
        END
      `)
      .orderBy(sql`AVG(CAST(${tournaments.buyIn} AS DECIMAL))`);
  }

  async getAnalyticsByCategory(userId: string, period = "30d", filters: any = {}): Promise<any> {
    console.log('🚨 CRITICAL DEBUG - getAnalyticsByCategory - userId recebido:', userId);
    console.log('🚨 CRITICAL DEBUG - getAnalyticsByCategory - Período recebido:', period);
    console.log('🚨 CRITICAL DEBUG - getAnalyticsByCategory - Filtros recebidos:', filters);

    const baseConditions = [eq(tournaments.userId, userId)];
    console.log('🔍 CATEGORY DEBUG - Base condition criada para userId:', userId);
    console.log('🚨 ISOLATION DEBUG - baseConditions INICIAL:', baseConditions);
    console.log('🚨 ISOLATION DEBUG - baseConditions LENGTH INICIAL:', baseConditions.length);

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    console.log('🔍 CATEGORY DEBUG - Period conditions:', periodConditions);
    console.log('🚨 ISOLATION DEBUG - periodConditions LENGTH:', periodConditions.length);
    console.log('🚨 ISOLATION DEBUG - baseConditions ANTES DO PUSH:', baseConditions.length);
    baseConditions.push(...periodConditions);
    console.log('🚨 ISOLATION DEBUG - baseConditions DEPOIS DO PUSH:', baseConditions.length);
    console.log('🚨 ISOLATION DEBUG - baseConditions FINAL:', baseConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    console.log('🔍 CATEGORY DEBUG - Dashboard filters:', dashboardFilters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);
    console.log('🔍 CATEGORY DEBUG - Final where condition:', whereCondition);
    console.log('🔍 CATEGORY DEBUG - Base conditions count:', baseConditions.length);
    console.log('🚨 ISOLATION DEBUG - WHERE FINAL CONSTRUÍDO:', whereCondition);
    console.log('🚨 ISOLATION DEBUG - VERIFICAÇÃO CRÍTICA - TEM FILTRO DE USUÁRIO?:', baseConditions.some(c => c.toString().includes('user_id')));

    // 🚨 TESTE DIRETO: Vou fazer uma query sem filtros para ver se há dados
    console.log('🚨 TESTE DIRETO - Fazendo query simples só com userId...');
    const testQuery = await db
      .select({
        category: tournaments.category,
        volume: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId))
      .groupBy(tournaments.category);
    
    console.log('🚨 TESTE DIRETO - Resultado da query simples:', testQuery);
    console.log('🚨 TESTE DIRETO - Número de categorias encontradas:', testQuery.length);

    const result = await db
      .select({
        category: tournaments.category,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.category);

    console.log('🔍 CATEGORY DEBUG - Raw result from database:', result);
    console.log('🔍 CATEGORY DEBUG - Result length:', result.length);

    // Log each category found
    result.forEach((item, index) => {
      console.log(`🔍 CATEGORY DEBUG - Item ${index}:`, {
        category: item.category,
        volume: item.volume,
        profit: item.profit
      });
    });

    return result;
  }

  getDateCondition(period: string) {
    const now = new Date();
    let dateThreshold: Date;

    console.log('🔍 BACKEND DEBUG - Período recebido:', period);
    console.log('🔍 BACKEND DEBUG - Data atual:', now.toISOString().split('T')[0]);

    switch (period) {
      case "7d":
        dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        dateThreshold = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "365d":
      case "1y":
        dateThreshold = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        // For "all" or any other period, return a condition that's always true
        console.log('🔍 BACKEND DEBUG - Período "all" - retornando todos os dados');
        return sql`1 = 1`;
    }

    const dateString = dateThreshold.toISOString().split('T')[0];
    console.log('🔍 BACKEND DEBUG - Data de corte calculada:', dateString);
    console.log('🔍 BACKEND DEBUG - Filtrando torneios >= que:', dateString);

    return gte(tournaments.datePlayed, dateThreshold);
  }

  buildFilterConditions(filters: any): any[] {
    const conditions: any[] = [];

    // Date range filter - example only, adjust as necessary
    if (filters.dateRange?.from) {
      conditions.push(gte(tournaments.datePlayed, new Date(filters.dateRange.from)));
    }
    if (filters.dateRange?.to) {
      conditions.push(lte(tournaments.datePlayed, new Date(filters.dateRange.to)));
    }

    // Sites filter
    if (filters.sites?.length > 0) {
      conditions.push(inArray(tournaments.site, filters.sites));
    }

    return conditions;
  }

  async getAnalyticsByDayOfWeek(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {
    console.log('🔍 BACKEND DEBUG - getAnalyticsByDayOfWeek - Período recebido:', period);
    console.log('🔍 BACKEND DEBUG - getAnalyticsByDayOfWeek - Filtros recebidos:', filters);

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const results = await db
      .select({
        dayOfWeek: sql<string>`EXTRACT(DOW FROM ${tournaments.datePlayed})::text`,
        dayName: sql<string>`
          CASE EXTRACT(DOW FROM ${tournaments.datePlayed})
            WHEN 0 THEN 'Domingo'
            WHEN 1 THEN 'Segunda'
            WHEN 2 THEN 'Terça'
            WHEN 3 THEN 'Quarta'
            WHEN 4 THEN 'Quinta'
            WHEN 5 THEN 'Sexta'
            WHEN 6 THEN 'Sábado'
          END
        `,
        volume: sql<string>`COUNT(*)::text`,
        // CORREÇÃO: prize já contém o profit calculado (resultado - buy-in), não subtrair novamente
        profit: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
        roi: sql<string>`
          CASE 
            WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 
            THEN ROUND((SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100, 2)::text
            ELSE '0'
          END
        `,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`)
      .orderBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`);

    console.log('DEBUG Day of Week Analytics - Raw data from DB:', results);
    console.log('DEBUG Day of Week Analytics - Sample item:', results[0]);

    // Ensure we have all days of the week represented
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const completeResults = [];

    for (let i = 0; i < 7; i++) {
      const existing = results.find(r => parseInt(String(r.dayOfWeek)) === i);
      if (existing) {
        completeResults.push(existing);
      } else {
        completeResults.push({
          dayOfWeek: i.toString(),
          dayName: dayNames[i],
          volume: '0',
          profit: '0',
          roi: '0'
        });
      }
    }

    console.log('DEBUG Day of Week Analytics - Final results:', completeResults);
    return completeResults;
  }

  // ETAPA 4: Analytics por velocidade

async getAnalyticsBySpeed(userId: string, period = "30d", filters: any = {}): Promise<any> {
    console.log('🔍 BACKEND DEBUG - getAnalyticsBySpeed - Período recebido:', period);
    console.log('🔍 BACKEND DEBUG - getAnalyticsBySpeed - Filtros recebidos:', filters);

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    return await db
      .select({
        speed: tournaments.speed,
        volume: sql<number>`COUNT(*)`,
        // CORREÇÃO: Usar a mesma lógica de profit por categoria - prize já contém o profit calculado
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        // CORREÇÃO: ROI baseado no profit total vs total investido
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        // CORREÇÃO: Profit médio por torneio
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.speed);
  }

  // ETAPA 5: Analytics mensais
  async getAnalyticsByMonth(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {
    console.log('🔍 BACKEND DEBUG - getAnalyticsByMonth - Período recebido:', period);
    console.log('🔍 BACKEND DEBUG - Filtros recebidos:', filters);

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const monthlyData = await db
      .select({
        month: sql<string>`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`,
        monthName: sql<string>`TO_CHAR(${tournaments.datePlayed}, 'MM/YYYY')`,
        volume: sql<string>`COUNT(*)`,
        // CORREÇÃO: Usar a mesma lógica dos outros analytics - prize já contém o profit calculado
        profit: sql<string>`SUM(CAST(${tournaments.prize} AS DECIMAL(10,2)))`,
        buyins: sql<string>`SUM(CAST(${tournaments.buyIn} AS DECIMAL(10,2)))`,
        roi: sql<string>`
          CASE 
            WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL(10,2))) > 0 
            THEN (SUM(CAST(${tournaments.prize} AS DECIMAL(10,2))) / SUM(CAST(${tournaments.buyIn} AS DECIMAL(10,2)))) * 100
            ELSE 0 
          END
        `,
        // Adicionar avgFieldSize usando a mesma lógica do getDashboardStats
        avgFieldSize: sql<number>`ROUND(AVG(CASE WHEN ${tournaments.fieldSize} >= 15 AND ${tournaments.fieldSize} IS NOT NULL THEN CAST(${tournaments.fieldSize} AS DECIMAL) ELSE NULL END), 0)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM'), TO_CHAR(${tournaments.datePlayed}, 'MM/YYYY')`)
      .orderBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM') DESC`);

    console.log('DEBUG Month Analytics - Raw data from DB:', monthlyData);
    console.log('DEBUG Month Analytics - Sample item structure:', monthlyData[0]);

    // Aplicar a mesma lógica de mediana/média do getDashboardStats para cada mês
    const processedMonthlyData = await Promise.all(monthlyData.map(async (item) => {
      // Buscar field sizes válidos para este mês específico
      const monthConditions = [
        eq(tournaments.userId, userId),
        sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM') = ${item.month}`,
        gte(tournaments.fieldSize, 15),
        isNotNull(tournaments.fieldSize)
      ];

      // Adicionar filtros adicionais se existirem
      if (dashboardFilters) {
        monthConditions.push(dashboardFilters);
      }

      const fieldSizeValues = await db
        .select({ fieldSize: tournaments.fieldSize })
        .from(tournaments)
        .where(and(...monthConditions))
        .orderBy(tournaments.fieldSize);

      let avgFieldSize = 0;

      // Verificar se há dados de CoinPoker para este mês específico
      const coinPokerCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(tournaments)
        .where(and(
          eq(tournaments.userId, userId),
          sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM') = ${item.month}`,
          eq(tournaments.site, 'CoinPoker')
        ));

      const hasCoinPokerData = Number(coinPokerCount[0]?.count || 0) > 0;

      if (hasCoinPokerData) {
        // Para CoinPoker, usar média
        avgFieldSize = Number(item.avgFieldSize) || 0;
      } else {
        // Para todos os outros sites, usar MEDIANA
        const fieldSizes = fieldSizeValues.map(row => Number(row.fieldSize));

        if (fieldSizes.length > 0) {
          const sortedFieldSizes = fieldSizes.sort((a, b) => a - b);
          const middleIndex = Math.floor(sortedFieldSizes.length / 2);

          if (sortedFieldSizes.length % 2 === 0) {
            avgFieldSize = Math.round((sortedFieldSizes[middleIndex - 1] + sortedFieldSizes[middleIndex]) / 2);
          } else {
            avgFieldSize = sortedFieldSizes[middleIndex];
          }
        }
      }

      return {
        month: item.month,
        monthName: item.monthName,
        volume: item.volume,
        profit: item.profit,
        buyins: item.buyins,
        roi: item.roi,
        avgFieldSize: avgFieldSize
      };
    }));

    return processedMonthlyData;
  }

  // ETAPA 5: Analytics por faixa de field
  async getAnalyticsByField(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {
    console.log('🔍 BACKEND DEBUG - getAnalyticsByField - Período recebido:', period);
    console.log('🔍 BACKEND DEBUG - getAnalyticsByField - Filtros recebidos:', filters);

    const baseConditions = [
      eq(tournaments.userId, userId),
      isNotNull(tournaments.position),
      isNotNull(tournaments.fieldSize)
    ];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    // Primeiro, buscar todos os torneios com position e fieldSize válidos
    const allTournaments = await db
      .select({
        position: tournaments.position,
        fieldSize: tournaments.fieldSize,
        prize: tournaments.prize,
        buyIn: tournaments.buyIn,
      })
      .from(tournaments)
      .where(whereCondition);

    console.log('DEBUG Field Analytics - Raw tournaments:', allTournaments.length);

    // Processar no JavaScript para calcular percentuais de eliminação
    const tournamentsWithPercentage = allTournaments.map(t => {
      const eliminationPercentage = (t.position && t.fieldSize) ? (t.position / t.fieldSize) * 100 : 0;
      return {
        ...t,
        eliminationPercentage
      };
    });

    // Definir faixas de eliminação percentual
    const fieldRanges = [
      { label: 'Top 5%', min: 0, max: 5 },
      { label: '5-10%', min: 5, max: 10 },
      { label: '10-15%', min: 10, max: 15 },
      { label: '15-20%', min: 15, max: 20 },
      { label: '20-30%', min: 20, max: 30 },
      { label: '30-50%', min: 30, max: 50 },
      { label: '50-75%', min: 50, max: 75 },
      { label: '75-100%', min: 75, max: 100 }
    ];

    // Agrupar por faixas de eliminação
    const analytics = fieldRanges.map(range => {
      const tournamentsInRange = tournamentsWithPercentage.filter(t => {
        const eliminationPercentage = t.eliminationPercentage;
        return eliminationPercentage >= range.min && eliminationPercentage < range.max;
      });

      const volume = tournamentsInRange.length;
      const profit = tournamentsInRange.reduce((sum, t) => sum + parseFloat(String(t.prize || '0')), 0);
      const buyins = tournamentsInRange.reduce((sum, t) => sum + parseFloat(String(t.buyIn || '0')), 0);
      const roi = buyins > 0 ? (profit / buyins) * 100 : 0;

      return {
        fieldRange: range.label,
        volume: volume.toString(),
        profit: profit.toString(),
        buyins: buyins.toString(),
        roi: roi.toString()
      };
    });

    console.log('DEBUG Field Analytics - Final results:', analytics);
    return analytics;
  }

  // ETAPA 5: Analytics de posições finais - Mesa Final (1-18)
  async getFinalTableAnalytics(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {
    console.log('🔍 BACKEND DEBUG - getFinalTableAnalytics - Período recebido:', period);
    console.log('🔍 BACKEND DEBUG - getFinalTableAnalytics - Filtros recebidos:', filters);

    const baseConditions = [
      eq(tournaments.userId, userId),
      gte(tournaments.position, 1),
      lte(tournaments.position, 9), // Apenas posições 1-9 são final table
      isNotNull(tournaments.position)
    ];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    // Buscar apenas torneios com posições 1-9 (final table válidas)
    const results = await db
      .select({
        position: tournaments.position,
        volume: sql<string>`COUNT(*)::text`,
        profit: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL)), 0)::text`,
        roi: sql<string>`
          CASE 
            WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 
            THEN ROUND((SUM(CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100, 2)::text
            ELSE '0'
          END
        `,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.position)
      .orderBy(tournaments.position);

    return results;
  }

  async getPlannedTournamentsDashboardStats(userId: string, period = "30d", filters: any = {}): Promise<any> {

    try {
      // First, get the active profile states for each day
      const activeProfileStates = await db
        .select({
          dayOfWeek: profileStates.dayOfWeek,
          activeProfile: profileStates.activeProfile
        })
        .from(profileStates)
        .where(eq(profileStates.userId, userId));

      // Create a map of dayOfWeek -> activeProfile (apenas para perfis ativos)
      const activeProfileMap = new Map<number, string>();
      activeProfileStates.forEach(state => {
        // Apenas incluir dias onde há um perfil ativo (não null)
        if (state.activeProfile !== null) {
          activeProfileMap.set(state.dayOfWeek, state.activeProfile);
        }
      });

      // Get planned tournaments matching active profiles
      const baseConditions = [
        eq(plannedTournaments.userId, userId),
        eq(plannedTournaments.isActive, true)
      ];

      // Add profile filtering conditions
      const profileConditions = [];
      for (const [dayOfWeek, activeProfile] of activeProfileMap) {
        profileConditions.push(
          and(
            eq(plannedTournaments.dayOfWeek, dayOfWeek),
            eq(plannedTournaments.profile, activeProfile)
          )
        );
      }

      // Se não há perfis ativos em nenhum dia, retornar estatísticas zeradas
      if (profileConditions.length === 0) {
        return {
          count: 0,
          profit: 0,
          abi: 0,
          roi: 0,
          itm: 0,
          reentries: 0,
          avgProfitPerTournament: 0,
          stakeRange: { min: 0, max: 0 },
          finalTables: 0,
          finalTablesRate: 0,
          bigHits: 0,
          bigHitsRate: 0,
          avgFieldSize: 0,
          avgProfitPerDay: 0,
          earlyFinishes: 0,
          earlyFinishRate: 0,
          lateFinishes: 0,
          lateFinishRate: 0,
          biggestPrize: 0,
          daysPlayed: 0,
          headsUpTotal: 0,
          headsUpWins: 0,
          totalProfit: 0,
          totalBuyins: 0,
          totalTournaments: 0,
          vanillaCount: 0,
          pkoCount: 0,
          mysteryCount: 0,
          normalCount: 0,
          turboCount: 0,
          hyperCount: 0,
          activeDays: 0
        };
      }

      baseConditions.push(or(...profileConditions));

      const whereCondition = and(...baseConditions);

      // Get tournament statistics from planned tournaments
      const stats = await db
        .select({
          count: sql<number>`COUNT(*)`,
          totalBuyins: sql<number>`SUM(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          avgBuyin: sql<number>`AVG(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          minBuyin: sql<number>`MIN(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          maxBuyin: sql<number>`MAX(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          totalGuaranteed: sql<number>`SUM(CAST(${plannedTournaments.guaranteed} AS DECIMAL))`,
          avgGuaranteed: sql<number>`AVG(CAST(${plannedTournaments.guaranteed} AS DECIMAL))`,
          vanillaCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.type} = 'Vanilla' THEN 1 END)`,
          pkoCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.type} = 'PKO' THEN 1 END)`,
          mysteryCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.type} = 'Mystery' THEN 1 END)`,
          normalCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.speed} = 'Normal' THEN 1 END)`,
          turboCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.speed} = 'Turbo' THEN 1 END)`,
          hyperCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.speed} = 'Hyper' THEN 1 END)`,
          activeDays: sql<number>`COUNT(DISTINCT ${plannedTournaments.dayOfWeek})`
        })
        .from(plannedTournaments)
        .where(whereCondition);

      const result = stats[0];

      if (!result || result.count === 0) {
        return {
          count: 0,
          profit: 0,
          abi: 0,
          roi: 0,
          itm: 0,
          reentries: 0,
          avgProfitPerTournament: 0,
          stakeRange: { min: 0, max: 0 },
          finalTables: 0,
          finalTablesRate: 0,
          bigHits: 0,
          bigHitsRate: 0,
          avgFieldSize: 0,
          avgProfitPerDay: 0,
          earlyFinishes: 0,
          earlyFinishRate: 0,
          lateFinishes: 0,
          lateFinishRate: 0,
          biggestPrize: 0,
          daysPlayed: result.activeDays || 0,
          headsUpTotal: 0,
          headsUpWins: 0,
          totalProfit: 0,
          totalBuyins: result.totalBuyins || 0,
          totalTournaments: result.count || 0,
          avgBuyin: result.avgBuyin || 0,
          itmCount: 0,
          firstPlaceCount: 0,
          profileBased: true,
          activeProfiles: Array.from(activeProfileMap.values()),
          activeDays: result.activeDays || 0
        };
      }

      // Calculate metrics based on planned tournaments
      const count = Number(result.count || 0);
      const totalBuyins = Number(result.totalBuyins || 0);
      const avgBuyin = Number(result.avgBuyin || 0);
      const activeDays = Number(result.activeDays || 0);

      // For planned tournaments, we can't calculate historical profit/ITM/etc.
      // Instead, we show planning metrics
      const plannedStats = {
        count,
        profit: 0, // No historical profit for planned tournaments
        abi: avgBuyin,
        roi: 0, // No historical ROI for planned tournaments
        itm: 0, // No historical ITM for planned tournaments
        reentries: 0, // No historical reentries for planned tournaments
        avgProfitPerTournament: 0,
        stakeRange: {
          min: Number(result.minBuyin || 0),
          max: Number(result.maxBuyin || 0)
        },
        finalTables: 0,
        finalTablesRate: 0,
        bigHits: 0,
        bigHitsRate: 0,
        avgFieldSize: 0,
        avgProfitPerDay: 0,
        earlyFinishes: 0,
        earlyFinishRate: 0,
        lateFinishes: 0,
        lateFinishRate: 0,
        biggestPrize: 0,
        daysPlayed: activeDays,
        headsUpTotal: 0,
        headsUpWins: 0,
        totalProfit: 0,
        totalBuyins,
        totalTournaments: count,
        avgBuyin,
        itmCount: 0,
        firstPlaceCount: 0,
        profileBased: true,
        activeProfiles: Array.from(activeProfileMap.values()),
        activeDays,
        // Planning-specific metrics
        totalGuaranteed: Number(result.totalGuaranteed || 0),
        avgGuaranteed: Number(result.avgGuaranteed || 0),
        vanillaCount: Number(result.vanillaCount || 0),
        pkoCount: Number(result.pkoCount || 0),
        mysteryCount: Number(result.mysteryCount || 0),
        normalCount: Number(result.normalCount || 0),
        turboCount: Number(result.turboCount || 0),
        hyperCount: Number(result.hyperCount || 0),
        vanillaPercentage: count > 0 ? (Number(result.vanillaCount || 0) / count) * 100 : 0,
        pkoPercentage: count > 0 ? (Number(result.pkoCount || 0) / count) * 100 : 0,
        mysteryPercentage: count > 0 ? (Number(result.mysteryCount || 0) / count) * 100 : 0,
        normalPercentage: count > 0 ? (Number(result.normalCount || 0) / count) * 100 : 0,
        turboPercentage: count > 0 ? (Number(result.turboCount || 0) / count) * 100 : 0,
        hyperPercentage: count > 0 ? (Number(result.hyperCount || 0) / count) * 100 : 0
      };


      return plannedStats;

    } catch (error) {
      console.error('🚨 PROFILE-BASED DASHBOARD ERROR:', error);
      throw error;
    }
  }

  async getDashboardStats(userId: string, period = "30d", filters: any = {}): Promise<any> {
    // 🚨 ETAPA 2 DEBUG - Verificação crítica do userPlatformId
    console.log('🚨 ETAPA 2 DEBUG - getDashboardStats iniciado');
    console.log('🚨 ETAPA 2 DEBUG - userId recebido:', userId);
    console.log('🚨 ETAPA 2 DEBUG - Tipo do userId:', typeof userId);
    console.log('🚨 ETAPA 2 DEBUG - Period:', period);
    console.log('🚨 ETAPA 2 DEBUG - Filters:', filters);
    
    // Check if profile-based filtering is enabled
    if (filters.profileBased) {
      console.log('🔍 PROFILE-BASED FILTERING ENABLED - Switching to planned tournaments dashboard');
      return this.getPlannedTournamentsDashboardStats(userId, period, filters);
    }
    
    // Base condition - always filter by user
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter
    console.log('🔍 BACKEND DEBUG - getDashboardStats - Período recebido:', period);
    console.log('🔍 BACKEND DEBUG - getDashboardStats - Filtros recebidos:', filters);

    // DEBUG DETALHADO DOS FILTROS
    if (filters.sites?.length > 0) {
      console.log('🔍 FILTRO DEBUG - Sites que serão filtrados:', filters.sites);
    }
    if (filters.categories?.length > 0) {
      console.log('🔍 FILTRO DEBUG - Categorias que serão filtradas:', filters.categories);
    }
    if (filters.speeds?.length > 0) {
      console.log('🔍 FILTRO DEBUG - Velocidades que serão filtradas:', filters.speeds);
    }

    // INVESTIGAÇÃO: Log específico para "Mesas Finais"
    console.log('🎯 MESA FINAL DEBUG - Iniciando investigação da métrica "Mesas Finais"');

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters){
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    console.log('🔍 WHERE CONDITION DEBUG - Final conditions:', whereCondition);
    console.log('🔍 WHERE CONDITION DEBUG - Base conditions length:', baseConditions.length);

    // INVESTIGAÇÃO: Verificar torneios com posições finais para debug (SIMPLIFICADA)
    let finalTableInvestigation: any[] = [];
    try {
      const finalTableCount = await db
        .select({
          count: sql<number>`COUNT(*)`
        })
        .from(tournaments)
        .where(and(
          eq(tournaments.userId, userId),
          isNotNull(tournaments.position),
          gte(tournaments.position, 1),
          lte(tournaments.position, 9)
        ));
      
      console.log('🎯 MESA FINAL DEBUG - Contagem final tables:', finalTableCount[0]?.count || 0);
    } catch (error) {
      console.log('🚨 ERRO na investigação Final Table:', error);
    }

    // Executar query principal
    let stats: any;
    try {
      console.log('🎯 EXECUTANDO QUERY PRINCIPAL - getDashboardStats...');
      
      stats = await db
        .select({
          // Contagem: Quantidade de torneios
          count: sql<number>`COUNT(*)`,

          // Lucro: Profit total (usando a coluna prize que já contém o profit calculado)
          totalProfit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,

          // Total investido (buy-ins + reentradas para ROI)
          totalBuyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
          totalReentries: sql<number>`SUM(COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0))`,
          totalReentriesCost: sql<number>`SUM(COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0) * CAST(${tournaments.buyIn} AS DECIMAL))`,

          // ABI: Buy-in médio (Stake Médio) - rounded to 2 decimal places
          avgBuyin: sql<number>`ROUND(AVG(CAST(${tournaments.buyIn} AS DECIMAL)), 2)`,

          // ITM: Quantidade que ficou na premiação (prize > 0)
          itmCount: sql<number>`SUM(CASE WHEN CAST(${tournaments.prize} AS DECIMAL) > 0 THEN 1 ELSE 0 END)`,

          // FTs: Final Tables (posição >= 1 AND <= 9, números válidos apenas)
          finalTablesCount: sql<number>`SUM(CASE WHEN ${tournaments.position} >= 1 AND ${tournaments.position} <= 9 AND ${tournaments.position} IS NOT NULL THEN 1 ELSE 0 END)`,

          // Cravadas: 1º lugar (posição = 1)
          firstPlaceCount: sql<number>`SUM(CASE WHEN ${tournaments.position} = 1 THEN 1 ELSE 0 END)`,

          // Média de participantes - will be calculated separately with median for most sites
          avgFieldSize: sql<number>`ROUND(AVG(CASE WHEN ${tournaments.fieldSize} >= 15 AND ${tournaments.fieldSize} IS NOT NULL THEN CAST(${tournaments.fieldSize} AS DECIMAL) ELSE NULL END), 0)`,

          // Finalização Precoce: últimos 10% (percentil >= 90%)
          earlyFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.fieldSize} IS NOT NULL AND ${tournaments.fieldSize} > 0 AND ${tournaments.fieldSize} >= 15 AND ${tournaments.position} IS NOT NULL AND ${tournaments.position} > 0 AND (CAST(${tournaments.position} AS DECIMAL) / CAST(${tournaments.fieldSize} AS DECIMAL)) * 100 >= 90 THEN 1 ELSE 0 END)`,

          // Finalização Tardia: primeiros 10% (percentil <= 10%)
          lateFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.fieldSize} IS NOT NULL AND ${tournaments.fieldSize} > 0 AND ${tournaments.fieldSize} >= 15 AND ${tournaments.position} IS NOT NULL AND ${tournaments.position} > 0 AND (CAST(${tournaments.position} AS DECIMAL) / CAST(${tournaments.fieldSize} AS DECIMAL)) * 100 <= 10 THEN 1 ELSE 0 END)`,

          // Big Hit: Maior premiação registrada
          biggestPrize: sql<number>`MAX(CAST(${tournaments.prize} AS DECIMAL))`,

          // Stake Range: menor e maior buy-in (ignorando valores muito baixos e freerolls)
          minBuyin: sql<number>`MIN(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,
          maxBuyin: sql<number>`MAX(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,

          // Dias Jogados: Quantidade de dias únicos com registros
          daysPlayed: sql<number>`COUNT(DISTINCT DATE(${tournaments.datePlayed}))`,

          // Heads-Up: Estatísticas específicas para heads-up (field_size = 2 ou field_size <= 4 para incluir small field)
          headsUpTotal: sql<number>`SUM(CASE WHEN ${tournaments.fieldSize} = 2 OR ${tournaments.fieldSize} <= 4 THEN 1 ELSE 0 END)`,
          headsUpWins: sql<number>`SUM(CASE WHEN (${tournaments.fieldSize} = 2 OR ${tournaments.fieldSize} <= 4) AND ${tournaments.position} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(tournaments)
        .where(whereCondition);
    } catch (error) {
      console.log('🚨 ERRO na query principal:', error);
      return {
        count: 0,
        profit: 0,
        abi: 0,
        roi: 0,
        itm: 0,
        reentries: 0,
        avgProfitPerTournament: 0,
        stakeRange: { min: 0, max: 0 },
        finalTables: 0,
        finalTablesRate: 0,
        bigHits: 0,
        bigHitsRate: 0,
        avgFieldSize: 0,
        avgProfitPerDay: 0,
        earlyFinishes: 0,
        earlyFinishRate: 0,
        lateFinishes: 0,
        lateFinishRate: 0,
        biggestPrize: 0,
        daysPlayed: 0,
        headsUpTotal: 0,
        headsUpWins: 0,
        totalProfit: 0,
        totalBuyins: 0,
        totalTournaments: 0,
        avgBuyin: 0,
        itmCount: 0,
        firstPlaceCount: 0
      };
    }

    const [result] = stats || [];

    console.log('🎯 MESA FINAL DEBUG - Resultado da query principal:', result);
    console.log('🎯 MESA FINAL DEBUG - FTs calculados pela query:', Number(result?.finalTablesCount || 0));
    console.log('🎯 MESA FINAL DEBUG - Critério usado na query: posição <= 9 AND posição > 0');

    if (!result) {
      return {
        count: 0,
        profit: 0,
        abi: 0,
        roi: 0,
        itm: 0,
        reentries: 0,
        avgProfitPerTournament: 0,
        stakeRange: { min: 0, max: 0 },
        finalTables: 0,
        finalTablesRate: 0,
        bigHits: 0,
        bigHitsRate: 0,
        avgFieldSize: 0,
        avgProfitPerDay: 0,
        earlyFinishes: 0,
        earlyFinishRate: 0,
        lateFinishes: 0,
        lateFinishRate: 0,
        biggestPrize: 0,
        daysPlayed: 0,
        headsUpTotal: 0,
        headsUpWins: 0,
      };
    }

    // Cálculos corretos baseados nas especificações
    const count = Number(result.count || 0);
    const profit = Number(result.totalProfit || 0);
    const totalBuyins = Number(result.totalBuyins || 0);
    const totalReentries = Number(result.totalReentries || 0);

    // Calculando valor investido total (buy-ins + reentradas em dinheiro)
    const totalReentriesCost = Number(result.totalReentriesCost || 0);
    const totalInvested = totalBuyins + totalReentriesCost;

    // Calculando número total de entradas (torneios + reentradas)
    const totalEntries = count + totalReentries;

    // 1. Contagem: Quantidade de torneios
    // 2. Lucro: Profit total dos torneios
    // 3. ABI: Buy-in médio do torneio
    const abi = Number(result.avgBuyin || 0);

    // 4. ROI: Profit / (Total investido: buy-in + reentradas em valor monetário)
    console.log('DEBUG ROI:', { profit, totalBuyins, totalReentriesCost, totalInvested, count, totalReentries });
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    // 5. ITM: Percentual que ficou dentro da faixa de premiação
    const itmCount = Number(result.itmCount || 0);
    const itm = count > 0 ? (itmCount / count) * 100 : 0;

    // 6. Reentradas: Quantidade total de reentradas feitas no torneio
    const reentries = totalReentries;

    // 7. Lucro Médio: Lucro total / (Entradas + Reentradas)
    const avgProfitPerTournament = totalEntries > 0 ? profit / totalEntries : 0;

    // 8. Stake Range: Menor e maior buy-in dos torneios, ignorando amostragens muito baixas
    const stakeRange = {
      min: Number(result.minBuyin || 0),
      max: Number(result.maxBuyin || 0)
    };

    // 9. FTs: Quantidade total que ficou dentre os 9 primeiros, junto com percentual
    const finalTablesCount = Number(result.finalTablesCount || 0);
    const finalTablesRate = count > 0 ? (finalTablesCount / count) * 100 : 0;

    // 10. Cravadas: Quantidade total que ficou em 1º no torneio, junto com percentual
    const firstPlaceCount = Number(result.firstPlaceCount || 0);
    const bigHitsRate = count > 0 ? (firstPlaceCount / count) * 100 : 0;

    // 11. Média de participantes: MEDIANA para todos os sites (exceto CoinPoker)

    // Buscar todos os valores de fieldSize válidos para calcular mediana
    const fieldSizeValues = await db
      .select({ fieldSize: tournaments.fieldSize })
      .from(tournaments)
      .where(and(
        whereCondition,
        gte(tournaments.fieldSize, 15),
        isNotNull(tournaments.fieldSize)
      ))
      .orderBy(tournaments.fieldSize);

    let avgFieldSize = 0;

    // Verificar se há dados de CoinPoker para usar média em vez de mediana
    const coinPokerTournaments = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tournaments)
      .where(and(
        whereCondition,
        eq(tournaments.site, 'CoinPoker')
      ));

    const hasCoinPokerData = Number(coinPokerTournaments[0]?.count || 0) > 0;

    if (hasCoinPokerData) {
      // Para CoinPoker, usar média (método atual)
      avgFieldSize = Number(result.avgFieldSize) || 0;
      console.log('🔍 PARTICIPANTES DEBUG - CoinPoker detectado, usando MÉDIA:', avgFieldSize);
    } else {
      // Para todos os outros sites, usar MEDIANA
      const fieldSizes = fieldSizeValues.map(row => Number(row.fieldSize));

      if (fieldSizes.length > 0) {
        // Calcular mediana
        const sortedFieldSizes = fieldSizes.sort((a, b) => a - b);
        const middleIndex = Math.floor(sortedFieldSizes.length / 2);

        if (sortedFieldSizes.length % 2 === 0) {
          // Número par de elementos: média dos dois valores do meio
          avgFieldSize = Math.round((sortedFieldSizes[middleIndex - 1] + sortedFieldSizes[middleIndex]) / 2);
        } else {
          // Número ímpar de elementos: valor do meio
          avgFieldSize = sortedFieldSizes[middleIndex];
        }

        console.log('🔍 PARTICIPANTES DEBUG - MEDIANA calculada:', avgFieldSize);
        console.log('🔍 PARTICIPANTES DEBUG - Total de valores:', fieldSizes.length);
        console.log('🔍 PARTICIPANTES DEBUG - Valores de exemplo:', fieldSizes.slice(0, 5), '...');
      } else {
        console.log('🔍 PARTICIPANTES DEBUG - Sem dados válidos para mediana');
      }
    }

    console.log('🔍 PARTICIPANTES DEBUG - Critério aplicado: fieldSize >= 15');
    console.log('🔍 PARTICIPANTES DEBUG - Valor sendo retornado:', avgFieldSize);

    // 16. Dias Jogados: Quantidade de dias únicos com registros
    const daysPlayed = Number(result.daysPlayed || 0);

    // 12. Lucro Médio/Dia: Lucro total dividido pelos dias jogados
    const avgProfitPerDay = daysPlayed > 0 ? profit / daysPlayed : 0;

    // 13. Finalização Precoce: Frequência em que ficou entre 10% dos últimos no torneio (percentil >= 90%)
    const earlyFinishCount = Number(result.earlyFinishCount || 0);
    const earlyFinishRate = count > 0 ? (earlyFinishCount / count) * 100 : 0;

    // 14. Finalização Tardia: Frequência em que ficou entre os 10% dos primeiros no torneio (percentil <= 10%)
    const lateFinishCount = Number(result.lateFinishCount || 0);
    const lateFinishRate = count > 0 ? (lateFinishCount / count) * 100 : 0;

    console.log('🔍 FINALIZAÇÃO DEBUG - Dados calculados:');
    console.log('🔍 FINALIZAÇÃO DEBUG - Finalização Precoce:', earlyFinishCount, 'torneios (', earlyFinishRate.toFixed(2), '%)');
    console.log('🔍 FINALIZAÇÃO DEBUG - Finalização Tardia:', lateFinishCount, 'torneios (', lateFinishRate.toFixed(2), '%)');
    console.log('🔍 FINALIZAÇÃO DEBUG - Critério: percentil >= 90% (precoce) e <= 10% (tardia)');

    // 15. Big Hit: A maior premiação registrada dos torneios
    const biggestPrize = Number(result.biggestPrize || 0);

    // 17. Heads-Up: Estatísticas específicas para heads-up
    const headsUpTotal = Number(result.headsUpTotal || 0);
    const headsUpWins = Number(result.headsUpWins || 0);

    return {
      // Indicadores principais conforme especificação
      count, // 1. Contagem
      profit, // 2. Lucro
      abi, // 3. ABI
      roi, // 4. ROI
      itm, // 5. ITM%
      reentries, // 6. Reentradas
      avgProfitPerTournament, // 7. Lucro Médio/Torneio
      stakeRange, // 8. Stake Range
      finalTables: finalTablesCount, // 9. FTs (quantidade)
      finalTablesRate, // 9. FTs (percentual)
      bigHits: firstPlaceCount, // 10. Cravadas (quantidade)
      bigHitsRate, // 10. Cravadas (percentual)
      firstPlaceCount, // 🏆 Cravadas (quantidade específica)
      avgFieldSize, // 11. Média participantes
      avgProfitPerDay, // 12. Lucro Médio/Dia
      earlyFinishes: earlyFinishCount, // 13. Finalização Precoce (quantidade)
      earlyFinishRate, // 13. Finalização Precoce (percentual)
      lateFinishes: lateFinishCount, // 14. Finalização Tardia (quantidade)
      lateFinishRate, // 14. Finalização Tardia (percentual)
      biggestPrize, // 15. Big Hit
      daysPlayed, // 16. Dias Jogados
      headsUpTotal, // 17. Heads-Up Total
      headsUpWins, // 17. Heads-Up Wins

      // Campos para compatibilidade
      totalProfit: profit,
      totalBuyins,
      totalTournaments: count,
      avgBuyin: abi,
      itmCount,
    };
  }

  async getPerformanceByPeriod(userId: string, period: string, filters: any = {}): Promise<any> {
    console.log('🔍 PERFORMANCE DEBUG - getPerformanceByPeriod chamado');
    console.log('🔍 PERFORMANCE DEBUG - userId:', userId);
    console.log('🔍 PERFORMANCE DEBUG - period:', period);
    console.log('🔍 PERFORMANCE DEBUG - filters:', filters);

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter if not showing all
    if (period !== "all") {
      const now = new Date();
      let startDate: Date;
      let endDate: Date | null = null;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'last_3_months':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'last_6_months':
          startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
          break;
        case 'last_12_months':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'last_24_months':
          startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
          break;
        case 'last_36_months':
          startDate = new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        case 'current_month':
          // First day of current month at 00:00:00
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
        case 'current_year':
          // First day of current year at 00:00:00
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          // Handle custom date ranges (YYYY-MM-DD to YYYY-MM-DD format)
          if (period.includes(' to ')) {
            const [from, to] = period.split(' to ');
            startDate = new Date(from + 'T00:00:00.000Z');
            endDate = new Date(to + 'T23:59:59.999Z');
            console.log('🔍 PERFORMANCE DEBUG - Custom range:', { from, to, startDate, endDate });
          } else {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          }
      }

      console.log('🔍 PERFORMANCE DEBUG - startDate:', startDate);
      console.log('🔍 PERFORMANCE DEBUG - endDate:', endDate);

      baseConditions.push(gte(tournaments.datePlayed, startDate));
      if (endDate) {
        baseConditions.push(lte(tournaments.datePlayed, endDate));
      }
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    console.log('🔍 PERFORMANCE DEBUG - baseConditions length:', baseConditions.length);
    
    const performance = await db
      .select({
        date: sql<string>`DATE(${tournaments.datePlayed})`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`DATE(${tournaments.datePlayed})`)
      .orderBy(sql`DATE(${tournaments.datePlayed})`);

    console.log('🔍 PERFORMANCE DEBUG - Resultados encontrados:', performance.length);
    console.log('🔍 PERFORMANCE DEBUG - Total profit:', performance.reduce((sum, p) => sum + Number(p.profit), 0));

    return performance;
  }

  // Tournament Library com Agrupamento Inteligente
  async getTournamentLibrary(userId: string, period: string = "all", filters: any = {}): Promise<any[]> {
    // Base condition - always filter by user
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter if not showing all
    if (period !== "all") {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      baseConditions.push(gte(tournaments.datePlayed, startDate));
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    // Get all tournaments for the user within period/filters
    const allTournaments = await db
      .select()
      .from(tournaments)
      .where(whereCondition)
      .orderBy(tournaments.datePlayed);

    // Group tournaments intelligently by similarity
    const groups = this.groupTournamentsBySimilarity(allTournaments);

    // Filter groups to only show those with 20+ tournaments
    const significantGroups = groups.filter(group => group.tournaments.length >= 20);

    // Calculate metrics for each group
    const libraryGroups = significantGroups.map(group => {
      const tournamentsList = group.tournaments;
      const volume = tournamentsList.length;

      // Financial metrics
      const totalBuyins = tournamentsList.reduce((sum: number, t: any) => sum + parseFloat(String(t.buyIn)), 0);
      const totalReentries = tournamentsList.reduce((sum: number, t: any) => sum + (t.reentries || 0), 0);
      const totalProfit = tournamentsList.reduce((sum: number, t: any) => sum + parseFloat(String(t.prize)), 0); // prize já é o profit líquido

      // Calculando valor investido total (buy-ins + reentradas em dinheiro)
      const totalReentriesCost = tournamentsList.reduce((sum: number, t: any) => {
        const reentries = t.reentries || 0;
        const buyinValue = parseFloat(String(t.buyIn));
        return sum + (reentries * buyinValue);
      }, 0);
      const totalInvestment = totalBuyins + totalReentriesCost;

      // Calculando número total de entradas (torneios + reentradas)
      const totalEntries = volume + totalReentries;

      const avgProfit = totalEntries > 0 ? totalProfit / totalEntries : 0;
      const roi = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
      const avgBuyin = totalBuyins / volume;

      // Performance metrics
      const finalTables = tournamentsList.filter((t: any) => t.finalTable === true).length;
      const finalTableRate = (finalTables / volume) * 100;
      const bigHits = tournamentsList.filter((t: any) => t.bigHit === true).length;
      const bigHitRate = (bigHits / volume) * 100;
      const itm = tournamentsList.filter((t: any) => t.position && t.position > 0 && parseFloat(String(t.prize)) > 0).length;
      const itmRate = (itm / volume) * 100;

      // Additional metrics
      const avgFieldSize = tournamentsList.reduce((sum: number, t: any) => sum + (t.fieldSize || 0), 0) / volume;
      const avgPosition = tournamentsList.filter((t: any) => t.position).reduce((sum: number, t: any) => sum + (t.position || 0), 0) / tournamentsList.filter((t: any) => t.position).length || 0;

      // Best and worst results
      const bestResult = Math.max(...tournamentsList.map((t: any) => parseFloat(String(t.prize)) - parseFloat(String(t.buyIn))));
      const worstResult = Math.min(...tournamentsList.map((t: any) => parseFloat(String(t.prize)) - parseFloat(String(t.buyIn))));

      return {
        id: group.groupKey,
        groupName: group.groupName,
        representativeTournament: group.representative,
        site: group.site,
        category: group.category,
        speed: group.speed,
        format: group.format,

        // Volume metrics
        volume,

        // Financial metrics
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        avgProfit: parseFloat(avgProfit.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        avgBuyin: parseFloat(avgBuyin.toFixed(2)),
        totalBuyins: parseFloat(totalBuyins.toFixed(2)),

        // Performance metrics
        finalTables,
        finalTableRate: parseFloat(finalTableRate.toFixed(1)),
        bigHits,
        bigHitRate: parseFloat(bigHitRate.toFixed(1)),
        itm,
        itmRate: parseFloat(itmRate.toFixed(1)),

        // Additional metrics
        avgFieldSize: Math.round(avgFieldSize),
        avgPosition: Math.round(avgPosition),
        totalReentries,
        bestResult: parseFloat(bestResult.toFixed(2)),
        worstResult: parseFloat(worstResult.toFixed(2)),

        // Tournament details for drill-down
        tournaments: tournamentsList
      };
    });

    return libraryGroups;
  }

  // Helper function to group tournaments by similarity
  private groupTournamentsBySimilarity(tournaments: any[]): any[] {
    const groups: any[] = [];

    for (const tournament of tournaments) {
      // Find existing group with similar characteristics
      let matchingGroup = groups.find(group => 
        this.tournamentsAreSimilar(tournament, group.representative)
      );

      if (matchingGroup) {
        // Add to existing group
        matchingGroup.tournaments.push(tournament);
      } else {
        // Create new group
        const groupKey = this.generateGroupKey(tournament);
        groups.push({
          groupKey,
          groupName: this.generateGroupName(tournament),
          representative: tournament,
          site: tournament.site,
          category: tournament.category,
          speed: tournament.speed,
          format: tournament.format,
          tournaments: [tournament]
        });
      }
    }

    return groups;
  }

  // Check if two tournaments are similar (50% name similarity + exact buyin/type/speed/site)
  private tournamentsAreSimilar(t1: any, t2: any): boolean {
    // Must be exact same site
    if (t1.site !== t2.site) return false;

    // Must be exact same buy-in
    const buyin1 = parseFloat(String(t1.buyIn));
    const buyin2 = parseFloat(String(t2.buyIn));
    if (buyin1 !== buyin2) return false;

    // Must be exact same category (type)
    if (t1.category !== t2.category) return false;

    // Must be exact same speed
    if (t1.speed !== t2.speed) return false;

    // Check name similarity (50% threshold)
    const name1 = this.normalizeTitle(t1.name);
    const name2 = this.normalizeTitle(t2.name);

    const similarity = this.calculateStringSimilarity(name1, name2);
    return similarity >= 0.5; // 50% similarity threshold
  }

  // Normalize tournament name for better comparison
  private normalizeTitle(name: string): string {
    return name
      .toLowerCase()
      .replace(/\$[\d,]+\s*(gtd|guaranteed)?/gi, '') // Remove prize amounts
      .replace(/\$[\d.]+(k|m)?/gi, '') // Remove dollar amounts
      .replace(/\b(gtd|guaranteed|turbo|hyper|super|progressive|knockout|pko|bounty|mystery|mtt)\b/gi, '') // Remove common terms
      .replace(/\b\d+\s*(re|rebuy|addon|add-on|max|6-max|9-max|heads-up|hu)\b/gi, '') // Remove structural terms
      .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Calculate string similarity using Jaccard similarity
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(str2.split(' ').filter(w => w.length > 2));

    const words1Array = Array.from(words1);
    const words2Array = Array.from(words2);
    const intersectionArray = words1Array.filter(x => words2.has(x));
    const unionArray = Array.from(new Set([...words1Array, ...words2Array]));

    return unionArray.length === 0 ? 0 : intersectionArray.length / unionArray.length;
  }

  // Generate a unique key for the group
  private generateGroupKey(tournament: any): string {
    const normalizedName = this.normalizeTitle(tournament.name);
    const buyin = Math.round(parseFloat(String(tournament.buyIn)));
    return `${tournament.site}-${buyin}-${normalizedName.replace(/\s+/g, '-')}`.toLowerCase();
  }

  // Generate a friendly name for the group
  private generateGroupName(tournament: any): string {
    const name = tournament.name;
    const buyin = parseFloat(String(tournament.buyIn));

    // Extract meaningful parts from tournament name
    let baseName = name
      .replace(/\$[\d,]+\s*(gtd|guaranteed)?/gi, '') // Remove specific prize amounts
      .replace(/\b(episode|day|fase|phase)\s*\d+[a-z]?(\s*[-:]\s*)?/gi, '') // Remove episode/day numbers
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/gi, '') // Remove times
      .replace(/\s*[-–—]\s*\d+-day\s+event/gi, '') // Remove "2-Day Event" etc
      .trim();

    // If name is too generic, use site + category + buyin
    if (baseName.length < 10 || /^(mtt|tournament|torneio)$/i.test(baseName)) {
      baseName = `${tournament.category} Tournament`;
    }

    return `${baseName} ($${buyin})`;
  }

  // Planned tournament operations
  async getPlannedTournaments(userId: string, dayOfWeek?: number): Promise<PlannedTournament[]> {
    console.log('🔍 STORAGE: Buscando torneios para userPlatformId:', userId, 'dayOfWeek:', dayOfWeek);
    
    // Validação crítica: garantir que userPlatformId não é null/undefined
    if (!userId) {
      console.error('🚨 STORAGE ERROR: userPlatformId está null ou undefined!');
      throw new Error('UserPlatformId é obrigatório para buscar torneios');
    }
    
    let query = db
      .select()
      .from(plannedTournaments)
      .where(eq(plannedTournaments.userId, userId));
    
    // Add day of week filter if specified
    if (dayOfWeek !== undefined) {
      query = query.where(and(
        eq(plannedTournaments.userId, userId),
        eq(plannedTournaments.dayOfWeek, dayOfWeek)
      ));
    }
    
    const result = await query.orderBy(plannedTournaments.dayOfWeek, plannedTournaments.time);
    
    console.log('🔍 STORAGE: Encontrados', result.length, 'torneios para userId:', userId, 'dayOfWeek:', dayOfWeek);
    console.log('🔍 STORAGE: IDs dos torneios encontrados:', result.map(t => ({ id: t.id, userId: t.userId, dayOfWeek: t.dayOfWeek })));
    
    return result;
  }

  async getPlannedTournament(id: string): Promise<PlannedTournament | null> {
    const result = await db
      .select()
      .from(plannedTournaments)
      .where(eq(plannedTournaments.id, id))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  async getAllPlannedTournaments(): Promise<PlannedTournament[]> {
    console.log('🔍 STORAGE: Buscando pool global de torneios para sugestões');
    
    const result = await db
      .select()
      .from(plannedTournaments)
      .orderBy(plannedTournaments.dayOfWeek, plannedTournaments.time);
    
    console.log('🔍 STORAGE: Pool global contém', result.length, 'torneios de todos os usuários');
    
    return result;
  }

  async createPlannedTournament(tournament: InsertPlannedTournament): Promise<PlannedTournament> {
    const id = nanoid();
    const [created] = await db
      .insert(plannedTournaments)
      .values({ ...tournament, id })
      .returning();
    return created;
  }

  async updatePlannedTournament(id: string, tournament: Partial<InsertPlannedTournament>): Promise<PlannedTournament> {
    console.log('Storage: updatePlannedTournament called with:', { id, tournament });

    const [updated] = await db
      .update(plannedTournaments)
      .set({ ...tournament, updatedAt: new Date() })
      .where(eq(plannedTournaments.id, id))
      .returning();

    console.log('Storage: update result:', updated);

    if (!updated) {
      throw new Error(`Planned tournament with id ${id} not found`);
    }

    return updated;
  }

  async deletePlannedTournament(id: string): Promise<void> {
    await db.delete(plannedTournaments).where(eq(plannedTournaments.id, id));
  }

  async getPlannedTournamentsBySession(userId: string, sessionId: string): Promise<PlannedTournament[]> {
    console.log('Storage: getPlannedTournamentsBySession called with:', { userId, sessionId });

    const result = await db
      .select()
      .from(plannedTournaments)
      .where(and(
        eq(plannedTournaments.userId, userId),
        eq(plannedTournaments.sessionId, sessionId)
      ));

    console.log('Storage: Found planned tournaments for session:', result.length);
    return result;
  }

  // Break feedback operations
  async getBreakFeedbacks(userId: string, sessionId?: string): Promise<BreakFeedback[]> {
    const baseConditions = [eq(breakFeedbacks.userId, userId)];

    if (sessionId) {
      baseConditions.push(eq(breakFeedbacks.sessionId, sessionId));
    }

    return await db
      .select()
      .from(breakFeedbacks)
      .where(and(...baseConditions))
      .orderBy(desc(breakFeedbacks.breakTime));
  }

  async createBreakFeedback(feedback: InsertBreakFeedback): Promise<BreakFeedback> {
    const id = nanoid();
    const [created] = await db
      .insert(breakFeedbacks)
      .values({ ...feedback, id })
      .returning();
    return created;
  }

  async deleteBreakFeedback(id: string): Promise<void> {
    await db.delete(breakFeedbacks).where(eq(breakFeedbacks.id, id));
  }

  // Session tournament operations
  async getSessionTournaments(userId: string, sessionId?: string): Promise<SessionTournament[]> {
    console.log("🔍 BUSCA TORNEIOS - SessionId:", sessionId);
    console.log("🔍 BUSCA TORNEIOS - UserId:", userId);
    
    const baseConditions = [eq(sessionTournaments.userId, userId)];

    if (sessionId) {
      baseConditions.push(eq(sessionTournaments.sessionId, sessionId));
      console.log('🔍 BUSCA TORNEIOS - Added sessionId condition to query');
    }

    console.log('🔍 BUSCA TORNEIOS - Base conditions count:', baseConditions.length);
    
    // Build the query
    const query = db
      .select()
      .from(sessionTournaments)
      .where(and(...baseConditions))
      .orderBy(desc(sessionTournaments.createdAt));
    
    console.log("🔍 QUERY EXECUTADA: SELECT * FROM session_tournaments WHERE user_id = ? AND session_id = ?");
    console.log("🔍 QUERY PARAMS - userId:", userId, "sessionId:", sessionId);
    
    // Execute the query
    const rawResults = await query;
    
    console.log("🔍 RESULTADO BRUTO:", rawResults);
    console.log("🔍 RESULTADO PROCESSADO:", rawResults.map(t => ({ 
      id: t.id, 
      userId: t.userId, 
      sessionId: t.sessionId, 
      site: t.site, 
      name: t.name, 
      status: t.status 
    })));
    console.log("🔍 TOTAL DE TORNEIOS ENCONTRADOS:", rawResults.length);
    
    // Return the complete results - the query is working correctly
    return rawResults;
  }

  async createSessionTournament(tournament: InsertSessionTournament): Promise<SessionTournament> {
    const id = nanoid();
    const tournamentData = {
      ...tournament,
      id,
      startTime: tournament.startTime ? (typeof tournament.startTime === 'string' ? new Date(tournament.startTime) : tournament.startTime) : null,
      endTime: tournament.endTime ? (typeof tournament.endTime === 'string' ? new Date(tournament.endTime) : tournament.endTime) : null
    };

    const [created] = await db
      .insert(sessionTournaments)
      .values([tournamentData])
      .returning();
    return created;
  }

  async updateSessionTournament(id: string, tournament: Partial<InsertSessionTournament>): Promise<SessionTournament> {
    console.log('🔍 STORAGE UPDATE - Starting update for tournament ID:', id);
    console.log('🔍 STORAGE UPDATE - Update data received:', tournament);
    console.log('🔍 STORAGE UPDATE - Status field:', tournament.status);
    
    const updateData: any = { ...tournament, updatedAt: new Date() };

    // Convert startTime to Date if it's a string
    if (updateData.startTime && typeof updateData.startTime === 'string') {
      updateData.startTime = new Date(updateData.startTime);
    }

    console.log('🔍 STORAGE UPDATE - Final update data to DB:', updateData);

    const [updated] = await db
      .update(sessionTournaments)
      .set(updateData)
      .where(eq(sessionTournaments.id, id))
      .returning();
    
    console.log('🔍 STORAGE UPDATE - DB returned:', updated);
    console.log('🔍 STORAGE UPDATE - Updated status:', updated?.status);
    
    return updated;
  }

  async deleteSessionTournament(id: string): Promise<void> {
    await db.delete(sessionTournaments).where(eq(sessionTournaments.id, id));
  }

  async getSessionTournamentsByDay(userId: string, dayOfWeek: number): Promise<SessionTournament[]> {
    console.log('🎯 GRIND DEBUG - ============ INÍCIO DO DEBUG ============');
    console.log('🎯 GRIND DEBUG - Dia da semana processado:', dayOfWeek);
    console.log('🎯 GRIND DEBUG - UserId:', userId);

    // 🎯 QUERY DIRETA: Buscar perfil ativo para este dia específico
    const activeProfileState = await db
      .select({
        activeProfile: profileStates.activeProfile
      })
      .from(profileStates)
      .where(
        and(
          eq(profileStates.userId, userId),
          eq(profileStates.dayOfWeek, dayOfWeek)
        )
      )
      .limit(1);

    const activeProfile = activeProfileState[0]?.activeProfile || 'A'; // Default to 'A' if not found
    
    console.log('🎯 GRIND DEBUG - Perfil ativo para dia', dayOfWeek, ':', activeProfile);
    console.log('🎯 GRIND DEBUG - Profile state encontrado:', activeProfileState[0] || 'NENHUM - usando default A');

    // ANTES DE FILTRAR: Vamos ver TODOS os torneios para este dia (ambos perfis)
    const allTournamentsForDay = await db
      .select()
      .from(plannedTournaments)
      .where(
        and(
          eq(plannedTournaments.userId, userId),
          eq(plannedTournaments.dayOfWeek, dayOfWeek),
          eq(plannedTournaments.isActive, true)
        )
      );

    console.log('🎯 GRIND DEBUG - TODOS os torneios para o dia (antes do filtro):');
    console.log('🎯 GRIND DEBUG - Total torneios para dia', dayOfWeek, ':', allTournamentsForDay.length);
    
    // Separar por perfil para debug
    const profileATournaments = allTournamentsForDay.filter(t => t.profile === 'A');
    const profileBTournaments = allTournamentsForDay.filter(t => t.profile === 'B');
    const noProfileTournaments = allTournamentsForDay.filter(t => !t.profile || t.profile === null);
    
    console.log('🎯 GRIND DEBUG - Torneios Perfil A:', profileATournaments.length);
    console.log('🎯 GRIND DEBUG - Torneios Perfil B:', profileBTournaments.length);
    console.log('🎯 GRIND DEBUG - Torneios sem perfil:', noProfileTournaments.length);

    // AGORA aplicar o filtro pelo perfil ativo
    const planned = await db
      .select()
      .from(plannedTournaments)
      .where(
        and(
          eq(plannedTournaments.userId, userId),
          eq(plannedTournaments.dayOfWeek, dayOfWeek),
          eq(plannedTournaments.isActive, true),
          eq(plannedTournaments.profile, activeProfile) // 🎯 FILTRAR APENAS PELO PERFIL ATIVO
        )
      )
      .orderBy(plannedTournaments.time);

    console.log('🎯 GRIND DEBUG - APÓS FILTRO pelo perfil ativo (' + activeProfile + '):');
    console.log('🎯 GRIND DEBUG - Torneios encontrados APÓS filtro:', planned.length);
    console.log('🎯 GRIND DEBUG - Estes são os torneios que serão enviados para o Grind');

    if (planned.length > 0) {
      console.log('🎯 GRIND DEBUG - Sample dos torneios filtrados:', planned.slice(0, 3).map(t => ({
        id: t.id,
        name: t.name,
        profile: t.profile,
        site: t.site,
        time: t.time
      })));
    }

    console.log('🎯 GRIND DEBUG - ============ FIM DO DEBUG ============');

    // Convert planned tournaments to session tournament format for the session PRESERVING ALL DATA
    const result = planned.map(p => {
      console.log('🔍 Processing planned tournament:', { id: p.id, time: p.time, type: p.type, speed: p.speed });
      
      const tournament = {
        id: p.id, // Use the actual ID without prefix to avoid duplication
        userId: p.userId,
        sessionId: p.sessionId || '',
        site: p.site,
        name: p.name,
        buyIn: p.buyIn,
        rebuys: p.rebuys || 0, // PRESERVE ACTUAL REBUYS FROM DB
        result: p.result || '0', // PRESERVE ACTUAL RESULT FROM DB
        bounty: p.bounty || '0', // PRESERVE ACTUAL BOUNTY FROM DB
        position: p.position,
        fieldSize: null,
        status: p.status || 'upcoming' as const, // Use status from planned tournament
        startTime: p.startTime,
        endTime: null,
        prize: null,
        prioridade: 0,
        fromPlannedTournament: true,
        plannedTournamentId: p.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Include planned tournament specific fields
        time: p.time,
        guaranteed: p.guaranteed,
        type: p.type,
        speed: p.speed, // Fix: Use p.speed instead of p.type
        category: p.type, // Map type to category for compatibility
      };

      console.log('🔍 Final tournament object:', { id: tournament.id, time: tournament.time, type: tournament.type, speed: tournament.speed });
      return tournament;
    });

    console.log('🔍 getSessionTournamentsByDay - Final result count:', result.length);
    console.log('🔍 getSessionTournamentsByDay - Sample final result:', result[0] || 'none');

    return result;
  }

  async resetPlannedTournamentsForSession(userId: string, dayOfWeek: number): Promise<void> {
    console.log('Resetting planned tournaments for clean session start - User:', userId, 'Day:', dayOfWeek);

    // Reset all planned tournaments for the specified day to initial state
    const resetResult = await db
      .update(plannedTournaments)
      .set({
        status: 'upcoming',
        result: '0',
        bounty: '0',
        position: null,
        rebuys: 0,
        startTime: null,
        sessionId: null, // Clear any previous session links
        updatedAt: new Date()
      })
      .where(and(
        eq(plannedTournaments.userId, userId),
        eq(plannedTournaments.dayOfWeek, dayOfWeek),
        eq(plannedTournaments.isActive, true)
      ))
      .returning();

    console.log(`Reset ${resetResult.length} planned tournaments to clean state for day ${dayOfWeek}`);

    // Also clean up any session tournaments that might be orphaned for today
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const orphanedSessionTournaments = await db
      .select()
      .from(sessionTournaments)
      .where(and(
        eq(sessionTournaments.userId, userId),
        gte(sessionTournaments.createdAt, startOfDay),
        lte(sessionTournaments.createdAt, endOfDay)
      ));

    // Delete orphaned session tournaments created today
    if (orphanedSessionTournaments.length > 0) {
      await db
        .delete(sessionTournaments)
        .where(and(
          eq(sessionTournaments.userId, userId),
          gte(sessionTournaments.createdAt, startOfDay),
          lte(sessionTournaments.createdAt, endOfDay)
        ));

      console.log(`Cleaned up ${orphanedSessionTournaments.length} orphaned session tournaments from today`);
    }

    console.log('Session reset completed - all tournaments and data cleaned for fresh start');
  }

  // Study card operations
  async getStudyCards(userId: string): Promise<StudyCard[]> {
    return await db
      .select()
      .from(studyCards)
      .where(eq(studyCards.userId, userId))
      .orderBy(desc(studyCards.createdAt));
  }

  async createStudyCard(studyCard: InsertStudyCard): Promise<StudyCard> {
    const studyCardData = {
      ...studyCard,
      id: nanoid(),
      studyDays: Array.isArray(studyCard.studyDays) ? studyCard.studyDays : 
                 (studyCard.studyDays !== undefined && studyCard.studyDays !== null ? [studyCard.studyDays as string] : [])
    };

    const [newStudyCard] = await db
      .insert(studyCards)
      .values(studyCardData)
      .returning();
    return newStudyCard;
  }

  async getStudyCard(id: string, userId: string): Promise<StudyCard | undefined> {
    const [studyCard] = await db
      .select()
      .from(studyCards)
      .where(and(eq(studyCards.id, id), eq(studyCards.userId, userId)));
    return studyCard;
  }

  async updateStudyCard(id: string, studyCard: Partial<InsertStudyCard>): Promise<StudyCard> {
    const updateData: any = {
      ...studyCard,
      updatedAt: new Date(),
    };

    // Handle studyDays array properly
    if (studyCard.studyDays) {
      updateData.studyDays = Array.isArray(studyCard.studyDays) ? studyCard.studyDays : 
                            (studyCard.studyDays ? [studyCard.studyDays as string] : []);
    }

    const [updatedStudyCard] = await db
      .update(studyCards)
      .set(updateData)
      .where(eq(studyCards.id, id))
      .returning();
    return updatedStudyCard;
  }

  async deleteStudyCard(id: string): Promise<void> {
    await db.delete(studyCards).where(eq(studyCards.id, id));
  }

  // Study material operations
  async getStudyMaterials(studyCardId: string): Promise<StudyMaterial[]> {
    return await db
      .select()
      .from(studyMaterials)
      .where(eq(studyMaterials.studyCardId, studyCardId))
      .orderBy(desc(studyMaterials.createdAt));
  }

  async createStudyMaterial(material: InsertStudyMaterial): Promise<StudyMaterial> {
    const [newMaterial] = await db
      .insert(studyMaterials)
      .values({
        ...material,
        id: nanoid(),
      })
      .returning();
    return newMaterial;
  }

  // Study note operations
  async getStudyNotes(studyCardId: string): Promise<StudyNote[]> {
    return await db
      .select()
      .from(studyNotes)
      .where(eq(studyNotes.studyCardId, studyCardId))
      .orderBy(desc(studyNotes.createdAt));
  }

  async createStudyNote(note: InsertStudyNote): Promise<StudyNote> {
    const noteData = {
      ...note,
      id: nanoid(),
      tags: Array.isArray(note.tags) ? note.tags : (note.tags !== undefined && note.tags !== null ? [note.tags as string] : [])
    };

    const [newNote] = await db
      .insert(studyNotes)
      .values(noteData)
      .returning();
    return newNote;
  }



  // Study session operations
  async getStudySessions(userId: string): Promise<StudySession[]> {
    return await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.userId, userId))
      .orderBy(desc(studySessions.createdAt));
  }

  async createStudySession(session: InsertStudySession): Promise<StudySession> {
    const sessionData = {
      ...session,
      id: nanoid(),
      activities: Array.isArray(session.activities) ? session.activities : (session.activities !== undefined && session.activities !== null ? [session.activities as string] : []),
      insights: Array.isArray(session.insights) ? session.insights : (session.insights !== undefined && session.insights !== null ? [session.insights as string] : [])
    };

    const [newSession] = await db
      .insert(studySessions)
      .values(sessionData)
      .returning();
    return newSession;
  }

  // Active days operations
  async getActiveDays(userId: string): Promise<ActiveDay[]> {
    return await db
      .select()
      .from(activeDays)
      .where(eq(activeDays.userId, userId))
      .orderBy(activeDays.dayOfWeek);
  }

  async toggleActiveDay(userId: string, dayOfWeek: number): Promise<ActiveDay> {
    // Check if the day already exists
    const [existingDay] = await db
      .select()
      .from(activeDays)
      .where(and(
        eq(activeDays.userId, userId),
        eq(activeDays.dayOfWeek, dayOfWeek)
      ));

    if (existingDay) {
      // Toggle existing day
      const [updatedDay] = await db
        .update(activeDays)
        .set({
          isActive: !existingDay.isActive,
          updatedAt: new Date()
        })
        .where(eq(activeDays.id, existingDay.id))
        .returning();
      return updatedDay;
    } else {
      // Create new day (default is active = true, so toggle to false)
      const [newDay] = await db
        .insert(activeDays)
        .values({
          id: nanoid(),
          userId,
          dayOfWeek,
          isActive: false // Since we're "toggling" and default would be true
        })
        .returning();
      return newDay;
    }
  }

  // Calendário Inteligente methods
  async getWeeklyRoutine(userId: string, weekStart: Date): Promise<WeeklyRoutine | null> {
    const result = await db
      .select()
      .from(weeklyRoutines)
      .where(and(
        eq(weeklyRoutines.userId, userId),
        eq(weeklyRoutines.weekStart, weekStart)
      ))
      .limit(1);

    return result[0] || null;
  }

  async createWeeklyRoutine(routine: InsertWeeklyRoutine): Promise<WeeklyRoutine> {
    const [result] = await db.insert(weeklyRoutines).values(routine).returning();
    return result;
  }

  async updateWeeklyRoutine(id: string, routine: Partial<InsertWeeklyRoutine>): Promise<WeeklyRoutine> {
    const [result] = await db
      .update(weeklyRoutines)
      .set({ ...routine, updatedAt: new Date() })
      .where(eq(weeklyRoutines.id, id))
      .returning();
    return result;
  }

  async getStudySchedules(userId: string): Promise<StudySchedule[]> {
    return await db
      .select()
      .from(studySchedules)
      .where(eq(studySchedules.userId, userId))
      .orderBy(studySchedules.dayOfWeek, studySchedules.startTime);
  }

  async createStudySchedule(schedule: InsertStudySchedule): Promise<StudySchedule> {
    const [result] = await db
      .insert(studySchedules)
      .values({ ...schedule, id: nanoid() })
      .returning();
    return result;
  }

  // Calendar Categories CRUD
  async getCalendarCategories(userId: string): Promise<CalendarCategory[]> {
    return await db
      .select()
      .from(calendarCategories)
      .where(eq(calendarCategories.userId, userId))
      .orderBy(calendarCategories.name);
  }

  async createCalendarCategory(category: InsertCalendarCategory): Promise<CalendarCategory> {
    const [result] = await db
      .insert(calendarCategories)
      .values({ ...category, id: nanoid() })
      .returning();
    return result;
  }

  async updateCalendarCategory(id: string, category: Partial<InsertCalendarCategory>): Promise<CalendarCategory> {
    const [result] = await db
      .update(calendarCategories)
      .set({ ...category, updatedAt: new Date() })
      .where(eq(calendarCategories.id, id))
      .returning();
    return result;
  }

  async deleteCalendarCategory(id: string): Promise<void> {
    await db.delete(calendarCategories).where(eq(calendarCategories.id, id));
  }

  // Calendar Events CRUD
  async getCalendarEvents(userId: string, weekStart?: Date, weekEnd?: Date): Promise<CalendarEvent[]> {
    const conditions = [eq(calendarEvents.userId, userId)];

    if (weekStart && weekEnd) {
      conditions.push(
        gte(calendarEvents.startTime, weekStart),
        lte(calendarEvents.endTime, weekEnd)
      );
    }

    return await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startTime);
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const [result] = await db
      .insert(calendarEvents)
      .values({ ...event, id: nanoid() })
      .returning();
    return result;
  }

  async updateCalendarEvent(id: string, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent> {
    const [result] = await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))
      .returning();
    return result;
  }

  async deleteCalendarEvent(id: string): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  async deleteCalendarEventsBySource(userId: string, source: string): Promise<void> {
    await db.delete(calendarEvents).where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.source, source)
      )
    );
  }

  // Delete all events in a recurring series
  async deleteRecurringEventSeries(parentEventId: string): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.parentEventId, parentEventId));
    await db.delete(calendarEvents).where(eq(calendarEvents.id, parentEventId));
  }

  // Update all events in a recurring series
  async updateRecurringEventSeries(parentEventId: string, event: Partial<InsertCalendarEvent>): Promise<void> {
    await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(calendarEvents.parentEventId, parentEventId));

    await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(calendarEvents.id, parentEventId));
  }


  async deleteWeeklyRoutine(id: string): Promise<void> {
    await db.delete(weeklyRoutines).where(eq(weeklyRoutines.id, id));
  }



  async updateStudySchedule(id: string, schedule: Partial<InsertStudySchedule>): Promise<StudySchedule> {
    const [result] = await db
      .update(studySchedules)
      .set(schedule)
      .where(eq(studySchedules.id, id))
      .returning();
    return result;
  }

  async deleteStudySchedule(id: string): Promise<void> {
    await db.delete(studySchedules).where(eq(studySchedules.id, id));
  }

  // Method to get date range of tournaments for debugging
  async getDateRange(userId: string) {
    const result = await db
      .select({
        oldestDate: sql<string>`MIN(${tournaments.datePlayed})`,
        newestDate: sql<string>`MAX(${tournaments.datePlayed})`,
        totalCount: sql<number>`COUNT(*)`
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId));

    const data = result[0];

    console.log('🔍 DATE RANGE DEBUG - Dados encontrados:', data);

    if (data.oldestDate && data.newestDate) {
      const oldestDate = new Date(data.oldestDate);
      const newestDate = new Date(data.newestDate);
      const diffInDays = Math.floor((newestDate.getTime() - oldestDate.getTime()) / (24 * 60 * 60 * 1000));

      console.log('🔍 DATE RANGE DEBUG - Período total disponível:', diffInDays, 'dias');

      return {
        oldestDate: data.oldestDate,
        newestDate: data.newestDate,
        totalCount: data.totalCount,
        totalDays: diffInDays,
        hasOneYearData: diffInDays >= 365
      };
    }

    return {
      oldestDate: null,
      newestDate: null,
      totalCount: 0,
      totalDays: 0,
      hasOneYearData: false
    };
  }

  // Helper method to build dashboard filters
  private buildDashboardFilters(filters: any): any {
    return null;
  }

  // ===== BUG REPORTS METHODS =====

  async createBugReport(report: InsertBugReport): Promise<BugReport> {
    const id = nanoid();
    const [result] = await db
      .insert(bugReports)
      .values({
        id,
        ...report,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return result;
  }

  async getBugReports(): Promise<BugReport[]> {
    return await db
      .select()
      .from(bugReports)
      .orderBy(desc(bugReports.createdAt));
  }

  async getBugReportsByUser(userId: string): Promise<BugReport[]> {
    return await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.userId, userId))
      .orderBy(desc(bugReports.createdAt));
  }

  async getBugReportById(id: string): Promise<BugReport | null> {
    const [result] = await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.id, id))
      .limit(1);
    return result || null;
  }

  async updateBugReport(id: string, updates: Partial<InsertBugReport>): Promise<BugReport> {
    const [result] = await db
      .update(bugReports)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(bugReports.id, id))
      .returning();
    return result;
  }

  async deleteBugReport(id: string): Promise<void> {
    await db.delete(bugReports).where(eq(bugReports.id, id));
  }

  async getBugReportStats(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    dismissed: number;
    byUrgency: { low: number; medium: number; high: number };
    byType: { bug: number; suggestion: number; performance: number };
  }> {
    const allReports = await db.select().from(bugReports);

    return {
      total: allReports.length,
      open: allReports.filter(r => r.status === 'open').length,
      inProgress: allReports.filter(r => r.status === 'in_progress').length,
      resolved: allReports.filter(r => r.status === 'resolved').length,
      dismissed: allReports.filter(r => r.status === 'dismissed').length,
      byUrgency: {
        low: allReports.filter(r => r.urgency === 'low').length,
        medium: allReports.filter(r => r.urgency === 'medium').length,
        high: allReports.filter(r => r.urgency === 'high').length,
      },
      byType: {
        bug: allReports.filter(r => r.type === 'bug').length,
        suggestion: allReports.filter(r => r.type === 'suggestion').length,
        performance: allReports.filter(r => r.type === 'performance').length,
      },
    };
  }

  // Upload History - persistência do histórico de upload
  async getUploadHistory(userId: string): Promise<UploadHistory[]> {
    console.log('📊 Storage: Fetching upload history for user:', userId);
    return await db
      .select()
      .from(uploadHistory)
      .where(eq(uploadHistory.userId, userId))
      .orderBy(desc(uploadHistory.uploadDate))
      .limit(5);
  }

  async createUploadHistory(uploadRecord: InsertUploadHistory): Promise<UploadHistory> {
    const id = nanoid();

    // Primeiro, limpamos registros antigos se já existem 5
    const existing = await db
      .select({ id: uploadHistory.id })
      .from(uploadHistory)
      .where(eq(uploadHistory.userId, uploadRecord.userId))
      .orderBy(desc(uploadHistory.uploadDate));

    if (existing.length >= 5) {
      // Remove o mais antigo se já tem 5
      const toDelete = existing.slice(4); // Mantém apenas os primeiros 4
      if (toDelete.length > 0) {
        await db
          .delete(uploadHistory)
          .where(
            and(
              eq(uploadHistory.userId, uploadRecord.userId),
              sql`${uploadHistory.id} IN (${toDelete.map(r => `'${r.id}'`).join(', ')})`
            )
          );
      }
    }

    // Insere novo registro
    const [created] = await db
      .insert(uploadHistory)
      .values({
        id,
        ...uploadRecord,
      })
      .returning();

    return created;
  }

  async deleteUploadHistory(id: string, userId: string): Promise<UploadHistory | null> {
    const [deleted] = await db
      .delete(uploadHistory)
      .where(
        and(
          eq(uploadHistory.id, id),
          eq(uploadHistory.userId, userId)
        )
      )
      .returning();

    return deleted || null;
  }

}

export const storage = new DatabaseStorage();

export async function getSitePerformanceData(period: string = '30d'): Promise<any[]> {
  try {
    // Calculate date range based on period
    let dateCondition = sql`TRUE`;

    if (period !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          // First day of current month at 00:00:00
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
          // First day of current year at 00:00:00
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Ensure startDate is valid
      if (isNaN(startDate.getTime())) {
        console.error('Invalid startDate calculated:', startDate);
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      dateCondition = sql`${tournaments.datePlayed} >= ${startDate.toISOString()}`;
    }

    const performance = await db
      .select({
        site: tournaments.site,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(dateCondition)
      .groupBy(tournaments.site)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);

    return performance;
  } catch (error) {
    console.error('Error fetching site performance data:', error);
    return [];
  }
}

export async function getCategoryPerformanceData(period: string = '30d'): Promise<any[]> {
  try {
    // Calculate date range based on period
    let dateCondition = sql`TRUE`;

    if (period !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          // First day of current month at 00:00:00
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
          // First day of current year at 00:00:00
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Ensure startDate is valid
      if (isNaN(startDate.getTime())) {
        console.error('Invalid startDate calculated:', startDate);
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      dateCondition = sql`${tournaments.datePlayed} >= ${startDate.toISOString()}`;
    }

    const performance = await db
      .select({
        category: tournaments.category,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(dateCondition)
      .groupBy(tournaments.category)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);

    return performance;
  } catch (error) {
    console.error('Error fetching category performance data:', error);
    return [];
  }
}

function getStartDateForPeriod(period: string): Date {
  const now = new Date();
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '365d':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}