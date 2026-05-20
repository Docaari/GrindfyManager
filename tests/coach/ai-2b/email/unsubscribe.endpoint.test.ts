// =============================================================================
// Sprint AI-2B / RF-07.4 (ADR-172 §2.6) — GET /api/coach/email/unsubscribe
//
// Cobre:
//   - Token format: ${userId}.${kind}.${expiresAt}.${hmac} (URL-safe).
//   - HMAC SHA256 com secret EMAIL_UNSUBSCRIBE_SECRET ?? JWT_SECRET.
//   - Valid + não expirado → UPDATE user_coach_preferences.email_X_enabled=false +
//     retorna HTML 200 confirmação.
//   - Token expirado (expiresAt < now) → 400.
//   - HMAC inválido → 400.
//   - Token malformed (não 4 partes) → 400.
//   - Endpoint público (sem requireAuth).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

const ORIGINAL_SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET;
const ORIGINAL_JWT = process.env.JWT_SECRET;

beforeEach(() => {
  vi.resetModules();
  process.env.JWT_SECRET = "test-jwt-secret";
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  else process.env.EMAIL_UNSUBSCRIBE_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_JWT === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT;
});

function buildToken(userId: string, kind: string, expiresAt: number, secret: string): string {
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${userId}|${kind}|${expiresAt}`)
    .digest("hex");
  return `${userId}.${kind}.${expiresAt}.${hmac}`;
}

function makeReq(token?: string): any {
  return { query: { token } };
}

function makeRes(): any {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
  };
}

describe("GET /api/coach/email/unsubscribe — happy path", () => {
  it("token válido → UPDATE pref + 200 HTML", async () => {
    const updateSpy = vi.fn(async () => undefined);
    const injectedStorage: any = {
      setEmailOptIn: updateSpy,
    };
    const expiresAt = Date.now() + 365 * 86400 * 1000;
    const token = buildToken("USER-1", "report_weekly", expiresAt, "test-jwt-secret");
    const { handleUnsubscribeEmail } = await import("../../../../server/routes/coach");
    const req = makeReq(token);
    const res = makeRes();
    await handleUnsubscribeEmail(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalledWith("USER-1", "report_weekly", false);
  });
});

describe("GET /api/coach/email/unsubscribe — token expirado", () => {
  it("expiresAt < now → 400", async () => {
    const injectedStorage: any = { setEmailOptIn: vi.fn() };
    const expiresAt = Date.now() - 1000;
    const token = buildToken("USER-1", "report_weekly", expiresAt, "test-jwt-secret");
    const { handleUnsubscribeEmail } = await import("../../../../server/routes/coach");
    const req = makeReq(token);
    const res = makeRes();
    await handleUnsubscribeEmail(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(injectedStorage.setEmailOptIn).not.toHaveBeenCalled();
  });
});

describe("GET /api/coach/email/unsubscribe — HMAC inválido", () => {
  it("HMAC tamper → 400", async () => {
    const injectedStorage: any = { setEmailOptIn: vi.fn() };
    const expiresAt = Date.now() + 1000000;
    const validToken = buildToken("USER-1", "report_weekly", expiresAt, "wrong-secret");
    const { handleUnsubscribeEmail } = await import("../../../../server/routes/coach");
    const req = makeReq(validToken);
    const res = makeRes();
    await handleUnsubscribeEmail(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("GET /api/coach/email/unsubscribe — token malformed", () => {
  it("token sem 4 partes → 400", async () => {
    const injectedStorage: any = { setEmailOptIn: vi.fn() };
    const { handleUnsubscribeEmail } = await import("../../../../server/routes/coach");
    const req = makeReq("malformed-token");
    const res = makeRes();
    await handleUnsubscribeEmail(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("token ausente → 400", async () => {
    const injectedStorage: any = { setEmailOptIn: vi.fn() };
    const { handleUnsubscribeEmail } = await import("../../../../server/routes/coach");
    const req = makeReq();
    const res = makeRes();
    await handleUnsubscribeEmail(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("GET /api/coach/email/unsubscribe — EMAIL_UNSUBSCRIBE_SECRET override", () => {
  it("usa EMAIL_UNSUBSCRIBE_SECRET quando definido (não JWT_SECRET)", async () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "specific-unsub-secret";
    const updateSpy = vi.fn(async () => undefined);
    const injectedStorage: any = { setEmailOptIn: updateSpy };
    const expiresAt = Date.now() + 1000000;
    const token = buildToken("USER-1", "report_monthly", expiresAt, "specific-unsub-secret");
    const { handleUnsubscribeEmail } = await import("../../../../server/routes/coach");
    const req = makeReq(token);
    const res = makeRes();
    await handleUnsubscribeEmail(req, res, injectedStorage);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalledWith("USER-1", "report_monthly", false);
  });
});
