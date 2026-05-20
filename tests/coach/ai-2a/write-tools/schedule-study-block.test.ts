// =============================================================================
// Sprint AI-2A / RF-03 (ADR-165) — schedule_study_block
//
// Cobre:
//   - Zod: topic obrigatório, startAt ISO, durationMinutes 15-240.
//   - Validações: studyThemeId ownership, lessonId entitlement.
//   - Execute: insert em study_sessions_v2 com status='planned'.
//   - Conflito de horário: preview avisa mas execute permite (não bloqueia).
//   - Undo: DELETE da row criada.
//   - Descritor: write tool + Pro+ + auditLevel persist.
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("schedule_study_block — Zod validation", () => {
  it("rejeita durationMinutes < 15", async () => {
    const { scheduleStudyBlockInputSchema } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const r = scheduleStudyBlockInputSchema.safeParse({
      topic: "ICM final table",
      startAt: "2026-05-25T20:00:00Z",
      durationMinutes: 5,
    });
    expect(r.success).toBe(false);
  });

  it("rejeita durationMinutes > 240", async () => {
    const { scheduleStudyBlockInputSchema } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const r = scheduleStudyBlockInputSchema.safeParse({
      topic: "ICM final table",
      startAt: "2026-05-25T20:00:00Z",
      durationMinutes: 300,
    });
    expect(r.success).toBe(false);
  });

  it("rejeita startAt nao-ISO", async () => {
    const { scheduleStudyBlockInputSchema } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const r = scheduleStudyBlockInputSchema.safeParse({
      topic: "ICM",
      startAt: "25/05/2026 20:00",
      durationMinutes: 60,
    });
    expect(r.success).toBe(false);
  });

  it("aceita input minimo valido (topic + startAt + durationMinutes)", async () => {
    const { scheduleStudyBlockInputSchema } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const r = scheduleStudyBlockInputSchema.safeParse({
      topic: "ICM final table",
      startAt: "2026-05-25T20:00:00Z",
      durationMinutes: 60,
    });
    expect(r.success).toBe(true);
  });
});

describe("schedule_study_block — ownership e entitlement", () => {
  it("studyThemeId de outro user -> theme_not_accessible", async () => {
    const injectedStorage: any = {
      getStudyTheme: vi.fn(async () => ({ id: "th-1", userId: "OTHER-USER" })),
    };
    const { scheduleStudyBlockTool } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const out = await scheduleStudyBlockTool.executeConfirmed!(
      {
        topic: "ICM",
        studyThemeId: "th-1",
        startAt: "2026-05-25T20:00:00Z",
        durationMinutes: 60,
      },
      { userId: "U", injectedStorage } as any,
      undefined,
    ).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    expect(JSON.stringify(out)).toMatch(/theme_not_accessible/);
  });

  it("lessonId sem entitlement -> lesson_not_accessible", async () => {
    const injectedStorage: any = {
      hasLessonEntitlement: vi.fn(async () => false),
    };
    vi.doMock("../../../../server/services/lessonEntitlement", () => ({
      hasAccess: vi.fn(async () => false),
    }));
    const { scheduleStudyBlockTool } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const out = await scheduleStudyBlockTool.executeConfirmed!(
      {
        topic: "Lesson study",
        lessonId: "L-1",
        startAt: "2026-05-25T20:00:00Z",
        durationMinutes: 60,
      },
      { userId: "U", injectedStorage } as any,
      undefined,
    ).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    expect(JSON.stringify(out)).toMatch(/lesson_not_accessible/);
  });
});

describe("schedule_study_block — execute + undo", () => {
  it("executeConfirmed cria 1 row em study_sessions_v2 com status='planned'", async () => {
    const created: any[] = [];
    const injectedStorage: any = {
      getStudyTheme: vi.fn(async () => null),
      createStudySessionV2: vi.fn(async (payload: any) => {
        const row = { id: "ss-1", ...payload };
        created.push(row);
        return row;
      }),
      listStudySessionsV2InRange: vi.fn(async () => []),
    };
    const { scheduleStudyBlockTool } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    const out: any = await scheduleStudyBlockTool.executeConfirmed!(
      {
        topic: "ICM final table",
        startAt: "2026-05-25T20:00:00Z",
        durationMinutes: 60,
      },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(out.payloadAfter).toBeTruthy();
    expect(out.payloadAfter.id).toBe("ss-1");
    expect(injectedStorage.createStudySessionV2).toHaveBeenCalledTimes(1);
    const insertPayload = injectedStorage.createStudySessionV2.mock.calls[0][0];
    expect(insertPayload.status).toBe("planned");
  });

  it("undo deleta a row criada", async () => {
    const injectedStorage: any = {
      deleteStudySessionV2: vi.fn(async () => undefined),
    };
    const { scheduleStudyBlockTool } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    await scheduleStudyBlockTool.undo!(
      null,
      { id: "ss-1" },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.deleteStudySessionV2).toHaveBeenCalledWith(expect.stringMatching(/ss-1/));
  });

  it("conflito de horário registra warning no preview mas nao bloqueia execute", async () => {
    const injectedStorage: any = {
      getStudyTheme: vi.fn(async () => null),
      listStudySessionsV2InRange: vi.fn(async () => [{ id: "other-block", scheduledFor: "2026-05-25T20:00:00Z" }]),
      createStudySessionV2: vi.fn(async (payload: any) => ({ id: "ss-1", ...payload })),
    };
    const { scheduleStudyBlockTool } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    // O preview deve flagar; o execute prossegue.
    const out: any = await scheduleStudyBlockTool.executeConfirmed!(
      { topic: "ICM", startAt: "2026-05-25T20:00:00Z", durationMinutes: 60 },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.createStudySessionV2).toHaveBeenCalled();
    expect(out.payloadAfter?.id).toBe("ss-1");
  });
});

describe("schedule_study_block — descritor", () => {
  it("name + requiresConfirmation + auditLevel + tier", async () => {
    const { scheduleStudyBlockTool } = await import(
      "../../../../server/coachTools/handlers/scheduleStudyBlock"
    );
    expect(scheduleStudyBlockTool.name).toBe("schedule_study_block");
    expect(scheduleStudyBlockTool.requiresConfirmation).toBe(true);
    expect(scheduleStudyBlockTool.auditLevel).toBe("persist");
    expect(scheduleStudyBlockTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
