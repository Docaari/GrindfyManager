// =============================================================================
// Sprint AI-2B / RF-09.3 (ADR-173) — POST /api/coach/onboarding/accept-disclaimer
//
// Cobre:
//   - requireAuth obrigatório.
//   - Seta user_coach_preferences.disclaimer_accepted_at = NOW().
//   - Idempotente (chamar 2x não muda valor da primeira vez OU atualiza sempre — implementer escolhe;
//     o teste valida apenas que não há erro).
//   - Lesson #34: handler aceita injectedStorage 3o arg.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

function makeReq(userId = "USER-1"): any {
  return {
    user: { userPlatformId: userId, subscriptionPlan: "trial" },
    body: {},
  };
}

function makeRes(): any {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe("POST /api/coach/onboarding/accept-disclaimer", () => {
  it("seta disclaimer_accepted_at = NOW", async () => {
    const updateSpy = vi.fn(async (userId: string, payload: any) => undefined);
    const injectedStorage: any = {
      updateUserCoachPreferences: updateSpy,
    };
    const { handleAcceptDisclaimer } = await import("../../../../server/routes/coach");
    const req = makeReq();
    const res = makeRes();
    const before = Date.now();
    await handleAcceptDisclaimer(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0][1];
    expect(payload.disclaimerAcceptedAt).toBeTruthy();
    const accepted = new Date(payload.disclaimerAcceptedAt).getTime();
    expect(accepted).toBeGreaterThanOrEqual(before - 1000);
  });

  it("idempotente — 2 chamadas seguidas não dão erro", async () => {
    const updateSpy = vi.fn(async () => undefined);
    const injectedStorage: any = {
      updateUserCoachPreferences: updateSpy,
    };
    const { handleAcceptDisclaimer } = await import("../../../../server/routes/coach");
    const req = makeReq();
    const res1 = makeRes();
    const res2 = makeRes();
    await handleAcceptDisclaimer(req, res1, injectedStorage);
    await handleAcceptDisclaimer(req, res2, injectedStorage);
    expect(res1.status).toHaveBeenCalledWith(200);
    expect(res2.status).toHaveBeenCalledWith(200);
  });
});
