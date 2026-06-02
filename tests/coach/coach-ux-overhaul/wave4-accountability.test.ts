// =============================================================================
// Wave 4 (#8) — log_commitment tool + bFollowupTick (accountability).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logCommitmentTool, logCommitmentInputSchema } from "../../../server/coachTools/handlers/logCommitment";

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
beforeEach(() => vi.resetModules());
afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
});

describe("#8 — logCommitmentTool", () => {
  it("schema valida dueDate YYYY-MM-DD + text", () => {
    expect(logCommitmentInputSchema.safeParse({ text: "estudar PKO", dueDate: "2026-06-07" }).success).toBe(true);
    expect(logCommitmentInputSchema.safeParse({ text: "x", dueDate: "07/06" }).success).toBe(false);
    expect(logCommitmentInputSchema.safeParse({ text: "ab", dueDate: "2026-06-07" }).success).toBe(false); // text<3
  });

  it("executeConfirmed cria o compromisso (source=tool)", async () => {
    const created = { id: "c1", text: "estudar PKO essa semana", dueDate: "2026-06-07" };
    const storage = { createCoachCommitment: vi.fn(async () => created) };
    const out = await (logCommitmentTool as any).executeConfirmed(
      { text: "estudar PKO essa semana", category: "study", dueDate: "2026-06-07" },
      { userId: "USER-1", chatSessionId: "cs-1", injectedStorage: storage },
    );
    expect(storage.createCoachCommitment).toHaveBeenCalledTimes(1);
    const arg = storage.createCoachCommitment.mock.calls[0][0];
    expect(arg.userId).toBe("USER-1");
    expect(arg.source).toBe("tool");
    expect(arg.dueDate).toBe("2026-06-07");
    expect(out.affectedEntityType).toBe("coach_commitments");
    expect(out.output.commitmentId).toBe("c1");
  });

  it("undo -> status cancelled", async () => {
    const storage = { updateCoachCommitmentStatus: vi.fn(async () => {}) };
    await (logCommitmentTool as any).undo(null, { id: "c1" }, { userId: "USER-1", injectedStorage: storage });
    expect(storage.updateCoachCommitmentStatus).toHaveBeenCalledWith("c1", "cancelled");
  });

  it("tier gate Pro+ (free fora)", () => {
    expect((logCommitmentTool as any).gateByTier).toContain("pro");
    expect((logCommitmentTool as any).gateByTier).not.toContain("free");
    expect((logCommitmentTool as any).requiresConfirmation).toBe(true);
  });
});

describe("#8 — bFollowupTick", () => {
  function mockEngine(allow: boolean) {
    vi.doMock("../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow, reason: allow ? undefined : "quiet_hours" })),
    }));
  }

  it("compromisso vencido + allow -> nudge B-FOLLOWUP + marca followedUp", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    mockEngine(true);
    const storage: any = {
      listDueCoachCommitments: vi.fn(async () => [{ id: "c1", userId: "USER-1", text: "estudar PKO", dueDate: "2026-06-01" }]),
      createChatSession: vi.fn(async () => ({ id: "cs" })),
      insertChatMessage: vi.fn(async () => ({ id: "m" })),
      createNudgeLog: vi.fn(async () => "nl"),
      markCoachCommitmentFollowedUp: vi.fn(async () => {}),
    };
    const { bFollowupTick } = await import("../../../server/coach/jobs/bFollowup");
    await bFollowupTick({ now: new Date("2026-06-05T15:00:00Z"), injectedStorage: storage });
    expect(storage.createNudgeLog).toHaveBeenCalledTimes(1);
    expect(storage.createNudgeLog.mock.calls[0][0].category).toBe("B-FOLLOWUP");
    expect(storage.markCoachCommitmentFollowedUp).toHaveBeenCalledWith("c1");
  });

  it("not allow (quiet hours) -> NAO marca (re-tenta depois)", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    mockEngine(false);
    const storage: any = {
      listDueCoachCommitments: vi.fn(async () => [{ id: "c1", userId: "USER-1", text: "x", dueDate: "2026-06-01" }]),
      createNudgeLog: vi.fn(async () => "nl"),
      markCoachCommitmentFollowedUp: vi.fn(async () => {}),
    };
    const { bFollowupTick } = await import("../../../server/coach/jobs/bFollowup");
    await bFollowupTick({ now: new Date("2026-06-05T03:00:00Z"), injectedStorage: storage });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
    expect(storage.markCoachCommitmentFollowedUp).not.toHaveBeenCalled();
  });

  it("kill switch -> early return", async () => {
    process.env.COACH_NUDGES_ENABLED = "false";
    mockEngine(true);
    const storage: any = { listDueCoachCommitments: vi.fn(async () => []), createNudgeLog: vi.fn() };
    const { bFollowupTick } = await import("../../../server/coach/jobs/bFollowup");
    await bFollowupTick({ now: new Date(), injectedStorage: storage });
    expect(storage.listDueCoachCommitments).not.toHaveBeenCalled();
  });
});
