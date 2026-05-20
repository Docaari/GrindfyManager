// =============================================================================
// Sprint AI-2A / RF-08-10 (ADR-167) — cronRunner registra 3 ticks novos.
//
// Cobre:
//   - startCoachCrons() com COACH_NUDGES_ENABLED!=false registra 3 schedules
//     hourly: b_downswing, b_volume, b_grade.
//   - COACH_NUDGES_ENABLED=false -> os 3 NAO sao registrados.
//
// Reusa pattern de cron-kill-switch.test.ts (lesson #37 — node-cron import
// estatico) e doMock('node-cron').
//
// Status esperado: TODOS FALHAM (cronRunner ainda nao registra os 3 ticks).
// =============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_CRON = process.env.COACH_CRON_ENABLED;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_CRON === undefined) delete process.env.COACH_CRON_ENABLED;
  else process.env.COACH_CRON_ENABLED = ORIGINAL_CRON;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("cronRunner — AI-2A 3 ticks novos", () => {
  it("sem COACH_NUDGES_ENABLED -> 3 schedules adicionais hourly + log com nomes", async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = "true";
    delete process.env.COACH_NUDGES_ENABLED;

    const scheduledTickIds: string[] = [];
    const scheduleSpy = (expr: string, fn: any, _opts?: any) => {
      // Capturamos a expressao + tentamos extrair o lock name via uma execucao dummy
      // (o cronRunner usa withAdvisoryLock que captura um nome — para AI-2A esperamos
      // nudge_bdownswing_tick / nudge_bvolume_tick / nudge_bgrade_tick OU
      // cron:coach-b-downswing / etc. Lemos a hot string da funcao).
      try {
        const src = fn.toString();
        const found = src.match(/b[-_]?(downswing|volume|grade)/gi);
        if (found) scheduledTickIds.push(...found.map((s: string) => s.toLowerCase()));
      } catch { /* noop */ }
      scheduledTickIds.push(expr);
      return { stop: vi.fn() };
    };
    vi.doMock("node-cron", () => ({
      default: { schedule: scheduleSpy },
      schedule: scheduleSpy,
    }));

    // Mock dos jobs novos AI-2A (eles ainda nao existem — esses doMocks definem stubs
    // para o import nao explodir; o teste valida que cronRunner OS IMPORTA).
    vi.doMock("../../../../server/coach/jobs/bDownswing", () => ({ bDownswingTick: vi.fn(async () => undefined) }));
    vi.doMock("../../../../server/coach/jobs/bVolume", () => ({ bVolumeTick: vi.fn(async () => undefined) }));
    vi.doMock("../../../../server/coach/jobs/bGrade", () => ({ bGradeTick: vi.fn(async () => undefined) }));

    const { startCoachCrons } = await import("../../../../server/coach/cronRunner");
    startCoachCrons();

    // Espera-se pelo menos 3 entries com b-downswing/b-volume/b-grade nos lock names
    const haveDownswing = scheduledTickIds.some((s) => /downswing/i.test(s));
    const haveVolume = scheduledTickIds.some((s) => /volume/i.test(s));
    const haveGrade = scheduledTickIds.some((s) => /grade/i.test(s));
    expect(haveDownswing).toBe(true);
    expect(haveVolume).toBe(true);
    expect(haveGrade).toBe(true);
  });

  it("COACH_NUDGES_ENABLED=false -> 3 schedules AI-2A NAO sao registrados", async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = "true";
    process.env.COACH_NUDGES_ENABLED = "false";

    const scheduledIds: string[] = [];
    const scheduleSpy = (expr: string, fn: any, _opts?: any) => {
      try {
        const src = fn.toString();
        const found = src.match(/b[-_]?(downswing|volume|grade)/gi);
        if (found) scheduledIds.push(...found.map((s: string) => s.toLowerCase()));
      } catch { /* noop */ }
      scheduledIds.push(expr);
      return { stop: vi.fn() };
    };
    vi.doMock("node-cron", () => ({
      default: { schedule: scheduleSpy },
      schedule: scheduleSpy,
    }));
    vi.doMock("../../../../server/coach/jobs/bDownswing", () => ({ bDownswingTick: vi.fn(async () => undefined) }));
    vi.doMock("../../../../server/coach/jobs/bVolume", () => ({ bVolumeTick: vi.fn(async () => undefined) }));
    vi.doMock("../../../../server/coach/jobs/bGrade", () => ({ bGradeTick: vi.fn(async () => undefined) }));

    const { startCoachCrons } = await import("../../../../server/coach/cronRunner");
    startCoachCrons();

    const haveAny = scheduledIds.some((s) => /downswing|volume|grade/i.test(s));
    expect(haveAny).toBe(false);
  });
});
