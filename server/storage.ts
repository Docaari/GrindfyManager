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
  getTournaments(userId: string, limit?: number, offset?: number): Promise<Tournament[]>;
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
  getAnalyticsByDayOfWeek(userId: string, period?: string, filters?: any): Promise<any[]>;
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
  async getTournaments(userId: string, limit = 50, offset = 0): Promise<Tournament[]> {
    return await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.userId, userId))
      .orderBy(desc(tournaments.datePlayed))
      .limit(limit)
      .offset(offset);
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
  }): Promise<boolean> {
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
    const updateData = {
      ...template,
      updatedAt: new Date()
    };

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
    // Include all tournaments for now to show complete data
    return await db
      .select({
        site: tournaments.site,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId))
      .groupBy(tournaments.site)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);
  }

  async getAnalyticsByBuyinRange(userId: string, period = "30d"): Promise<any> {
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
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL)) - 1) * 100 ELSE 0 END`,
        avgBuyin: sql<number>`AVG(CAST(${tournaments.buyIn} AS DECIMAL))`,
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId))
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

  async getAnalyticsByCategory(userId: string, period = "30d"): Promise<any> {
    return await db
      .select({
        category: tournaments.category,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId))
      .groupBy(tournaments.category)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);
  }

  getDateCondition(period: string) {
    const startDate = new Date();
    
    switch (period) {
      case "month":
        startDate.setDate(1); // First day of current month
        return gte(tournaments.datePlayed, startDate);
      
      case "year":
        startDate.setMonth(0, 1); // January 1st of current year
        return gte(tournaments.datePlayed, startDate);
      
      case "all":
        return sql`1 = 1`; // No date restriction
      
      default:
        // Handle traditional format like "7d", "30d", etc.
        const daysAgo = parseInt(period.replace("d", ""));
        if (isNaN(daysAgo)) {
          return sql`1 = 1`; // Default to all if invalid format
        }
        startDate.setDate(startDate.getDate() - daysAgo);
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
    // For now, let's include all tournaments regardless of period to show complete data
    // Later we can implement proper period filtering based on actual tournament dates
    const includeAllTournaments = period === "all" || true; // Always show all for now

    // Base condition - always filter by user
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter if not showing all
    if (!includeAllTournaments) {
      const daysAgo = parseInt(period.replace("d", ""));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      baseConditions.push(gte(tournaments.datePlayed, startDate));
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
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
    const totalInvested = totalBuyins + totalReentries; // Total investido = buy-ins + reentradas

    // 1. Contagem: Quantidade de torneios
    // 2. Lucro: Profit total dos torneios
    // 3. ABI: Buy-in médio do torneio
    const abi = Number(result.avgBuyin || 0);

    // 4. ROI: Profit / (Total investido: buy-in + reentradas)
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    // 5. ITM: Percentual que ficou dentro da faixa de premiação
    const itmCount = Number(result.itmCount || 0);
    const itm = count > 0 ? (itmCount / count) * 100 : 0;

    // 6. Reentradas: Quantidade total de reentradas feitas no torneio
    const reentries = totalReentries;

    // 7. Lucro Médio/Torneio: Lucro médio por torneio
    const avgProfitPerTournament = count > 0 ? profit / count : 0;

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
    const daysAgo = parseInt(period.replace("d", ""));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const performance = await db
      .select({
        date: sql<string>`DATE(${tournaments.datePlayed})`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, startDate)
        )
      )
      .groupBy(sql`DATE(${tournaments.datePlayed})`)
      .orderBy(sql`DATE(${tournaments.datePlayed})`);

    return performance;
  }
}

export const storage = new DatabaseStorage();