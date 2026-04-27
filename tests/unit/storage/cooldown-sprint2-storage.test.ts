import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — Storage methods (Sleep Gate + Analytics)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4 + RF-06)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Modulos NAO existem ainda — Implementer adiciona em server/storage.ts:
//   - setSessionPlanClosed(sessionId, userId, value: boolean): GrindSession | null
//   - setUserDashboardSnoozedUntil(userId, until: Date | string): User | null
//   - clearUserDashboardSnoozedUntil(userId): User | null
//   - getCooldownComplianceMetrics(userId, period): {total, completed, complianceRate}
//   - getStarredHandsDistribution(userId, period): [{type, count}]
//   - getCooldownImpactMetrics(userId, period): {withCooldown, withoutCooldown, delta}
//   - getTopLessons(userId, period): [{token, count}]
//
// SHAPE TESTS (verifica que metodos existem com assinatura esperada).
// =============================================================================

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Sleep Gate methods
// ============================================================================

describe('storage.setSessionPlanClosed - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.setSessionPlanClosed).toBe('function');
  });

  it('aceita signature (sessionId, userId, value)', () => {
    const fn = storage.setSessionPlanClosed;
    expect(fn.length).toBeGreaterThanOrEqual(2);
  });
});

describe('storage.setUserDashboardSnoozedUntil - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.setUserDashboardSnoozedUntil).toBe('function');
  });
});

describe('storage.clearUserDashboardSnoozedUntil - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.clearUserDashboardSnoozedUntil).toBe('function');
  });
});

// ============================================================================
// Analytics aggregation methods
// ============================================================================

describe('storage.getCooldownComplianceMetrics - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getCooldownComplianceMetrics).toBe('function');
  });

  it('aceita signature (userId, period)', () => {
    const fn = storage.getCooldownComplianceMetrics;
    expect(fn.length).toBeGreaterThanOrEqual(1);
  });
});

describe('storage.getStarredHandsDistribution - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getStarredHandsDistribution).toBe('function');
  });
});

describe('storage.getCooldownImpactMetrics - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getCooldownImpactMetrics).toBe('function');
  });
});

describe('storage.getTopLessons - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getTopLessons).toBe('function');
  });
});
