// =============================================================================
// Sprint AI-2B / RF-06 (ADR-171) — log_mental_hand (write, confirm v1)
//
// Cobre:
//   - Descritor: name + requiresConfirmation:true + auditLevel:'persist' + Pro+/Trial.
//   - Zod: situation (1..1000), emotion enum, realResponse (1..1000), idealResponse (1..1000),
//     tags array <= 10, linkedGrindSessionId?, occurredAt? ISO default now.
//   - Preview echo do input com id proposto via nanoid.
//   - Execute (após confirm): INSERT mental_hand_history via createMentalHand.
//   - Undo: DELETE.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("log_mental_hand — descritor", () => {
  it("name + requiresConfirmation:true + auditLevel:'persist' + Pro+", async () => {
    const { logMentalHandTool } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    expect(logMentalHandTool.name).toBe("log_mental_hand");
    expect(logMentalHandTool.requiresConfirmation).toBe(true);
    expect(logMentalHandTool.auditLevel).toBe("persist");
    expect(logMentalHandTool.gateByTier).toEqual(
      expect.arrayContaining(["pro", "premium", "admin"]),
    );
  });
});

describe("log_mental_hand — Zod validation", () => {
  it("rejeita situation vazia", async () => {
    const { logMentalHandInputSchema } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    expect(
      logMentalHandInputSchema.safeParse({
        situation: "",
        emotion: "tilt",
        realResponse: "x",
        idealResponse: "y",
      }).success,
    ).toBe(false);
  });

  it("rejeita situation > 1000 chars", async () => {
    const { logMentalHandInputSchema } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    expect(
      logMentalHandInputSchema.safeParse({
        situation: "a".repeat(1500),
        emotion: "tilt",
        realResponse: "x",
        idealResponse: "y",
      }).success,
    ).toBe(false);
  });

  it("rejeita emotion fora do enum", async () => {
    const { logMentalHandInputSchema } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    expect(
      logMentalHandInputSchema.safeParse({
        situation: "BB 30 vs UTG",
        emotion: "raiva",
        realResponse: "fold",
        idealResponse: "call",
      }).success,
    ).toBe(false);
  });

  it("aceita emotions válidas", async () => {
    const { logMentalHandInputSchema } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    const emotions = ["frustration", "tilt", "fear", "overconfidence", "fatigue", "other"];
    for (const emotion of emotions) {
      expect(
        logMentalHandInputSchema.safeParse({
          situation: "x",
          emotion,
          realResponse: "y",
          idealResponse: "z",
        }).success,
      ).toBe(true);
    }
  });

  it("rejeita tags > 10", async () => {
    const { logMentalHandInputSchema } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    expect(
      logMentalHandInputSchema.safeParse({
        situation: "x",
        emotion: "tilt",
        realResponse: "y",
        idealResponse: "z",
        tags: Array.from({ length: 15 }, (_, i) => `tag${i}`),
      }).success,
    ).toBe(false);
  });

  it("rejeita realResponse vazio", async () => {
    const { logMentalHandInputSchema } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    expect(
      logMentalHandInputSchema.safeParse({
        situation: "x",
        emotion: "tilt",
        realResponse: "",
        idealResponse: "z",
      }).success,
    ).toBe(false);
  });
});

describe("log_mental_hand — preview", () => {
  it("payloadBefore null + payloadAfter echo do input", async () => {
    const { logMentalHandTool } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    const out: any = await logMentalHandTool.preview!(
      {
        situation: "BB 30 vs UTG opener 22",
        emotion: "tilt",
        realResponse: "call",
        idealResponse: "fold",
      },
      { userId: "USER-1" } as any,
    );
    expect(out.payloadBefore).toBeNull();
    expect(out.payloadAfter).toBeTruthy();
    expect(out.payloadAfter.situation).toBe("BB 30 vs UTG opener 22");
    expect(out.payloadAfter.emotion).toBe("tilt");
  });
});

describe("log_mental_hand — execute (após confirm)", () => {
  it("INSERT mental_hand_history via createMentalHand", async () => {
    const injectedStorage: any = {
      createMentalHand: vi.fn(async (payload: any) => ({
        id: "mh-1",
        ...payload,
        createdAt: new Date(),
      })),
    };
    const { logMentalHandTool } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    const out: any = await logMentalHandTool.executeConfirmed!(
      {
        situation: "BB 30",
        emotion: "tilt",
        realResponse: "call",
        idealResponse: "fold",
      },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.createMentalHand).toHaveBeenCalledTimes(1);
    expect(out.payloadAfter.id).toBe("mh-1");
  });

  it("occurredAt default = now() quando ausente", async () => {
    let captured: any = null;
    const injectedStorage: any = {
      createMentalHand: vi.fn(async (payload: any) => {
        captured = payload;
        return { id: "mh-2", ...payload };
      }),
    };
    const before = Date.now();
    const { logMentalHandTool } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    await logMentalHandTool.executeConfirmed!(
      {
        situation: "x",
        emotion: "fear",
        realResponse: "y",
        idealResponse: "z",
      },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    const after = Date.now();
    expect(captured.occurredAt).toBeTruthy();
    const occurredAtMs = new Date(captured.occurredAt).getTime();
    expect(occurredAtMs).toBeGreaterThanOrEqual(before);
    expect(occurredAtMs).toBeLessThanOrEqual(after);
  });
});

describe("log_mental_hand — undo", () => {
  it("undo deleta a row criada", async () => {
    const injectedStorage: any = {
      deleteMentalHand: vi.fn(async () => undefined),
    };
    const { logMentalHandTool } = await import(
      "../../../../server/coachTools/handlers/logMentalHand"
    );
    await logMentalHandTool.undo!(
      null,
      { id: "mh-1" },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.deleteMentalHand).toHaveBeenCalledWith(
      expect.stringMatching(/mh-1/),
    );
  });
});
