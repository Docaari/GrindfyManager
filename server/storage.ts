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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql, like, not, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

// Utility function to build SQL filters from dashboard filters
function buildFilters(filters: any) {
  const conditions: any[] = [];

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
  getPlannedTournaments(userId: string): Promise<PlannedTournament[]>;
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
  async getTournaments(userId: string, limit: number = 50, offset?: number, period?: string, filters?: any): Promise<Tournament[]> {
    const baseConditions = [eq(tournaments.userId, userId)];

    // Apply period filter
    if (period && period !== 'all') {
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

    // Apply dashboard filters
    if (filters) {
      const dashboardFilters = buildFilters(filters);
      if (dashboardFilters) {
        baseConditions.push(dashboardFilters);
      }
    }

    const whereCondition = and(...baseConditions);

    const result = await db
      .select()
      .from(tournaments)
      .where(whereCondition)
      .orderBy(desc(tournaments.datePlayed))
      .limit(limit);

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

  // Check if tournament is duplicate based on multiple criteria
  async isDuplicateTournament(userId: string, tournamentData: {
    name: string;
    datePlayed: Date;
    buyIn: number;
    position?: number;
    fieldSize?: number;
    site?: string;
  }): Promise<boolean> {
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
      updatedAt: new Date()
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
    if (template.dayOfWeek && Array.isArray(template.dayOfWeek)) {
      updateData.dayOfWeek = template.dayOfWeek;
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
      createdAt: new Date()
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

  // User settings operations
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    try {
      const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      return settings;
    } catch (error: any) {
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
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter
    if (period !== "all") {
      const dateCondition = this.getDateCondition(period);
      baseConditions.push(dateCondition);
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    return await db
      .select({
        site: tournaments.site,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.site);
  }

  async getAnalyticsByBuyinRange(userId: string, period = "30d", filters: any = {}): Promise<any> {
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter
    if (period !== "all") {
      const dateCondition = this.getDateCondition(period);
      baseConditions.push(dateCondition);
    }

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
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter
    if (period !== "all") {
      const dateCondition = this.getDateCondition(period);
      baseConditions.push(dateCondition);
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    return await db
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
  }

  getDateCondition(period: string) {
    const now = new Date();

    switch (period) {
      case "month":
        // First day of current month at 00:00:00
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return gte(tournaments.datePlayed, monthStart);

      case "year":
        // January 1st of current year at 00:00:00
        const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        return gte(tournaments.datePlayed, yearStart);

      case "all":
        return sql`1 = 1`; // No date restriction

      default:
        // Handle traditional format like "7d", "30d", etc.
        const daysAgo = parseInt(period.replace("d", ""));
        if (isNaN(daysAgo)) {
          return sql`1 = 1`; // Default to all if invalid format
        }
        const startDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        return gte(tournaments.datePlayed, startDate);
    }
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
    const dateCondition = this.getDateCondition(period);
    const filterConditions = this.buildFilterConditions(filters);

    const results = await db
      .select({
        dayOfWeek: sql<string>`EXTRACT(DOW FROM ${tournaments.datePlayed})`,
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
        volume: sql<string>`COUNT(*)`,
        profit: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL)), 0)`,
        roi: sql<string>`
          CASE 
            WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 
            THEN ROUND((SUM(CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100, 2)
            ELSE 0 
          END
        `,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          dateCondition,
          ...filterConditions
        )
      )
      .groupBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`)
      .orderBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`);

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

    return completeResults;
  }

  async getDashboardStats(userId: string, period = "30d", filters: any = {}): Promise<any> {
    // Base condition - always filter by user
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter
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

      baseConditions.push(gte(tournaments.datePlayed, startDate));
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters){
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const stats = await db
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

        // FTs: Final Tables (posição <= 9)
        finalTablesCount: sql<number>`SUM(CASE WHEN ${tournaments.position} <= 9 AND ${tournaments.position} > 0 THEN 1 ELSE 0 END)`,

        // Cravadas: 1º lugar (posição = 1)
        firstPlaceCount: sql<number>`SUM(CASE WHEN ${tournaments.position} = 1 THEN 1 ELSE 0 END)`,

        // Média de participantes - rounded to whole number, excluding invalid values
        avgFieldSize: sql<number>`ROUND(AVG(CASE WHEN ${tournaments.fieldSize} > 0 AND ${tournaments.fieldSize} IS NOT NULL THEN CAST(${tournaments.fieldSize} AS DECIMAL) ELSE NULL END), 0)`,

        // Finalização Precoce: últimos 10% (posição > 90% do field)
        earlyFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.position} > (CAST(${tournaments.fieldSize} AS DECIMAL) * 0.9) AND ${tournaments.fieldSize} > 0 AND ${tournaments.position} > 0 THEN 1 ELSE 0 END)`,

        // Finalização Tardia: primeiros 10% (posição <= 10% do field)
        lateFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.position} <= (CAST(${tournaments.fieldSize} AS DECIMAL) * 0.1) AND ${tournaments.position} > 0 AND ${tournaments.fieldSize} > 0 THEN 1 ELSE 0 END)`,

        // Big Hit: Maior premiação registrada
        biggestPrize: sql<number>`MAX(CAST(${tournaments.prize} AS DECIMAL))`,

        // Stake Range: menor e maior buy-in (ignorando valores muito baixos e freerolls)
        minBuyin: sql<number>`MIN(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,
        maxBuyin: sql<number>`MAX(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,

        // Dias Jogados: Quantidade de dias únicos com registros
        daysPlayed: sql<number>`COUNT(DISTINCT DATE(${tournaments.datePlayed}))`,
      })
      .from(tournaments)
      .where(whereCondition);

    const [result] = stats;

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
    const firstPlaceRate = count > 0 ? (firstPlaceCount / count) * 100 : 0;

    // 11. Média de participantes: Média de total de participantes no torneio
    const avgFieldSize = Number(result.avgFieldSize) || 0;

    // 12. Lucro Médio/Dia: Lucro médio por dia (simplified calculation)
    // For now, calculate based on 30 days as a reasonable average
    const avgProfitPerDay = count > 0 ? profit / 30 : 0;

    // 13. Finalização Precoce: Frequência em que ficou entre 10% dos últimos no torneio
    const earlyFinishCount = Number(result.earlyFinishCount || 0);
    const earlyFinishRate = count > 0 ? (earlyFinishCount / count) * 100 : 0;

    // 14. Finalização Tardia: Frequência em que ficou entre os 10% dos primeiros no torneio
    const lateFinishCount = Number(result.lateFinishCount || 0);
    const lateFinishRate = count > 0 ? (lateFinishCount / count) * 100 : 0;

    // 15. Big Hit: A maior premiação registrada dos torneios
    const biggestPrize = Number(result.biggestPrize || 0);

    // 16. Dias Jogados: Quantidade de dias únicos com registros
    const daysPlayed = Number(result.daysPlayed || 0);

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
      bigHitsRate: firstPlaceRate, // 10. Cravadas (percentual)
      avgFieldSize, // 11. Média participantes
      avgProfitPerDay, // 12. Lucro Médio/Dia
      earlyFinishes: earlyFinishCount, // 13. Finalização Precoce (quantidade)
      earlyFinishRate, // 13. Finalização Precoce (percentual)
      lateFinishes: lateFinishCount, // 14. Finalização Tardia (quantidade)
      lateFinishRate, // 14. Finalização Tardia (percentual)
      biggestPrize, // 15. Big Hit
      daysPlayed, // 16. Dias Jogados

      // Campos para compatibilidade
      totalProfit: profit,
      totalBuyins,
      totalTournaments: count,
      avgBuyin: abi,
      itmCount,
    };
  }

  async getPerformanceByPeriod(userId: string, period: string, filters: any = {}): Promise<any> {
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

      baseConditions.push(gte(tournaments.datePlayed, startDate));
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

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
  async getPlannedTournaments(userId: string): Promise<PlannedTournament[]> {
    return await db
      .select()
      .from(plannedTournaments)
      .where(eq(plannedTournaments.userId, userId))
      .orderBy(plannedTournaments.dayOfWeek, plannedTournaments.time);
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
    const baseConditions = [eq(sessionTournaments.userId, userId)];
    
    if (sessionId) {
      baseConditions.push(eq(sessionTournaments.sessionId, sessionId));
    }

    return await db
      .select()
      .from(sessionTournaments)
      .where(and(...baseConditions))
      .orderBy(desc(sessionTournaments.createdAt));
  }

  async createSessionTournament(tournament: InsertSessionTournament): Promise<SessionTournament> {
    const id = nanoid();
    const [created] = await db
      .insert(sessionTournaments)
      .values({ ...tournament, id })
      .returning();
    return created;
  }

  async updateSessionTournament(id: string, tournament: Partial<InsertSessionTournament>): Promise<SessionTournament> {
    const [updated] = await db
      .update(sessionTournaments)
      .set({ ...tournament, updatedAt: new Date() })
      .where(eq(sessionTournaments.id, id))
      .returning();
    return updated;
  }

  async deleteSessionTournament(id: string): Promise<void> {
    await db.delete(sessionTournaments).where(eq(sessionTournaments.id, id));
  }

  async getSessionTournamentsByDay(userId: string, dayOfWeek: number): Promise<SessionTournament[]> {
    // Get planned tournaments for the specified day and map them to session tournaments format
    const planned = await db
      .select()
      .from(plannedTournaments)
      .where(
        and(
          eq(plannedTournaments.userId, userId),
          eq(plannedTournaments.dayOfWeek, dayOfWeek),
          eq(plannedTournaments.isActive, true)
        )
      )
      .orderBy(plannedTournaments.time);

    // Convert planned tournaments to session tournament format for the session PRESERVING ALL DATA
    return planned.map(p => {
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
        fromPlannedTournament: true,
        plannedTournamentId: p.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Include planned tournament specific fields
        time: p.time,
        guaranteed: p.guaranteed,
        type: p.type,
        speed: p.speed,
        category: p.type, // Map type to category for compatibility
      };
      
      console.log('Storage: Transformed tournament', tournament.id, 'rebuys:', tournament.rebuys, 'result:', tournament.result);
      return tournament;
    });
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
        endTime: null,
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
    const [newStudyCard] = await db
      .insert(studyCards)
      .values({
        ...studyCard,
        id: nanoid(),
      })
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
    const [updatedStudyCard] = await db
      .update(studyCards)
      .set({
        ...studyCard,
        updatedAt: new Date(),
      })
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
    const [newNote] = await db
      .insert(studyNotes)
      .values({
        ...note,
        id: nanoid(),
      })
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
    const [newSession] = await db
      .insert(studySessions)
      .values({
        ...session,
        id: nanoid(),
      })
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

  async updateWeeklyRoutine(id: string, routine: Partial<InsertWeeklyRoutine>): Promise<WeeklyRoutine> {
    const [result] = await db
      .update(weeklyRoutines)
      .set(routine)
      .where(eq(weeklyRoutines.id, id))
      .returning();
    return result;
  }

  async deleteWeeklyRoutine(id: string): Promise<void> {
    await db.delete(weeklyRoutines).where(eq(weeklyRoutines.id, id));
  }

  async getStudySchedules(userId: string): Promise<StudySchedule[]> {
    return await db
      .select()
      .from(studySchedules)
      .where(eq(studySchedules.userId, userId))
      .orderBy(studySchedules.dayOfWeek, studySchedules.startTime);
  }

  async createStudySchedule(schedule: InsertStudySchedule): Promise<StudySchedule> {
    const [result] = await db.insert(studySchedules).values(schedule).returning();
    return result;
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