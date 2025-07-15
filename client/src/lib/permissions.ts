import { SUBSCRIPTION_PROFILES } from '../../../shared/permissions';

export type SubscriptionPlan = 'basico' | 'premium' | 'pro' | 'admin';

/**
 * Obtém as tags/permissões para um plano de assinatura
 */
export function getUserTags(subscriptionPlan: SubscriptionPlan): string[] {
  const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
  return profile ? profile.tags : [];
}

/**
 * Verifica se um usuário tem acesso a uma tag específica
 */
export function hasTagAccess(userPlan: SubscriptionPlan, requiredTag: string): boolean {
  const userTags = getUserTags(userPlan);
  return userTags.includes(requiredTag);
}

/**
 * Verifica se um usuário tem acesso a uma página específica
 */
export function hasPageAccess(userPlan: SubscriptionPlan, pageName: string): boolean {
  const profile = SUBSCRIPTION_PROFILES[userPlan];
  if (!profile) return false;
  
  return profile.pages.includes(pageName);
}

/**
 * Obtém o nome legível do plano de assinatura
 */
export function getSubscriptionPlanName(plan: SubscriptionPlan): string {
  const names = {
    'basico': 'Básico',
    'premium': 'Premium',
    'pro': 'Pro',
    'admin': 'Admin'
  };
  return names[plan] || 'Desconhecido';
}

/**
 * Obtém informações detalhadas sobre um plano de assinatura
 */
export function getSubscriptionPlanInfo(plan: SubscriptionPlan) {
  const profile = SUBSCRIPTION_PROFILES[plan];
  if (!profile) return null;
  
  return {
    name: getSubscriptionPlanName(plan),
    description: profile.description,
    tags: profile.tags,
    pages: profile.pages,
    features: profile.features
  };
}