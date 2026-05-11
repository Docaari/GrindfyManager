/**
 * Launch Fase 2 — Wave 3: auth hardening P0 regression tests.
 *
 *  1. /api/auth/verify-email auto-login: session via httpOnly Set-Cookie ONLY —
 *     no accessToken/refreshToken in the JSON body (was persisted to localStorage).
 *  2. OAuth provisioning: createOrUpdateOAuthUser throws when the provider email is
 *     not verified; OAuthService.decodeIdToken reads email/email_verified claims.
 *  3. /api/auth/forgot-password: dedicated per-(normalized)email rate limit, 3/hour,
 *     resilient to plus-addressing (victim+1@ / victim+2@ → same bucket).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// mocks — built inside vi.hoisted so they exist before any (hoisted) import runs
// the mocked modules. See CLAUDE.md lesson #14.
// ---------------------------------------------------------------------------
const { dbState, dbMock, emailServiceMock, storageMock, authServiceMock } = vi.hoisted(() => {
  const dbState = { selectRows: [] as any[] };
  function thenable(getRows: () => any[]): any {
    const chain: any = {
      from: () => chain, innerJoin: () => chain, leftJoin: () => chain,
      where: () => chain, orderBy: () => chain, limit: () => chain,
      set: () => chain, values: () => chain, returning: () => thenable(getRows),
      then: (resolve: (v: any[]) => any) => resolve(getRows()),
    };
    return chain;
  }
  const dbMock = {
    select: () => thenable(() => dbState.selectRows),
    insert: () => thenable(() => dbState.selectRows),
    update: () => thenable(() => dbState.selectRows),
    delete: () => thenable(() => []),
  };
  const emailServiceMock = {
    verifyUserEmailWithData: vi.fn(async () => 'owner@example.com'),
    generatePasswordResetToken: vi.fn(async () => 'reset-tok'),
    sendPasswordReset: vi.fn(async () => true),
    markPasswordResetTokenUsed: vi.fn(async () => undefined),
    verifyPasswordResetToken: vi.fn(async () => null),
    cleanupExpiredTokens: vi.fn(async () => undefined),
    resendEmailVerification: vi.fn(async () => true),
    sendEmailVerification: vi.fn(async () => true),
  };
  const storageMock = { getUserSettings: vi.fn(async () => ({})) };
  const authServiceMock = {
    generateTokens: vi.fn(() => ({ accessToken: 'fake.access.jwt', refreshToken: 'fake.refresh.jwt' })),
    logAccess: vi.fn(async () => undefined),
  };
  return { dbState, dbMock, emailServiceMock, storageMock, authServiceMock };
});

vi.mock('../../../server/db', () => ({ db: dbMock, pool: {} }));
vi.mock('../../../server/auth', async () => {
  const actual = await vi.importActual<any>('../../../server/auth');
  return {
    ...actual,
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: 'USER-0001', userPlatformId: 'USER-0001', permissions: [] };
      next();
    },
    requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    AuthService: { ...actual.AuthService, ...authServiceMock },
  };
});
vi.mock('../../../server/emailService', () => ({ default: emailServiceMock, EmailService: emailServiceMock }));
vi.mock('../../../server/storage', () => ({ storage: storageMock }));

import OAuthService from '../../../server/oauth';

async function buildApp() {
  const { registerAuthRoutes } = await import('../../../server/routes/auth');
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app as any);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectRows = [];
  emailServiceMock.verifyUserEmailWithData.mockResolvedValue('owner@example.com');
});

// ===========================================================================
// 1. verify-email — cookies only, no tokens in body
// ===========================================================================
describe('POST /api/auth/verify-email — auto-login via httpOnly cookies', () => {
  it('sets grindfy_access_token + grindfy_refresh_token cookies', async () => {
    dbState.selectRows = [{ userPlatformId: 'USER-0001', email: 'owner@example.com', name: 'Owner', username: 'owner', status: 'active', subscriptionPlan: 'trial', trialEndsAt: null, subscriptionEndsAt: null }];
    const app = await buildApp();
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'valid-tok' });
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] || [];
    const joined = (Array.isArray(setCookie) ? setCookie : [setCookie]).join('; ');
    expect(joined).toMatch(/grindfy_access_token=/);
    expect(joined).toMatch(/grindfy_refresh_token=/);
    expect(joined).toMatch(/HttpOnly/i);
  });
  it('does NOT return accessToken / refreshToken in the JSON body', async () => {
    dbState.selectRows = [{ userPlatformId: 'USER-0001', email: 'owner@example.com', name: 'Owner', username: 'owner', status: 'active', subscriptionPlan: 'trial', trialEndsAt: null, subscriptionEndsAt: null }];
    const app = await buildApp();
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'valid-tok' });
    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.body).not.toHaveProperty('refreshToken');
    expect(res.body.autoLogin).toBe(true);
    expect(res.body.user).toBeDefined();
  });
  it('invalid token → 400, no cookies', async () => {
    emailServiceMock.verifyUserEmailWithData.mockResolvedValue(null as any);
    const app = await buildApp();
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'bad' });
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

// ===========================================================================
// 2. OAuth verified-email guard + id_token decode
// ===========================================================================
describe('OAuthService.decodeIdToken', () => {
  function jwtFor(claims: Record<string, unknown>): string {
    const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64u({ alg: 'RS256' })}.${b64u(claims)}.signature`;
  }
  it('reads email + email_verified (boolean true)', () => {
    const c = OAuthService.decodeIdToken(jwtFor({ email: 'a@b.com', email_verified: true }));
    expect(c).toEqual({ email: 'a@b.com', email_verified: true });
  });
  it('treats string "true" as verified, anything else as not', () => {
    expect(OAuthService.decodeIdToken(jwtFor({ email: 'a@b.com', email_verified: 'true' }))?.email_verified).toBe(true);
    expect(OAuthService.decodeIdToken(jwtFor({ email: 'a@b.com', email_verified: false }))?.email_verified).toBe(false);
    expect(OAuthService.decodeIdToken(jwtFor({ email: 'a@b.com' }))?.email_verified).toBe(false);
  });
  it('returns null for garbage / missing input', () => {
    expect(OAuthService.decodeIdToken(undefined)).toBeNull();
    expect(OAuthService.decodeIdToken('not-a-jwt')).toBeNull();
    expect(OAuthService.decodeIdToken('a.b')).toBeNull();
  });
});

describe('OAuthService.createOrUpdateOAuthUser — verified-email guard', () => {
  const base = { id: 'g-123', email: 'someone@example.com', name: 'Some One' };
  it('rejects when verified is false', async () => {
    await expect(OAuthService.createOrUpdateOAuthUser('google', { ...base, verified: false }))
      .rejects.toMatchObject({ code: 'OAUTH_EMAIL_NOT_VERIFIED' });
  });
  it('rejects when verified is undefined', async () => {
    await expect(OAuthService.createOrUpdateOAuthUser('google', { ...base } as any))
      .rejects.toMatchObject({ code: 'OAUTH_EMAIL_NOT_VERIFIED' });
  });
  it('does not throw the verified guard when verified is true (proceeds to DB layer)', async () => {
    // With verified=true the guard passes; the (mocked) db then takes over. We only
    // assert it is NOT the OAUTH_EMAIL_NOT_VERIFIED rejection.
    dbState.selectRows = [{ id: 'u1', userPlatformId: 'USER-0009', email: base.email, emailVerified: true }];
    await expect(OAuthService.createOrUpdateOAuthUser('google', { ...base, verified: true }))
      .resolves.toBeDefined();
  });
});

// ===========================================================================
// 3. forgot-password dedicated email rate limit (3/hour, plus-addressing safe)
// ===========================================================================
describe('POST /api/auth/forgot-password — per-email rate limit', () => {
  it('allows 3, then 429 on the 4th request to the same mailbox even with +tag variation', async () => {
    dbState.selectRows = []; // no user → handler short-circuits with 200
    const app = await buildApp();
    const r1 = await request(app).post('/api/auth/forgot-password').send({ email: 'victim@example.com' });
    const r2 = await request(app).post('/api/auth/forgot-password').send({ email: 'victim+1@example.com' });
    const r3 = await request(app).post('/api/auth/forgot-password').send({ email: 'victim+anything@example.com' });
    const r4 = await request(app).post('/api/auth/forgot-password').send({ email: 'victim+evade@example.com' });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(429);
  });
  it('a different mailbox is unaffected by another mailbox hitting the limit', async () => {
    dbState.selectRows = [];
    const app = await buildApp();
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@example.com' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@example.com' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@example.com' });
    const blocked = await request(app).post('/api/auth/forgot-password').send({ email: 'a@example.com' });
    const other = await request(app).post('/api/auth/forgot-password').send({ email: 'b@example.com' });
    expect(blocked.status).toBe(429);
    expect(other.status).toBe(200);
  });
});
