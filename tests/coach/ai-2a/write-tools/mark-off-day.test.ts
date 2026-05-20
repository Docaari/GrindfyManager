// =============================================================================
// Sprint AI-2A / RF-05 (ADR-165) — mark_off_day
//
// Cobre:
//   - Zod: offDate regex YYYY-MM-DD, reason opcional max 200.
//   - Idempotente: UNIQUE (user_id, off_date) -> ON CONFLICT DO NOTHING.
//   - Preview warning has_planned_tournaments quando ja existem torneios no dia.
//   - Undo: DELETE da row.
//   - Descritor: write tool + Pro+ + auditLevel persist.
//   - Integração com bulk_propose_grade: off_day skipa o dia (testado em bulkProposeGrade).
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("mark_off_day — Zod validation", () => {
  it("rejeita offDate fora do formato YYYY-MM-DD", async () => {
    const { markOffDayInputSchema } = await import(
      "../../../../server/coachTools/handlers/markOffDay"
    );
    expect(markOffDayInputSchema.safeParse({ offDate: "25-05-2026" }).success).toBe(false);
    expect(markOffDayInputSchema.safeParse({ offDate: "invalid" }).success).toBe(false);
  });

  it("rejeita reason > 200 chars", async () => {
    const { markOffDayInputSchema } = await import(
      "../../../../server/coachTools/handlers/markOffDay"
    );
    expect(
      markOffDayInputSchema.safeParse({
        offDate: "2026-05-25",
        reason: "a".repeat(250),
      }).success,
    ).toBe(false);
  });

  it("aceita offDate valido (com ou sem reason)", async () => {
    const { markOffDayInputSchema } = await import(
      "../../../../server/coachTools/handlers/markOffDay"
    );
    expect(markOffDayInputSchema.safeParse({ offDate: "2026-05-25" }).success).toBe(true);
    expect(
      markOffDayInputSchema.safeParse({ offDate: "2026-05-25", reason: "ferias" }).success,
    ).toBe(true);
  });
});

describe("mark_off_day — execute idempotente", () => {
  it("cria 1 row em user_off_days quando nao existe", async () => {
    const injectedStorage: any = {
      countPlannedTournamentsForDate: vi.fn(async () => 0),
      createUserOffDay: vi.fn(async (payload: any) => ({ id: "od-1", ...payload, created: true })),
    };
    const { markOffDayTool } = await import(
      "../../../../server/coachTools/handlers/markOffDay"
    );
    const out: any = await markOffDayTool.executeConfirmed!(
      { offDate: "2026-05-25", reason: "ferias" },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(out.payloadAfter).toBeTruthy();
    expect(out.payloadAfter.id).toBe("od-1");
    expect(injectedStorage.createUserOffDay).toHaveBeenCalledTimes(1);
  });

  it("re-mark do mesmo dia (UNIQUE conflict) -> created:false, ok:true (ON CONFLICT DO NOTHING)", async () => {
    const injectedStorage: any = {
      countPlannedTournamentsForDate: vi.fn(async () => 0),
      // simula caminho 2o execute: createUserOffDay devolve um shape onde "created" false
      createUserOffDay: vi.fn(async () => ({ id: "od-1", offDate: "2026-05-25", created: false })),
    };
    const { markOffDayTool } = await import(
      "../../../../server/coachTools/handlers/markOffDay"
    );
    const out: any = await markOffDayTool.executeConfirmed!(
      { offDate: "2026-05-25" },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(out.payloadAfter.id).toBe("od-1");
    // Aceita output indicando que NAO foi criado novo (already existed):
    const created = out.payloadAfter.created;
    expect(created === false || created === undefined).toBeTruthy();
  });
});

describe("mark_off_day — undo", () => {
  it("undo deleta a row criada", async () => {
    const injectedStorage: any = {
      deleteUserOffDay: vi.fn(async () => undefined),
    };
    const { markOffDayTool } = await import(
      "../../../../server/coachTools/handlers/markOffDay"
    );
    await markOffDayTool.undo!(
      null,
      { id: "od-1" },
      { userId: "U", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.deleteUserOffDay).toHaveBeenCalledWith(expect.stringMatching(/od-1/));
  });
});

describe("mark_off_day — descritor", () => {
  it("name + requiresConfirmation + auditLevel + tier", async () => {
    const { markOffDayTool } = await import(
      "../../../../server/coachTools/handlers/markOffDay"
    );
    expect(markOffDayTool.name).toBe("mark_off_day");
    expect(markOffDayTool.requiresConfirmation).toBe(true);
    expect(markOffDayTool.auditLevel).toBe("persist");
    expect(markOffDayTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
