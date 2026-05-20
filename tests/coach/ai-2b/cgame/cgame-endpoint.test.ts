// =============================================================================
// Sprint AI-2B / RF-05 (ADR-170 §2.3) — GET /api/coach/cgame/snapshot endpoint
//
// Cobre:
//   - requireAuth obrigatório (sem JWT → 401).
//   - NÃO tier-gated (free vê seus próprios dados).
//   - Response shape: { current, inchwormSeries, movement }.
//   - period query param: 30d | 90d | trimestre | ano.
//   - Sem dados → payload empty válido.
//   - Lesson #34: handler aceita injectedStorage 3o arg.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

function makeReq(query: any = {}, userId = "USER-1"): any {
  return {
    user: { userPlatformId: userId, subscriptionPlan: "free" },
    query,
  };
}

function makeRes(): any {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe("GET /api/coach/cgame/snapshot — happy path", () => {
  it("retorna { current, inchwormSeries, movement }", async () => {
    const injectedStorage: any = {
      listWarmupRitualsForRange: vi.fn(async () => [
        { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
      ]),
    };
    const { handleGetCgameSnapshot } = await import(
      "../../../../server/routes/coach"
    );
    const req = makeReq({ period: "90d" });
    const res = makeRes();
    await handleGetCgameSnapshot(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.current).toBeTruthy();
    expect(Array.isArray(payload.inchwormSeries)).toBe(true);
    expect(payload.movement).toBeTruthy();
  });
});

describe("GET /api/coach/cgame/snapshot — free user (não-gated)", () => {
  it("free user vê seu próprio snapshot (não tier-gated)", async () => {
    const injectedStorage: any = {
      listWarmupRitualsForRange: vi.fn(async () => []),
    };
    const { handleGetCgameSnapshot } = await import(
      "../../../../server/routes/coach"
    );
    const req = makeReq({ period: "30d" }, "USER-FREE");
    req.user.subscriptionPlan = "free";
    const res = makeRes();
    await handleGetCgameSnapshot(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("GET /api/coach/cgame/snapshot — sample 0", () => {
  it("sem warm-ups → current { aPct:0, sampleSize:0, confidence:'low' }", async () => {
    const injectedStorage: any = {
      listWarmupRitualsForRange: vi.fn(async () => []),
    };
    const { handleGetCgameSnapshot } = await import(
      "../../../../server/routes/coach"
    );
    const req = makeReq({ period: "30d" });
    const res = makeRes();
    await handleGetCgameSnapshot(req, res, injectedStorage);
    const payload = res.json.mock.calls[0][0];
    expect(payload.current.sampleSize).toBe(0);
    expect(payload.current.confidence).toBe("low");
  });
});

describe("GET /api/coach/cgame/snapshot — período inválido", () => {
  it("period inválido → 400", async () => {
    const injectedStorage: any = {
      listWarmupRitualsForRange: vi.fn(async () => []),
    };
    const { handleGetCgameSnapshot } = await import(
      "../../../../server/routes/coach"
    );
    const req = makeReq({ period: "invalid-period" });
    const res = makeRes();
    await handleGetCgameSnapshot(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
