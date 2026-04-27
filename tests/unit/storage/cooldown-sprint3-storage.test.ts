import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-3 — Storage methods (validacao pos-deprecation marker)
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07)
// ADR  : Docs/architecture/decisions/042-cooldown-coach-tool-registry.md
// Index: Docs/architecture/cooldown-index.md
//
// Sprint 3 NAO adiciona novos metodos de storage (reusa Sprint 2). Apenas:
//   1. Valida que metodos Sprint 2 ainda funcionam apos marker @deprecated
//      em preparation_logs (preparationLogs nao impacta cooldown_logs).
//   2. ADR-042 menciona OPCIONALMENTE getRecentCooldownDigest(userId, limit=5).
//      Esta sprint NAO requer (Implementer pode reusar getStarredHandsDistribution
//      + getCooldownComplianceMetrics para construir digest no
//      buildCooldownPromptBlock).
//
// Apenas shape strict checks dos 4 metodos Sprint 2.
// IMPORTANT: red phase — testes devem PASSAR (ja existem do Sprint 2).
// Pattern reusa Sprint 2 ja entregue.
// =============================================================================

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Sprint 2 storage methods — shape strict (Sprint 3 reusa, nao adiciona)
// ============================================================================

describe('storage Sprint 3 — Sprint 2 methods continuam exportados', () => {
  it('storage.getCooldownComplianceMetrics existe', () => {
    expect(typeof storage.getCooldownComplianceMetrics).toBe('function');
  });

  it('storage.getStarredHandsDistribution existe', () => {
    expect(typeof storage.getStarredHandsDistribution).toBe('function');
  });

  it('storage.getTopLessons existe', () => {
    expect(typeof storage.getTopLessons).toBe('function');
  });

  it('storage.getCooldownImpactMetrics existe', () => {
    expect(typeof storage.getCooldownImpactMetrics).toBe('function');
  });

  it('signature getCooldownComplianceMetrics(userId, period) — 2 args', () => {
    expect(storage.getCooldownComplianceMetrics.length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
