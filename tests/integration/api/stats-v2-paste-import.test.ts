// =============================================================================
// Sprint Stats-V2 — Paste import preview endpoint (RF-05)
//
// Red phase. Endpoint POST /api/hud-stat-snapshots/preview ainda nao existe.
//
// Espec:
//   - body { pasted: string }
//   - retorna { matched, unmatched, invalid }
//   - protegido (requireAuth)
//   - rate-limited
//   - body grande > 50KB rejeitado 413
//
// Pattern segue bankroll.test.ts: testa handler isolado mockando deps.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do parser do client (handler V2 deve reusar parser shared OU duplicar)
vi.mock("../../../shared/snapshot-import-parser", () => ({
  parsePastedSnapshot: vi.fn().mockReturnValue({
    matched: { vpip: 22.5 },
    unmatched: [],
    invalid: [],
  }),
}));

import { handlePostPasteImportPreview } from "../../../server/routes/statsAnalyzerImport";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: "USER-0001" },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

describe("POST /api/hud-stat-snapshots/preview", () => {
  it("retorna { matched, unmatched, invalid } com body { pasted }", async () => {
    const req = makeReq({ body: { pasted: "VPIP\t22.5" } });
    const res = makeRes();
    await handlePostPasteImportPreview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("matched");
    expect(res.body).toHaveProperty("unmatched");
    expect(res.body).toHaveProperty("invalid");
  });

  it("400 quando body.pasted ausente ou nao string", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await handlePostPasteImportPreview(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400 quando body.pasted e numero (type guard)", async () => {
    const req = makeReq({ body: { pasted: 123 } });
    const res = makeRes();
    await handlePostPasteImportPreview(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("413 quando body.pasted maior que 50KB", async () => {
    const huge = "VPIP\t22.5\n".repeat(6000); // ~60KB
    const req = makeReq({
      body: { pasted: huge },
      headers: { "content-length": String(huge.length) },
    });
    const res = makeRes();
    await handlePostPasteImportPreview(req, res);
    expect(res.statusCode).toBe(413);
  });

  it("rejeita request sem userPlatformId (auth handler)", async () => {
    const req = makeReq({ user: null });
    const res = makeRes();
    await handlePostPasteImportPreview(req, res);
    // requireAuth normalmente rejeita antes; quando handler eh chamado direto,
    // ele deve fail-safe com 401 OU 400.
    expect([401, 400]).toContain(res.statusCode);
  });
});
