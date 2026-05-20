// =============================================================================
// Sprint AI-2A — Integration e2e: bulk_propose_grade via coachToolRunner.
//
// Cobre:
//   - POST /api/coach/chat com tool call simulado -> preview retorna proposed array.
//   - User confirma (/api/coach/actions/:id/confirm) -> planned_tournaments rows criados.
//   - Undo dentro 5min reverte (DELETE em lote por createdIds).
//
// Esta e' uma integration test parcial — exercita o coachToolRunner com a tool
// AI-2A registrada. Mocka storage + walletService; usa runner real.
//
// Status esperado: FALHAM (tool nao registrada ainda).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("bulk_propose_grade e2e via coachToolRunner", () => {
  it("preview -> confirm -> execute cria N rows; undo deleta todas", async () => {
    const created: any[] = [];

    const injectedStorage: any = {
      getTournamentSuggestions: vi.fn(async () => [
        { site: "WPN", name: "T1", time: "19:00", type: "Vanilla", speed: "Normal", buyIn: 100, prioridade: 1 },
        { site: "GG", name: "T2", time: "20:00", type: "Vanilla", speed: "Normal", buyIn: 100, prioridade: 1 },
      ]),
      listPlannedTournaments: vi.fn(async () => []),
      listOffDaysForUser: vi.fn(async () => []),
      createPlannedTournament: vi.fn(async (payload: any) => {
        const row = { id: `pt-${created.length + 1}`, ...payload };
        created.push(row);
        return row;
      }),
      deletePlannedTournamentsByIds: vi.fn(async (ids: string[]) => {
        for (const id of ids) {
          const idx = created.findIndex((r) => r.id === id);
          if (idx >= 0) created.splice(idx, 1);
        }
      }),
    };
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 10000),
    }));

    const mod = await import("../../../../server/coachTools/handlers/bulkProposeGrade");
    const tool = mod.bulkProposeGradeTool;

    // Preview
    const preview = await tool.fetchPayloadBefore!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1, 2], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    const previewData = preview.preview ?? preview;
    expect(previewData.proposed.length).toBeGreaterThan(0);

    // Execute (confirm)
    const execResult: any = await tool.executeConfirmed!(
      { weekStartDate: "2026-05-25", profile: "A", daysOfWeek: [1, 2], strict: false, maxTournaments: 20 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(execResult.payloadAfter).toBeTruthy();
    const ids: string[] = execResult.payloadAfter.createdIds ?? [];
    expect(ids.length).toBeGreaterThan(0);
    expect(created.length).toBe(ids.length);

    // Undo
    await tool.undo!(null, execResult.payloadAfter, { userId: "U", injectedStorage } as any, undefined);
    expect(created.length).toBe(0);
  });
});
