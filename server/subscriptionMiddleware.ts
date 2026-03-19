import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from './subscriptionService';

interface AuthenticatedRequest extends Omit<Request, 'user'> {
  user?: {
    id: string;
    userPlatformId: string;
    email: string;
    username: string;
    isBlocked?: boolean;
  };
}

// Middleware para verificar status de assinatura
export async function checkSubscriptionStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.userPlatformId) {
      return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    const { isActive, planType, subscription } = await subscriptionService.checkSubscriptionStatus(req.user.userPlatformId);

    // Adicionar informações de assinatura ao request
    (req as any).subscription = {
      isActive,
      planType,
      subscription
    };

    // Atualizar métricas de engajamento
    await subscriptionService.trackUserActivity({
      userId: req.user.userPlatformId,
      activityType: 'page_view',
      page: req.path,
      metadata: {
        method: req.method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }
    });


    next();
  } catch (error) {
    next();
  }
}

// Middleware para verificar acesso a features específicas
export function requireSubscriptionFeature(featureName: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.userPlatformId) {
        return res.status(401).json({ message: 'Usuário não autenticado' });
      }

      const hasAccess = await subscriptionService.checkFeatureAccess(req.user.userPlatformId, featureName);

      if (!hasAccess) {
        // Rastrear tentativa de acesso negado
        await subscriptionService.trackUserActivity({
          userId: req.user.userPlatformId,
          activityType: 'page_view' as any, // TODO: type properly - 'access_denied' not in schema enum
          page: req.path,
          metadata: {
            feature: featureName,
            reason: 'subscription_required'
          }
        });

        return res.status(403).json({
          message: 'Acesso negado: assinatura necessária',
          feature: featureName,
          upgradeRequired: true
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }
  };
}

// Middleware para usuários expirados (acesso apenas à Home)
export function restrictExpiredUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const subscription = (req as any).subscription;
  
  if (!subscription?.isActive && req.path !== '/' && req.path !== '/api/auth/me' && req.path !== '/api/auth/logout') {
    return res.status(403).json({
      message: 'Assinatura expirada: acesso limitado à página inicial',
      expired: true,
      upgradeRequired: true
    });
  }

  next();
}

// Middleware para processar assinaturas expiradas periodicamente
export async function processExpiredSubscriptions() {
  try {
    await subscriptionService.processExpiredSubscriptions();
  } catch (error) {
  }
}

// Configurar processamento automático de assinaturas expiradas (executar a cada hora)
export function setupSubscriptionProcessing() {
  // Executar imediatamente
  processExpiredSubscriptions();
  
  // Configurar execução a cada hora
  setInterval(processExpiredSubscriptions, 60 * 60 * 1000);
  
}

// Middleware para adicionar informações de assinatura à resposta
export function addSubscriptionInfo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const subscription = (req as any).subscription;
  
  if (subscription) {
    res.locals.subscription = {
      isActive: subscription.isActive,
      planType: subscription.planType,
      endDate: subscription.subscription?.endDate,
      daysRemaining: subscription.subscription?.endDate 
        ? Math.ceil((new Date(subscription.subscription.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null
    };
  }

  next();
}

// Middleware para rastrear início de sessão
export async function trackSessionStart(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (req.user?.userPlatformId) {
      await subscriptionService.trackUserActivity({
        userId: req.user.userPlatformId,
        activityType: 'session_start',
        metadata: {
          timestamp: new Date().toISOString(),
          userAgent: req.get('User-Agent')
        }
      });

      // Atualizar streak de login diário
      const metrics = await subscriptionService.getEngagementMetrics(req.user.userPlatformId);
      const lastLoginDateVal = metrics?.lastLoginDate;
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      let newStreak = 1;
      if (lastLoginDateVal) {
        const lastLoginDate = new Date(lastLoginDateVal);
        if (lastLoginDate.toDateString() === yesterday.toDateString()) {
          newStreak = (metrics!.streakDays || 0) + 1;
        } else if (lastLoginDate.toDateString() === today.toDateString()) {
          newStreak = metrics!.streakDays || 1;
        }
      }

      await subscriptionService.updateEngagementMetrics(req.user.userPlatformId, {
        dailyLoginStreak: newStreak
      });
    }

    next();
  } catch (error) {
    next();
  }
}

export default {
  checkSubscriptionStatus,
  requireSubscriptionFeature,
  restrictExpiredUsers,
  addSubscriptionInfo,
  trackSessionStart,
  setupSubscriptionProcessing
};