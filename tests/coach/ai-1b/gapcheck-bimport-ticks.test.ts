import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLocalHour } from '../../../server/coach/timezone';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-1B / RF-10 + RF-11 — categorias de nudge B-GAPCHECK e B-IMPORT
//   server/coach/jobs/gapCheck.ts  -> gapCheckTick({ now, injectedStorage? })  (NAO EXISTE)
//   server/coach/jobs/bImport.ts   -> bImportTick({ now, injectedStorage? })    (NAO EXISTE)
//
// Fontes:
//   - Docs/specs/sprint-ai-1b.md (RF-10/11 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/157-...-bgapcheck-bimport.md (§2.3-2.6, §3.4, §5)
//   - Docs/api/coach.md "Categorias de nudge novas (ADR-157)"
//
// Aritmetica gap-check: D-3 = SEXTA (3 dias antes da entrega de segunda 7h);
//   roda 0 * * * * filtrando hora local util + "hoje eh sexta no fuso do user".
//   O implementer confirma a aritmetica exata; aqui o critério eh "≈ sexta D-3".
// B-IMPORT: 0 * * * * filtrando hora local; Pro+; >= COACH_BIMPORT_DAYS (default 5)
//   sem import + sessionsInPeriod > 0.
//
// Lessons: #3 (mock shape REAL — getCoachPreferences/countNudgeLog/findNudgeLog/
//   getLastUploadAt/countGrindSessionsSince), #9 (logar/safe; try-catch por user),
//   `now: Date` injetavel.
//
// Status esperado: TODOS FALHAM (modulos nao existem).
// =============================================================================

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_BIMPORT_DAYS = process.env.COACH_BIMPORT_DAYS;

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED; else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_BIMPORT_DAYS === undefined) delete process.env.COACH_BIMPORT_DAYS; else process.env.COACH_BIMPORT_DAYS = ORIGINAL_BIMPORT_DAYS;
  vi.useRealTimers();
});

function mockAdvisoryLockPassthrough() {
  vi.doMock('../../../server/lib/advisoryLock', () => ({
    withAdvisoryLock: vi.fn(async (_key: string, fn: () => any) => fn()),
  }));
}

// ---------------------------------------------------------------------------
// Mock do nudgeEngine — shouldSendNudge controlavel por user/categoria.
// ---------------------------------------------------------------------------
function mockShouldSendNudge(impl?: (userId: string, ctx: any) => any) {
  const fn = vi.fn(impl ?? (async () => ({ allow: true })));
  vi.doMock('../../../server/coach/nudgeEngine', () => ({
    shouldSendNudge: fn,
    // re-export usado por algum codigo (nudgeEngine re-exporta de ./timezone):
    getLocalHour,
  }));
  return fn;
}

// ---------------------------------------------------------------------------
// fake storage
// ---------------------------------------------------------------------------
function makeStorageGapCheck(opts: {
  users?: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }>;
  prefsByUser?: Record<string, { reportWeeklyEnabled?: boolean; nudgeBGapcheck?: boolean; frozenCategories?: any }>;
  // estado por user — itens faltantes
  missingByUser?: Record<string, { noImportButHasSessions?: boolean; unreconciledSessions?: boolean; bankrollSnapshotPending?: boolean; zeroStudyWithFocus?: boolean; focusNoStatsUpdate?: boolean }>;
} = {}) {
  const calls = { createNudgeLog: vi.fn(async (row: any) => `nl-${row?.category ?? 'x'}`) };
  const storage: any = {
    listUsersForCron: vi.fn(async () => opts.users ?? []),
    getUserTimezone: vi.fn(async (uid: string) => (opts.users ?? []).find(u => u.userPlatformId === uid)?.timezone ?? 'America/Sao_Paulo'),
    getUserSubscriptionPlan: vi.fn(async (uid: string) => (opts.users ?? []).find(u => u.userPlatformId === uid)?.subscriptionPlan ?? 'free'),
    // estado real — queries no momento (nunca flag stale)
    hasImportThisWeek: vi.fn(async (uid: string) => !(opts.missingByUser?.[uid]?.noImportButHasSessions)),
    countGrindSessionsThisWeek: vi.fn(async (uid: string) => (opts.missingByUser?.[uid]?.noImportButHasSessions ? 3 : 0)),
    hasUnreconciledSessionsThisWeek: vi.fn(async (uid: string) => !!opts.missingByUser?.[uid]?.unreconciledSessions),
    hasPendingBankrollSnapshot: vi.fn(async (uid: string) => !!opts.missingByUser?.[uid]?.bankrollSnapshotPending),
    getStudyMinutesThisWeek: vi.fn(async (uid: string) => (opts.missingByUser?.[uid]?.zeroStudyWithFocus ? 0 : 90)),
    findActiveLeakFocusList: vi.fn(async (uid: string) => (opts.missingByUser?.[uid]?.zeroStudyWithFocus || opts.missingByUser?.[uid]?.focusNoStatsUpdate ? [{ leakTag: 'icm' }] : [])),
    hasStatsUpdateForActiveFocus: vi.fn(async (uid: string) => !(opts.missingByUser?.[uid]?.focusNoStatsUpdate)),
    // anti-fadiga shape real (caso shouldSendNudge real seja usado)
    getActiveSnoozeForCategory: vi.fn(async () => null),
    countNudgeLog: vi.fn(async () => 0),
    findNudgeLog: vi.fn(async () => null),
    createChatSession: vi.fn(async () => ({ id: 'cs-1' })),
    insertChatMessage: vi.fn(async () => ({ id: 'cm-1' })),
    createNudgeLog: calls.createNudgeLog,
  };
  const getCoachPreferences = vi.fn(async (uid: string) => ({
    nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, frozenCategories: opts.prefsByUser?.[uid]?.frozenCategories ?? {},
    quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
    reportWeeklyEnabled: opts.prefsByUser?.[uid]?.reportWeeklyEnabled ?? false,
    nudgeBGapcheck: opts.prefsByUser?.[uid]?.nudgeBGapcheck ?? true,
    nudgeBImport: true,
  }));
  return { storage, calls, getCoachPreferences };
}

function makeStorageBImport(opts: {
  users?: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }>;
  prefsByUser?: Record<string, { nudgeBImport?: boolean; frozenCategories?: any }>;
  lastImportByUser?: Record<string, Date | null>;
  sessionsByUser?: Record<string, number>;
} = {}) {
  const calls = { createNudgeLog: vi.fn(async (row: any) => `nl-${row?.category ?? 'x'}`) };
  const storage: any = {
    listUsersForCron: vi.fn(async () => opts.users ?? []),
    getUserTimezone: vi.fn(async (uid: string) => (opts.users ?? []).find(u => u.userPlatformId === uid)?.timezone ?? 'America/Sao_Paulo'),
    getUserSubscriptionPlan: vi.fn(async (uid: string) => (opts.users ?? []).find(u => u.userPlatformId === uid)?.subscriptionPlan ?? 'free'),
    getLastUploadAt: vi.fn(async (uid: string) => (uid in (opts.lastImportByUser ?? {}) ? opts.lastImportByUser![uid] : new Date('2026-05-10T00:00:00Z'))),
    countGrindSessionsSince: vi.fn(async (uid: string) => opts.sessionsByUser?.[uid] ?? 0),
    getActiveSnoozeForCategory: vi.fn(async () => null),
    countNudgeLog: vi.fn(async () => 0),
    findNudgeLog: vi.fn(async () => null),
    createChatSession: vi.fn(async () => ({ id: 'cs-1' })),
    insertChatMessage: vi.fn(async () => ({ id: 'cm-1' })),
    createNudgeLog: calls.createNudgeLog,
  };
  const getCoachPreferences = vi.fn(async (uid: string) => ({
    nudgeBSnapshot: true, nudgeBImport: opts.prefsByUser?.[uid]?.nudgeBImport ?? true,
    frozenCategories: opts.prefsByUser?.[uid]?.frozenCategories ?? {},
    quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  }));
  return { storage, calls, getCoachPreferences };
}

// 2026-05-08 eh uma SEXTA. 10h America/Sao_Paulo == 13h UTC (hora util).
const FRIDAY_D3_SP = new Date(Date.UTC(2026, 4, 8, 13, 0, 0));
// 2026-05-11 eh segunda — NAO eh D-3.
const MONDAY_SP = new Date(Date.UTC(2026, 4, 11, 13, 0, 0));
// hora util generica para B-IMPORT (18h SP == 21h UTC seria quiet — usamos 15h SP == 18h UTC)
const BIMPORT_HOUR_SP = new Date(Date.UTC(2026, 4, 8, 18, 0, 0));

// =============================================================================
// B-GAPCHECK
// =============================================================================
describe('gapCheckTick — B-GAPCHECK', () => {
  it('sexta D-3, user Pro+ opt-in COM dados faltantes (sessoes registradas + sem import) -> cria 1 coach_nudge_log category=B-GAPCHECK cycleKey=YYYY-WW', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    const shouldSend = mockShouldSendNudge(async () => ({ allow: true }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });

    expect(calls.createNudgeLog).toHaveBeenCalledTimes(1);
    const row = calls.createNudgeLog.mock.calls[0][0];
    expect(row.category).toBe('B-GAPCHECK');
    expect(typeof row.cycleKey).toBe('string');
    expect(row.cycleKey).toMatch(/^\d{4}-\d{2}$/); // YYYY-WW
    expect(row.triggeredByEvent ?? row.triggered_by_event).toBe('gap_check_d3');
    // shouldSendNudge chamado com category B-GAPCHECK + cycleKey.
    expect(shouldSend).toHaveBeenCalledWith('USER-SP', expect.objectContaining({ category: 'B-GAPCHECK' }));
  });

  it('idempotencia — shouldSendNudge retorna already_sent_this_cycle na 2a chamada do mesmo ciclo -> nao duplica', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    let calledOnce = false;
    mockShouldSendNudge(async () => {
      if (calledOnce) return { allow: false, reason: 'already_sent_this_cycle' };
      calledOnce = true;
      return { allow: true };
    });
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    await gapCheckTick({ now: FRIDAY_D3_SP });
    expect(calls.createNudgeLog).toHaveBeenCalledTimes(1);
  });

  it('user Pro+ opt-in SEM dados faltantes (tudo OK) -> nao manda nada (nao cobra quem esta OK — risco R5)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-OK', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-OK': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-OK': {} }, // nada faltando
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('user Pro+ SEM opt-in do report -> nao recebe gap-check (gap-check so pra quem recebe o report)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-NOOPT', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-NOOPT': { reportWeeklyEnabled: false, nudgeBGapcheck: true } },
      missingByUser: { 'USER-NOOPT': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('user Free -> nao recebe gap-check', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-FREE', timezone: 'America/Sao_Paulo', subscriptionPlan: 'free' }],
      prefsByUser: { 'USER-FREE': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-FREE': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('user com nudgeBGapcheck=false -> shouldSendNudge retorna category_disabled, nada enviado', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    const shouldSend = mockShouldSendNudge(async () => ({ allow: false, reason: 'category_disabled' }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: false } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('user com B-GAPCHECK congelada -> shouldSendNudge retorna category_frozen, nada enviado', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: false, reason: 'category_frozen' }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: true, frozenCategories: { 'B-GAPCHECK': { frozenAt: '2026-05-01T00:00:00Z' } } } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('o check de estado eh REAL — faz as queries no momento (hasImportThisWeek, countGrindSessionsThisWeek, etc.)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const { storage, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    // pelo menos um dos checks de estado foi chamado no momento.
    const realCheckCalled =
      storage.hasImportThisWeek.mock.calls.length > 0 ||
      storage.countGrindSessionsThisWeek.mock.calls.length > 0 ||
      storage.hasUnreconciledSessionsThisWeek.mock.calls.length > 0 ||
      storage.hasPendingBankrollSnapshot.mock.calls.length > 0 ||
      storage.getStudyMinutesThisWeek.mock.calls.length > 0 ||
      storage.hasStatsUpdateForActiveFocus.mock.calls.length > 0;
    expect(realCheckCalled).toBe(true);
  });

  it('hoje NAO eh sexta (segunda) -> gapCheckTick nao faz check pra ninguem', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: MONDAY_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('COACH_NUDGES_ENABLED=false -> gapCheckTick nao roda (ou roda mas o engine nega tudo no check 0)', async () => {
    vi.resetModules();
    process.env.COACH_NUDGES_ENABLED = 'false';
    mockAdvisoryLockPassthrough();
    // engine real diria nudges_globally_disabled — aqui simulamos isso.
    mockShouldSendNudge(async () => ({ allow: false, reason: 'nudges_globally_disabled' }));
    const { storage, calls, getCoachPreferences } = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });
});

// =============================================================================
// B-IMPORT
// =============================================================================
describe('bImportTick — B-IMPORT', () => {
  it('user Pro+ que NAO importou ha >= 5 dias E tem >= 1 sessao -> cria 1 coach_nudge_log category=B-IMPORT cycleKey=YYYY-WW com link /upload', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    delete process.env.COACH_BIMPORT_DAYS;
    mockAdvisoryLockPassthrough();
    const shouldSend = mockShouldSendNudge(async () => ({ allow: true }));
    // ultimo import ha 10 dias; 4 sessoes no periodo.
    const tenDaysAgo = new Date(BIMPORT_HOUR_SP.getTime() - 10 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      lastImportByUser: { 'USER-SP': tenDaysAgo },
      sessionsByUser: { 'USER-SP': 4 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });

    expect(calls.createNudgeLog).toHaveBeenCalledTimes(1);
    const row = calls.createNudgeLog.mock.calls[0][0];
    expect(row.category).toBe('B-IMPORT');
    expect(row.cycleKey).toMatch(/^\d{4}-\d{2}$/);
    expect(row.triggeredByEvent ?? row.triggered_by_event).toBe('b_import_check');
    expect(JSON.stringify(row)).toContain('/upload');
    expect(shouldSend).toHaveBeenCalledWith('USER-SP', expect.objectContaining({ category: 'B-IMPORT' }));
  });

  it('idempotencia — shouldSendNudge already_sent_this_cycle na 2a chamada da mesma semana -> nao duplica', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    let once = false;
    mockShouldSendNudge(async () => {
      if (once) return { allow: false, reason: 'already_sent_this_cycle' };
      once = true;
      return { allow: true };
    });
    const tenDaysAgo = new Date(BIMPORT_HOUR_SP.getTime() - 10 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      lastImportByUser: { 'USER-SP': tenDaysAgo },
      sessionsByUser: { 'USER-SP': 4 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    await bImportTick({ now: BIMPORT_HOUR_SP });
    expect(calls.createNudgeLog).toHaveBeenCalledTimes(1);
  });

  it('user que importou ONTEM (< N dias) -> nao manda nada', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const yesterday = new Date(BIMPORT_HOUR_SP.getTime() - 1 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      lastImportByUser: { 'USER-SP': yesterday },
      sessionsByUser: { 'USER-SP': 4 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('user que nao importa ha muito tempo MAS NAO TEM sessoes registradas -> nao manda nada (nao esta jogando)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const longAgo = new Date(BIMPORT_HOUR_SP.getTime() - 60 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      lastImportByUser: { 'USER-SP': longAgo },
      sessionsByUser: { 'USER-SP': 0 }, // sem sessoes
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('user nunca importou (lastImportAt null) MAS tem sessoes -> manda B-IMPORT', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      lastImportByUser: { 'USER-SP': null },
      sessionsByUser: { 'USER-SP': 3 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    expect(calls.createNudgeLog).toHaveBeenCalledTimes(1);
    expect(calls.createNudgeLog.mock.calls[0][0].category).toBe('B-IMPORT');
  });

  it('user com nudgeBImport=false -> category_disabled, nada enviado', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: false, reason: 'category_disabled' }));
    const tenDaysAgo = new Date(BIMPORT_HOUR_SP.getTime() - 10 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { nudgeBImport: false } },
      lastImportByUser: { 'USER-SP': tenDaysAgo },
      sessionsByUser: { 'USER-SP': 4 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('B-IMPORT congelada -> category_frozen, nada enviado', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: false, reason: 'category_frozen' }));
    const tenDaysAgo = new Date(BIMPORT_HOUR_SP.getTime() - 10 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { frozenCategories: { 'B-IMPORT': { frozenAt: '2026-05-01T00:00:00Z' } } } },
      lastImportByUser: { 'USER-SP': tenDaysAgo },
      sessionsByUser: { 'USER-SP': 4 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('COACH_BIMPORT_DAYS env override altera o threshold de dias (default 5) — com COACH_BIMPORT_DAYS=20 e ultimo import ha 10d -> NAO manda', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    process.env.COACH_BIMPORT_DAYS = '20';
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: true }));
    const tenDaysAgo = new Date(BIMPORT_HOUR_SP.getTime() - 10 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      lastImportByUser: { 'USER-SP': tenDaysAgo },
      sessionsByUser: { 'USER-SP': 4 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    // 10d < 20d -> nao manda.
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });

  it('COACH_NUDGES_ENABLED=false -> bImportTick nao roda / engine nega tudo', async () => {
    vi.resetModules();
    process.env.COACH_NUDGES_ENABLED = 'false';
    mockAdvisoryLockPassthrough();
    mockShouldSendNudge(async () => ({ allow: false, reason: 'nudges_globally_disabled' }));
    const tenDaysAgo = new Date(BIMPORT_HOUR_SP.getTime() - 10 * 24 * 60 * 60 * 1000);
    const { storage, calls, getCoachPreferences } = makeStorageBImport({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      lastImportByUser: { 'USER-SP': tenDaysAgo },
      sessionsByUser: { 'USER-SP': 4 },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { bImportTick } = await import('../../../server/coach/jobs/bImport');
    await bImportTick({ now: BIMPORT_HOUR_SP });
    expect(calls.createNudgeLog).not.toHaveBeenCalled();
  });
});

// =============================================================================
// B-GAPCHECK e B-IMPORT distintos
// =============================================================================
describe('B-GAPCHECK e B-IMPORT — categorias distintas', () => {
  it('shouldSendNudge eh chamado com categorias distintas; um user pode receber as duas na mesma semana (caps a parte)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();
    const shouldSend = mockShouldSendNudge(async () => ({ allow: true }));

    // gapCheckTick numa sexta com dado faltante.
    const g = makeStorageGapCheck({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true, nudgeBGapcheck: true } },
      missingByUser: { 'USER-SP': { noImportButHasSessions: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: g.getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage: g.storage }));
    const { gapCheckTick } = await import('../../../server/coach/jobs/gapCheck');
    await gapCheckTick({ now: FRIDAY_D3_SP });

    const categories = shouldSend.mock.calls.map((c: any) => c[1]?.category);
    expect(categories).toContain('B-GAPCHECK');
    expect(categories).not.toContain('B-IMPORT'); // o gapCheckTick so trata B-GAPCHECK
  });
});
