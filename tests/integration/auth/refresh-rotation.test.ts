/**
 * Launch Fase 2 — Wave 5: refresh token rotation + family/reuse detection (ADR-143).
 *
 * Unit-level tests for server/refreshTokenStore with a mocked db: covers the
 * status classification (unrecorded / valid / reuse / expired), the family
 * revoke side-effect on reuse, recording, rotation, and revokeAllForUser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbState, dbMock } = vi.hoisted(() => {
  const dbState = {
    selectRows: [] as any[],
    insertedRows: [] as any[],
    updates: [] as Array<{ set: any }>,
  };
  function selectThenable() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      then: (resolve: (v: any[]) => any) => resolve(dbState.selectRows),
    };
    return chain;
  }
  const dbMock = {
    select: () => selectThenable(),
    insert: () => ({
      values: (v: any) => { dbState.insertedRows.push(v); return Promise.resolve(undefined); },
    }),
    update: () => ({
      set: (s: any) => ({ where: () => { dbState.updates.push({ set: s }); return Promise.resolve(undefined); } }),
    }),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
  };
  return { dbState, dbMock };
});
vi.mock('../../../server/db', () => ({ db: dbMock, pool: {} }));

import {
  sha256Hex, checkRefreshToken, recordRefreshToken, markRotated, revokeAllForUser, rotateRefreshToken,
} from '../../../server/refreshTokenStore';

// A minimal JWT-shaped string with an exp claim N ms in the future.
function jwtWithExp(msFromNow: number): string {
  const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const exp = Math.floor((Date.now() + msFromNow) / 1000);
  return `${b64u({ alg: 'HS256' })}.${b64u({ userId: 'u', userPlatformId: 'USER-1', exp })}.sig`;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectRows = [];
  dbState.insertedRows = [];
  dbState.updates = [];
});

describe('sha256Hex', () => {
  it('is deterministic and 64 hex chars', () => {
    const h = sha256Hex('abc');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('abc')).toBe(h);
    expect(sha256Hex('abcd')).not.toBe(h);
  });
});

describe('checkRefreshToken', () => {
  it('unrecorded when no DB row', async () => {
    dbState.selectRows = [];
    const r = await checkRefreshToken('some.jwt.token');
    expect(r.status).toBe('unrecorded');
    expect(r.row).toBeUndefined();
  });
  it('valid when row exists, not revoked, not expired', async () => {
    dbState.selectRows = [{ id: 'r1', familyId: 'fam1', tokenHash: 'h', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }];
    const r = await checkRefreshToken('tok');
    expect(r.status).toBe('valid');
    expect(r.row?.familyId).toBe('fam1');
    expect(dbState.updates).toHaveLength(0);
  });
  it('reuse when row already revoked — and the whole family is revoked', async () => {
    dbState.selectRows = [{ id: 'r1', familyId: 'fam1', tokenHash: 'h', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }];
    const r = await checkRefreshToken('tok');
    expect(r.status).toBe('reuse');
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set.revokedReason).toBe('reuse_detected');
  });
  it('expired when past expiry', async () => {
    dbState.selectRows = [{ id: 'r1', familyId: 'fam1', tokenHash: 'h', revokedAt: null, expiresAt: new Date(Date.now() - 1000) }];
    const r = await checkRefreshToken('tok');
    expect(r.status).toBe('expired');
    expect(dbState.updates[0].set.revokedReason).toBe('expired');
  });
});

describe('recordRefreshToken', () => {
  it('inserts a row with sha256(token) and the given familyId', async () => {
    await recordRefreshToken({ userId: 'USER-1', rawToken: 'raw-token', familyId: 'fam-x' });
    expect(dbState.insertedRows).toHaveLength(1);
    expect(dbState.insertedRows[0].tokenHash).toBe(sha256Hex('raw-token'));
    expect(dbState.insertedRows[0].familyId).toBe('fam-x');
    expect(dbState.insertedRows[0].userId).toBe('USER-1');
  });
  it('derives expiresAt from the JWT exp claim', async () => {
    const tok = jwtWithExp(10 * 60 * 1000); // +10min
    await recordRefreshToken({ userId: 'USER-1', rawToken: tok });
    const exp = new Date(dbState.insertedRows[0].expiresAt).getTime();
    expect(exp).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    expect(exp).toBeLessThan(Date.now() + 11 * 60 * 1000);
  });
  it('starts a fresh family when none given', async () => {
    const fam = await recordRefreshToken({ userId: 'USER-1', rawToken: 'r' });
    expect(typeof fam).toBe('string');
    expect(fam.length).toBeGreaterThan(0);
    expect(dbState.insertedRows[0].familyId).toBe(fam);
  });
});

describe('markRotated / revokeAllForUser', () => {
  it('markRotated revokes with reason rotated + replacedByHash', async () => {
    await markRotated('old', 'new');
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set.revokedReason).toBe('rotated');
    expect(dbState.updates[0].set.replacedByHash).toBe(sha256Hex('new'));
  });
  it('revokeAllForUser revokes with the given reason', async () => {
    await revokeAllForUser('USER-1', 'logout');
    expect(dbState.updates[0].set.revokedReason).toBe('logout');
    await revokeAllForUser('USER-1', 'password_change');
    expect(dbState.updates[1].set.revokedReason).toBe('password_change');
  });
});

describe('rotateRefreshToken', () => {
  const mintPair = () => ({ accessToken: 'a', refreshToken: 'new.refresh.jwt' });

  it('valid token -> marks old rotated, records new in the SAME family, returns pair', async () => {
    dbState.selectRows = [{ id: 'r1', familyId: 'fam-keep', tokenHash: 'h', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }];
    const pair = await rotateRefreshToken('old.refresh.jwt', 'USER-1', mintPair);
    expect(pair).toEqual({ accessToken: 'a', refreshToken: 'new.refresh.jwt' });
    // one update (markRotated -> reason rotated) + one insert (new token in same family)
    expect(dbState.updates.some(u => u.set.revokedReason === 'rotated')).toBe(true);
    expect(dbState.insertedRows[0].familyId).toBe('fam-keep');
    expect(dbState.insertedRows[0].tokenHash).toBe(sha256Hex('new.refresh.jwt'));
  });

  it('unrecorded token -> records new in a NEW family, no markRotated, returns pair', async () => {
    dbState.selectRows = [];
    const pair = await rotateRefreshToken('legacy.refresh.jwt', 'USER-1', mintPair);
    expect(pair).not.toBeNull();
    expect(dbState.updates.some(u => u.set.revokedReason === 'rotated')).toBe(false);
    expect(dbState.insertedRows).toHaveLength(1);
  });

  it('reuse token -> returns null (and the family was revoked by checkRefreshToken)', async () => {
    dbState.selectRows = [{ id: 'r1', familyId: 'fam-bad', tokenHash: 'h', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }];
    const pair = await rotateRefreshToken('replayed.refresh.jwt', 'USER-1', mintPair);
    expect(pair).toBeNull();
    expect(dbState.updates.some(u => u.set.revokedReason === 'reuse_detected')).toBe(true);
    expect(dbState.insertedRows).toHaveLength(0);
  });

  it('expired token -> returns null, no new token recorded', async () => {
    dbState.selectRows = [{ id: 'r1', familyId: 'fam-old', tokenHash: 'h', revokedAt: null, expiresAt: new Date(Date.now() - 1000) }];
    const pair = await rotateRefreshToken('stale.refresh.jwt', 'USER-1', mintPair);
    expect(pair).toBeNull();
    expect(dbState.insertedRows).toHaveLength(0);
  });
});
