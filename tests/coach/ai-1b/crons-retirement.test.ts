import { describe, it, expect, vi, afterEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-1B / RF-07 — aposentadoria dos 2 crons de segunda
//   - server/coach/cronRunner.ts NAO agenda mais `0 6 * * 1` (generateCoachRecommendationsTick).
//   - server/jobs/index.ts NAO registra mais o registerWeeklyStudyPlanCron ativo
//     (removido OU no-op com log "deprecated").
//   - As FUNCOES continuam exportadas/chamaveis (generateCoachRecommendationsTick,
//     runWeeklyStudyPlan / generateWeeklyStudyPlan) — a logica eh reaproveitada
//     pelo gerador do Weekly Report.
//
// Fontes:
//   - Docs/specs/sprint-ai-1b.md (RF-07 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/156-aposentadoria-crons-segunda....md (§3.1, §5)
//
// Padrao: igual a tests/coach/ai-1a/cron-kill-switch.test.ts — mock de node-cron
// que coleta as cron expressions registradas.
//
// REESCRITA DE TESTES LEGADOS: este sprint pode tornar invalidos testes que
// verificavam que `0 6 * * 1` ESTAVA agendado (ex.:
// tests/coach/ai-1a/cron-kill-switch.test.ts linha "expect(scheduled).toContain('0 6 * * 1')").
// O implementer deve atualizar esse assert (passa a `not.toContain`); este arquivo
// estabelece o novo contrato. Os testes da FUNCAO `generateCoachRecommendationsTick`
// em si (se houver) continuam validos — NAO mexer.
//
// Status esperado: FALHAM enquanto os crons ainda forem agendados.
// =============================================================================

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_CRON = process.env.COACH_CRON_ENABLED;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED; else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_CRON === undefined) delete process.env.COACH_CRON_ENABLED; else process.env.COACH_CRON_ENABLED = ORIGINAL_CRON;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

function mockNodeCronCollector() {
  const scheduled: Array<{ expr: string; opts?: any }> = [];
  vi.doMock('node-cron', () => ({
    default: { schedule: (expr: string, _fn: any, opts?: any) => { scheduled.push({ expr, opts }); return { stop: vi.fn() }; } },
    schedule: (expr: string, _fn: any, opts?: any) => { scheduled.push({ expr, opts }); return { stop: vi.fn() }; },
  }));
  return scheduled;
}

// ---------------------------------------------------------------------------
// cronRunner — generateCoachRecommendations aposentado
// ---------------------------------------------------------------------------
describe('cronRunner — `0 6 * * 1` (generateCoachRecommendations) aposentado (AI-1B / ADR-156)', () => {
  it('startCoachCrons() em modo cron (COACH_CRON_ENABLED=true, sem COACH_NUDGES_ENABLED) NAO agenda `0 6 * * 1`', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    delete process.env.COACH_NUDGES_ENABLED;

    const scheduled = mockNodeCronCollector();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.doMock('../../../server/lib/advisoryLock', () => ({ withAdvisoryLock: vi.fn(async (_k: string, fn: () => any) => fn()) }));

    const { startCoachCrons } = await import('../../../server/coach/cronRunner');
    startCoachCrons();

    const exprs = scheduled.map(s => s.expr);
    // o cleanup (1min), B-SNAPSHOT (0 * 28 * *), B-STUDY (0 * * * *) continuam.
    expect(exprs).toContain('* * * * *');
    // generateCoachRecommendations (segunda 6h BRT) NAO mais agendado.
    expect(exprs).not.toContain('0 6 * * 1');
    infoSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// jobs/index — registerWeeklyStudyPlanCron aposentado
// ---------------------------------------------------------------------------
describe('jobs/index — registerWeeklyStudyPlanCron aposentado (AI-1B / ADR-156)', () => {
  it('registerAllJobs() NAO agenda mais `0 9 * * 1` (weekly study plan cron)', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';

    const scheduled = mockNodeCronCollector();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.doMock('../../../server/lib/advisoryLock', () => ({ withAdvisoryLock: vi.fn(async (_k: string, fn: () => any) => fn()) }));
    // os outros jobs precisam de algumas deps — mockamos node-cron acima; o resto
    // resolve via os modulos reais (que so chamam cron.schedule).

    const { registerAllJobs } = await import('../../../server/jobs/index');
    await registerAllJobs();

    const exprs = scheduled.map(s => s.expr);
    expect(exprs).not.toContain('0 9 * * 1');
    infoSpy.mockRestore();
  });

  it('registerAllJobs() registra o report job runner (`0 * * * *` enqueuer + `*/15 * * * *` processor)', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    delete process.env.COACH_NUDGES_ENABLED;

    const scheduled = mockNodeCronCollector();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.doMock('../../../server/lib/advisoryLock', () => ({ withAdvisoryLock: vi.fn(async (_k: string, fn: () => any) => fn()) }));

    const { registerAllJobs } = await import('../../../server/jobs/index');
    await registerAllJobs();

    const exprs = scheduled.map(s => s.expr);
    expect(exprs).toContain('0 * * * *');     // enqueuer
    expect(exprs).toContain('*/15 * * * *');  // processor
    infoSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// As funcoes continuam existindo/chamaveis
// ---------------------------------------------------------------------------
describe('funcoes dos crons aposentados continuam exportadas (logica reaproveitada pelo report)', () => {
  it('generateCoachRecommendationsTick continua exportado de server/coach/jobs/generateCoachRecommendations', async () => {
    vi.resetModules();
    const mod: any = await import('../../../server/coach/jobs/generateCoachRecommendations');
    expect(typeof mod.generateCoachRecommendationsTick).toBe('function');
  });

  it('runWeeklyStudyPlan / generateWeeklyStudyPlan continuam exportados', async () => {
    vi.resetModules();
    const jobMod: any = await import('../../../server/jobs/generateWeeklyStudyPlan');
    expect(typeof jobMod.runWeeklyStudyPlan).toBe('function');
    const svcMod: any = await import('../../../server/services/studyWeeklyPlanService');
    expect(typeof svcMod.generateWeeklyStudyPlan).toBe('function');
  });
});
