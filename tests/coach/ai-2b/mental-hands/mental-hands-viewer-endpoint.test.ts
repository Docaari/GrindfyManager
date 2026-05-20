// =============================================================================
// Sprint AI-2B / RF-06 (ADR-171 §2.3) — endpoints HTTP mental_hands
//
// Cobre:
//   - GET /api/coach/mental-hands?limit=20&offset=0&emotion=... paginado.
//   - POST /api/coach/mental-hands aberto a free + UI form.
//   - POST com rate limit 20/dia/user (anti-abuse).
//   - DELETE /api/coach/mental-hands/:id ownership 404 (não 403 — não vaza existência).
//   - Lesson #34: handlers aceitam injectedStorage 3o arg.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

function makeReq(opts: Partial<{ user: any; query: any; body: any; params: any }> = {}): any {
  return {
    user: opts.user ?? { userPlatformId: "USER-1", subscriptionPlan: "free" },
    query: opts.query ?? {},
    body: opts.body ?? {},
    params: opts.params ?? {},
  };
}

function makeRes(): any {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe("GET /api/coach/mental-hands — paginação + filtro", () => {
  it("lista paginada (default limit=20, offset=0)", async () => {
    const injectedStorage: any = {
      listMentalHandsPaginated: vi.fn(async () => [
        { id: "mh-1", emotion: "tilt", situation: "s1", createdAt: new Date() },
      ]),
    };
    const { handleListMentalHands } = await import("../../../../server/routes/coach");
    const req = makeReq({ query: {} });
    const res = makeRes();
    await handleListMentalHands(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(injectedStorage.listMentalHandsPaginated).toHaveBeenCalledWith(
      "USER-1",
      expect.objectContaining({ limit: 20, offset: 0 }),
      expect.anything(),
    );
  });

  it("filter por emotion", async () => {
    const injectedStorage: any = {
      listMentalHandsPaginated: vi.fn(async () => []),
    };
    const { handleListMentalHands } = await import("../../../../server/routes/coach");
    const req = makeReq({ query: { emotion: "tilt", limit: "50", offset: "10" } });
    const res = makeRes();
    await handleListMentalHands(req, res, injectedStorage);
    expect(injectedStorage.listMentalHandsPaginated).toHaveBeenCalledWith(
      "USER-1",
      expect.objectContaining({ limit: 50, offset: 10, emotion: "tilt" }),
      expect.anything(),
    );
  });
});

describe("POST /api/coach/mental-hands — aberto a free", () => {
  it("free user cria entry direta (UI form)", async () => {
    const injectedStorage: any = {
      countMentalHandsCreatedToday: vi.fn(async () => 5),
      createMentalHand: vi.fn(async (payload: any) => ({
        id: "mh-new",
        ...payload,
      })),
    };
    const { handleCreateMentalHand } = await import("../../../../server/routes/coach");
    const req = makeReq({
      user: { userPlatformId: "USER-FREE", subscriptionPlan: "free" },
      body: {
        situation: "BB 30 vs UTG",
        emotion: "tilt",
        realResponse: "call",
        idealResponse: "fold",
      },
    });
    const res = makeRes();
    await handleCreateMentalHand(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(injectedStorage.createMentalHand).toHaveBeenCalled();
  });

  it("rate limit 20/dia/user → 429 quando count >= 20", async () => {
    const injectedStorage: any = {
      countMentalHandsCreatedToday: vi.fn(async () => 20),
      createMentalHand: vi.fn(),
    };
    const { handleCreateMentalHand } = await import("../../../../server/routes/coach");
    const req = makeReq({
      body: {
        situation: "x",
        emotion: "tilt",
        realResponse: "y",
        idealResponse: "z",
      },
    });
    const res = makeRes();
    await handleCreateMentalHand(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(injectedStorage.createMentalHand).not.toHaveBeenCalled();
  });

  it("Zod inválido → 400", async () => {
    const injectedStorage: any = {
      countMentalHandsCreatedToday: vi.fn(async () => 0),
      createMentalHand: vi.fn(),
    };
    const { handleCreateMentalHand } = await import("../../../../server/routes/coach");
    const req = makeReq({
      body: { situation: "x" }, // missing required fields
    });
    const res = makeRes();
    await handleCreateMentalHand(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("DELETE /api/coach/mental-hands/:id — ownership", () => {
  it("user proprietário → 204", async () => {
    const injectedStorage: any = {
      getMentalHand: vi.fn(async () => ({ id: "mh-1", userId: "USER-1" })),
      deleteMentalHand: vi.fn(async () => undefined),
    };
    const { handleDeleteMentalHand } = await import("../../../../server/routes/coach");
    const req = makeReq({ params: { id: "mh-1" } });
    const res = makeRes();
    await handleDeleteMentalHand(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("outro user tenta DELETE → 404 (não 403 — não vaza existência)", async () => {
    const injectedStorage: any = {
      getMentalHand: vi.fn(async () => null),
      deleteMentalHand: vi.fn(),
    };
    const { handleDeleteMentalHand } = await import("../../../../server/routes/coach");
    const req = makeReq({ params: { id: "mh-other" } });
    const res = makeRes();
    await handleDeleteMentalHand(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(injectedStorage.deleteMentalHand).not.toHaveBeenCalled();
  });
});
