import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from './db';
import { subscriptions, userActivities, engagementMetrics } from '@shared/schema';
import { nanoid } from 'nanoid';
import type { Subscription, InsertSubscription, UserActivity, InsertUserActivity, EngagementMetrics, InsertEngagementMetrics } from '@shared/schema';

export class SubscriptionService {
  // Verificar se a assinatura do usuário está ativa
  async checkSubscriptionStatus(userId: string): Promise<{
    isActive: boolean;
    planType: string;
    subscription: Subscription | null;
  }> {
    try {
      const now = new Date();
      
      // Buscar assinatura ativa do usuário
      const activeSubscription = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, 'active'),
            gte(subscriptions.endDate, now)
          )
        )
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (activeSubscription.length === 0) {
        return {
          isActive: false,
          planType: 'basic',
          subscription: null
        };
      }

      const subscription = activeSubscription[0];
      
      return {
        isActive: true,
        planType: subscription.planType,
        subscription
      };
    } catch (error) {
      console.error('🔴 SUBSCRIPTION ERROR - Erro ao verificar status:', error);
      return {
        isActive: false,
        planType: 'basic',
        subscription: null
      };
    }
  }

  // Criar nova assinatura
  async createSubscription(data: {
    userId: string;
    planType: 'basic' | 'premium' | 'pro';
    durationDays: number;
    paymentMethodId?: string;
    autoRenewal?: boolean;
  }): Promise<Subscription> {
    try {
      const now = new Date();
      const endDate = new Date(now.getTime() + (data.durationDays * 24 * 60 * 60 * 1000));

      const subscriptionData = {
        id: nanoid(),
        userId: data.userId,
        planType: data.planType,
        status: 'active',
        startDate: now,
        endDate,
        durationDays: data.durationDays,
        autoRenewal: data.autoRenewal || false,
        paymentStatus: 'completed',
        paymentMethodId: data.paymentMethodId
      };

      const [newSubscription] = await db
        .insert(subscriptions)
        .values(subscriptionData as any) // TODO: type properly - InsertSubscription omits id
        .returning();

      console.log('✅ SUBSCRIPTION CREATED - Nova assinatura criada:', {
        userId: data.userId,
        planType: data.planType,
        endDate: endDate.toISOString()
      });

      return newSubscription;
    } catch (error) {
      console.error('🔴 SUBSCRIPTION ERROR - Erro ao criar assinatura:', error);
      throw error;
    }
  }

  // Rastrear atividade do usuário
  async trackUserActivity(data: {
    userId: string;
    activityType: 'page_view' | 'session_start' | 'session_end' | 'upload' | 'analysis' | 'grind_session';
    page?: string;
    sessionDuration?: number;
    metadata?: Record<string, any>;
  }): Promise<UserActivity> {
    try {
      const activityData = {
        id: nanoid(),
        userId: data.userId,
        activityType: data.activityType,
        page: data.page,
        sessionDuration: data.sessionDuration,
        metadata: data.metadata || {}
      };

      const [newActivity] = await db
        .insert(userActivities)
        .values(activityData as any) // TODO: type properly - InsertUserActivity omits id
        .returning();

      return newActivity;
    } catch (error) {
      console.error('🔴 ACTIVITY ERROR - Erro ao rastrear atividade:', error);
      throw error;
    }
  }

  // Atualizar métricas de engajamento
  async updateEngagementMetrics(userId: string, updates: {
    dailyLoginStreak?: number;
    weeklySessionCount?: number;
    favoriteFeatures?: string[];
    motivationScore?: number;
  }): Promise<EngagementMetrics> {
    try {
      // Verificar se já existe registro de métricas
      const existingMetrics = await db
        .select()
        .from(engagementMetrics)
        .where(eq(engagementMetrics.userId, userId))
        .limit(1);

      if (existingMetrics.length === 0) {
        // Criar novo registro
        const metricsData = {
          id: nanoid(),
          userId,
          streakDays: updates.dailyLoginStreak || 0,
          totalSessions: updates.weeklySessionCount || 0,
          engagementScore: updates.motivationScore || 50,
          lastLoginDate: new Date()
        };

        const [newMetrics] = await db
          .insert(engagementMetrics)
          .values(metricsData as any) // TODO: type properly - InsertEngagementMetrics omits id
          .returning();

        return newMetrics;
      } else {
        // Atualizar registro existente
        const mappedUpdates: Record<string, any> = {};
        if (updates.dailyLoginStreak !== undefined) mappedUpdates.streakDays = updates.dailyLoginStreak;
        if (updates.weeklySessionCount !== undefined) mappedUpdates.totalSessions = updates.weeklySessionCount;
        if (updates.motivationScore !== undefined) mappedUpdates.engagementScore = updates.motivationScore;

        const [updatedMetrics] = await db
          .update(engagementMetrics)
          .set({
            ...mappedUpdates,
            lastLoginDate: new Date(),
            updatedAt: new Date()
          } as any) // TODO: type properly
          .where(eq(engagementMetrics.userId, userId))
          .returning();

        return updatedMetrics;
      }
    } catch (error) {
      console.error('🔴 ENGAGEMENT ERROR - Erro ao atualizar métricas:', error);
      throw error;
    }
  }

  // Obter métricas de engajamento do usuário
  async getEngagementMetrics(userId: string): Promise<EngagementMetrics | null> {
    try {
      const metrics = await db
        .select()
        .from(engagementMetrics)
        .where(eq(engagementMetrics.userId, userId))
        .limit(1);

      return metrics[0] || null;
    } catch (error) {
      console.error('🔴 ENGAGEMENT ERROR - Erro ao obter métricas:', error);
      return null;
    }
  }

  // Marcar assinatura como expirada
  async markSubscriptionAsExpired(subscriptionId: string): Promise<void> {
    try {
      await db
        .update(subscriptions)
        .set({
          status: 'expired',
          updatedAt: new Date()
        })
        .where(eq(subscriptions.id, subscriptionId));

      console.log('⏰ SUBSCRIPTION EXPIRED - Assinatura marcada como expirada:', subscriptionId);
    } catch (error) {
      console.error('🔴 SUBSCRIPTION ERROR - Erro ao marcar como expirada:', error);
    }
  }

  // Obter histórico de assinaturas do usuário
  async getUserSubscriptionHistory(userId: string): Promise<Subscription[]> {
    try {
      return await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt));
    } catch (error) {
      console.error('🔴 SUBSCRIPTION ERROR - Erro ao obter histórico:', error);
      return [];
    }
  }

  // Verificar se usuário tem permissão para acessar feature
  async checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
    try {
      const { isActive, planType } = await this.checkSubscriptionStatus(userId);
      
      // Definir permissões por plano
      const permissions = {
        basic: [
          'dashboard_access',
          'analytics_access',
          'upload_access'
        ],
        premium: [
          'dashboard_access',
          'analytics_access',
          'upload_access',
          'studies_access',
          'grind_access',
          'warm_up_access',
          'grade_planner_access'
        ],
        pro: [
          'dashboard_access',
          'analytics_access',
          'upload_access',
          'studies_access',
          'grind_access',
          'warm_up_access',
          'grade_planner_access',
          'weekly_planner_access',
          'performance_access',
          'mental_prep_access',
          'grind_session_access',
          'user_analytics',
          'executive_reports'
        ]
      };

      const userPermissions = permissions[planType as keyof typeof permissions] || permissions.basic;
      
      return userPermissions.includes(feature);
    } catch (error) {
      console.error('🔴 FEATURE ACCESS ERROR - Erro ao verificar acesso:', error);
      return false;
    }
  }

  // Verificar e processar assinaturas expiradas (executar periodicamente)
  async processExpiredSubscriptions(): Promise<void> {
    try {
      const now = new Date();
      
      // Buscar assinaturas que expiraram
      const expiredSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, 'active'),
            lte(subscriptions.endDate, now)
          )
        );

      // Marcar como expiradas
      for (const subscription of expiredSubscriptions) {
        await this.markSubscriptionAsExpired(subscription.id);
      }

      if (expiredSubscriptions.length > 0) {
        console.log(`⏰ EXPIRED SUBSCRIPTIONS - Processadas ${expiredSubscriptions.length} assinaturas expiradas`);
      }
    } catch (error) {
      console.error('🔴 EXPIRED SUBSCRIPTIONS ERROR - Erro ao processar:', error);
    }
  }
}

export const subscriptionService = new SubscriptionService();