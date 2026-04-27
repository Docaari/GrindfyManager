import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-04 — Tiered rate limit
//
// Modulo alvo: server/coachAccess.ts (NAO EXISTE)
//   - getRateLimitForPlan(plan): number | Infinity
//   - Retorno: 10 free | 50 pro | 200 premium | Infinity (ou equivalente) admin
//
// Spec: docs/specs/coach-sprint-1-fundacao-economica.md (RF-04.1)
// ADR:  Docs/architecture/decisions/020-coach-rate-limit-rolling-24h.md
// =============================================================================

import { getRateLimitForPlan } from '../../../server/coachAccess';

describe('getRateLimitForPlan', () => {
  it('free -> 10', () => {
    expect(getRateLimitForPlan('free')).toBe(10);
  });

  it('pro -> 50', () => {
    expect(getRateLimitForPlan('pro')).toBe(50);
  });

  it('premium -> 200', () => {
    expect(getRateLimitForPlan('premium')).toBe(200);
  });

  it('admin -> Infinity (ou equivalente a bypass)', () => {
    const val = getRateLimitForPlan('admin');
    expect(val === Infinity || val === Number.MAX_SAFE_INTEGER || val === -1).toBe(true);
  });

  it('plan desconhecido -> fallback para free (10)', () => {
    // @ts-expect-error testando plan invalido
    expect(getRateLimitForPlan('whatever')).toBe(10);
  });

  it('trial -> 10 (equivalente a free)', () => {
    expect(getRateLimitForPlan('trial')).toBe(10);
  });

  it('expired -> 10 (equivalente a free)', () => {
    expect(getRateLimitForPlan('expired')).toBe(10);
  });
});
