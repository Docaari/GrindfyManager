// =============================================================================
// Auth user cache (Fase 3 perf — load test residual)
//
// getUserWithPermissions roda em TODA request autenticada (1-2 SELECTs em users
// + 1 JOIN em user_permissions). O cache in-memory por userId com TTL curto
// (default 30s, AUTH_CACHE_TTL_MS) elimina esse round-trip no caminho quente.
//
// Cobertura:
//   - segunda chamada com mesmo userId NAO toca o db (cache hit)
//   - invalidateAuthUserCache forca re-query
//   - _resetAuthUserCacheForTests limpa entre testes
//   - chave dupla: hit funciona por id OU userPlatformId
// =============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  sql: vi.fn(),
}));
vi.mock('@shared/schema', () => ({
  users: {
    id: 'users.id',
    email: 'users.email',
    userPlatformId: 'users.user_platform_id',
    status: 'users.status',
  },
  permissions: { id: 'permissions.id', name: 'permissions.name' },
  userPermissions: {
    userId: 'user_permissions.user_id',
    permissionId: 'user_permissions.permission_id',
    granted: 'user_permissions.granted',
  },
  accessLogs: {},
}));
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'mock-nanoid-id') }));

import { AuthService, invalidateAuthUserCache, _resetAuthUserCacheForTests } from '../../../server/auth';
import { db } from '../../../server/db';

const ACTIVE_USER = {
  id: 'nanoid-abc',
  userPlatformId: 'USER-0001',
  email: 'p@p.com',
  username: 'pdoaaari',
  name: 'P',
  firstName: 'P',
  lastName: 'D',
  status: 'active',
  subscriptionPlan: 'pro',
};

/**
 * Mocka db.select() para o fluxo de getUserWithPermissions:
 *   1a chamada -> SELECT * FROM users WHERE id = ?           -> [ACTIVE_USER]
 *   2a chamada -> SELECT name FROM user_permissions JOIN ... -> [{permissionName}]
 * Como a 1a retorna nao-vazio, o lookup por userPlatformId nao acontece.
 */
function wireDbForUserLookup(perms: string[] = ['studies']) {
  let n = 0;
  (db.select as any).mockImplementation(() => {
    n++;
    if (n === 1) {
      return { from: () => ({ where: () => Promise.resolve([ACTIVE_USER]) }) };
    }
    return {
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(perms.map((p) => ({ permissionName: p }))),
        }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetAuthUserCacheForTests();
});

describe('AuthService.getUserWithPermissions — cache', () => {
  it('primeira chamada vai ao db; segunda (mesmo userId) e cache hit', async () => {
    wireDbForUserLookup();

    const a = await AuthService.getUserWithPermissions('USER-0001');
    expect(a?.userPlatformId).toBe('USER-0001');
    expect(a?.permissions).toEqual(['studies']);
    const selectsAfterFirst = (db.select as any).mock.calls.length;
    expect(selectsAfterFirst).toBeGreaterThan(0);

    const b = await AuthService.getUserWithPermissions('USER-0001');
    expect(b?.userPlatformId).toBe('USER-0001');
    // Nenhum SELECT novo — veio do cache.
    expect((db.select as any).mock.calls.length).toBe(selectsAfterFirst);
  });

  it('cache hit funciona pela chave id (alem do userPlatformId)', async () => {
    wireDbForUserLookup();

    await AuthService.getUserWithPermissions('USER-0001');
    const after = (db.select as any).mock.calls.length;

    const byId = await AuthService.getUserWithPermissions('nanoid-abc');
    expect(byId?.userPlatformId).toBe('USER-0001');
    expect((db.select as any).mock.calls.length).toBe(after);
  });

  it('invalidateAuthUserCache forca nova consulta', async () => {
    wireDbForUserLookup();

    await AuthService.getUserWithPermissions('USER-0001');
    const after = (db.select as any).mock.calls.length;

    invalidateAuthUserCache('USER-0001');
    wireDbForUserLookup(['studies', 'coach']); // re-arma o mock (foi consumido)
    const fresh = await AuthService.getUserWithPermissions('USER-0001');
    expect(fresh?.permissions).toEqual(['studies', 'coach']);
    expect((db.select as any).mock.calls.length).toBeGreaterThan(after);
  });

  it('_resetAuthUserCacheForTests limpa o cache', async () => {
    wireDbForUserLookup();
    await AuthService.getUserWithPermissions('USER-0001');
    const after = (db.select as any).mock.calls.length;

    _resetAuthUserCacheForTests();
    wireDbForUserLookup();
    await AuthService.getUserWithPermissions('USER-0001');
    expect((db.select as any).mock.calls.length).toBeGreaterThan(after);
  });

  it('usuario inativo (null) NAO e cacheado', async () => {
    // 1a SELECT por id -> [], 2a SELECT por userPlatformId -> [] => retorna null
    (db.select as any).mockImplementation(() => ({
      from: () => ({ where: () => Promise.resolve([]) }),
    }));
    const r1 = await AuthService.getUserWithPermissions('USER-XXXX');
    expect(r1).toBeNull();
    const after = (db.select as any).mock.calls.length;
    // Segunda chamada tem que ir ao db de novo (nada cacheado).
    const r2 = await AuthService.getUserWithPermissions('USER-XXXX');
    expect(r2).toBeNull();
    expect((db.select as any).mock.calls.length).toBeGreaterThan(after);
  });
});
