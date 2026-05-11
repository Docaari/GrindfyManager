/**
 * Refresh token rotation + family/reuse detection (ADR-143).
 *
 * The refresh token itself stays a JWT; this module is the authoritative
 * server-side record. We persist only sha256(rawRefreshJwt) — never the raw JWT.
 *
 * Launch Fase 2 — Wave 5.
 */
import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { authRefreshTokens } from "@shared/schema";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** exp claim (ms epoch) decoded from a JWT, or now+30d if it can't be read. */
function deriveExpiresAt(rawJwt: string): Date {
  try {
    const part = rawJwt.split(".")[1];
    if (part) {
      const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
      const claims = JSON.parse(json);
      if (typeof claims.exp === "number") return new Date(claims.exp * 1000);
    }
  } catch { /* fall through */ }
  return new Date(Date.now() + THIRTY_DAYS_MS);
}

export type RefreshTokenStatus = "valid" | "reuse" | "expired" | "unrecorded";

export interface RefreshTokenCheck {
  status: RefreshTokenStatus;
  /** The matching row when status is "valid" (or "reuse"/"expired"); undefined for "unrecorded". */
  row?: typeof authRefreshTokens.$inferSelect;
}

/**
 * Looks the (raw) refresh token up by hash.
 *  - "valid"      — recorded, not revoked, not expired → caller may rotate
 *  - "reuse"      — recorded but already revoked → the WHOLE family is revoked here, caller must 401
 *  - "expired"    — recorded but past expiry → caller must 401
 *  - "unrecorded" — JWT valid but no row (legacy / pre-migration token) → caller may rotate, no chain
 */
export async function checkRefreshToken(rawToken: string): Promise<RefreshTokenCheck> {
  const hash = sha256Hex(rawToken);
  const [row] = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.tokenHash, hash));
  if (!row) return { status: "unrecorded" };
  if (row.revokedAt) {
    // Reuse of an already-consumed token ⇒ assume the family is compromised.
    await db.update(authRefreshTokens)
      .set({ revokedAt: new Date(), revokedReason: "reuse_detected" })
      .where(and(eq(authRefreshTokens.familyId, row.familyId), isNull(authRefreshTokens.revokedAt)));
    return { status: "reuse", row };
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    await db.update(authRefreshTokens)
      .set({ revokedAt: new Date(), revokedReason: "expired" })
      .where(eq(authRefreshTokens.id, row.id));
    return { status: "expired", row };
  }
  return { status: "valid", row };
}

export interface RecordRefreshTokenInput {
  userId: string;
  rawToken: string;
  familyId?: string; // omit to start a new family
  userAgent?: string | null;
  ip?: string | null;
}

/** Persists the hash of a freshly issued refresh token. Returns the familyId used. */
export async function recordRefreshToken(input: RecordRefreshTokenInput): Promise<string> {
  const familyId = input.familyId ?? nanoid();
  await db.insert(authRefreshTokens).values({
    id: nanoid(),
    userId: input.userId,
    tokenHash: sha256Hex(input.rawToken),
    familyId,
    expiresAt: deriveExpiresAt(input.rawToken),
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
  });
  return familyId;
}

/** Marks the old token row consumed by a rotation and links it to its replacement. */
export async function markRotated(oldRawToken: string, newRawToken: string): Promise<void> {
  await db.update(authRefreshTokens)
    .set({ revokedAt: new Date(), revokedReason: "rotated", replacedByHash: sha256Hex(newRawToken) })
    .where(and(eq(authRefreshTokens.tokenHash, sha256Hex(oldRawToken)), isNull(authRefreshTokens.revokedAt)));
}

/** Revokes every active refresh token row for a user (logout / password change). */
export async function revokeAllForUser(userId: string, reason: "logout" | "password_change"): Promise<void> {
  await db.update(authRefreshTokens)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(authRefreshTokens.userId, userId), isNull(authRefreshTokens.revokedAt)));
}

/**
 * Full rotation helper for /api/auth/refresh. Given the raw old token and a
 * factory that mints a new {accessToken, refreshToken} pair, returns the new
 * pair after recording/rotating — or null when the old token must be rejected.
 */
export async function rotateRefreshToken(
  rawOldToken: string,
  userId: string,
  mintNewPair: () => { accessToken: string; refreshToken: string },
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const check = await checkRefreshToken(rawOldToken);
  if (check.status === "reuse" || check.status === "expired") return null;
  const pair = mintNewPair();
  const familyId = check.status === "valid" ? check.row!.familyId : undefined;
  if (check.status === "valid") {
    await markRotated(rawOldToken, pair.refreshToken);
  }
  await recordRefreshToken({ userId, rawToken: pair.refreshToken, familyId, userAgent: meta?.userAgent, ip: meta?.ip });
  return pair;
}

/** Deletes refresh token rows that have been expired for more than 30 days. */
export async function cleanupExpiredRefreshTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  // Drizzle lt on timestamps:
  const { lt } = await import("drizzle-orm");
  await db.delete(authRefreshTokens).where(lt(authRefreshTokens.expiresAt, cutoff));
}
