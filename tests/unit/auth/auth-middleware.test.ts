import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock the database module
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  sql: vi.fn(),
}));

// Mock @shared/schema
vi.mock('@shared/schema', () => ({
  users: {
    id: 'users.id',
    email: 'users.email',
    userPlatformId: 'users.user_platform_id',
    failedLoginAttempts: 'users.failed_login_attempts',
    lockedUntil: 'users.locked_until',
    status: 'users.status',
    name: 'users.name',
    firstName: 'users.firstName',
    lastName: 'users.lastName',
    username: 'users.username',
    password: 'users.password',
    subscriptionPlan: 'users.subscriptionPlan',
  },
  permissions: {
    id: 'permissions.id',
    name: 'permissions.name',
  },
  userPermissions: {
    userId: 'user_permissions.user_id',
    permissionId: 'user_permissions.permission_id',
    granted: 'user_permissions.granted',
  },
  accessLogs: {},
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid-id'),
}));

// Note: @shared/permissions is NOT mocked - we use the real implementation
// since hasFullAccess is a pure function with no I/O

import { AuthService, requireAuth, requirePermission } from '../../../server/auth';
import { db } from '../../../server/db';

const JWT_SECRET = 'grindfy-secret-key';

function createMockReq(overrides: any = {}) {
  return {
    headers: {},
    url: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    user: undefined,
    ...overrides,
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar 401 quando nao ha header Authorization', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token de acesso necessário' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando Authorization nao comeca com Bearer', () => {
    const req = createMockReq({
      headers: { authorization: 'Basic some-token' },
    });
    const res = createMockRes();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token de acesso necessário' });
  });

  it('deve retornar 401 quando token e invalido', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer token-invalido' },
    });
    const res = createMockRes();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token inválido ou expirado' });
  });

  it('deve retornar 401 quando token expirou', () => {
    const expiredToken = jwt.sign(
      { userId: 'USER-0001', userPlatformId: 'USER-0001', email: 'test@test.com', type: 'access' },
      JWT_SECRET,
      { expiresIn: '0s' },
    );

    const req = createMockReq({
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token inválido ou expirado' });
  });

  it('deve chamar next e anexar user ao req quando token e valido e usuario existe e esta ativo', async () => {
    const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

    // Mock getUserWithPermissions response via db mocks
    // getUserWithPermissions first tries db.select().from(users).where(eq(users.id, userId))
    // then db.select().from(userPermissions).innerJoin(...).where(...)
    const mockActiveUser = {
      id: 'nanoid-123',
      userPlatformId: 'USER-0001',
      email: 'test@test.com',
      username: 'testuser',
      name: 'Test User',
      firstName: 'Test',
      lastName: 'User',
      status: 'active',
      subscriptionPlan: 'basico',
    };

    // The method does two selects: one for user, one for permissions
    let selectCallCount = 0;
    (db.select as any).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount <= 2) {
        // User lookups (by id then by userPlatformId)
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(
              selectCallCount === 1 ? [mockActiveUser] : [],
            ),
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      } else {
        // Permissions lookup (uses innerJoin)
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      }
    });

    // Mock logAccess (insert)
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    // requireAuth is async internally (uses .then), need to wait
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
    });

    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('test@test.com');
    expect(req.user.userPlatformId).toBe('USER-0001');
  });

  it('deve retornar 401 quando usuario nao esta ativo (status != active)', async () => {
    const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

    const mockInactiveUser = {
      id: 'nanoid-123',
      userPlatformId: 'USER-0001',
      email: 'test@test.com',
      username: 'testuser',
      status: 'pending_verification', // Not active
      subscriptionPlan: 'basico',
    };

    (db.select as any).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockInactiveUser]),
      }),
    }));

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    await vi.waitFor(() => {
      expect(res.status).toHaveBeenCalledWith(401);
    });

    expect(res.json).toHaveBeenCalledWith({ message: 'Usuário não encontrado ou inativo' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando usuario nao e encontrado no banco', async () => {
    const tokens = AuthService.generateTokens('USER-9999', 'USER-9999', 'ghost@test.com');

    (db.select as any).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }));

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const req = createMockReq({
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const res = createMockRes();
    const next = vi.fn();

    requireAuth(req as any, res as any, next);

    await vi.waitFor(() => {
      expect(res.status).toHaveBeenCalledWith(401);
    });

    expect(res.json).toHaveBeenCalledWith({ message: 'Usuário não encontrado ou inativo' });
  });
});

describe('requirePermission middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar 401 quando req.user nao esta definido', () => {
    const middleware = requirePermission('admin_full');
    const req = createMockReq({ user: undefined });
    const res = createMockRes();
    const next = vi.fn();

    // Mock logAccess
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    middleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Usuário não autenticado' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para admin_full quando usuario nao e super-admin', () => {
    const middleware = requirePermission('admin_full');
    const req = createMockReq({
      user: {
        id: 'nanoid-123',
        userPlatformId: 'USER-0001',
        email: 'user@test.com',
        username: 'testuser',
        status: 'active',
        subscriptionPlan: 'active',
        subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        permissions: [],
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    middleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Acesso restrito a administradores',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('deve chamar next para super-admin em qualquer permissao', () => {
    const middleware = requirePermission('admin_full');
    const req = createMockReq({
      user: {
        id: 'nanoid-123',
        userPlatformId: 'USER-0001',
        email: 'ricardo.agnolo@hotmail.com', // super admin
        username: 'admin',
        status: 'active',
        subscriptionPlan: 'admin',
        permissions: [],
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve chamar next para usuario com trial ativo em permissao nao-admin', () => {
    const middleware = requirePermission('dashboard_access');
    const req = createMockReq({
      user: {
        id: 'nanoid-123',
        userPlatformId: 'USER-0001',
        email: 'user@test.com',
        username: 'testuser',
        status: 'active',
        subscriptionPlan: 'trial',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        permissions: [],
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('deve retornar 403 para usuario com trial expirado', () => {
    const middleware = requirePermission('dashboard_access');
    const req = createMockReq({
      user: {
        id: 'nanoid-123',
        userPlatformId: 'USER-0001',
        email: 'user@test.com',
        username: 'testuser',
        status: 'active',
        subscriptionPlan: 'expired',
        trialEndsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        permissions: [],
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    middleware(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresSubscription: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
