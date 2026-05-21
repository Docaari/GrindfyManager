// =============================================================================
// Sprint AI-2B / RF-03 (ADR-169 §2.1) — enqueuer hourly inline para Quarterly
//
// Cobre:
//   - Trigger: dia 1 de jan/abr/jul/out às 7h local (fuso do user) + reportQuarterlyEnabled=true
//     + isReportEligible(userId, 'quarterly')=true → INSERT report_jobs row 'quarterly'.
//   - period_start = 1º dia do trimestre anterior; period_end = último dia.
//   - Idempotência: UNIQUE (user_id, 'quarterly', period_start) — re-tick na mesma hora no-op.
//   - Outros meses (fev/mai/etc) → skip.
//   - Outros dias → skip.
//   - Outros horários → skip.
//   - COACH_NUDGES_ENABLED=false → tick não roda.
//
// Lesson #37: nodeCron via import estático no cronRunner; tick fn é exportada e
// chamável diretamente. Aqui mocamos storage + clock.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;

beforeEach(() => {
  vi.resetModules();
  delete process.env.COACH_NUDGES_ENABLED;
});

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("enqueueQuarterlyReportJobsTick — trigger por mês/dia/hora local", () => {
  it("dia 1 abril 7h BRT + Trial + opt-in → INSERT report_jobs 'quarterly' Q1 2026", async () => {
    // 2026-04-01 10:00 UTC = 07:00 BRT (UTC-3)
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{
          userPlatformId: "USER-BRT",
          timezone: "America/Sao_Paulo",
          subscriptionPlan: "trial",
        }]),
      getUserCoachPreferences: vi.fn(async () => ({
        reportQuarterlyEnabled: true,
      })),
      insertReportJob: vi.fn(async (payload: any) => {
        insertedJobs.push(payload);
        return { ...payload, id: "rj-1" };
      }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(1);
    expect(insertedJobs[0].userId).toBe("USER-BRT");
    expect(insertedJobs[0].reportType).toBe("quarterly");
    // period_start = 2026-01-01 (1º dia do Q1 anterior)
    expect(String(insertedJobs[0].periodStart)).toMatch(/2026-01-01/);
    // period_end = 2026-03-31
    expect(String(insertedJobs[0].periodEnd)).toMatch(/2026-03-31/);
  });

  it("dia 1 julho 7h BRT → period_start=2026-04-01 (Q2 anterior)", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{
          userPlatformId: "USER-BRT",
          timezone: "America/Sao_Paulo",
          subscriptionPlan: "trial",
        }]),
      getUserCoachPreferences: vi.fn(async () => ({
        reportQuarterlyEnabled: true,
      })),
      insertReportJob: vi.fn(async (payload: any) => {
        insertedJobs.push(payload);
        return { ...payload, id: "rj-2" };
      }),
    };
    const now = new Date("2026-07-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(1);
    expect(String(insertedJobs[0].periodStart)).toMatch(/2026-04-01/);
    expect(String(insertedJobs[0].periodEnd)).toMatch(/2026-06-30/);
  });

  it("dia 1 janeiro 7h BRT → period_start=2025-10-01 (Q4 ano anterior)", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{
          userPlatformId: "USER-BRT",
          timezone: "America/Sao_Paulo",
          subscriptionPlan: "trial",
        }]),
      getUserCoachPreferences: vi.fn(async () => ({
        reportQuarterlyEnabled: true,
      })),
      insertReportJob: vi.fn(async (payload: any) => {
        insertedJobs.push(payload);
        return payload;
      }),
    };
    const now = new Date("2026-01-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(1);
    expect(String(insertedJobs[0].periodStart)).toMatch(/2025-10-01/);
    expect(String(insertedJobs[0].periodEnd)).toMatch(/2025-12-31/);
  });
});

describe("enqueueQuarterlyReportJobsTick — skip cases", () => {
  it("fevereiro dia 1 → skip (mês fora do trimestre civil)", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "U", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" }]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => { insertedJobs.push(p); return p; }),
    };
    const now = new Date("2026-02-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });

  it("abril dia 15 → skip (não é dia 1)", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "U", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" }]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => { insertedJobs.push(p); return p; }),
    };
    const now = new Date("2026-04-15T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });

  it("abril dia 1 mas hora local != 7 → skip", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "U", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" }]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => { insertedJobs.push(p); return p; }),
    };
    // 2026-04-01 15:00 UTC = 12:00 BRT
    const now = new Date("2026-04-01T15:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });

  it("Free com opt-in true → revalida via isReportEligible → skip", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{
          userPlatformId: "USER-FREE",
          timezone: "America/Sao_Paulo",
          subscriptionPlan: "free",
        }]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => { insertedJobs.push(p); return p; }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });

  it("opt-in false → skip", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "U", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" }]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: false })),
      insertReportJob: vi.fn(async (p: any) => { insertedJobs.push(p); return p; }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });
});

describe("enqueueQuarterlyReportJobsTick — idempotência", () => {
  it("re-tick na mesma hora → segundo INSERT recebe conflict no-op (storage simula)", async () => {
    let inserted = 0;
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "U", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" }]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (payload: any) => {
        inserted += 1;
        // simula ON CONFLICT (user_id, report_type, period_start) DO NOTHING
        if (inserted > 1) return null;
        return { ...payload, id: "rj-1" };
      }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(injectedStorage.insertReportJob).toHaveBeenCalledTimes(2);
    // não há erro lançado — second call no-op (returns null)
  });
});

describe("enqueueQuarterlyReportJobsTick — COACH_NUDGES_ENABLED=false", () => {
  it("kill switch desliga o tick (não enfileira nada)", async () => {
    process.env.COACH_NUDGES_ENABLED = "false";
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "U", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" }]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => { insertedJobs.push(p); return p; }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });
});
