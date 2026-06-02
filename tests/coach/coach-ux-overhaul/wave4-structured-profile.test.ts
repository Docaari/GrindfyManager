// =============================================================================
// Wave 4 (#9) — GET/PUT /api/coach/structured-profile (perfil editavel).
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { handleGetStructuredProfile, handlePutStructuredProfile } from "../../../server/routes/coachAi1a";

function mockRes() {
  const res: any = { statusCode: 0, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}

describe("#9 — GET structured-profile", () => {
  it("retorna o perfil estruturado", async () => {
    const storage = { getAiStructuredProfile: vi.fn(async () => ({ nivel: "mid_consistente", focoDoMes: "ICM" })) };
    const req: any = { user: { userPlatformId: "USER-1" } };
    const res = mockRes();
    await handleGetStructuredProfile(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.structuredProfile.focoDoMes).toBe("ICM");
  });

  it("nao autenticado -> 401", async () => {
    const res = mockRes();
    await handleGetStructuredProfile({}, res, {});
    expect(res.statusCode).toBe(401);
  });
});

describe("#9 — PUT structured-profile", () => {
  function makeStore() {
    const state: any = {};
    return {
      state,
      getAiStructuredProfile: vi.fn(async () => ({ ...state })),
      updateAiStructuredProfile: vi.fn(async (_uid: string, delta: any) => {
        Object.assign(state, delta);
        return { ...state };
      }),
      upsertCoachPreferences: vi.fn(async () => ({})),
    };
  }

  it("grava foco + tom + metas e espelha o tom nas prefs", async () => {
    const storage = makeStore();
    const req: any = {
      user: { userPlatformId: "USER-1" },
      body: { focoDoMes: "PKO", tomPreferido: "direct", metas: [{ texto: "subir stake", prazo: "mes" }] },
    };
    const res = mockRes();
    await handlePutStructuredProfile(req, res, storage);
    expect(res.statusCode).toBe(200);
    const delta = storage.updateAiStructuredProfile.mock.calls[0][1];
    expect(delta.focoDoMes).toBe("PKO");
    expect(delta.tomPreferido).toBe("direct");
    expect(Array.isArray(delta.metas)).toBe(true);
    expect(storage.upsertCoachPreferences).toHaveBeenCalledWith("USER-1", { coachTone: "direct" });
  });

  it("body invalido (campo desconhecido) -> 400", async () => {
    const storage = makeStore();
    const req: any = { user: { userPlatformId: "USER-1" }, body: { xpto: 1 } };
    const res = mockRes();
    await handlePutStructuredProfile(req, res, storage);
    expect(res.statusCode).toBe(400);
  });

  it("focoDoMes null limpa o campo", async () => {
    const storage = makeStore();
    const req: any = { user: { userPlatformId: "USER-1" }, body: { focoDoMes: null } };
    const res = mockRes();
    await handlePutStructuredProfile(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.updateAiStructuredProfile.mock.calls[0][1].focoDoMes).toBeNull();
  });
});
