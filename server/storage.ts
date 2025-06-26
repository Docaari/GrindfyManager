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
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

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
  getDashboardStats(userId: string, period?: string): Promise<any>;
  getPerformanceByPeriod(userId: string, period: string): Promise<any>;
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
      
      if (template.roi > 20) {
        insights.push({
          type: 'positive',
          title: 'High ROI Template',
          description: `Excellent ${template.roi.toFixed(1)}% ROI. Consider increasing volume.`,
          priority: 'high'
        });
      } else if (template.roi < -10) {
        insights.push({
          type: 'negative',
          title: 'Underperforming Template',
          description: `${template.roi.toFixed(1)}% ROI is concerning. Review or reduce volume.`,
          priority: 'high'
        });
      }
      
      if (template.count > 20 && template.roi < 5) {
        insights.push({
          type: 'warning',
          title: 'High Volume, Low ROI',
          description: 'Playing frequently but with marginal returns.',
          priority: 'medium'
        });
      }
      
      if (template.finalTables === 0 && template.count > 10) {
        insights.push({
          type: 'warning',
          title: 'No Final Tables',
          description: 'No final tables despite significant volume.',
          priority: 'medium'
        });
      }

      return {
        ...template,
        insights
      };
    });

    return recommendations;
  }

  // Analytics operations
  async getAnalyticsBySite(userId: string, period = "30d"): Promise<any> {
    const daysAgo = parseInt(period.replace("d", ""));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

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
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, startDate)
        )
      )
      .groupBy(tournaments.site)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);
  }

  async getAnalyticsByBuyinRange(userId: string, period = "30d"): Promise<any> {
    const daysAgo = parseInt(period.replace("d", ""));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    return await db
      .select({
        buyinRange: sql<string>`
          CASE 
            WHEN ${tournaments.buyIn} < 5 THEN 'Low ($0-$5)'
            WHEN ${tournaments.buyIn} < 25 THEN 'Mid ($5-$25)'
            WHEN ${tournaments.buyIn} < 100 THEN 'High ($25-$100)'
            ELSE 'Premium ($100+)'
          END
        `,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(${tournaments.prize} - ${tournaments.buyIn})`,
        buyins: sql<number>`SUM(${tournaments.buyIn})`,
        roi: sql<number>`CASE WHEN SUM(${tournaments.buyIn}) > 0 THEN (SUM(${tournaments.prize}) / SUM(${tournaments.buyIn}) - 1) * 100 ELSE 0 END`,
        avgBuyin: sql<number>`AVG(${tournaments.buyIn})`,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, startDate)
        )
      )
      .groupBy(sql`
        CASE 
          WHEN ${tournaments.buyIn} < 5 THEN 'Low ($0-$5)'
          WHEN ${tournaments.buyIn} < 25 THEN 'Mid ($5-$25)'
          WHEN ${tournaments.buyIn} < 100 THEN 'High ($25-$100)'
          ELSE 'Premium ($100+)'
        END
      `)
      .orderBy(sql`AVG(${tournaments.buyIn})`);
  }

  async getAnalyticsByCategory(userId: string, period = "30d"): Promise<any> {
    const daysAgo = parseInt(period.replace("d", ""));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    return await db
      .select({
        category: tournaments.category,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(${tournaments.prize} - ${tournaments.buyIn})`,
        buyins: sql<number>`SUM(${tournaments.buyIn})`,
        roi: sql<number>`CASE WHEN SUM(${tournaments.buyIn}) > 0 THEN (SUM(${tournaments.prize}) / SUM(${tournaments.buyIn}) - 1) * 100 ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, startDate)
        )
      )
      .groupBy(tournaments.category)
      .orderBy(sql`SUM(${tournaments.prize} - ${tournaments.buyIn}) DESC`);
  }

  async getAnalyticsByDayOfWeek(userId: string, period = "30d"): Promise<any> {
    const daysAgo = parseInt(period.replace("d", ""));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    return await db
      .select({
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${tournaments.datePlayed})`,
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
        avgProfit: sql<number>`AVG(${tournaments.prize} - ${tournaments.buyIn})`,
        volume: sql<number>`COUNT(*)`,
        totalProfit: sql<number>`SUM(${tournaments.prize} - ${tournaments.buyIn})`,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, startDate)
        )
      )
      .groupBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`)
      .orderBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`);
  }

  async getDashboardStats(userId: string, period = "30d"): Promise<any> {
    const daysAgo = parseInt(period.replace("d", ""));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const stats = await db
      .select({
        // Contagem: Quantidade de torneios
        count: sql<number>`COUNT(*)`,
        
        // Lucro: Profit total (Prize - BuyIn)
        totalProfit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL) - CAST(${tournaments.buyIn} AS DECIMAL))`,
        
        // Total investido (buy-ins + reentradas)
        totalInvested: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL) + COALESCE(${tournaments.reentries}, 0))`,
        totalBuyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        
        // ABI: Buy-in médio
        avgBuyin: sql<number>`AVG(CAST(${tournaments.buyIn} AS DECIMAL))`,
        
        // ITM: Quantidade que ficou na premiação (prize > 0)
        itmCount: sql<number>`SUM(CASE WHEN CAST(${tournaments.prize} AS DECIMAL) > 0 THEN 1 ELSE 0 END)`,
        
        // Reentradas: Total de reentradas
        totalReentries: sql<number>`SUM(COALESCE(${tournaments.reentries}, 0))`,
        
        // FTs: Posição <= 9 (Final Table)
        finalTablesCount: sql<number>`SUM(CASE WHEN ${tournaments.position} <= 9 AND ${tournaments.position} > 0 THEN 1 ELSE 0 END)`,
        
        // Cravadas: Posição = 1
        firstPlaceCount: sql<number>`SUM(CASE WHEN ${tournaments.position} = 1 THEN 1 ELSE 0 END)`,
        
        // Média de participantes
        avgFieldSize: sql<number>`AVG(CAST(${tournaments.fieldSize} AS DECIMAL))`,
        
        // Finalização Precoce: Posição > 90% do field
        earlyFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.position} > (${tournaments.fieldSize} * 0.9) AND ${tournaments.fieldSize} > 0 THEN 1 ELSE 0 END)`,
        
        // Finalização Tardia: Posição <= 10% do field
        lateFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.position} <= (${tournaments.fieldSize} * 0.1) AND ${tournaments.position} > 0 THEN 1 ELSE 0 END)`,
        
        // Big Hit: Maior premiação
        biggestPrize: sql<number>`MAX(CAST(${tournaments.prize} AS DECIMAL))`,
        
        // Stake Range
        minBuyin: sql<number>`MIN(CAST(${tournaments.buyIn} AS DECIMAL))`,
        maxBuyin: sql<number>`MAX(CAST(${tournaments.buyIn} AS DECIMAL))`,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, startDate)
        )
      );

    const [result] = stats;
    
    // Cálculos baseados nas definições do usuário
    const count = Number(result.count || 0);
    const profit = Number(result.totalProfit || 0);
    const totalInvested = Number(result.totalInvested || 0);
    const abi = Number(result.avgBuyin || 0);
    
    // ROI: Profit / Total investido (buy-in + reentradas)
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
    
    // ITM: Percentual que ficou na premiação
    const itmRate = count > 0 ? (Number(result.itmCount || 0) / count) * 100 : 0;
    
    // Lucro médio por torneio
    const avgProfitPerTournament = count > 0 ? profit / count : 0;
    
    // Lucro médio por dia
    const avgProfitPerDay = daysAgo > 0 ? profit / daysAgo : 0;
    
    // FTs com percentual
    const finalTablesCount = Number(result.finalTablesCount || 0);
    const finalTablesRate = count > 0 ? (finalTablesCount / count) * 100 : 0;
    
    // Cravadas com percentual
    const firstPlaceCount = Number(result.firstPlaceCount || 0);
    const firstPlaceRate = count > 0 ? (firstPlaceCount / count) * 100 : 0;
    
    // Finalização precoce com percentual
    const earlyFinishCount = Number(result.earlyFinishCount || 0);
    const earlyFinishRate = count > 0 ? (earlyFinishCount / count) * 100 : 0;
    
    // Finalização tardia com percentual
    const lateFinishCount = Number(result.lateFinishCount || 0);
    const lateFinishRate = count > 0 ? (lateFinishCount / count) * 100 : 0;
    
    // Stake Range (menor e maior buy-in)
    const stakeRange = {
      min: Number(result.minBuyin || 0),
      max: Number(result.maxBuyin || 0)
    };

    return {
      // Indicadores principais
      count, // Quantidade de torneios
      profit, // Lucro total
      abi, // Buy-in médio
      roi, // ROI baseado no total investido
      itm: itmRate, // Percentual ITM
      reentries: Number(result.totalReentries || 0), // Total de reentradas
      avgProfitPerTournament, // Lucro médio por torneio
      stakeRange, // Menor e maior buy-in
      finalTables: finalTablesCount, // Quantidade de FTs
      finalTablesRate, // Percentual de FTs
      bigHits: firstPlaceCount, // Quantidade de 1º lugares (cravadas)
      bigHitsRate: firstPlaceRate, // Percentual de cravadas
      avgFieldSize: Math.round(Number(result.avgFieldSize || 0)), // Média de participantes
      avgProfitPerDay, // Lucro médio por dia
      earlyFinishes: earlyFinishCount, // Quantidade de finalizações precoces
      earlyFinishRate, // Percentual de finalizações precoces
      lateFinishes: lateFinishCount, // Quantidade de finalizações tardias
      lateFinishRate, // Percentual de finalizações tardias
      biggestPrize: Number(result.biggestPrize || 0), // Maior premiação (Big Hit)
      
      // Campos para compatibilidade
      totalProfit: profit,
      totalBuyins: Number(result.totalBuyins || 0),
      totalTournaments: count,
      avgBuyin: abi,
      itmCount: Number(result.itmCount || 0),
    };
  }

  async getPerformanceByPeriod(userId: string, period: string): Promise<any> {
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
