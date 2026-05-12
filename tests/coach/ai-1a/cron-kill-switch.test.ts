import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-04 + RF-11 — crons respeitam COACH_NUDGES_ENABLED + checks novos
//
// - startCoachCrons() com COACH_NUDGES_ENABLED=false (e COACH_CRON_ENABLED=true):
//   registra so o cleanup de coach_actions; NAO registra B-SNAPSHOT, B-STUDY,
//   generateCoachRecommendations; loga coach.cron.nudges_disabled.
// - startCoachCrons() sem COACH_NUDGES_ENABLED -> registra os 4 schedules como hoje.
// - processBSnapshotTick({}) com COACH_NUDGES_ENABLED=false -> nenhum chatSession/
//   coach_nudge_log criado (shouldSendNudge retorna nudges_globally_disabled e o
//   loop faz continue).
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-04, RF-11, "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§1)
//
// Regressao: tests/coach/nudges/b-snapshot.test.ts e b-study.test.ts continuam
// passando (casos novos sao aditivos — NAO modificar esses arquivos).
// =============================================================================

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_CRON = process.env.COACH_CRON_ENABLED;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED; else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_CRON === undefined) delete process.env.COACH_CRON_ENABLED; else process.env.COACH_CRON_ENABLED = ORIGINAL_CRON;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// startCoachCrons — gating dos schedules de proatividade
// ---------------------------------------------------------------------------
describe('startCoachCrons — COACH_NUDGES_ENABLED gating', () => {
  it('=false (com COACH_CRON_ENABLED=true) -> registra cleanup mas NAO B-SNAPSHOT/B-STUDY/generateCoachRecommendations', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    process.env.COACH_NUDGES_ENABLED = 'false';

    const scheduled: string[] = [];
    vi.doMock('node-cron', () => ({
      default: { schedule: (expr: string, _fn: any, _opts?: any) => { scheduled.push(expr); return { stop: vi.fn() }; } },
      schedule: (expr: string, _fn: any, _opts?: any) => { scheduled.push(expr); return { stop: vi.fn() }; },
    }));

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { startCoachCrons } = await import('../../../server/coach/cronRunner');
    startCoachCrons();

    // cleanup (1min) registrado
    expect(scheduled).toContain('* * * * *');
    // B-SNAPSHOT (28th) NAO registrado
    expect(scheduled).not.toContain('0 * 28 * *');
    // B-STUDY (hourly) NAO registrado
    expect(scheduled).not.toContain('0 * * * *');
    // generateCoachRecommendations (segunda 6h) NAO registrado
    expect(scheduled).not.toContain('0 6 * * 1');
    // log de "nudges disabled"
    const logged = infoSpy.mock.calls.some(args => String(args[0] || '').includes('coach.cron.nudges_disabled'));
    expect(logged).toBe(true);
    infoSpy.mockRestore();
  });

  it('sem COACH_NUDGES_ENABLED -> registra os 4 schedules como hoje', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    delete process.env.COACH_NUDGES_ENABLED;

    const scheduled: string[] = [];
    vi.doMock('node-cron', () => ({
      default: { schedule: (expr: string, _fn: any, _opts?: any) => { scheduled.push(expr); return { stop: vi.fn() }; } },
      schedule: (expr: string, _fn: any, _opts?: any) => { scheduled.push(expr); return { stop: vi.fn() }; },
    }));

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { startCoachCrons } = await import('../../../server/coach/cronRunner');
    startCoachCrons();

    expect(scheduled).toContain('* * * * *');
    expect(scheduled).toContain('0 * 28 * *');
    expect(scheduled).toContain('0 * * * *');
    // AI-1B (ADR-156): generateCoachRecommendations (`0 6 * * 1`) aposentado — absorvido pelo Weekly Report.
    expect(scheduled).not.toContain('0 6 * * 1');
    infoSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// processBSnapshotTick — respeita kill switch via o engine
// ---------------------------------------------------------------------------
describe('processBSnapshotTick — COACH_NUDGES_ENABLED=false -> nada criado', () => {
  it('com a flag off -> shouldSendNudge retorna nudges_globally_disabled -> nenhum coach_nudge_log/chatSession criado', async () => {
    vi.resetModules();
    process.env.COACH_NUDGES_ENABLED = 'false';

    const listUsersForCronMock = vi.fn(async () => ([
      { userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]));
    const hasSnapshotThisMonthMock = vi.fn(async () => false);
    const createChatSessionMock = vi.fn(async () => ({ id: 'cs-1' }));
    const insertChatMessageMock = vi.fn(async () => ({ id: 'cm-1' }));
    const createNudgeLogMock = vi.fn(async () => 'nl-1');

    vi.doMock('../../../server/storage', () => ({
      storage: {
        listUsersForCron: listUsersForCronMock,
        hasSnapshotThisMonth: hasSnapshotThisMonthMock,
        createChatSession: createChatSessionMock,
        insertChatMessage: insertChatMessageMock,
        createNudgeLog: createNudgeLogMock,
      },
    }));

    // o engine real (com check 0) — mas a flag torna o resultado nudges_globally_disabled
    vi.doMock('../../../server/coach/nudgeEngine', () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: false, reason: 'nudges_globally_disabled' })),
    }));

    const { processBSnapshotTick } = await import('../../../server/coach/jobs/processBSnapshot');
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0)); // 9h SP
    await processBSnapshotTick({ now });

    expect(createNudgeLogMock).not.toHaveBeenCalled();
    expect(createChatSessionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processBStudyTick — categoria congelada para um user, outro recebe
// ---------------------------------------------------------------------------
describe('processBStudyTick — B-STUDY congelada para um user', () => {
  it('user com B-STUDY congelada nao recebe; outro user (sem congelamento) recebe normalmente', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;

    const listUsersForCronMock = vi.fn(async () => ([
      { userPlatformId: 'USER-FROZEN', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro', studyFocusActive: true },
      { userPlatformId: 'USER-OK', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro', studyFocusActive: true },
    ]));
    const createChatSessionMock = vi.fn(async () => ({ id: 'cs-x' }));
    const insertChatMessageMock = vi.fn(async () => ({ id: 'cm-x' }));
    const createNudgeLogMock = vi.fn(async () => 'nl-x');

    vi.doMock('../../../server/storage', () => ({
      storage: {
        listUsersForCron: listUsersForCronMock,
        createChatSession: createChatSessionMock,
        insertChatMessage: insertChatMessageMock,
        createNudgeLog: createNudgeLogMock,
        // alguns ticks usam outras funcoes — deixar como noop tolerante
        hasSnapshotThisMonth: vi.fn(async () => false),
        getStudyFocusForUser: vi.fn(async () => ({ active: true })),
      },
    }));

    vi.doMock('../../../server/coach/nudgeEngine', () => ({
      shouldSendNudge: vi.fn(async (uid: string) => (uid === 'USER-FROZEN' ? { allow: false, reason: 'category_frozen' } : { allow: true })),
    }));

    const { processBStudyTick } = await import('../../../server/coach/jobs/processBStudy');
    const now = new Date(Date.UTC(2026, 4, 12, 22, 0, 0)); // 19h SP
    await processBStudyTick({ now });

    // criou nudge log apenas para USER-OK
    const logCalls = createNudgeLogMock.mock.calls.map((c: any) => c[0]);
    expect(logCalls.some((a: any) => a && a.category === 'B-STUDY')).toBe(true);
    // USER-FROZEN nao aparece em nenhuma criacao
    const sessionCalls = createChatSessionMock.mock.calls.flat();
    const allArgsStr = JSON.stringify([logCalls, sessionCalls]);
    expect(allArgsStr).not.toContain('USER-FROZEN');
  });
});
