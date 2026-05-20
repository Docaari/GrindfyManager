// =============================================================================
// Sprint AI-2A / RF-02 (ADR-165) — bulk_propose_grade
//
// Cobre:
//   - Zod input validation (cap maxTournaments<=20, daysOfWeek 0-6, profile A|B|C).
//   - Output shape: proposed[], conflicts[], strictWouldReject, summary.
//   - Modo strict rejeita execute em conflito (`strict_conflict`).
//   - Modo non-strict registra os não-conflituosos + retorna `{ registered, skipped }`.
//   - Dedup intra-pacote (time_overlap).
//   - already_in_grade detection cross-check com listPlannedTournaments.
//   - off_day skip via listOffDaysForUser.
//   - wallet_below_threshold conflict.
//   - Undo lê createdIds do payloadAfter e deleta em lote.
//   - scoring_error em 1 day não trava os outros.
//   - tool descritor: requiresConfirmation, auditLevel persist, gateByTier.
//
// Lessons aplicadas: #32 (db.transaction fallback), #34 (injectedStorage),
//   #9 (log antes de fallback), #10 (DRY scoring), #11 (default minimum).
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("bulk_propose_grade — Zod validation (cap 20, daysOfWeek, profile)", () => {
  it("validation_failed quando maxTournaments > 20", async () => {
    const mod = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const tool = mod.bulkProposeGradeTool;
    const r = await tool.executeConfirmed!(
      { weekStartDate: "2026-05-25", profile: "A", maxTournaments: 25 },
      { userId: "U" } as any,
      undefined,
    ).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    // Aceita validation no executeConfirmed OU em uma validate prévia.
    expect(JSON.stringify(r)).toMatch(/validation_failed|max|exceeded/i);
  });

  it("validation_failed quando profile invalido", async () => {
    const { bulkProposeGradeInputSchema } = await import(
      "../../../../server/coachTools/handlers/bulkProposeGrade"
    );
    const r = bulkProposeGradeInputSchema.safeParse({ weekStartDate: "2026-05-25", profile: "Z" });
    expect(r.success).toBe(false);
  });

  it("validation_failed quando daysOfWeek inclui 7", async () => {
    const { bulkProposeGradeInputSchema } = await import(
      "../../../../server/coachTools/handlers/bulkProposeGrade"
    );
    const r = bulkProposeGradeInputSchema.safeParse({
      weekStartDate: "2026-05-25",
      profile: "A",
      daysOfWeek: [1, 2, 7],
    });
    expect(r.success).toBe(false);
  });

  it("validation_failed quando weekStartDate nao bate o regex YYYY-MM-DD", async () => {
    const { bulkProposeGradeInputSchema } = await import(
      "../../../../server/coachTools/handlers/bulkProposeGrade"
    );
    const r = bulkProposeGradeInputSchema.safeParse({ weekStartDate: "25-05-2026", profile: "A" });
    expect(r.success).toBe(false);
  });
});

describe("bulk_propose_grade — preview/proposed", () => {
  it("preview com daysOfWeek=[1,2,3] retorna proposed com dayOfWeek ∈ {1,2,3}", async () => {
    const suggestionsByDay: Record<number, any[]> = {
      1: [{ site: "WPN", name: "Big 100K", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 109, prioridade: 1 }],
      2: [{ site: "GG", name: "Bounty Builder", time: "21:00", type: "PKO", speed: "Normal", buyIn: 55, prioridade: 2 }],
      3: [{ site: "Stars", name: "Sunday Million", time: "19:00", type: "Vanilla", speed: "Normal", buyIn: 109, prioridade: 1 }],
    };
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async ({ dayOfWeek }: any) => suggestionsByDay[dayOfWeek] ?? []),
      listPlannedTournaments: vi.fn(async () => []),
      listOffDaysForUser: vi.fn(async () => []),
    };
    const walletService = { getConsolidatedBalance: vi.fn(async () => 10000) };
    vi.doMock("../../../../server/services/walletService", () => walletService);

    const mod = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const tool = mod.bulkProposeGradeTool;
    const result = await tool.fetchPayloadBefore!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1, 2, 3], strict: false, maxTournaments: 20 },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    expect(result).toBeTruthy();
    const preview = result.preview ?? result; // tolera shapes
    expect(Array.isArray(preview.proposed)).toBe(true);
    const days = preview.proposed.map((p: any) => p.dayOfWeek);
    days.forEach((d: number) => expect([1, 2, 3]).toContain(d));
    expect(preview.summary).toBeTruthy();
    expect(typeof preview.summary.totalBuyIn).toBe("number");
    expect(typeof preview.summary.estimatedHours).toBe("number");
  });

  it("conflict: time_overlap dentro do mesmo pacote (2 torneios mesmo dia/hora)", async () => {
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "T1", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 100, prioridade: 1 },
        { site: "GG", name: "T2", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 100, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => []),
      listOffDaysForUser: vi.fn(async () => []),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const result = await bulkProposeGradeTool.fetchPayloadBefore!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    const preview = result.preview ?? result;
    const reasons = preview.conflicts.map((c: any) => c.reason);
    expect(reasons).toContain("time_overlap");
  });

  it("conflict: already_in_grade quando match com listPlannedTournaments", async () => {
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "Big 100K", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 100, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => [
        { site: "WPN", name: "Big 100K", time: "20:00", dayOfWeek: 1 },
      ]),
      listOffDaysForUser: vi.fn(async () => []),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const result = await bulkProposeGradeTool.fetchPayloadBefore!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    const preview = result.preview ?? result;
    expect(preview.conflicts.map((c: any) => c.reason)).toContain("already_in_grade");
  });

  it("conflict: off_day skipa dia inteiro listado em listOffDaysForUser", async () => {
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "T", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 50, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => []),
      // sabado 2026-05-30 marcado como off-day. weekStartDate 2026-05-25 (segunda) + dayOfWeek=6 -> sabado 2026-05-30.
      listOffDaysForUser: vi.fn(async () => [new Date("2026-05-30")]),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const result = await bulkProposeGradeTool.fetchPayloadBefore!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [6], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    const preview = result.preview ?? result;
    expect(preview.conflicts.find((c: any) => c.reason === "off_day")).toBeTruthy();
    // Nada deve ter sido proposto para sabado
    expect(preview.proposed.filter((p: any) => p.dayOfWeek === 6)).toHaveLength(0);
  });

  it("wallet_below_threshold quando saldo < sum(buyIn)*2", async () => {
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "Big", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 500, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => []),
      listOffDaysForUser: vi.fn(async () => []),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 300), // < 500*2=1000
    }));
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const result = await bulkProposeGradeTool.fetchPayloadBefore!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    const preview = result.preview ?? result;
    expect(preview.conflicts.map((c: any) => c.reason)).toContain("wallet_below_threshold");
  });

  it("scoring_error em 1 dayOfWeek nao trava os outros (lesson #9)", async () => {
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async ({ dayOfWeek }: any) => {
        if (dayOfWeek === 3) throw new Error("scoring failed for day 3");
        return [{ site: "WPN", name: "T", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 50, prioridade: 1 }];
      }),
      listPlannedTournaments: vi.fn(async () => []),
      listOffDaysForUser: vi.fn(async () => []),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const result = await bulkProposeGradeTool.fetchPayloadBefore!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1, 2, 3], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    const preview = result.preview ?? result;
    expect(preview.conflicts.find((c: any) => c.reason === "scoring_error" && c.dayOfWeek === 3)).toBeTruthy();
    // outros days continuam
    expect(preview.proposed.length).toBeGreaterThan(0);
    errSpy.mockRestore();
  });
});

describe("bulk_propose_grade — execute + undo", () => {
  it("strict=true + conflicts -> recusa execute com strict_conflict", async () => {
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "T", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 100, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => [
        { site: "WPN", name: "T", time: "20:00", dayOfWeek: 1 },
      ]),
      listOffDaysForUser: vi.fn(async () => []),
      createPlannedTournament: vi.fn(),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const out = await bulkProposeGradeTool.executeConfirmed!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1], strict: true, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    ).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    expect(JSON.stringify(out)).toMatch(/strict_conflict/);
    expect(injectedStorage.createPlannedTournament).not.toHaveBeenCalled();
  });

  it("strict=false + 2 conflicts -> registra proposed - 2 e payloadAfter.createdIds populado", async () => {
    const created: any[] = [];
    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "T1", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 50, prioridade: 1 },
        { site: "GG", name: "T2", time: "21:00", type: "Vanilla", speed: "Normal", buyIn: 50, prioridade: 1 },
        { site: "Stars", name: "T3", time: "22:00", type: "Vanilla", speed: "Normal", buyIn: 50, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => [
        { site: "WPN", name: "T1", time: "20:00", dayOfWeek: 1 },
      ]),
      listOffDaysForUser: vi.fn(async () => []),
      createPlannedTournament: vi.fn(async (payload: any) => {
        const row = { id: `pt-${created.length + 1}`, ...payload };
        created.push(row);
        return row;
      }),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const out: any = await bulkProposeGradeTool.executeConfirmed!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(out.payloadAfter).toBeTruthy();
    expect(Array.isArray(out.payloadAfter.createdIds)).toBe(true);
    expect(out.payloadAfter.createdIds.length).toBe(2); // 3 propostos - 1 already_in_grade
    expect(injectedStorage.createPlannedTournament).toHaveBeenCalledTimes(2);
  });

  it("undo deleta TODOS os planned_tournaments criados via deletePlannedTournamentsByIds", async () => {
    const injectedStorage: any = {
      deletePlannedTournamentsByIds: vi.fn(async () => undefined),
    };
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const payloadAfter = { createdIds: ["pt-1", "pt-2", "pt-3"], summary: {}, skipped: 0, skippedReasons: [] };
    await bulkProposeGradeTool.undo!(null, payloadAfter, { userId: "U", injectedStorage } as any, undefined);
    expect(injectedStorage.deletePlannedTournamentsByIds).toHaveBeenCalledTimes(1);
    const call = injectedStorage.deletePlannedTournamentsByIds.mock.calls[0];
    const ids = call.find((a: any) => Array.isArray(a)) ?? call[0];
    expect(ids).toEqual(expect.arrayContaining(["pt-1", "pt-2", "pt-3"]));
  });
});

describe("bulk_propose_grade — descritor de tool", () => {
  it("registra como write tool: requiresConfirmation=true, auditLevel=persist, gateByTier Pro+", async () => {
    const { bulkProposeGradeTool } = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    expect(bulkProposeGradeTool.name).toBe("bulk_propose_grade");
    expect(bulkProposeGradeTool.requiresConfirmation).toBe(true);
    expect(bulkProposeGradeTool.auditLevel).toBe("persist");
    expect(Array.isArray(bulkProposeGradeTool.gateByTier)).toBe(true);
    expect(bulkProposeGradeTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
    expect(typeof bulkProposeGradeTool.executeConfirmed).toBe("function");
    expect(typeof bulkProposeGradeTool.undo).toBe("function");
  });
});
