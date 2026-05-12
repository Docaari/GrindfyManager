import { describe, it, expect, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-0B / RF-06 — Tier gate ajustado:
//   - getRateLimitForPlan continua 10/50/200/∞ (INALTERADO — testes ficam).
//   - exportToolsForAnthropic('free') === [] (INALTERADO).
//   - canAccessCoach / getAccessibleCoaches / COACH_ACCESS REMOVIDOS (ou
//     trivializados). Estes testes assumem REMOCAO (ADR-148 §2.5 recomendacao).
//     -> os testes legados em tests/unit/coach/coach-access.test.ts foram
//        reescritos (ver resumo do test-writer).
//
// Spec: Docs/specs/sprint-ai-0b.md §RF-06; ADR-148 §2.5 + §5 (item 8).
//
// Lessons: #14/#26 (await import — para o registry de tools que faz side-effect
//          import; usamos await import + side-effect import primeiro).
// =============================================================================

vi.mock('../../../server/db', () => ({ db: { select: vi.fn() } }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ type: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ type: 'and', a })),
  desc: vi.fn((...a: any[]) => ({ type: 'desc', a })),
}));
vi.mock('@shared/schema', () => ({ userSubscriptions: {}, subscriptionPlans: {} }));

describe('getRateLimitForPlan — INALTERADO (10/50/200/Infinity)', () => {
  it('free === 10', async () => {
    const { getRateLimitForPlan }: any = await import('../../../server/coachAccess');
    expect(getRateLimitForPlan('free')).toBe(10);
  });
  it('pro === 50', async () => {
    const { getRateLimitForPlan }: any = await import('../../../server/coachAccess');
    expect(getRateLimitForPlan('pro')).toBe(50);
  });
  it('premium === 200', async () => {
    const { getRateLimitForPlan }: any = await import('../../../server/coachAccess');
    expect(getRateLimitForPlan('premium')).toBe(200);
  });
  it('admin === Infinity', async () => {
    const { getRateLimitForPlan }: any = await import('../../../server/coachAccess');
    expect(getRateLimitForPlan('admin')).toBe(Infinity);
  });
  it('trial/expired/desconhecido -> 10 (fallback seguro)', async () => {
    const { getRateLimitForPlan }: any = await import('../../../server/coachAccess');
    expect(getRateLimitForPlan('trial')).toBe(10);
    expect(getRateLimitForPlan('expired')).toBe(10);
    expect(getRateLimitForPlan('whatever')).toBe(10);
  });
});

describe('coachAccess — canAccessCoach/getAccessibleCoaches/COACH_ACCESS removidos (RF-06)', () => {
  it('canAccessCoach NAO eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachAccess');
    expect(mod.canAccessCoach).toBeUndefined();
  });
  it('getAccessibleCoaches NAO eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachAccess');
    expect(mod.getAccessibleCoaches).toBeUndefined();
  });
  it('COACH_ACCESS NAO eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachAccess');
    expect(mod.COACH_ACCESS).toBeUndefined();
  });
});

describe('exportToolsForAnthropic — free sem tools (INALTERADO)', () => {
  it("free -> [] (sem tools)", async () => {
    // Side-effect import garante registro das tools no registry singleton.
    try { await import('../../../server/coachTools/index'); } catch { /* graceful */ }
    const { exportToolsForAnthropic }: any = await import('../../../server/coachTools/registry');
    expect(exportToolsForAnthropic('free')).toEqual([]);
  });

  it('pro -> retorna array (tools gated por tier)', async () => {
    try { await import('../../../server/coachTools/index'); } catch { /* graceful */ }
    const { exportToolsForAnthropic }: any = await import('../../../server/coachTools/registry');
    const tools = exportToolsForAnthropic('pro');
    expect(Array.isArray(tools)).toBe(true);
  });

  it('admin recebe pelo menos tantas tools quanto pro', async () => {
    try { await import('../../../server/coachTools/index'); } catch { /* graceful */ }
    const { exportToolsForAnthropic }: any = await import('../../../server/coachTools/registry');
    const proTools = exportToolsForAnthropic('pro');
    const adminTools = exportToolsForAnthropic('admin');
    expect(adminTools.length).toBeGreaterThanOrEqual(proTools.length);
  });
});
