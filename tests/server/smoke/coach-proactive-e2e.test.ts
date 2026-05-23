// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-02 — smoke script Coach proativo end-to-end
//
// Spec: Docs/specs/sprint-mp-validation.md RF-02 §11 steps.
// Script CLI: scripts/smoke-coach-proactive.ts
//
// Cobertura (estrutura do script + flow funcional em mode dry-run):
//   - Script export `runSmokeCoachProactive(opts)` invocavel
//     programaticamente (tests integration).
//   - Modo dry-run: NAO chama LLM real (mock callReportLlm), NAO envia email.
//   - Cria user `USER-SMOKE-${ts}`, popula sessions, force enqueue, assert
//     report.status = 'ready' | 'degraded'.
//   - Cleanup remove TUDO via prefix `USER-SMOKE-%`.
//
// Lessons:
//   #34: handler injectedStorage 3o arg.
//   #36: drizzle-orm relations stub.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: vi.fn(() => ({})) };
});

vi.mock('../../../server/db', () => ({ db: {}, pool: {} }));

describe('RF-02 — smoke-coach-proactive script', () => {
  it('export runSmokeCoachProactive funcao', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');
    expect(typeof mod.runSmokeCoachProactive).toBe('function');
  });

  it('runSmokeCoachProactive({ dryRun: true }) retorna { ok, steps, exitCode }', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');

    // Mock fns internos via injecao (3o arg).
    const fakeDeps = {
      createFakeUser: vi.fn().mockResolvedValue({ userPlatformId: 'USER-SMOKE-0001' }),
      seedHistory: vi.fn().mockResolvedValue({ sessions: 7 }),
      enqueueReports: vi.fn().mockResolvedValue({ weekly: 1, daily: 1, monthly: 1 }),
      processReports: vi.fn().mockResolvedValue({ done: 3, failed: 0 }),
      assertReports: vi.fn().mockResolvedValue({ reports: 3, allReady: true }),
      forceNudges: vi.fn().mockResolvedValue({ fired: 5 }),
      exerciseTools: vi.fn().mockResolvedValue({ tools: 3 }),
      validateEmail: vi.fn().mockResolvedValue({ status: 'skipped' }),
      cleanup: vi.fn().mockResolvedValue({ deletedRows: 12 }),
    };

    const result = await mod.runSmokeCoachProactive(
      { dryRun: true, timeoutMs: 60_000 },
      fakeDeps,
    );

    expect(result).toMatchObject({
      ok: expect.any(Boolean),
      exitCode: expect.any(Number),
      steps: expect.any(Array),
    });
    expect(fakeDeps.cleanup).toHaveBeenCalled();
  });

  it('exit code 2 quando timeout (5min cap)', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');

    const slowDeps = {
      createFakeUser: vi.fn(() => new Promise((r) => setTimeout(() => r({}), 99_999))),
      seedHistory: vi.fn(),
      enqueueReports: vi.fn(),
      processReports: vi.fn(),
      assertReports: vi.fn(),
      forceNudges: vi.fn(),
      exerciseTools: vi.fn(),
      validateEmail: vi.fn(),
      cleanup: vi.fn().mockResolvedValue({ deletedRows: 0 }),
    };

    const result = await mod.runSmokeCoachProactive(
      { dryRun: true, timeoutMs: 50 },
      slowDeps,
    );
    expect(result.exitCode).toBe(2);
  });
});
