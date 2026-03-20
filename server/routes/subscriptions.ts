import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { subscriptionService } from "../subscriptionService";
import { db } from "../db";
import {
  userSubscriptions,
  subscriptionPlans,
  permissions,
  userPermissions,
  users,
} from "@shared/schema";
import { nanoid } from "nanoid";
import { eq, and, desc, lte, inArray } from "drizzle-orm";
import { removeUserPermissions } from "./helpers";

export function registerSubscriptionRoutes(app: Express): void {
  // Get subscription status
  app.get('/api/subscription/status', requireAuth, async (req, res) => {
    try {
      const subscriptionStatus = await subscriptionService.checkSubscriptionStatus(req.user!.userPlatformId);
      const engagementMetrics = await subscriptionService.getEngagementMetrics(req.user!.userPlatformId);

      res.json({
        ...subscriptionStatus,
        metrics: engagementMetrics
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao verificar status da assinatura' });
    }
  });

  // Create subscription
  app.post('/api/subscription/create', requireAuth, async (req, res) => {
    try {
      const { planType, durationDays, paymentMethodId, autoRenewal } = req.body;

      const subscription = await subscriptionService.createSubscription({
        userId: req.user!.userPlatformId,
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
      res.status(500).json({ message: 'Erro ao criar assinatura' });
    }
  });

  // Get subscription history
  app.get('/api/subscription/history', requireAuth, async (req, res) => {
    try {
      const history = await subscriptionService.getUserSubscriptionHistory(req.user!.userPlatformId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar histórico de assinaturas' });
    }
  });

  // Check feature access
  app.get('/api/subscription/feature/:feature', requireAuth, async (req, res) => {
    try {
      const { feature } = req.params;
      const hasAccess = await subscriptionService.checkFeatureAccess(req.user!.userPlatformId, feature);

      res.json({
        feature,
        hasAccess
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao verificar acesso à funcionalidade' });
    }
  });

  // Update engagement metrics
  app.post('/api/subscription/engagement', requireAuth, async (req, res) => {
    try {
      const metrics = await subscriptionService.updateEngagementMetrics(req.user!.userPlatformId, req.body);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao atualizar métricas de engajamento' });
    }
  });

  // Get all subscription plans
  app.get('/api/subscription-plans', async (req, res) => {
    try {
      const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
      res.json(plans);
    } catch (error) {
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
      endDate.setDate(endDate.getDate() + (plan[0].durationDays || 30));

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

      res.status(201).json({ message: 'Assinatura criada com sucesso', subscriptionId: subscriptionData.id });
    } catch (error) {
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
      res.status(500).json({ message: 'Erro ao cancelar assinatura' });
    }
  });

  // Check subscription expiration (cron job endpoint)
  app.post('/api/subscriptions/check-expiration', requireAuth, requirePermission('admin_full'), async (req: any, res) => {
    try {
      const now = new Date();

      // Find expired subscriptions
      const expiredSubscriptions = await db.select()
        .from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.status, 'active'),
          lte(userSubscriptions.endDate, now)
        ));


      for (const subscription of expiredSubscriptions) {
        if (subscription.autoRenew) {
          // Handle auto-renewal logic here
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

        }
      }

      res.json({
        message: 'Verificação de expiração concluída',
        processed: expiredSubscriptions.length
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao verificar expiração de assinaturas' });
    }
  });
}

// Helper function to apply plan permissions
async function applyPlanPermissions(userId: string, planId: string) {
  try {
    const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (plan.length === 0) return;

    const planPermissions = plan[0].permissions;
    if (!planPermissions || planPermissions.length === 0) return;

    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

    const permissionRecords = await db.select()
      .from(permissions)
      .where(inArray(permissions.name, planPermissions));

    const startDate = new Date();
    const expirationDate = new Date(startDate);
    expirationDate.setDate(expirationDate.getDate() + (plan[0].durationDays || 30));

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
  } catch (error) {
    throw error;
  }
}
