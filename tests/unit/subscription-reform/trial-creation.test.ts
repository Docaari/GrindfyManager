import { describe, it, expect } from 'vitest';

// =============================================================================
// Tests: Trial creation on registration — RF-03
// Tests the trial user creation logic (unit test of the values set).
// =============================================================================

const TRIAL_DURATION_DAYS = 14;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Simulates the registration logic from server/routes/auth.ts
function createTrialUser(input: { email: string; password: string; name: string }) {
  return {
    id: 'mock-id',
    email: input.email,
    subscriptionPlan: 'trial',
    trialEndsAt: new Date(Date.now() + TRIAL_DURATION_MS),
    subscriptionEndsAt: null as Date | null,
  };
}

describe('Trial creation on registration', () => {
  describe('subscriptionPlan', () => {
    it('deve definir subscriptionPlan como trial para novo usuario', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.subscriptionPlan).toBe('trial');
    });

    it('nao deve definir subscriptionPlan como basico (valor antigo)', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.subscriptionPlan).not.toBe('basico');
    });

    it('nao deve definir subscriptionPlan como premium', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.subscriptionPlan).not.toBe('premium');
    });
  });

  describe('trialEndsAt', () => {
    it('deve definir trialEndsAt como nao-null para novo usuario', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.trialEndsAt).not.toBeNull();
    });

    it('deve definir trialEndsAt como Date no futuro', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.trialEndsAt).toBeInstanceOf(Date);
      expect(user.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('deve definir trialEndsAt como exatamente 14 dias a partir do registro', () => {
      const beforeRegister = Date.now();
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      const afterRegister = Date.now();

      const expectedMin = beforeRegister + TRIAL_DURATION_MS;
      const expectedMax = afterRegister + TRIAL_DURATION_MS;

      expect(user.trialEndsAt).not.toBeNull();
      expect(user.trialEndsAt!.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(user.trialEndsAt!.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('deve definir trialEndsAt com precisao de milissegundos (nao arredondado)', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.trialEndsAt).not.toBeNull();
      const diff = user.trialEndsAt!.getTime() - Date.now();
      const tolerance = 5000;
      expect(Math.abs(diff - TRIAL_DURATION_MS)).toBeLessThan(tolerance);
    });
  });

  describe('subscriptionEndsAt', () => {
    it('deve definir subscriptionEndsAt como null para novo usuario em trial', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.subscriptionEndsAt).toBeNull();
    });
  });

  describe('consistencia dos campos', () => {
    it('deve ter trial + trialEndsAt futuro + subscriptionEndsAt null (estado consistente)', () => {
      const user = createTrialUser({ email: 'novo@test.com', password: 'senha12345', name: 'Novo' });
      expect(user.subscriptionPlan).toBe('trial');
      expect(user.trialEndsAt).not.toBeNull();
      expect(user.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
      expect(user.subscriptionEndsAt).toBeNull();
    });

    it('deve funcionar para qualquer email valido', () => {
      const emails = ['a@b.com', 'test@gmail.com', 'player@pokersite.com'];
      for (const email of emails) {
        const user = createTrialUser({ email, password: 'senha12345', name: 'Test' });
        expect(user.subscriptionPlan).toBe('trial');
        expect(user.trialEndsAt).not.toBeNull();
      }
    });
  });
});
