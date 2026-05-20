// =============================================================================
// Sprint AI-2A — Integration: mark_off_day + bulk_propose_grade.
//
// Cobre o efeito colateral cross-tool:
//   1. mark_off_day(2026-05-30) -> cria user_off_days row.
//   2. bulk_propose_grade para semana 2026-05-25 com daysOfWeek=[6] (sábado).
//   3. Strict mode rejeita (conflict reason='off_day' + strictWouldReject=true).
//
// Demonstra interplay entre 2 tools AI-2A.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("mark_off_day + bulk_propose_grade — cross-tool", () => {
  it("off day sábado 2026-05-30 -> bulk strict para daysOfWeek=[6] rejeita", async () => {
    const offDays: Date[] = [new Date("2026-05-30")];
    const injectedStorage: any = {
      // mark_off_day
      countPlannedTournamentsForDate: vi.fn(async () => 0),
      createUserOffDay: vi.fn(async (p: any) => ({ id: "od-1", ...p, created: true })),
      deleteUserOffDay: vi.fn(async () => undefined),
      // bulk_propose_grade
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "T", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 100, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => []),
      listOffDaysForUser: vi.fn(async () => offDays),
      createPlannedTournament: vi.fn(),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));

    // 1. mark_off_day
    const { markOffDayTool } = await import("../../../../server/coachTools/handlers/markOffDay");
    await markOffDayTool.executeConfirmed!(
      { offDate: "2026-05-30" },
      { userId: "U", injectedStorage } as any,
      undefined,
    );

    // 2. bulk_propose_grade strict para sabado
    const { bulkProposeGradeTool } = await import(
      "../../../../server/coachTools/handlers/bulkProposeGrade"
    );
    const out = await bulkProposeGradeTool.executeConfirmed!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [6], strict: true, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    ).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    expect(JSON.stringify(out)).toMatch(/strict_conflict|off_day/);
    expect(injectedStorage.createPlannedTournament).not.toHaveBeenCalled();
  });
});
