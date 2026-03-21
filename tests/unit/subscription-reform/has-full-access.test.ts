import { describe, it, expect } from 'vitest';
import {
  hasFullAccess,
  getTrialDaysRemaining,
  SUPER_ADMIN_EMAILS,
} from '../../../shared/permissions';

// =============================================================================
// Tests: hasFullAccess (pure function) — shared/permissions.ts
// Spec: docs/specs/subscription-reform.md — RF-04
// =============================================================================

// --- Helpers ---
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Adapter: the test file used positional args, but hasFullAccess takes an object
function checkAccess(
  subscriptionPlan: string,
  trialEndsAt: string | Date | null,
  subscriptionEndsAt: string | Date | null,
  userEmail?: string
): boolean {
  return hasFullAccess({
    email: userEmail || 'user@test.com',
    subscriptionPlan,
    trialEndsAt,
    subscriptionEndsAt,
  });
}

describe('hasFullAccess', () => {
  describe('super-admin bypass', () => {
    it('deve retornar true para ricardo.agnolo@hotmail.com independente de datas', () => {
      expect(checkAccess('expired', null, null, 'ricardo.agnolo@hotmail.com')).toBe(true);
    });

    it('deve retornar true para admin@grindfyapp.com independente de datas', () => {
      expect(checkAccess('expired', null, null, 'admin@grindfyapp.com')).toBe(true);
    });

    it('deve retornar true para super-admin mesmo com subscriptionPlan expired', () => {
      expect(checkAccess('expired', daysAgo(30), daysAgo(10), 'ricardo.agnolo@hotmail.com')).toBe(true);
    });

    it('deve retornar true para super-admin mesmo sem nenhuma data preenchida', () => {
      expect(checkAccess('trial', null, null, 'admin@grindfyapp.com')).toBe(true);
    });

    it('deve retornar false para email que nao e super-admin', () => {
      expect(checkAccess('expired', null, null, 'usuario@email.com')).toBe(false);
    });
  });

  describe('trial ativo', () => {
    it('deve retornar true para trial com trialEndsAt no futuro', () => {
      expect(checkAccess('trial', daysFromNow(7), null)).toBe(true);
    });

    it('deve retornar true para trial com trialEndsAt em 14 dias', () => {
      expect(checkAccess('trial', daysFromNow(14), null)).toBe(true);
    });

    it('deve retornar true para trial com trialEndsAt em 1 dia', () => {
      expect(checkAccess('trial', daysFromNow(1), null)).toBe(true);
    });

    it('deve retornar true para trial com trialEndsAt como string ISO', () => {
      expect(checkAccess('trial', daysFromNow(10).toISOString(), null)).toBe(true);
    });
  });

  describe('trial expirado', () => {
    it('deve retornar false para trial com trialEndsAt no passado', () => {
      expect(checkAccess('trial', daysAgo(1), null)).toBe(false);
    });

    it('deve retornar false para trial com trialEndsAt ha 30 dias', () => {
      expect(checkAccess('trial', daysAgo(30), null)).toBe(false);
    });

    it('deve retornar false para trial com trialEndsAt null (defensivo)', () => {
      expect(checkAccess('trial', null, null)).toBe(false);
    });

    it('deve retornar false quando subscriptionPlan e trial mas trialEndsAt expirou (defense in depth)', () => {
      expect(checkAccess('trial', daysAgo(5), null)).toBe(false);
    });
  });

  describe('assinatura ativa', () => {
    it('deve retornar true para active com subscriptionEndsAt no futuro', () => {
      expect(checkAccess('active', null, daysFromNow(30))).toBe(true);
    });

    it('deve retornar true para active com subscriptionEndsAt em 365 dias', () => {
      expect(checkAccess('active', null, daysFromNow(365))).toBe(true);
    });

    it('deve retornar true para active com subscriptionEndsAt em 1 dia', () => {
      expect(checkAccess('active', null, daysFromNow(1))).toBe(true);
    });

    it('deve retornar true para active com subscriptionEndsAt como string ISO', () => {
      expect(checkAccess('active', null, daysFromNow(60).toISOString())).toBe(true);
    });

    it('deve retornar true para active com trial expirado mas assinatura valida', () => {
      expect(checkAccess('active', daysAgo(30), daysFromNow(30))).toBe(true);
    });
  });

  describe('assinatura expirada', () => {
    it('deve retornar false para active com subscriptionEndsAt no passado', () => {
      expect(checkAccess('active', null, daysAgo(1))).toBe(false);
    });

    it('deve retornar false para active com subscriptionEndsAt ha 60 dias', () => {
      expect(checkAccess('active', null, daysAgo(60))).toBe(false);
    });

    it('deve retornar false para active com subscriptionEndsAt null (defensivo)', () => {
      expect(checkAccess('active', null, null)).toBe(false);
    });

    it('deve retornar false quando subscriptionPlan e active mas subscriptionEndsAt expirou (defense in depth)', () => {
      expect(checkAccess('active', null, daysAgo(10))).toBe(false);
    });
  });

  describe('plan admin', () => {
    it('deve retornar true para subscriptionPlan admin independente de datas', () => {
      expect(checkAccess('admin', null, null)).toBe(true);
    });

    it('deve retornar true para admin mesmo com datas expiradas', () => {
      expect(checkAccess('admin', daysAgo(100), daysAgo(50))).toBe(true);
    });

    it('deve retornar true para admin sem email fornecido', () => {
      expect(checkAccess('admin', null, null, undefined)).toBe(true);
    });
  });

  describe('plan expired', () => {
    it('deve retornar false para subscriptionPlan expired', () => {
      expect(checkAccess('expired', null, null)).toBe(false);
    });

    it('deve retornar false para expired sem datas', () => {
      expect(checkAccess('expired', null, null)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('deve retornar false quando ambas as datas sao null', () => {
      expect(checkAccess('trial', null, null)).toBe(false);
    });

    it('deve retornar false quando ambas as datas sao undefined', () => {
      expect(checkAccess('active', undefined as any, undefined as any)).toBe(false);
    });

    it('deve retornar false para plan desconhecido', () => {
      expect(checkAccess('basico', null, null)).toBe(false);
    });

    it('deve retornar false para plan vazio', () => {
      expect(checkAccess('', null, null)).toBe(false);
    });

    it('deve tratar trialEndsAt exatamente agora como sem acesso (strict less-than)', () => {
      expect(checkAccess('trial', new Date(), null)).toBe(false);
    });

    it('deve tratar subscriptionEndsAt exatamente agora como sem acesso (strict less-than)', () => {
      expect(checkAccess('active', null, new Date())).toBe(false);
    });
  });
});

describe('getTrialDaysRemaining', () => {
  it('deve retornar dias restantes quando trialEndsAt esta no futuro', () => {
    const result = getTrialDaysRemaining(daysFromNow(7));
    expect(result).toBeGreaterThanOrEqual(6);
    expect(result).toBeLessThanOrEqual(8);
  });

  it('deve retornar 14 para trial recem criado', () => {
    const result = getTrialDaysRemaining(daysFromNow(14));
    expect(result).toBeGreaterThanOrEqual(13);
    expect(result).toBeLessThanOrEqual(15);
  });

  it('deve retornar 0 quando trialEndsAt esta no passado', () => {
    expect(getTrialDaysRemaining(daysAgo(5))).toBe(0);
  });

  it('deve retornar 0 quando trialEndsAt e null', () => {
    expect(getTrialDaysRemaining(null)).toBe(0);
  });

  it('deve aceitar string ISO como input', () => {
    const result = getTrialDaysRemaining(daysFromNow(10).toISOString());
    expect(result).toBeGreaterThanOrEqual(9);
    expect(result).toBeLessThanOrEqual(11);
  });

  it('deve retornar 1 quando falta menos de 24h', () => {
    const almostExpired = new Date(Date.now() + 12 * 60 * 60 * 1000);
    expect(getTrialDaysRemaining(almostExpired)).toBe(1);
  });
});
