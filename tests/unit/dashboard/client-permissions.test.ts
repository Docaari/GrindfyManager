import { describe, it, expect } from 'vitest';
import {
  hasFullAccess,
  isSuperAdmin,
  getSubscriptionStatus,
  getTrialDaysRemaining,
  PLANS,
} from '../../../client/src/lib/permissions';

// =============================================================================
// Testes: Funcoes de permissao do cliente (client/src/lib/permissions.ts)
//
// Re-exports do shared/permissions.ts. Testa a interface publica usada
// pelo frontend para controle de acesso binario.
// =============================================================================

describe('hasFullAccess (client re-export)', () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

  it('deve retornar true para trial ativo', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'trial',
      trialEndsAt: futureDate,
    })).toBe(true);
  });

  it('deve retornar false para trial expirado', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'trial',
      trialEndsAt: pastDate,
    })).toBe(false);
  });

  it('deve retornar true para assinatura ativa', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'active',
      subscriptionEndsAt: futureDate,
    })).toBe(true);
  });

  it('deve retornar false para assinatura expirada', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'active',
      subscriptionEndsAt: pastDate,
    })).toBe(false);
  });
});

describe('isSuperAdmin (client re-export)', () => {
  it('deve funcionar via re-export', () => {
    expect(isSuperAdmin('ricardo.agnolo@hotmail.com')).toBe(true);
    expect(isSuperAdmin('random@test.com')).toBe(false);
  });
});

describe('getSubscriptionStatus (client re-export)', () => {
  it('deve retornar trial para usuario em trial', () => {
    expect(getSubscriptionStatus({
      subscriptionPlan: 'trial',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })).toBe('trial');
  });

  it('deve retornar expired para usuario expirado', () => {
    expect(getSubscriptionStatus({
      subscriptionPlan: 'expired',
    })).toBe('expired');
  });
});

describe('getTrialDaysRemaining (client re-export)', () => {
  it('deve retornar 0 para null', () => {
    expect(getTrialDaysRemaining(null)).toBe(0);
  });

  it('deve retornar dias para data futura', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    expect(getTrialDaysRemaining(future)).toBeGreaterThanOrEqual(9);
  });
});

describe('PLANS (client re-export)', () => {
  it('deve exportar planos mensal e anual', () => {
    expect(PLANS.monthly).toBeDefined();
    expect(PLANS.annual).toBeDefined();
    expect(PLANS.monthly.pricePerMonth).toBe(29.90);
    expect(PLANS.annual.pricePerMonth).toBe(19.90);
  });
});
