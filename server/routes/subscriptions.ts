import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { db } from "../db";
import {
  users,
  subscriptions,
} from "@shared/schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hasFullAccess, getSubscriptionStatus, getTrialDaysRemaining, isSuperAdmin, PLANS } from "@shared/permissions";

export function registerSubscriptionRoutes(app: Express): void {
  // Get subscription status
  app.get('/api/subscription/status', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const status = getSubscriptionStatus(user);
      const daysRemaining = status === 'trial'
        ? getTrialDaysRemaining(user.trialEndsAt)
        : status === 'active' && user.subscriptionEndsAt
          ? Math.max(0, Math.ceil((new Date(user.subscriptionEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : 0;

      res.json({
        plan: status,
        trialEndsAt: user.trialEndsAt,
        subscriptionEndsAt: user.subscriptionEndsAt,
        daysRemaining,
        hasAccess: hasFullAccess(user),
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao verificar status da assinatura' });
    }
  });

  // Register subscription intent (user wants to subscribe)
  app.post('/api/subscription/subscribe', requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        billingCycle: z.enum(['monthly', 'annual']),
      });
      const { billingCycle } = schema.parse(req.body);

      const plan = PLANS[billingCycle];
      const amount = billingCycle === 'monthly' ? 2990 : 23880; // cents

      // Create pending subscription record
      await db.insert(subscriptions).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        planType: billingCycle,
        status: 'pending',
        startDate: new Date(),
        endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
        durationDays: plan.durationDays,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      res.json({
        message: 'Solicitacao de assinatura registrada. Entre em contato com o suporte para finalizar o pagamento.',
        billingCycle,
        amount,
        currency: 'BRL',
      });
    } catch (error) {
      if ((error as any).issues) {
        return res.status(400).json({ message: 'Ciclo de cobranca invalido. Use "monthly" ou "annual".' });
      }
      res.status(500).json({ message: 'Erro ao registrar solicitacao de assinatura' });
    }
  });

  // Get subscription history
  app.get('/api/subscription/history', requireAuth, async (req, res) => {
    try {
      const history = await db.select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, req.user!.userPlatformId))
        .orderBy(subscriptions.createdAt);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar historico de assinaturas' });
    }
  });
}
