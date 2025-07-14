import { db } from './db';
import { subscriptions, notifications } from '@shared/schema';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface NotificationData {
  id: string;
  userId: string;
  type: 'subscription_expiring' | 'subscription_expired' | 'general';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  daysUntilExpiration?: number;
  isRead: boolean;
  createdAt: Date;
  scheduledFor?: Date;
}

export class NotificationService {
  static async createNotification(data: {
    userId: string;
    type: 'subscription_expiring' | 'subscription_expired' | 'general';
    title: string;
    message: string;
    priority: 'low' | 'medium' | 'high';
    daysUntilExpiration?: number;
    scheduledFor?: Date;
  }): Promise<NotificationData> {
    const notification = {
      id: nanoid(),
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      priority: data.priority,
      daysUntilExpiration: data.daysUntilExpiration || null,
      isRead: false,
      createdAt: new Date(),
      scheduledFor: data.scheduledFor || new Date(),
    };

    await db.insert(notifications).values(notification);
    return notification as NotificationData;
  }

  static async getUserNotifications(userId: string): Promise<NotificationData[]> {
    const userNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(sql`${notifications.createdAt} DESC`);

    return userNotifications as NotificationData[];
  }

  static async markAsRead(notificationId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));
  }

  static async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));

    return result[0]?.count || 0;
  }

  static async checkExpiringSubscriptions(): Promise<void> {
    console.log('🔔 NOTIFICATIONS - Verificando assinaturas próximas do vencimento...');
    
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    try {
      // Assinaturas expirando em 7 dias
      const expiring7Days = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.status, 'active'),
          lte(subscriptions.endDate, in7Days),
          gte(subscriptions.endDate, new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000))
        ));

      for (const subscription of expiring7Days) {
        await this.createExpirationNotification(subscription.userId, 7);
      }

      // Assinaturas expirando em 3 dias
      const expiring3Days = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.status, 'active'),
          lte(subscriptions.endDate, in3Days),
          gte(subscriptions.endDate, new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000))
        ));

      for (const subscription of expiring3Days) {
        await this.createExpirationNotification(subscription.userId, 3);
      }

      // Assinaturas expirando em 1 dia
      const expiring1Day = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.status, 'active'),
          lte(subscriptions.endDate, in1Day),
          gte(subscriptions.endDate, now)
        ));

      for (const subscription of expiring1Day) {
        await this.createExpirationNotification(subscription.userId, 1);
      }

      console.log(`🔔 NOTIFICATIONS - Processadas: ${expiring7Days.length} (7d), ${expiring3Days.length} (3d), ${expiring1Day.length} (1d)`);
    } catch (error) {
      console.error('🔔 NOTIFICATIONS - Erro ao verificar assinaturas:', error);
    }
  }

  static async createExpirationNotification(userId: string, daysUntilExpiration: number): Promise<void> {
    const titles = {
      7: 'Assinatura expira em 7 dias',
      3: 'Assinatura expira em 3 dias - Ação necessária',
      1: 'Assinatura expira amanhã - Renove agora'
    };

    const messages = {
      7: 'Sua assinatura Grindfy expira em 7 dias. Renove agora para manter acesso a todas as funcionalidades.',
      3: 'Sua assinatura expira em apenas 3 dias! Não perca o acesso às suas análises e dados.',
      1: 'URGENTE: Sua assinatura expira amanhã! Renove agora para não perder acesso à plataforma.'
    };

    const priorities = {
      7: 'medium' as const,
      3: 'high' as const,
      1: 'high' as const
    };

    // Verificar se já existe notificação similar recente
    const existingNotifications = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'subscription_expiring'),
        eq(notifications.daysUntilExpiration, daysUntilExpiration),
        gte(notifications.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)) // últimas 24h
      ));

    if (existingNotifications.length === 0) {
      await this.createNotification({
        userId,
        type: 'subscription_expiring',
        title: titles[daysUntilExpiration as keyof typeof titles],
        message: messages[daysUntilExpiration as keyof typeof messages],
        priority: priorities[daysUntilExpiration as keyof typeof priorities],
        daysUntilExpiration
      });

      console.log(`🔔 NOTIFICATIONS - Criada notificação para usuário ${userId} (${daysUntilExpiration} dias)`);
    }
  }

  static async createExpiredNotification(userId: string): Promise<void> {
    await this.createNotification({
      userId,
      type: 'subscription_expired',
      title: 'Assinatura expirada',
      message: 'Sua assinatura Grindfy expirou. Renove agora para recuperar o acesso completo à plataforma.',
      priority: 'high'
    });
  }

  static async deleteOldNotifications(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    await db
      .delete(notifications)
      .where(lte(notifications.createdAt, thirtyDaysAgo));
    
    console.log('🔔 NOTIFICATIONS - Notificações antigas removidas');
  }
}