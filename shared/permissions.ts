// Subscription Reform: Simple binary access model
// Users either have full access (trial active, subscription active, or super-admin) or no access.

export const SUPER_ADMIN_EMAILS = ['ricardo.agnolo@hotmail.com', 'admin@grindfyapp.com'];

export function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email);
}

export function hasFullAccess(user: {
  email: string;
  subscriptionPlan: string;
  trialEndsAt?: string | Date | null;
  subscriptionEndsAt?: string | Date | null;
}): boolean {
  if (isSuperAdmin(user.email)) return true;
  if (user.subscriptionPlan === 'admin') return true;

  const now = new Date();

  if (user.trialEndsAt) {
    const trialEnd = new Date(user.trialEndsAt);
    if (trialEnd > now) return true;
  }

  if (user.subscriptionEndsAt) {
    const subEnd = new Date(user.subscriptionEndsAt);
    if (subEnd > now) return true;
  }

  return false;
}

export function getTrialDaysRemaining(trialEndsAt?: string | Date | null): number {
  if (!trialEndsAt) return 0;
  const end = new Date(trialEndsAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getSubscriptionStatus(user: {
  subscriptionPlan: string;
  trialEndsAt?: string | Date | null;
  subscriptionEndsAt?: string | Date | null;
}): 'trial' | 'active' | 'expired' {
  const now = new Date();
  if (user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > now) return 'active';
  if (user.trialEndsAt && new Date(user.trialEndsAt) > now) return 'trial';
  return 'expired';
}

// Plan definitions
export const PLANS = {
  monthly: { id: 'monthly', name: 'Mensal', pricePerMonth: 29.90, totalPrice: 29.90, durationDays: 30 },
  annual: { id: 'annual', name: 'Anual', pricePerMonth: 19.90, totalPrice: 238.80, durationDays: 365, discount: 33 },
};
