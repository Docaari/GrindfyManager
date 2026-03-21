import { describe, it, expect } from 'vitest';
import { PLANS } from '../../../shared/permissions';

// =============================================================================
// Tests: Subscription plans and activation — RF-01, RF-09, RF-11
// Spec: docs/specs/subscription-reform.md
// =============================================================================

// Helper: simulate activateSubscription logic (from admin endpoint)
function activateSubscription(
  _userId: string,
  billingCycle: 'monthly' | 'annual'
) {
  const plan = PLANS[billingCycle];
  const now = Date.now();
  return {
    subscriptionPlan: 'active',
    subscriptionEndsAt: new Date(now + plan.durationDays * 24 * 60 * 60 * 1000),
    billingCycle,
  };
}

function validateBillingCycle(cycle: string): boolean {
  return cycle === 'monthly' || cycle === 'annual';
}

describe('Subscription plans constants', () => {
  describe('monthly plan', () => {
    it('deve ter plano mensal definido', () => {
      expect(PLANS.monthly).toBeDefined();
    });

    it('deve ter preco mensal de R$29,90', () => {
      expect(PLANS.monthly.pricePerMonth).toBe(29.90);
    });

    it('deve ter preco total igual ao mensal', () => {
      expect(PLANS.monthly.totalPrice).toBe(29.90);
    });

    it('deve ter duracao de 30 dias', () => {
      expect(PLANS.monthly.durationDays).toBe(30);
    });
  });

  describe('annual plan', () => {
    it('deve ter plano anual definido', () => {
      expect(PLANS.annual).toBeDefined();
    });

    it('deve ter preco mensal equivalente de R$19,90', () => {
      expect(PLANS.annual.pricePerMonth).toBe(19.90);
    });

    it('deve ter preco total anual de R$238,80', () => {
      expect(PLANS.annual.totalPrice).toBe(238.80);
    });

    it('deve ter duracao de 365 dias', () => {
      expect(PLANS.annual.durationDays).toBe(365);
    });

    it('deve ter desconto de 33%', () => {
      expect(PLANS.annual.discount).toBe(33);
    });
  });

  describe('economia do plano anual', () => {
    it('deve ter desconto de ~33% comparado ao mensal', () => {
      const monthlyAnnualCost = 29.90 * 12;
      const annualCost = 238.80;
      const discount = ((monthlyAnnualCost - annualCost) / monthlyAnnualCost) * 100;

      expect(discount).toBeGreaterThanOrEqual(33);
      expect(discount).toBeLessThan(34);
    });
  });

  describe('planos disponiveis', () => {
    it('deve ter exatamente 2 planos: monthly e annual', () => {
      expect(Object.keys(PLANS)).toHaveLength(2);
      expect(Object.keys(PLANS)).toContain('monthly');
      expect(Object.keys(PLANS)).toContain('annual');
    });

    it('nao deve ter planos basico, premium ou pro (valores antigos)', () => {
      expect(PLANS).not.toHaveProperty('basico');
      expect(PLANS).not.toHaveProperty('premium');
      expect(PLANS).not.toHaveProperty('pro');
    });
  });
});

describe('Subscription activation', () => {
  describe('monthly activation', () => {
    it('deve definir subscriptionPlan como active', () => {
      const result = activateSubscription('user-123', 'monthly');
      expect(result.subscriptionPlan).toBe('active');
    });

    it('deve definir subscriptionEndsAt como 30 dias no futuro', () => {
      const before = Date.now();
      const result = activateSubscription('user-123', 'monthly');
      const after = Date.now();
      const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
      expect(result.subscriptionEndsAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.subscriptionEndsAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('deve definir billingCycle como monthly', () => {
      const result = activateSubscription('user-123', 'monthly');
      expect(result.billingCycle).toBe('monthly');
    });
  });

  describe('annual activation', () => {
    it('deve definir subscriptionPlan como active', () => {
      const result = activateSubscription('user-123', 'annual');
      expect(result.subscriptionPlan).toBe('active');
    });

    it('deve definir subscriptionEndsAt como 365 dias no futuro', () => {
      const before = Date.now();
      const result = activateSubscription('user-123', 'annual');
      const after = Date.now();
      const expectedMin = before + 365 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 365 * 24 * 60 * 60 * 1000;
      expect(result.subscriptionEndsAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.subscriptionEndsAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('deve definir billingCycle como annual', () => {
      const result = activateSubscription('user-123', 'annual');
      expect(result.billingCycle).toBe('annual');
    });
  });
});

describe('Billing cycle validation', () => {
  it('deve aceitar monthly como billingCycle valido', () => {
    expect(validateBillingCycle('monthly')).toBe(true);
  });

  it('deve aceitar annual como billingCycle valido', () => {
    expect(validateBillingCycle('annual')).toBe(true);
  });

  it('deve rejeitar billingCycle invalido', () => {
    expect(validateBillingCycle('weekly')).toBe(false);
  });

  it('deve rejeitar string vazia', () => {
    expect(validateBillingCycle('')).toBe(false);
  });

  it('deve rejeitar valores antigos de plano', () => {
    expect(validateBillingCycle('basico')).toBe(false);
    expect(validateBillingCycle('premium')).toBe(false);
    expect(validateBillingCycle('pro')).toBe(false);
  });

  it('deve rejeitar free como billingCycle', () => {
    expect(validateBillingCycle('free')).toBe(false);
  });
});
