// =============================================================================
// Sprint AI-3 / RF-04 (ADR-174 §2.4) — enqueueQuarterlyReportJobsTick migra
// de iterateUsersWithTimezone para listUsersForCron (paridade weekly/monthly).
//
// Cobre:
//   - tick chama storage.listUsersForCron("subscription_plan IN ('trial','active','admin')")
//     (filtro SQL exato — paridade reportJobRunner.ts:184).
//   - iterateUsersWithTimezone NÃO é chamado.
//   - Demais comportamento (mês ∈ {1,4,7,10}, dia 1, hora local 7, opt-in,
//     eligible tier, period calc) inalterado.
//
// Lessons:
//   - #3 — mock shape REAL de listUsersForCron: { userPlatformId, timezone,
//     subscriptionPlan }.
//
// Status esperado: TODOS FALHAM (impl ainda usa iterateUsersWithTimezone).
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
});

describe("enqueueQuarterlyReportJobsTick — usa listUsersForCron (RF-04)", () => {
  it("chama listUsersForCron com filtro SQL canônico (paridade weekly/monthly)", async () => {
    const insertedJobs: any[] = [];
    const listUsersForCron = vi.fn(async () => [
      { userPlatformId: "USER-TRIAL", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" },
    ]);
    const iterateUsersWithTimezone = vi.fn();
    const injectedStorage: any = {
      listUsersForCron,
      iterateUsersWithTimezone,
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => {
        insertedJobs.push(p);
        return { ...p, id: "rj-1" };
      }),
    };
    const now = new Date("2026-04-01T10:00:00Z"); // 07h BRT, dia 1 abr
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);

    expect(listUsersForCron).toHaveBeenCalled();
    const filterArg = listUsersForCron.mock.calls[0][0];
    expect(typeof filterArg).toBe("string");
    expect(filterArg).toContain("subscription_plan");
    expect(filterArg).toContain("trial");
    expect(filterArg).toContain("active");
    expect(filterArg).toContain("admin");
    expect(insertedJobs.length).toBe(1);
    expect(insertedJobs[0].reportType).toBe("quarterly");
  });

  it("NÃO chama iterateUsersWithTimezone", async () => {
    const listUsersForCron = vi.fn(async () => []);
    const iterateUsersWithTimezone = vi.fn(async function* () {
      yield { userPlatformId: "Z", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" };
    });
    const injectedStorage: any = {
      listUsersForCron,
      iterateUsersWithTimezone,
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => p),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(iterateUsersWithTimezone).not.toHaveBeenCalled();
  });

  it("listUsersForCron vazio → 0 jobs", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => []),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => {
        insertedJobs.push(p);
        return p;
      }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });

  it("3 users (trial+active+admin) dia 1 abril 7h BRT + opt-in → 3 jobs", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [
        { userPlatformId: "USER-T", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" },
        { userPlatformId: "USER-A", timezone: "America/Sao_Paulo", subscriptionPlan: "active" },
        { userPlatformId: "USER-D", timezone: "America/Sao_Paulo", subscriptionPlan: "admin" },
      ]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => {
        insertedJobs.push(p);
        return p;
      }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs.length).toBe(3);
  });

  it("Comportamento preservado: período = trimestre anterior (1/abr → Q1)", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [
        { userPlatformId: "USER-1", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" },
      ]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => {
        insertedJobs.push(p);
        return p;
      }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(1);
    expect(String(insertedJobs[0].periodStart)).toMatch(/2026-01-01/);
    expect(String(insertedJobs[0].periodEnd)).toMatch(/2026-03-31/);
  });

  it("Comportamento preservado: opt-in false → skip mesmo com listUsersForCron retornando o user", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [
        { userPlatformId: "USER-1", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" },
      ]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: false })),
      insertReportJob: vi.fn(async (p: any) => {
        insertedJobs.push(p);
        return p;
      }),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });

  it("Comportamento preservado: hora local != 7 → skip", async () => {
    const insertedJobs: any[] = [];
    const injectedStorage: any = {
      listUsersForCron: vi.fn(async () => [
        { userPlatformId: "USER-1", timezone: "America/Sao_Paulo", subscriptionPlan: "trial" },
      ]),
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => {
        insertedJobs.push(p);
        return p;
      }),
    };
    // 2026-04-01 15:00 UTC = 12:00 BRT
    const now = new Date("2026-04-01T15:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(insertedJobs).toHaveLength(0);
  });

  it("COACH_NUDGES_ENABLED=false → tick no-op (não chama listUsersForCron)", async () => {
    process.env.COACH_NUDGES_ENABLED = "false";
    const listUsersForCron = vi.fn(async () => []);
    const injectedStorage: any = {
      listUsersForCron,
      getUserCoachPreferences: vi.fn(async () => ({ reportQuarterlyEnabled: true })),
      insertReportJob: vi.fn(async (p: any) => p),
    };
    const now = new Date("2026-04-01T10:00:00Z");
    const { enqueueQuarterlyReportJobsTick } = await import(
      "../../../server/jobs/reportJobRunner"
    );
    await enqueueQuarterlyReportJobsTick(now, injectedStorage);
    expect(listUsersForCron).not.toHaveBeenCalled();
  });
});
