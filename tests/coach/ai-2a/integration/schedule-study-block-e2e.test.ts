// =============================================================================
// Sprint AI-2A — Integration e2e: schedule_study_block.
//
// preview -> execute -> undo (DELETE study_sessions_v2 row).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("schedule_study_block e2e", () => {
  it("execute cria row + undo deleta", async () => {
    const sessions: any[] = [];
    const injectedStorage: any = {
      getStudyTheme: vi.fn(async () => ({ id: "th-1", userId: "U" })),
      createStudySessionV2: vi.fn(async (p: any) => {
        const row = { id: "ss-1", ...p };
        sessions.push(row);
        return row;
      }),
      deleteStudySessionV2: vi.fn(async (id: string) => {
        const idx = sessions.findIndex((s) => s.id === id);
        if (idx >= 0) sessions.splice(idx, 1);
      }),
      listStudySessionsV2InRange: vi.fn(async () => []),
    };
    const { scheduleStudyBlockTool } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const exec: any = await scheduleStudyBlockTool.executeConfirmed!(
      {
        topic: "ICM final",
        studyThemeId: "th-1",
        startAt: "2026-05-25T20:00:00Z",
        durationMinutes: 60,
      },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(sessions.length).toBe(1);
    await scheduleStudyBlockTool.undo!(null, exec.payloadAfter, { userId: "U", injectedStorage } as any, undefined);
    expect(sessions.length).toBe(0);
  });
});
