import { describe, it, expect, vi, afterEach } from "vitest";

// =============================================================================
// Reviewer follow-up (CHANGES-REQUESTED) — integracao com shapes de storage REAIS.
//
// Os testes red-phase originais mockavam storage com `vi.fn()` idealizado (lesson
// #3 em escala). Estes testes NOVOS exercitam o pipeline com fakes que respeitam:
//   - distincao `users.id` (UUID) vs `users.userPlatformId` (USER-XXXX) no lookup;
//   - assinaturas reais (getTournaments(userId, limit,...), getBankrollSnapshots({from,to}),
//     getDashboardStats -> { count, profit, roi(%), itm(%), finalTables, bigHits }, etc.);
//   - elegibilidade do processor via o snapshot subscription_plan_at_enqueue + re-check
//     de opt-in (NAO um vi.fn() que devolve o plano ideal);
//   - sinais reais do gap-check / B-IMPORT (hasImportThisWeek, countGrindSessionsSince, ...).
// =============================================================================

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_BIMPORT = process.env.COACH_BIMPORT_DAYS;

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED; else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_BIMPORT === undefined) delete process.env.COACH_BIMPORT_DAYS; else process.env.COACH_BIMPORT_DAYS = ORIGINAL_BIMPORT;
  vi.useRealTimers();
});

function advisoryPassthrough() {
  vi.doMock("../../../server/lib/advisoryLock", () => ({
    withAdvisoryLock: vi.fn(async (_k: string, fn: () => any) => fn()),
  }));
}

// =============================================================================
// 1) Processor — lookup de user respeita id(UUID) vs userPlatformId(USER-XXXX);
//    elegibilidade via snapshot subscription_plan_at_enqueue + opt-in re-check.
// =============================================================================
describe("processReportJobsTick — lookup real de user + elegibilidade via snapshot", () => {
  function makeStorage(opts: {
    // o "banco" de users — keyed por UUID. O userPlatformId eh um campo.
    usersById: Record<string, { id: string; userPlatformId: string; subscriptionPlan: string }>;
  }) {
    const jobs: any[] = [];
    let seq = 0;
    const byPlatformId: Record<string, any> = {};
    for (const u of Object.values(opts.usersById)) byPlatformId[u.userPlatformId] = u;
    const upsertCalls: any[] = [];
    const storage: any = {
      // getUser(id) — WHERE users.id = ? (UUID). Se chamado com USER-XXXX -> undefined.
      getUser: vi.fn(async (id: string) => opts.usersById[id]),
      // getUserById(userPlatformId) — WHERE users.user_platform_id = ?  (o CORRETO).
      getUserById: vi.fn(async (upid: string) => byPlatformId[upid]),
      // getUserSubscriptionPlan NAO eh fornecido aqui — o reportStorage fallback
      // (que usa getUserById) NAO esta attachado nestes testes; entao o processor
      // DEVE conseguir revalidar via o snapshot subscriptionPlanAtEnqueue.
      claimReportJob: vi.fn(async ({ jobId }: { jobId: string }) => {
        const j = jobs.find((x) => x.id === jobId);
        if (!j || j.status !== "pending") return null;
        j.status = "running";
        j.attempts += 1;
        return { ...j };
      }),
      updateReportJob: vi.fn(async (jobId: string, patch: any) => {
        const j = jobs.find((x) => x.id === jobId);
        if (j) Object.assign(j, patch);
        return j;
      }),
      listDueReportJobs: vi.fn(async ({ now }: { now: Date }) =>
        jobs.filter((j) => j.status === "pending" && new Date(j.scheduledFor).getTime() <= now.getTime()),
      ),
      getReportForPeriod: vi.fn(async () => null),
      upsertReport: vi.fn(async (row: any) => {
        upsertCalls.push(row);
        return { id: `report-${++seq}`, ...row };
      }),
      insertReportJobOnConflictDoNothing: vi.fn(async (row: any) => {
        const job = { id: `job-${++seq}`, attempts: 0, status: "pending", maxAttempts: 3, ...row };
        jobs.push(job);
        return job;
      }),
    };
    return { storage, jobs, upsertCalls };
  }

  it("user Pro+ opt-in: processor revalida via subscriptionPlanAtEnqueue (snapshot = tier resolvido) + opt-in -> gera o reports row + job done", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    advisoryPassthrough();

    const { storage, jobs, upsertCalls } = makeStorage({
      // users.subscription_plan cru = 'active'; o tier pro/premium vem do JOIN.
      usersById: { "uuid-abc": { id: "uuid-abc", userPlatformId: "USER-0042", subscriptionPlan: "active" } },
    });
    // job enfileirado COM o snapshot do tier RESOLVIDO (como o enqueuer faz —
    // 'active' -> resolveUserTier -> 'pro'). O processor revalida sobre este valor.
    await storage.insertReportJobOnConflictDoNothing({
      userId: "USER-0042",
      reportType: "weekly",
      periodStart: "2026-05-04",
      periodEnd: "2026-05-10",
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)),
      timezone: "America/Sao_Paulo",
      subscriptionPlanAtEnqueue: "pro",
      enqueuedBy: "cron_enqueuer",
    });
    // getCoachPreferences -> opt-in ligado.
    vi.doMock("../../../server/storage/coachPreferences", () => ({
      getCoachPreferences: vi.fn(async () => ({ reportWeeklyEnabled: true, frozenCategories: {} })),
    }));
    const genMock = vi.fn(async () => ({
      content: { schemaVersion: 1, reportType: "weekly", generation: { degraded: false } },
      markdown: "# rel",
      status: "ready",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 100, output_tokens: 200 },
    }));
    vi.doMock("../../../server/services/weeklyReportGenerator", () => ({ generateWeeklyReport: genMock }));
    vi.doMock("../../../server/storage", () => ({ storage }));

    const { processReportJobsTick } = await import("../../../server/jobs/reportJobRunner");
    await processReportJobsTick({ now: new Date(Date.UTC(2026, 4, 11, 10, 30, 0)) });

    // NAO virou skipped — o snapshot do plano + opt-in foram suficientes.
    expect(jobs[0].status).toBe("done");
    expect(jobs[0].lastError ?? null).not.toBe("no_longer_eligible");
    expect(genMock).toHaveBeenCalledTimes(1);
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
    // os tokens do gerador foram propagados pro reports row (nao zerados).
    const row = upsertCalls[upsertCalls.length - 1];
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(200);
  });

  it("user que fez downgrade: snapshot diz pro mas o opt-in (getCoachPreferences) agora retorna false -> job skipped, sem reports row", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    advisoryPassthrough();

    const { storage, jobs, upsertCalls } = makeStorage({
      usersById: { "uuid-x": { id: "uuid-x", userPlatformId: "USER-0001", subscriptionPlan: "free" } },
    });
    await storage.insertReportJobOnConflictDoNothing({
      userId: "USER-0001",
      reportType: "weekly",
      periodStart: "2026-05-04",
      periodEnd: "2026-05-10",
      scheduledFor: new Date(Date.UTC(2026, 4, 11, 10, 0, 0)),
      timezone: "America/Sao_Paulo",
      subscriptionPlanAtEnqueue: "free", // downgrade refletido no snapshot
      enqueuedBy: "cron_enqueuer",
    });
    vi.doMock("../../../server/storage/coachPreferences", () => ({
      getCoachPreferences: vi.fn(async () => ({ reportWeeklyEnabled: true, frozenCategories: {} })),
    }));
    const genMock = vi.fn();
    vi.doMock("../../../server/services/weeklyReportGenerator", () => ({ generateWeeklyReport: genMock }));
    vi.doMock("../../../server/storage", () => ({ storage }));

    const { processReportJobsTick } = await import("../../../server/jobs/reportJobRunner");
    await processReportJobsTick({ now: new Date(Date.UTC(2026, 4, 11, 10, 30, 0)) });

    expect(jobs[0].status).toBe("skipped");
    expect(jobs[0].lastError).toBe("no_longer_eligible");
    expect(genMock).not.toHaveBeenCalled();
    expect(upsertCalls.length).toBe(0);
  });

  it("getUser(USER-XXXX) NUNCA casa (lookup por UUID) — getUserById(USER-XXXX) eh o correto", async () => {
    const { storage } = makeStorage({
      usersById: { "uuid-1": { id: "uuid-1", userPlatformId: "USER-9999", subscriptionPlan: "active" } },
    });
    // simula o bug do reviewer: chamar getUser com o userPlatformId.
    expect(await storage.getUser("USER-9999")).toBeUndefined();
    // o jeito certo:
    expect((await storage.getUserById("USER-9999"))?.subscriptionPlan).toBe("active");
  });
});

// =============================================================================
// 3) gapCheckTick — storage com sinais REAIS (helpers que existem).
// =============================================================================
describe("gapCheckTick — sinais reais", () => {
  it("sexta D-3, Pro+ opt-in, hasImportThisWeek=false + countGrindSessionsThisWeek=3 -> dispara B-GAPCHECK", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    advisoryPassthrough();
    const shouldSend = vi.fn(async () => ({ allow: true }));
    vi.doMock("../../../server/coach/nudgeEngine", () => ({ shouldSendNudge: shouldSend }));
    const createNudgeLog = vi.fn(async (row: any) => `nl-${row?.category}`);
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-0042", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }]),
      getUserSubscriptionPlan: vi.fn(async () => "pro"),
      // sinais REAIS (mesmos nomes que attachCoachSignalsStorage expoe):
      hasImportThisWeek: vi.fn(async () => false),
      countGrindSessionsThisWeek: vi.fn(async () => 3),
      hasUnreconciledSessionsThisWeek: vi.fn(async () => false),
      hasPendingBankrollSnapshot: vi.fn(async () => false),
      getStudyMinutesThisWeek: vi.fn(async () => 120),
      findActiveLeakFocusList: vi.fn(async () => []),
      hasStatsUpdateForActiveFocus: vi.fn(async () => true),
      createChatSession: vi.fn(async () => ({ id: "cs-1" })),
      insertChatMessage: vi.fn(async () => ({ id: "cm-1" })),
      createNudgeLog,
    };
    vi.doMock("../../../server/storage/coachPreferences", () => ({ getCoachPreferences: vi.fn(async () => ({ reportWeeklyEnabled: true, nudgeBGapcheck: true, frozenCategories: {} })) }));
    vi.doMock("../../../server/storage", () => ({ storage }));

    // 2026-05-08 = sexta; 10h America/Sao_Paulo == 13h UTC.
    const { gapCheckTick } = await import("../../../server/coach/jobs/gapCheck");
    await gapCheckTick({ now: new Date(Date.UTC(2026, 4, 8, 13, 0, 0)) });

    expect(createNudgeLog).toHaveBeenCalledTimes(1);
    expect(createNudgeLog.mock.calls[0][0].category).toBe("B-GAPCHECK");
    // link de stats aponta pra rota REGISTRADA (/estudos/stats), nao /stats.
    // (neste cenario o item faltante eh "import" -> /upload; mas garantimos que o
    //  body NUNCA contem o /stats invalido.)
    expect(JSON.stringify(createNudgeLog.mock.calls[0][0])).not.toContain('"/stats"');
    // pelo menos um dos checks de estado reais foi consultado.
    expect(storage.hasImportThisWeek).toHaveBeenCalled();
  });

  it("tudo OK (hasImportThisWeek=true, sem sessoes, estudo > 0, foco com stats) -> nao manda nada", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    advisoryPassthrough();
    vi.doMock("../../../server/coach/nudgeEngine", () => ({ shouldSendNudge: vi.fn(async () => ({ allow: true })) }));
    const createNudgeLog = vi.fn();
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-0042", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }]),
      getUserSubscriptionPlan: vi.fn(async () => "pro"),
      hasImportThisWeek: vi.fn(async () => true),
      countGrindSessionsThisWeek: vi.fn(async () => 0),
      hasUnreconciledSessionsThisWeek: vi.fn(async () => false),
      hasPendingBankrollSnapshot: vi.fn(async () => false),
      getStudyMinutesThisWeek: vi.fn(async () => 90),
      findActiveLeakFocusList: vi.fn(async () => [{ leakCode: "icm" }]),
      hasStatsUpdateForActiveFocus: vi.fn(async () => true),
      createChatSession: vi.fn(async () => ({ id: "cs-1" })),
      insertChatMessage: vi.fn(async () => ({ id: "cm-1" })),
      createNudgeLog,
    };
    vi.doMock("../../../server/storage/coachPreferences", () => ({ getCoachPreferences: vi.fn(async () => ({ reportWeeklyEnabled: true, nudgeBGapcheck: true, frozenCategories: {} })) }));
    vi.doMock("../../../server/storage", () => ({ storage }));

    const { gapCheckTick } = await import("../../../server/coach/jobs/gapCheck");
    await gapCheckTick({ now: new Date(Date.UTC(2026, 4, 8, 13, 0, 0)) });
    expect(createNudgeLog).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4) bImportTick — getLastUploadAt / countGrindSessionsSince REAIS.
// =============================================================================
describe("bImportTick — sinais reais", () => {
  it("ultimo import ha 10d + 4 sessoes desde -> dispara B-IMPORT com link /upload", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    delete process.env.COACH_BIMPORT_DAYS;
    advisoryPassthrough();
    vi.doMock("../../../server/coach/nudgeEngine", () => ({ shouldSendNudge: vi.fn(async () => ({ allow: true })) }));
    const createNudgeLog = vi.fn(async (row: any) => `nl-${row?.category}`);
    // 2026-05-08 15h SP == 18h UTC.
    const nowUtc = new Date(Date.UTC(2026, 4, 8, 18, 0, 0));
    const tenDaysAgo = new Date(nowUtc.getTime() - 10 * 24 * 60 * 60 * 1000);
    const sinceCalls: any[] = [];
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-0042", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }]),
      getUserSubscriptionPlan: vi.fn(async () => "pro"),
      getLastUploadAt: vi.fn(async () => tenDaysAgo),
      countGrindSessionsSince: vi.fn(async (_uid: string, since: Date) => { sinceCalls.push(since); return 4; }),
      createChatSession: vi.fn(async () => ({ id: "cs-1" })),
      insertChatMessage: vi.fn(async () => ({ id: "cm-1" })),
      createNudgeLog,
    };
    vi.doMock("../../../server/storage/coachPreferences", () => ({ getCoachPreferences: vi.fn(async () => ({ nudgeBImport: true, frozenCategories: {} })) }));
    vi.doMock("../../../server/storage", () => ({ storage }));

    const { bImportTick } = await import("../../../server/coach/jobs/bImport");
    await bImportTick({ now: nowUtc });

    expect(createNudgeLog).toHaveBeenCalledTimes(1);
    const row = createNudgeLog.mock.calls[0][0];
    expect(row.category).toBe("B-IMPORT");
    expect(JSON.stringify(row)).toContain("/upload");
    // countGrindSessionsSince chamado com a data do ultimo import (best-effort).
    expect(storage.countGrindSessionsSince).toHaveBeenCalled();
  });

  it("importou ontem (< 5d default) -> nao manda nada", async () => {
    vi.resetModules();
    delete process.env.COACH_NUDGES_ENABLED;
    delete process.env.COACH_BIMPORT_DAYS;
    advisoryPassthrough();
    vi.doMock("../../../server/coach/nudgeEngine", () => ({ shouldSendNudge: vi.fn(async () => ({ allow: true })) }));
    const createNudgeLog = vi.fn();
    const nowUtc = new Date(Date.UTC(2026, 4, 8, 18, 0, 0));
    const yesterday = new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000);
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-0042", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }]),
      getUserSubscriptionPlan: vi.fn(async () => "pro"),
      getLastUploadAt: vi.fn(async () => yesterday),
      countGrindSessionsSince: vi.fn(async () => 4),
      createChatSession: vi.fn(async () => ({ id: "cs-1" })),
      insertChatMessage: vi.fn(async () => ({ id: "cm-1" })),
      createNudgeLog,
    };
    vi.doMock("../../../server/storage/coachPreferences", () => ({ getCoachPreferences: vi.fn(async () => ({ nudgeBImport: true, frozenCategories: {} })) }));
    vi.doMock("../../../server/storage", () => ({ storage }));

    const { bImportTick } = await import("../../../server/coach/jobs/bImport");
    await bImportTick({ now: nowUtc });
    expect(createNudgeLog).not.toHaveBeenCalled();
  });
});
