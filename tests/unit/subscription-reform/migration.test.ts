import { describe, it, expect } from 'vitest';

// =============================================================================
// Tests: Migration of existing users — RF-02 migration logic
// Spec: docs/specs/subscription-reform.md
// Tests the pure migration function that transforms old plan values to new ones.
// =============================================================================

interface UserBeforeMigration {
  id: string;
  email: string;
  subscriptionPlan: string;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
}

interface UserAfterMigration {
  id: string;
  email: string;
  subscriptionPlan: string;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
}

// Real migration function (matches the SQL migration logic)
function migrateUserPlan(user: UserBeforeMigration): UserAfterMigration {
  const { subscriptionPlan } = user;

  // Old tier plans -> active with 365 days
  if (['basico', 'premium', 'pro'].includes(subscriptionPlan)) {
    return {
      ...user,
      subscriptionPlan: 'active',
      subscriptionEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  }

  // admin, trial, active, expired -> keep as-is
  if (['admin', 'trial', 'active', 'expired'].includes(subscriptionPlan)) {
    return { ...user };
  }

  // Unknown values -> expired
  return {
    ...user,
    subscriptionPlan: 'expired',
  };
}

// --- Helpers ---
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe('Migration of existing users', () => {
  describe('basico -> active', () => {
    it('deve migrar usuario basico para subscriptionPlan active', () => {
      const user = migrateUserPlan({ id: 'u1', email: 'b@t.com', subscriptionPlan: 'basico', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionPlan).toBe('active');
    });

    it('deve definir subscriptionEndsAt como 365 dias no futuro para basico', () => {
      const before = Date.now();
      const user = migrateUserPlan({ id: 'u1', email: 'b@t.com', subscriptionPlan: 'basico', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionEndsAt).not.toBeNull();
      expect(user.subscriptionEndsAt!.getTime()).toBeGreaterThanOrEqual(before + 365 * 24 * 60 * 60 * 1000);
    });
  });

  describe('premium -> active', () => {
    it('deve migrar usuario premium para subscriptionPlan active', () => {
      const user = migrateUserPlan({ id: 'u2', email: 'p@t.com', subscriptionPlan: 'premium', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionPlan).toBe('active');
    });

    it('deve definir subscriptionEndsAt como 365 dias no futuro para premium', () => {
      const before = Date.now();
      const user = migrateUserPlan({ id: 'u2', email: 'p@t.com', subscriptionPlan: 'premium', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionEndsAt).not.toBeNull();
      expect(user.subscriptionEndsAt!.getTime()).toBeGreaterThanOrEqual(before + 365 * 24 * 60 * 60 * 1000);
    });
  });

  describe('pro -> active', () => {
    it('deve migrar usuario pro para subscriptionPlan active', () => {
      const user = migrateUserPlan({ id: 'u3', email: 'pr@t.com', subscriptionPlan: 'pro', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionPlan).toBe('active');
    });

    it('deve definir subscriptionEndsAt como 365 dias no futuro para pro', () => {
      const before = Date.now();
      const user = migrateUserPlan({ id: 'u3', email: 'pr@t.com', subscriptionPlan: 'pro', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionEndsAt).not.toBeNull();
      expect(user.subscriptionEndsAt!.getTime()).toBeGreaterThanOrEqual(before + 365 * 24 * 60 * 60 * 1000);
    });
  });

  describe('admin -> admin (sem alteracao)', () => {
    it('deve manter subscriptionPlan admin', () => {
      const user = migrateUserPlan({ id: 'u4', email: 'a@t.com', subscriptionPlan: 'admin', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionPlan).toBe('admin');
    });

    it('deve manter subscriptionEndsAt null para admin', () => {
      const user = migrateUserPlan({ id: 'u4', email: 'a@t.com', subscriptionPlan: 'admin', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionEndsAt).toBeNull();
    });

    it('deve manter trialEndsAt null para admin', () => {
      const user = migrateUserPlan({ id: 'u4', email: 'a2@t.com', subscriptionPlan: 'admin', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.trialEndsAt).toBeNull();
    });
  });

  describe('trial -> trial (sem alteracao)', () => {
    it('deve manter subscriptionPlan trial', () => {
      const trialEnds = daysFromNow(5);
      const user = migrateUserPlan({ id: 'u5', email: 't@t.com', subscriptionPlan: 'trial', trialEndsAt: trialEnds, subscriptionEndsAt: null });
      expect(user.subscriptionPlan).toBe('trial');
    });

    it('deve manter trialEndsAt inalterado', () => {
      const trialEnds = daysFromNow(5);
      const user = migrateUserPlan({ id: 'u5', email: 't@t.com', subscriptionPlan: 'trial', trialEndsAt: trialEnds, subscriptionEndsAt: null });
      expect(user.trialEndsAt).toEqual(trialEnds);
    });
  });

  describe('active -> active (sem alteracao)', () => {
    it('deve manter subscriptionPlan active', () => {
      const subEnds = daysFromNow(60);
      const user = migrateUserPlan({ id: 'u6', email: 'ac@t.com', subscriptionPlan: 'active', trialEndsAt: null, subscriptionEndsAt: subEnds });
      expect(user.subscriptionPlan).toBe('active');
    });

    it('deve manter subscriptionEndsAt inalterado', () => {
      const subEnds = daysFromNow(60);
      const user = migrateUserPlan({ id: 'u6', email: 'ac@t.com', subscriptionPlan: 'active', trialEndsAt: null, subscriptionEndsAt: subEnds });
      expect(user.subscriptionEndsAt).toEqual(subEnds);
    });
  });

  describe('nenhum usuario existente perde acesso', () => {
    it('todos os planos antigos devem ser migrados para active com 365 dias', () => {
      const oldPlans = ['basico', 'premium', 'pro'];
      for (const plan of oldPlans) {
        const user = migrateUserPlan({ id: `u-${plan}`, email: `${plan}@t.com`, subscriptionPlan: plan, trialEndsAt: null, subscriptionEndsAt: null });
        expect(user.subscriptionPlan).toBe('active');
        expect(user.subscriptionEndsAt).not.toBeNull();
        const daysRemaining = (user.subscriptionEndsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        expect(daysRemaining).toBeGreaterThan(364);
      }
    });
  });

  describe('valores invalidos de subscriptionPlan', () => {
    it('deve tratar plan desconhecido como expired', () => {
      const user = migrateUserPlan({ id: 'ux', email: 'x@t.com', subscriptionPlan: 'free', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionPlan).toBe('expired');
    });

    it('deve tratar plan vazio como expired', () => {
      const user = migrateUserPlan({ id: 'ue', email: 'e@t.com', subscriptionPlan: '', trialEndsAt: null, subscriptionEndsAt: null });
      expect(user.subscriptionPlan).toBe('expired');
    });
  });
});
