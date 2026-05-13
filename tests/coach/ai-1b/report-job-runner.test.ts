import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-1B / RF-03 + RF-06 + RF-09 — job runner timezone-aware
//   - enqueueWeeklyReportJobsTick({ now }) — cron 0 * * * *
//   - processReportJobsTick({ now })       — cron */15 * * * *
//
// Modulo NAO EXISTE ainda: server/jobs/reportJobRunner.ts
//   exporta: enqueueWeeklyReportJobsTick, processReportJobsTick,
//            registerReportJobRunner, isWeeklyReportEligible (ou inline — aceitamos
//            ambas as formas; aqui testamos os 2 ticks que sao o coracao do RF).
//
// Fontes:
//   - Docs/specs/sprint-ai-1b.md (RF-03/05.1/06/09 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/155-relatorios-automaticos-report-jobs-runner-tz-aware.md (§3.2, §5)
//   - Docs/api/coach.md "Job runner timezone-aware (ADR-155)"
//
// Lessons aplicaveis: #3 (mock shape REAL — listUsersForCron retorna
//   { userPlatformId, timezone, subscriptionPlan }), #9 (logar antes de fallback /
//   safe-deny / try-catch por user), #34 (storage injetavel — os ticks recebem
//   injectedStorage? como 2o arg; aceitamos tambem mock por modulo).
//
// `now: Date` injetado em todos os ticks (DI determinista).
//
// Status esperado: TODOS FALHAM (modulo nao existe).
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
// Helpers — fake storage com as funcoes que o runner precisa.
// ---------------------------------------------------------------------------
type Job = {
  id: string;
  userId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  scheduledFor: Date;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  timezone: string | null;
  reportId: string | null;
  lastError: string | null;
};

function makeFakeStorage(opts: {
  users?: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }>;
  prefsByUser?: Record<string, { reportWeeklyEnabled?: boolean }>;
  planByUser?: Record<string, string>;          // plano "agora" (revalidacao)
  existingReportForPeriod?: Set<string>;          // `${userId}|weekly|${periodStart}` ja tem reports row
} = {}) {
  const jobs: Job[] = [];
  let seq = 0;
  const calls = {
    insertReportJobOnConflictDoNothing: vi.fn(),
    claimReportJob: vi.fn(),
    updateReportJob: vi.fn(),
    upsertReport: vi.fn(),
    getReportForPeriod: vi.fn(),
  };

  const storage: any = {
    // shape REAL — listUsersForCron(filter) -> [{ userPlatformId, timezone, subscriptionPlan }]
    listUsersForCron: vi.fn(async (_filter?: string) => opts.users ?? []),
    getUserTimezone: vi.fn(async (uid: string) => (opts.users ?? []).find(u => u.userPlatformId === uid)?.timezone ?? 'America/Sao_Paulo'),

    // Enqueuer — INSERT ... ON CONFLICT (user_id, report_type, period_start) DO NOTHING
    insertReportJobOnConflictDoNothing: vi.fn(async (row: any) => {
      calls.insertReportJobOnConflictDoNothing(row);
      const key = `${row.userId}|${row.reportType}|${row.periodStart}`;
      const dup = jobs.some(j => `${j.userId}|${j.reportType}|${j.periodStart}` === key);
      if (dup) return null; // no-op
      const job: Job = {
        id: `job-${++seq}`,
        userId: row.userId,
        reportType: row.reportType,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        scheduledFor: row.scheduledFor instanceof Date ? row.scheduledFor : new Date(row.scheduledFor),
        status: row.status ?? 'pending',
        attempts: 0,
        maxAttempts: row.maxAttempts ?? 3,
        nextAttemptAt: null,
        timezone: row.timezone ?? null,
        reportId: null,
        lastError: null,
      };
      jobs.push(job);
      return job;
    }),

    // Processor — SELECT jobs pending due ORDER BY scheduled_for ASC LIMIT 25
    listDueReportJobs: vi.fn(async ({ now, limit }: { now: Date; limit?: number }) => {
      return jobs
        .filter(j => j.status === 'pending'
          && j.scheduledFor.getTime() <= now.getTime()
          && (j.nextAttemptAt === null || j.nextAttemptAt.getTime() <= now.getTime()))
        .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
        .slice(0, limit ?? 25);
    }),

    // Claim atomico — UPDATE ... SET status='running', attempts=attempts+1 WHERE id=? AND status='pending' RETURNING *
    claimReportJob: vi.fn(async ({ jobId, now }: { jobId: string; now: Date }) => {
      calls.claimReportJob(jobId);
      const job = jobs.find(j => j.id === jobId);
      if (!job || job.status !== 'pending') return null; // outro runner pegou
      job.status = 'running';
      job.attempts += 1;
      return { ...job };
    }),

    updateReportJob: vi.fn(async (jobId: string, patch: Partial<Job>) => {
      calls.updateReportJob({ jobId, patch });
      const job = jobs.find(j => j.id === jobId);
      if (job) Object.assign(job, patch);
      return job;
    }),

    // revalidacao de elegibilidade no processamento
    getUserSubscriptionPlan: vi.fn(async (uid: string) => opts.planByUser?.[uid] ?? (opts.users ?? []).find(u => u.userPlatformId === uid)?.subscriptionPlan ?? 'free'),

    // reports
    getReportForPeriod: vi.fn(async (uid: string, type: string, periodStart: string) => {
      calls.getReportForPeriod({ uid, type, periodStart });
      const key = `${uid}|${type}|${periodStart}`;
      if (opts.existingReportForPeriod?.has(key)) {
        return { id: `existing-report-${uid}`, userId: uid, reportType: type, periodStart, status: 'ready' };
      }
      return null;
    }),
    upsertReport: vi.fn(async (row: any) => {
      calls.upsertReport(row);
      return { id: `report-${++seq}`, ...row };
    }),
  };

  // getCoachPreferences (modulo separado) — aqui exposto como funcao do storage tambem
  // mas o engine real usa server/storage/coachPreferences. Para o runner aceitamos
  // que ele leia prefs via getCoachPreferences. Devolvemos um stub.
  const getCoachPreferences = vi.fn(async (uid: string) => ({
    ...{ nudgeBSnapshot: true, frozenCategories: {} },
    reportWeeklyEnabled: opts.prefsByUser?.[uid]?.reportWeeklyEnabled ?? false,
  }));

  return { storage, jobs, calls, getCoachPreferences };
}

// withAdvisoryLock — passthrough sem lock real (mock de modulo).
function mockAdvisoryLockPassthrough() {
  vi.doMock('../../../server/lib/advisoryLock', () => ({
    withAdvisoryLock: vi.fn(async (_key: string, fn: () => any) => fn()),
  }));
}

// =============================================================================
// 1) Enqueuer — timezone awareness
// =============================================================================
describe('enqueueWeeklyReportJobsTick — timezone awareness', () => {
  it('segunda 07:xx no fuso de um user Pro+ opt-in -> cria exatamente 1 report_jobs row pending weekly', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    // 2026-05-11 eh uma segunda. 07:00 America/Sao_Paulo == 10:00 UTC.
    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });

    expect(jobs.length).toBe(1);
    expect(jobs[0]).toEqual(expect.objectContaining({ userId: 'USER-SP', reportType: 'weekly', status: 'pending' }));
    // period_start eh uma date YYYY-MM-DD da semana QUE ACABOU (5/mai..11/mai? confirme com a spec —
    // o critério aqui: eh uma string ISO de data, anterior ao dia atual).
    expect(typeof jobs[0].periodStart).toBe('string');
    expect(jobs[0].periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('idempotencia — chamar 2x no mesmo tick -> 1 job so (ON CONFLICT DO NOTHING; sem excecao)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    await expect(enqueueWeeklyReportJobsTick({ now })).resolves.not.toThrow();
    expect(jobs.length).toBe(1);
  });

  it('terca (hora local != 7) -> nao cria job', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    // 2026-05-12 terca, 10:00 UTC == 07:00 SP, mas eh terca -> nao cria.
    const now = new Date(Date.UTC(2026, 4, 12, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.length).toBe(0);
  });

  it('segunda mas hora local != 7 (ex: 8h SP) -> nao cria job', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    // 2026-05-11 segunda, 11:00 UTC == 08:00 SP -> hora != 7.
    const now = new Date(Date.UTC(2026, 4, 11, 11, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.length).toBe(0);
  });

  it('fuso extremo Pacific/Kiritimati (UTC+14) — quando eh segunda 7h LA -> cria; nenhuma colisao com SP', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    // Pacific/Kiritimati = UTC+14. Segunda 07:00 local == domingo 17:00 UTC.
    // 2026-05-11 = segunda; 07:00 Kiritimati == 2026-05-10 17:00 UTC.
    const now = new Date(Date.UTC(2026, 4, 10, 17, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [
        { userPlatformId: 'USER-KI', timezone: 'Pacific/Kiritimati', subscriptionPlan: 'trial' },
        { userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' },
      ],
      prefsByUser: { 'USER-KI': { reportWeeklyEnabled: true }, 'USER-SP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    // so o user de Kiritimati ganha job neste tick (em SP ainda eh domingo 14h).
    expect(jobs.map(j => j.userId)).toEqual(['USER-KI']);
  });

  it('fuso extremo Pacific/Pago_Pago (UTC-11) — quando eh segunda 7h LA -> cria', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    // Pacific/Pago_Pago = UTC-11. Segunda 07:00 local == segunda 18:00 UTC.
    const now = new Date(Date.UTC(2026, 4, 11, 18, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-PG', timezone: 'Pacific/Pago_Pago', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-PG': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.map(j => j.userId)).toEqual(['USER-PG']);
  });

  it('vira de ano — primeira segunda de 2027 (semana 52->01) nao quebra', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    // 2027-01-04 eh a primeira segunda de 2027. 07:00 SP == 10:00 UTC.
    const now = new Date(Date.UTC(2027, 0, 4, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await expect(enqueueWeeklyReportJobsTick({ now })).resolves.not.toThrow();
    expect(jobs.length).toBe(1);
  });
});

// =============================================================================
// 2) Enqueuer — elegibilidade (opt-in + plano)
//
// AI-1B bug fix: `users.subscription_plan` so assume 'trial'|'active'|'expired'|
// 'admin' — NUNCA 'pro'/'premium'. A distincao pro/premium vem de
// resolveUserTier(...) (user_subscriptions JOIN subscription_plans). Elegivel:
// 'trial' direto | 'admin' | 'active' com resolveUserTier ∈ {pro,premium,admin}.
// 'expired'/'free' -> NAO elegivel.
// =============================================================================
describe('enqueueWeeklyReportJobsTick — elegibilidade', () => {
  it('user trial com opt-in DESLIGADO -> nao cria job', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-OFF', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-OFF': { reportWeeklyEnabled: false } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.length).toBe(0);
  });

  it('user expired (mesmo com reportWeeklyEnabled=true) -> nao cria job', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      // listUsersForCron("subscription_plan IN ('trial','active','admin')") ja filtra
      // 'expired' fora em producao; aqui testamos defesa em profundidade.
      users: [{ userPlatformId: 'USER-EXP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'expired' }],
      prefsByUser: { 'USER-EXP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.length).toBe(0);
  });

  it('user admin (opt-in ligado) -> cria job (admin sempre elegivel)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-ADM', timezone: 'America/Sao_Paulo', subscriptionPlan: 'admin' }],
      prefsByUser: { 'USER-ADM': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.map(j => j.userId)).toEqual(['USER-ADM']);
  });

  it("user 'active' com resolveUserTier -> 'premium' (subscription pro/premium ativa): cria job; snapshot = tier resolvido", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-PREM', timezone: 'America/Sao_Paulo', subscriptionPlan: 'active' }],
      prefsByUser: { 'USER-PREM': { reportWeeklyEnabled: true } },
    });
    // a distincao pro/premium vem do JOIN — mockamos resolveUserTier.
    vi.doMock('../../../server/coachAccess', () => ({ resolveUserTier: vi.fn(async () => 'premium') }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.map(j => j.userId)).toEqual(['USER-PREM']);
  });

  it("user 'active' mas resolveUserTier -> 'free' (sem subscription pro/premium ativa): nao cria job", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-ACTFREE', timezone: 'America/Sao_Paulo', subscriptionPlan: 'active' }],
      prefsByUser: { 'USER-ACTFREE': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/coachAccess', () => ({ resolveUserTier: vi.fn(async () => 'free') }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.length).toBe(0);
  });

  it('erro ao ler prefs -> safe-deny (nao enfileira para esse user) + console.error LOGADO', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs } = makeFakeStorage({
      users: [
        { userPlatformId: 'USER-BAD', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' },
        { userPlatformId: 'USER-OK', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' },
      ],
    });
    const getCoachPreferences = vi.fn(async (uid: string) => {
      if (uid === 'USER-BAD') throw new Error('db exploded');
      return { reportWeeklyEnabled: true, frozenCategories: {} };
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await expect(enqueueWeeklyReportJobsTick({ now })).resolves.not.toThrow();
    // USER-BAD pulado; USER-OK enfileirado.
    expect(jobs.map(j => j.userId)).toEqual(['USER-OK']);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// =============================================================================
// 3) Enqueuer — gating COACH_NUDGES_ENABLED
// =============================================================================
describe('enqueueWeeklyReportJobsTick — COACH_NUDGES_ENABLED gating', () => {
  it('=false -> return cedo, nenhum job criado, log informa nudges_globally_disabled', async () => {
    vi.resetModules();
    process.env.COACH_NUDGES_ENABLED = 'false';
    mockAdvisoryLockPassthrough();

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const now = new Date(Date.UTC(2026, 4, 11, 10, 0, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { enqueueWeeklyReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await enqueueWeeklyReportJobsTick({ now });
    expect(jobs.length).toBe(0);
    expect(storage.listUsersForCron).not.toHaveBeenCalled();
    const logged = infoSpy.mock.calls.some(args => JSON.stringify(args).includes('nudges_globally_disabled'));
    expect(logged).toBe(true);
    infoSpy.mockRestore();
  });
});

// =============================================================================
// 4) Processor — happy path + idempotencia + claim atomico
// =============================================================================
describe('processReportJobsTick — happy path', () => {
  function setupGeneratorMock(impl: any) {
    vi.doMock('../../../server/services/weeklyReportGenerator', () => ({
      generateWeeklyReport: impl,
    }));
  }

  it('job pending due -> running -> generateWeeklyReport (mock) -> reports row -> done + report_id', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 30, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    // enfileira manualmente via storage helper:
    await storage.insertReportJobOnConflictDoNothing({
      userId: 'USER-SP', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10',
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)), status: 'pending', maxAttempts: 3, timezone: 'America/Sao_Paulo',
    });
    const genMock = vi.fn(async () => ({
      content: { schemaVersion: 1, reportType: 'weekly' }, markdown: '# rel', status: 'ready', model: 'claude-sonnet-4-6',
    }));
    setupGeneratorMock(genMock);
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { processReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await processReportJobsTick({ now });

    expect(genMock).toHaveBeenCalledTimes(1);
    expect(storage.upsertReport).toHaveBeenCalled();
    const job = jobs[0];
    expect(job.status).toBe('done');
    expect(job.reportId).toBeTruthy();
  });

  it('job que JA tem reports row para (user, weekly, period_start) -> done sem chamar o gerador', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 30, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
      existingReportForPeriod: new Set(['USER-SP|weekly|2026-05-04']),
    });
    await storage.insertReportJobOnConflictDoNothing({
      userId: 'USER-SP', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10',
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)), status: 'pending', maxAttempts: 3, timezone: 'America/Sao_Paulo',
    });
    const genMock = vi.fn();
    setupGeneratorMock(genMock);
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { processReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await processReportJobsTick({ now });

    expect(genMock).not.toHaveBeenCalled();
    expect(jobs[0].status).toBe('done');
    expect(jobs[0].reportId).toBe('existing-report-USER-SP');
  });

  it('claim atomico — 2 processReportJobsTick concorrentes nao processam o mesmo job 2x', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 30, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    await storage.insertReportJobOnConflictDoNothing({
      userId: 'USER-SP', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10',
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)), status: 'pending', maxAttempts: 3, timezone: 'America/Sao_Paulo',
    });
    const genMock = vi.fn(async () => ({ content: { schemaVersion: 1 }, markdown: '#', status: 'ready', model: 'm' }));
    setupGeneratorMock(genMock);
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { processReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await Promise.all([processReportJobsTick({ now }), processReportJobsTick({ now })]);
    // o gerador rodou no maximo 1x — claim WHERE status='pending' garante.
    expect(genMock.mock.calls.length).toBeLessThanOrEqual(1);
    expect(jobs[0].status).toBe('done');
  });
});

// =============================================================================
// 5) Processor — revalidacao de elegibilidade (downgrade entre enqueue e processar)
// =============================================================================
describe('processReportJobsTick — revalidacao de elegibilidade', () => {
  it('user que fez downgrade entre enfileirar e processar -> job skipped, last_error=no_longer_eligible, nenhum reports row', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const now = new Date(Date.UTC(2026, 4, 11, 10, 30, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-DOWN', timezone: 'America/Sao_Paulo', subscriptionPlan: 'free' }],
      prefsByUser: { 'USER-DOWN': { reportWeeklyEnabled: true } },
      planByUser: { 'USER-DOWN': 'free' }, // agora eh free
    });
    await storage.insertReportJobOnConflictDoNothing({
      userId: 'USER-DOWN', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10',
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)), status: 'pending', maxAttempts: 3, timezone: 'America/Sao_Paulo',
    });
    const genMock = vi.fn();
    vi.doMock('../../../server/services/weeklyReportGenerator', () => ({ generateWeeklyReport: genMock }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { processReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await processReportJobsTick({ now });

    expect(genMock).not.toHaveBeenCalled();
    expect(jobs[0].status).toBe('skipped');
    expect(jobs[0].lastError).toBe('no_longer_eligible');
    expect(storage.upsertReport).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 6) Processor — retry com backoff + fail-soft
// =============================================================================
describe('processReportJobsTick — retry / backoff / fail-soft', () => {
  it('gerador lanca 1x -> job volta a pending, attempts=1, next_attempt_at ~= now+15min, last_error preenchido; nao re-chamado ate next_attempt_at; console.error LOGADO', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const now = new Date(Date.UTC(2026, 4, 11, 10, 30, 0));
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    await storage.insertReportJobOnConflictDoNothing({
      userId: 'USER-SP', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10',
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)), status: 'pending', maxAttempts: 3, timezone: 'America/Sao_Paulo',
    });
    const genMock = vi.fn(async () => { throw new Error('llm timeout'); });
    vi.doMock('../../../server/services/weeklyReportGenerator', () => ({ generateWeeklyReport: genMock }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { processReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await processReportJobsTick({ now });

    const job = jobs[0];
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBeTruthy();
    expect(job.nextAttemptAt).toBeInstanceOf(Date);
    // backoff de 15min apos a 1a falha (tolerancia de 1min).
    const delta = (job.nextAttemptAt as Date).getTime() - now.getTime();
    expect(delta).toBeGreaterThanOrEqual(14 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(16 * 60 * 1000);
    // console.error('report.job.error', ...) logado (lesson #9).
    const logged = errSpy.mock.calls.some(args => String(args[0] ?? '').includes('report.job.error'));
    expect(logged).toBe(true);

    // mesmo tick (now ainda < next_attempt_at) -> nao re-chama.
    genMock.mockClear();
    await processReportJobsTick({ now });
    expect(genMock).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  it('gerador lanca 3x (attempts atinge max_attempts) -> fail-soft: reports row status=degraded, degraded_reason=llm_failed_3x; job done (nunca failed)', async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({
      users: [{ userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' }],
      prefsByUser: { 'USER-SP': { reportWeeklyEnabled: true } },
    });
    await storage.insertReportJobOnConflictDoNothing({
      userId: 'USER-SP', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10',
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)), status: 'pending', maxAttempts: 3, timezone: 'America/Sao_Paulo',
    });
    // gerador sempre lanca; mas na 3a tentativa o runner deve gerar o relatorio
    // deterministico (fail-soft) — a spec diz que o gerador retorna o deterministico
    // quando attempts >= max. Aceitamos qualquer um dos dois caminhos: ou o runner
    // chama o gerador num "modo deterministico" e ele retorna degraded, ou o runner
    // monta um content minimal. O importante: reports row degraded + job done.
    const genMock = vi.fn(async (args: any) => {
      if (args && args.failSoft === true) {
        return { content: { schemaVersion: 1, generation: { degraded: true, degradedReason: 'llm_failed_3x' } }, markdown: '#', status: 'degraded', model: null };
      }
      throw new Error('llm timeout');
    });
    vi.doMock('../../../server/services/weeklyReportGenerator', () => ({ generateWeeklyReport: genMock }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { processReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    const job = jobs[0];

    // tentativa 1
    await processReportJobsTick({ now: new Date(Date.UTC(2026, 4, 11, 10, 30, 0)) });
    // tentativa 2 — avanca para depois do next_attempt_at
    let after = (job.nextAttemptAt as Date) ?? new Date(Date.UTC(2026, 4, 11, 11, 0, 0));
    await processReportJobsTick({ now: new Date(after.getTime() + 60_000) });
    // tentativa 3
    after = (job.nextAttemptAt as Date) ?? new Date(Date.UTC(2026, 4, 11, 15, 0, 0));
    await processReportJobsTick({ now: new Date(after.getTime() + 60_000) });

    expect(job.status).toBe('done');
    expect(job.status).not.toBe('failed');
    // upsertReport chamado com status degraded + degraded_reason llm_failed_3x.
    const upsertCalls = storage.upsertReport.mock.calls.map((c: any[]) => c[0]);
    const degraded = upsertCalls.find((r: any) => r && (r.status === 'degraded' || r.degradedReason === 'llm_failed_3x'));
    expect(degraded).toBeTruthy();
    expect(String(degraded.degradedReason ?? degraded.degraded_reason)).toBe('llm_failed_3x');
  });
});

// =============================================================================
// 7) Processor — gating COACH_NUDGES_ENABLED
// =============================================================================
describe('processReportJobsTick — COACH_NUDGES_ENABLED gating', () => {
  it('=false -> return cedo, nenhum job processado, log nudges_globally_disabled', async () => {
    vi.resetModules();
    process.env.COACH_NUDGES_ENABLED = 'false';
    mockAdvisoryLockPassthrough();

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { storage, jobs, getCoachPreferences } = makeFakeStorage({});
    await storage.insertReportJobOnConflictDoNothing({
      userId: 'USER-SP', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10',
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)), status: 'pending', maxAttempts: 3, timezone: 'America/Sao_Paulo',
    });
    const genMock = vi.fn();
    vi.doMock('../../../server/services/weeklyReportGenerator', () => ({ generateWeeklyReport: genMock }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences }));
    vi.doMock('../../../server/storage', () => ({ storage }));

    const { processReportJobsTick } = await import('../../../server/jobs/reportJobRunner');
    await processReportJobsTick({ now: new Date(Date.UTC(2026, 4, 11, 10, 30, 0)) });
    expect(genMock).not.toHaveBeenCalled();
    expect(jobs[0].status).toBe('pending');
    const logged = infoSpy.mock.calls.some(args => JSON.stringify(args).includes('nudges_globally_disabled'));
    expect(logged).toBe(true);
    infoSpy.mockRestore();
  });
});

// =============================================================================
// 8) Registro do runner (RF-06)
// =============================================================================
describe('registerReportJobRunner — registro dos crons', () => {
  it('em modo cron (COACH_CRON_ENABLED=true) -> registra enqueuer (0 * * * *) + processor (*/15 * * * *); log report.job.runner.started', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    delete process.env.COACH_NUDGES_ENABLED;
    mockAdvisoryLockPassthrough();

    const scheduled: string[] = [];
    vi.doMock('node-cron', () => ({
      default: { schedule: (expr: string) => { scheduled.push(expr); return { stop: vi.fn() }; } },
      schedule: (expr: string) => { scheduled.push(expr); return { stop: vi.fn() }; },
    }));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { registerReportJobRunner } = await import('../../../server/jobs/reportJobRunner');
    await registerReportJobRunner();

    expect(scheduled).toContain('0 * * * *');
    expect(scheduled).toContain('*/15 * * * *');
    const logged = infoSpy.mock.calls.some(args => JSON.stringify(args).includes('report.job.runner.started'));
    expect(logged).toBe(true);
    infoSpy.mockRestore();
  });

  it('em modo cron com COACH_NUDGES_ENABLED=false -> log "desabilitado pelo kill switch"; nenhum schedule de relatorio agendado', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    process.env.COACH_NUDGES_ENABLED = 'false';
    mockAdvisoryLockPassthrough();

    const scheduled: string[] = [];
    vi.doMock('node-cron', () => ({
      default: { schedule: (expr: string) => { scheduled.push(expr); return { stop: vi.fn() }; } },
      schedule: (expr: string) => { scheduled.push(expr); return { stop: vi.fn() }; },
    }));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { registerReportJobRunner } = await import('../../../server/jobs/reportJobRunner');
    await registerReportJobRunner();

    expect(scheduled).not.toContain('0 * * * *');
    expect(scheduled).not.toContain('*/15 * * * *');
    const logged = infoSpy.mock.calls.some(args => JSON.stringify(args).toLowerCase().includes('kill switch') || JSON.stringify(args).includes('nudges_disabled'));
    expect(logged).toBe(true);
    infoSpy.mockRestore();
  });
});
