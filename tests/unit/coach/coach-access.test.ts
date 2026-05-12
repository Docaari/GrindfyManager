import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// REESCRITO no Sprint AI-0B — o sujeito deste teste mudou parcialmente.
//
// Antes: testava canAccessCoach / getAccessibleCoaches / getUpgradeTarget
// (gate de "qual coach por tier") + resolveUserTier + clearUserTierCache.
//
// Agora (ADR-148 / Sprint AI-0B RF-06): a consolidacao num agente unico
// elimina o gate por coachType. canAccessCoach / getAccessibleCoaches /
// COACH_ACCESS foram REMOVIDOS. O tier gate vira so rate limit + tools.
// getRateLimitForPlan (10/50/200/∞), resolveUserTier e clearUserTierCache
// permanecem INALTERADOS — testados aqui (regressao preservada).
//
// Mudanca intencional (red-phase) — NAO eh regressao silenciosa.
// Spec: Docs/specs/sprint-ai-0b.md §RF-06; ADR-148 §2.5 + §5 (item 8).
// =============================================================================

vi.mock('../../../server/db', () => ({ db: { select: vi.fn() } }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ type: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ type: 'and', a })),
  desc: vi.fn((...a: any[]) => ({ type: 'desc', a })),
}));
vi.mock('@shared/schema', () => ({ userSubscriptions: {}, subscriptionPlans: {} }));

import {
  getRateLimitForPlan,
  resolveUserTier,
  clearUserTierCache,
  clearTierCache,
} from '../../../server/coachAccess';

// =============================================================================
// canAccessCoach / getAccessibleCoaches / COACH_ACCESS — REMOVIDOS (RF-06)
// =============================================================================
describe('coachAccess — gate por coachType removido (Sprint AI-0B / RF-06)', () => {
  it('canAccessCoach nao eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachAccess');
    expect(mod.canAccessCoach).toBeUndefined();
  });
  it('getAccessibleCoaches nao eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachAccess');
    expect(mod.getAccessibleCoaches).toBeUndefined();
  });
  it('COACH_ACCESS nao eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachAccess');
    expect(mod.COACH_ACCESS).toBeUndefined();
  });
});

// =============================================================================
// getRateLimitForPlan — INALTERADO
// =============================================================================
describe('getRateLimitForPlan (inalterado)', () => {
  it('free -> 10', () => { expect(getRateLimitForPlan('free')).toBe(10); });
  it('pro -> 50', () => { expect(getRateLimitForPlan('pro')).toBe(50); });
  it('premium -> 200', () => { expect(getRateLimitForPlan('premium')).toBe(200); });
  it('admin -> Infinity', () => { expect(getRateLimitForPlan('admin')).toBe(Infinity); });
  it('trial/expired/desconhecido -> 10', () => {
    expect(getRateLimitForPlan('trial')).toBe(10);
    expect(getRateLimitForPlan('expired')).toBe(10);
    expect(getRateLimitForPlan('xpto')).toBe(10);
  });
});

// =============================================================================
// resolveUserTier — INALTERADO (admin bypass + trial->free + active->query)
// =============================================================================
describe('resolveUserTier (inalterado)', () => {
  beforeEach(() => { clearTierCache(); vi.clearAllMocks(); });

  it('user null -> free', async () => {
    expect(await resolveUserTier(null)).toBe('free');
  });

  it('role=admin -> admin', async () => {
    expect(await resolveUserTier({ id: 'u', role: 'admin', subscriptionPlan: 'free' })).toBe('admin');
  });

  it('subscriptionPlan=admin -> admin', async () => {
    expect(await resolveUserTier({ id: 'u', subscriptionPlan: 'admin' })).toBe('admin');
  });

  it('plano trial/expired/free/vazio -> free (sem hit no db)', async () => {
    const { db } = await import('../../../server/db') as any;
    db.select = vi.fn();
    expect(await resolveUserTier({ id: 'u', userPlatformId: 'USER-1', subscriptionPlan: 'trial' })).toBe('free');
    expect(await resolveUserTier({ id: 'u', userPlatformId: 'USER-1', subscriptionPlan: 'expired' })).toBe('free');
    expect(await resolveUserTier({ id: 'u', userPlatformId: 'USER-1', subscriptionPlan: 'free' })).toBe('free');
    expect(db.select).not.toHaveBeenCalled();
  });

  function mockDbReturn(rows: any[]) {
    return {
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
          }),
        }),
      }),
    };
  }

  it('plano active + planName "Pro" -> pro (consulta db, cacheia)', async () => {
    const { db } = await import('../../../server/db') as any;
    db.select = vi.fn().mockReturnValueOnce(mockDbReturn([{ planName: 'Plano Pro Anual' }]));
    const t = await resolveUserTier({ id: 'u', userPlatformId: 'USER-PRO', role: 'user', subscriptionPlan: 'active' });
    expect(t).toBe('pro');
  });

  it('plano active sem subscription -> free', async () => {
    const { db } = await import('../../../server/db') as any;
    db.select = vi.fn().mockReturnValueOnce(mockDbReturn([]));
    const t = await resolveUserTier({ id: 'u', userPlatformId: 'USER-NONE', role: 'user', subscriptionPlan: 'active' });
    expect(t).toBe('free');
  });
});

// =============================================================================
// clearUserTierCache — INALTERADO
// =============================================================================
describe('clearUserTierCache (inalterado)', () => {
  it('aceita userId vazio/undefined sem lancar', () => {
    expect(() => clearUserTierCache('')).not.toThrow();
    expect(() => clearUserTierCache(undefined as any)).not.toThrow();
  });
});
