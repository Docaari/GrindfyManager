import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import {
  users,
  subscriptions,
  subscriptionPlans,
} from "@shared/schema";
import { nanoid } from "nanoid";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { hasFullAccess, getSubscriptionStatus, getTrialDaysRemaining, PLANS } from "@shared/permissions";
import { stripe, isStripeEnabled } from "../stripe";

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function stripeUnavailable(res: Response) {
  return res.status(503).json({ message: 'Pagamentos temporariamente indisponiveis' });
}

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

  // Register subscription intent (manual fallback — user wants to subscribe without Stripe)
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

  // =========================================================================
  // Stripe Checkout — create a checkout session
  // =========================================================================
  app.post('/api/subscription/checkout', requireAuth, async (req, res) => {
    try {
      if (!isStripeEnabled() || !stripe) {
        return stripeUnavailable(res);
      }

      const schema = z.object({
        planId: z.string().min(1),
        billingCycle: z.enum(['monthly', 'annual']),
      });
      const { planId, billingCycle } = schema.parse(req.body);

      // Look up the plan
      const [plan] = await db.select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ message: 'Plano nao encontrado' });
      }

      const stripePriceId = billingCycle === 'monthly'
        ? plan.stripePriceIdMonthly
        : plan.stripePriceIdAnnual;

      if (!stripePriceId) {
        return res.status(400).json({ message: 'Preco Stripe nao configurado para este plano/ciclo' });
      }

      const user = req.user!;

      // Create or reuse Stripe customer
      let customerId: string | undefined;
      const [dbUser] = await db.select()
        .from(users)
        .where(eq(users.userPlatformId, user.userPlatformId))
        .limit(1);

      if (dbUser?.stripeCustomerId) {
        customerId = dbUser.stripeCustomerId;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: stripePriceId, quantity: 1 }],
        success_url: `${BASE_URL}/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${BASE_URL}/subscriptions?cancelled=true`,
        ...(customerId ? { customer: customerId } : { customer_email: user.email }),
        metadata: {
          userId: user.userPlatformId,
          planId,
          billingCycle,
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      if ((error as any).issues) {
        return res.status(400).json({ message: 'Dados invalidos. Envie planId e billingCycle.' });
      }
      res.status(500).json({ message: 'Erro ao criar sessao de checkout' });
    }
  });

  // =========================================================================
  // Stripe Billing Portal
  // =========================================================================
  app.post('/api/subscription/portal', requireAuth, async (req, res) => {
    try {
      if (!isStripeEnabled() || !stripe) {
        return stripeUnavailable(res);
      }

      const user = req.user!;
      const [dbUser] = await db.select()
        .from(users)
        .where(eq(users.userPlatformId, user.userPlatformId))
        .limit(1);

      if (!dbUser?.stripeCustomerId) {
        return res.status(400).json({ message: 'Nenhuma assinatura Stripe encontrada. Use o checkout para assinar.' });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: dbUser.stripeCustomerId,
        return_url: `${BASE_URL}/subscriptions`,
      });

      res.json({ url: session.url });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao abrir portal de assinatura' });
    }
  });

  // =========================================================================
  // Cancel subscription (cancel at period end)
  // =========================================================================
  app.post('/api/subscription/cancel', requireAuth, async (req, res) => {
    try {
      if (!isStripeEnabled() || !stripe) {
        return stripeUnavailable(res);
      }

      const user = req.user!;

      // Find active subscription with stripeSubscriptionId
      const [activeSub] = await db.select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, user.userPlatformId),
            eq(subscriptions.status, 'active'),
          )
        )
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (!activeSub?.stripeSubscriptionId) {
        return res.status(400).json({ message: 'Nenhuma assinatura ativa encontrada para cancelar' });
      }

      // Cancel at period end in Stripe
      await stripe.subscriptions.update(activeSub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      // Update local status
      await db.update(subscriptions)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, activeSub.id));

      res.json({ message: 'Assinatura sera cancelada ao fim do periodo atual' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao cancelar assinatura' });
    }
  });

  // =========================================================================
  // Stripe Webhook
  // =========================================================================
  app.post('/api/webhooks/stripe', async (req: Request, res: Response) => {
    if (!isStripeEnabled() || !stripe) {
      return res.status(503).send('Stripe not configured');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(503).send('Webhook secret not configured');
    }

    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      return res.status(400).send('Missing stripe-signature header');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook signature verification failed`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          const userId = session.metadata?.userId;
          const planId = session.metadata?.planId;
          const billingCycle = session.metadata?.billingCycle as 'monthly' | 'annual' | undefined;

          if (!userId) break;

          const stripeCustomerId = session.customer as string;
          const stripeSubscriptionId = session.subscription as string;

          // Save Stripe customer ID on user (idempotent)
          await db.update(users)
            .set({ stripeCustomerId, updatedAt: new Date() })
            .where(eq(users.userPlatformId, userId));

          const durationDays = billingCycle === 'annual' ? 365 : 30;
          const now = new Date();
          const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

          // Check if subscription already exists (idempotent)
          const [existing] = await db.select()
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
            .limit(1);

          if (!existing) {
            await db.insert(subscriptions).values({
              id: nanoid(),
              userId,
              planType: billingCycle || 'monthly',
              status: 'active',
              startDate: now,
              endDate,
              durationDays,
              autoRenewal: true,
              paymentStatus: 'completed',
              stripeSubscriptionId,
              createdAt: now,
              updatedAt: now,
            });
          }

          // Update user subscription fields
          await db.update(users)
            .set({
              subscriptionPlan: 'active',
              subscriptionEndsAt: endDate,
              updatedAt: new Date(),
            })
            .where(eq(users.userPlatformId, userId));

          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as any;
          const stripeSubId = sub.id as string;

          const newStatus = sub.cancel_at_period_end ? 'cancelled' : (sub.status === 'active' ? 'active' : sub.status);

          await db.update(subscriptions)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          const stripeSubId = sub.id as string;

          await db.update(subscriptions)
            .set({ status: 'expired', updatedAt: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

          // Find user and update their subscription status
          const [localSub] = await db.select()
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
            .limit(1);

          if (localSub) {
            await db.update(users)
              .set({
                subscriptionPlan: 'expired',
                updatedAt: new Date(),
              })
              .where(eq(users.userPlatformId, localSub.userId));
          }

          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as any;
          const stripeSubId = invoice.subscription as string;

          if (stripeSubId) {
            await db.update(subscriptions)
              .set({ paymentStatus: 'failed', updatedAt: new Date() })
              .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
          }

          break;
        }
      }
    } catch (error) {
      // Log but don't fail — Stripe will retry
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
  });
}
