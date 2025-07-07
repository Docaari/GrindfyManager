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

  // Break feedback operations
  getBreakFeedbacks(userId: string, sessionId?: string): Promise<BreakFeedback[]>;
  createBreakFeedback(feedback: InsertBreakFeedback): Promise<BreakFeedback>;

  // Session tournament operations
  getSessionTournaments(userId: string, sessionId?: string): Promise<SessionTournament[]>;
  createSessionTournament(tournament: InsertSessionTournament): Promise<SessionTournament>;
  updateSessionTournament(id: string, tournament: Partial<InsertSessionTournament>): Promise<SessionTournament>;
  deleteSessionTournament(id: string): Promise<void>;
  getSessionTournamentsByDay(userId: string, dayOfWeek: number): Promise<SessionTournament[]>;
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
        return undefined; // No date condition for 'all' period
      
      default:
        // Default to 30 days if period not recognized
        const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return gte(tournaments.datePlayed, defaultStart);
    }
  }
}

export const storage = new DatabaseStorage();