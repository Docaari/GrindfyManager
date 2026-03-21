import { describe, it, expect } from 'vitest';
import {
  isSuperAdmin,
  SUPER_ADMIN_EMAILS,
  hasFullAccess,
  getTrialDaysRemaining,
  getSubscriptionStatus,
  PLANS,
} from '../../../shared/permissions';

// =============================================================================
// Testes: Sistema de permissoes simplificado (shared/permissions.ts)
//
// Novo modelo binario: trial ativo / assinatura ativa / admin = acesso total.
// Tudo o mais = sem acesso.
// =============================================================================

// ---------------------------------------------------------------------------
// isSuperAdmin
// ---------------------------------------------------------------------------

describe('isSuperAdmin', () => {
  it('deve retornar true para email do super admin', () => {
    expect(isSuperAdmin(SUPER_ADMIN_EMAILS[0])).toBe(true);
  });

  it('deve retornar true para segundo super admin', () => {
    expect(isSuperAdmin(SUPER_ADMIN_EMAILS[1])).toBe(true);
  });

  it('deve retornar false para qualquer outro email', () => {
    expect(isSuperAdmin('outro@email.com')).toBe(false);
  });

  it('deve retornar false para string vazia', () => {
    expect(isSuperAdmin('')).toBe(false);
  });

  it('deve ser case-sensitive', () => {
    expect(isSuperAdmin(SUPER_ADMIN_EMAILS[0].toUpperCase())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasFullAccess
// ---------------------------------------------------------------------------

describe('hasFullAccess', () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

  it('deve retornar true para super-admin independente de datas', () => {
    expect(hasFullAccess({
      email: SUPER_ADMIN_EMAILS[0],
      subscriptionPlan: 'expired',
      trialEndsAt: null,
      subscriptionEndsAt: null,
    })).toBe(true);
  });

  it('deve retornar true para plano admin independente de datas', () => {
    expect(hasFullAccess({
      email: 'qualquer@email.com',
      subscriptionPlan: 'admin',
      trialEndsAt: null,
      subscriptionEndsAt: null,
    })).toBe(true);
  });

  it('deve retornar true para trial com trialEndsAt no futuro', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'trial',
      trialEndsAt: futureDate,
      subscriptionEndsAt: null,
    })).toBe(true);
  });

  it('deve retornar false para trial com trialEndsAt no passado', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'trial',
      trialEndsAt: pastDate,
      subscriptionEndsAt: null,
    })).toBe(false);
  });

  it('deve retornar true para active com subscriptionEndsAt no futuro', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'active',
      trialEndsAt: null,
      subscriptionEndsAt: futureDate,
    })).toBe(true);
  });

  it('deve retornar false para active com subscriptionEndsAt no passado', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'active',
      trialEndsAt: null,
      subscriptionEndsAt: pastDate,
    })).toBe(false);
  });

  it('deve retornar false para expired sem datas', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'expired',
      trialEndsAt: null,
      subscriptionEndsAt: null,
    })).toBe(false);
  });

  it('deve retornar false para trial com trialEndsAt null (defensivo)', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'trial',
      trialEndsAt: null,
      subscriptionEndsAt: null,
    })).toBe(false);
  });

  it('deve retornar false para active com subscriptionEndsAt null (defensivo)', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'active',
      trialEndsAt: null,
      subscriptionEndsAt: null,
    })).toBe(false);
  });

  it('deve funcionar com Date objects alem de strings', () => {
    const futureAsDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'trial',
      trialEndsAt: futureAsDate,
      subscriptionEndsAt: null,
    })).toBe(true);
  });

  it('defense in depth: subscriptionPlan trial mas trialEndsAt passado => false', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'trial',
      trialEndsAt: pastDate,
      subscriptionEndsAt: null,
    })).toBe(false);
  });

  it('defense in depth: subscriptionPlan active mas subscriptionEndsAt passado => false', () => {
    expect(hasFullAccess({
      email: 'user@test.com',
      subscriptionPlan: 'active',
      trialEndsAt: null,
      subscriptionEndsAt: pastDate,
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTrialDaysRemaining
// ---------------------------------------------------------------------------

describe('getTrialDaysRemaining', () => {
  it('deve retornar 0 para null', () => {
    expect(getTrialDaysRemaining(null)).toBe(0);
  });

  it('deve retornar 0 para undefined', () => {
    expect(getTrialDaysRemaining(undefined)).toBe(0);
  });

  it('deve retornar 0 para data no passado', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(getTrialDaysRemaining(past)).toBe(0);
  });

  it('deve retornar dias restantes para data no futuro', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const days = getTrialDaysRemaining(future);
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
  });

  it('deve funcionar com string ISO', () => {
    const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const days = getTrialDaysRemaining(future);
    expect(days).toBeGreaterThanOrEqual(13);
    expect(days).toBeLessThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionStatus
// ---------------------------------------------------------------------------

describe('getSubscriptionStatus', () => {
  it('deve retornar "active" para subscriptionEndsAt no futuro', () => {
    expect(getSubscriptionStatus({
      subscriptionPlan: 'active',
      trialEndsAt: null,
      subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })).toBe('active');
  });

  it('deve retornar "trial" para trialEndsAt no futuro (sem subscription)', () => {
    expect(getSubscriptionStatus({
      subscriptionPlan: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionEndsAt: null,
    })).toBe('trial');
  });

  it('deve retornar "expired" quando ambas datas no passado', () => {
    expect(getSubscriptionStatus({
      subscriptionPlan: 'expired',
      trialEndsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionEndsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    })).toBe('expired');
  });

  it('deve retornar "expired" quando ambas datas null', () => {
    expect(getSubscriptionStatus({
      subscriptionPlan: 'expired',
      trialEndsAt: null,
      subscriptionEndsAt: null,
    })).toBe('expired');
  });

  it('deve priorizar active sobre trial quando ambos validos', () => {
    expect(getSubscriptionStatus({
      subscriptionPlan: 'active',
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// PLANS
// ---------------------------------------------------------------------------

describe('PLANS', () => {
  it('deve ter plano mensal com preco R$29.90', () => {
    expect(PLANS.monthly.pricePerMonth).toBe(29.90);
    expect(PLANS.monthly.durationDays).toBe(30);
  });

  it('deve ter plano anual com preco R$19.90/mes', () => {
    expect(PLANS.annual.pricePerMonth).toBe(19.90);
    expect(PLANS.annual.totalPrice).toBe(238.80);
    expect(PLANS.annual.durationDays).toBe(365);
    expect(PLANS.annual.discount).toBe(33);
  });
});
