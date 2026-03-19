import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Mock the database module before importing AuthService
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

// Mock @shared/schema to avoid DB-dependent imports
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

import { AuthService } from '../../../server/auth';
import { db } from '../../../server/db';

const JWT_SECRET = 'grindfy-secret-key';
const JWT_REFRESH_SECRET = 'grindfy-refresh-secret-key';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('deve retornar um hash diferente da senha original', async () => {
      const password = 'senha12345';
      const hashed = await AuthService.hashPassword(password);

      expect(hashed).not.toBe(password);
      expect(hashed).toBeTruthy();
      expect(typeof hashed).toBe('string');
    });

    it('deve gerar hash com salt rounds 12 (compativel com bcrypt.compare)', async () => {
      const password = 'minhaSenha123';
      const hashed = await AuthService.hashPassword(password);

      // bcrypt hashes with salt round 12 start with $2a$ or $2b$ and have a cost of 12
      expect(hashed).toMatch(/^\$2[ab]\$12\$/);
    });

    it('deve gerar hashes diferentes para a mesma senha (salt unico)', async () => {
      const password = 'mesmaSenha';
      const hash1 = await AuthService.hashPassword(password);
      const hash2 = await AuthService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('deve retornar true para senha correta', async () => {
      const password = 'senha12345';
      const hashed = await bcrypt.hash(password, 12);

      const result = await AuthService.verifyPassword(password, hashed);

      expect(result).toBe(true);
    });

    it('deve retornar false para senha incorreta', async () => {
      const hashed = await bcrypt.hash('senha12345', 12);

      const result = await AuthService.verifyPassword('senhaErrada', hashed);

      expect(result).toBe(false);
    });

    it('deve retornar false quando password e vazio', async () => {
      const result = await AuthService.verifyPassword('', 'somehash');

      expect(result).toBe(false);
    });

    it('deve retornar false quando hashedPassword e vazio', async () => {
      const result = await AuthService.verifyPassword('password', '');

      expect(result).toBe(false);
    });

    it('deve retornar false quando ambos sao null/undefined', async () => {
      const result = await AuthService.verifyPassword(
        null as any,
        null as any,
      );

      expect(result).toBe(false);
    });

    it('deve retornar false e nao lancar excecao para hash invalido', async () => {
      const result = await AuthService.verifyPassword('password', 'not-a-valid-hash');

      expect(result).toBe(false);
    });
  });

  describe('generateTokens', () => {
    it('deve retornar accessToken e refreshToken', () => {
      const tokens = AuthService.generateTokens('user-id', 'USER-0001', 'test@test.com');

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('deve gerar accessToken com payload correto e tipo access', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      const decoded = jwt.verify(tokens.accessToken, JWT_SECRET) as any;

      expect(decoded.userId).toBe('USER-0001');
      expect(decoded.userPlatformId).toBe('USER-0001');
      expect(decoded.email).toBe('test@test.com');
      expect(decoded.type).toBe('access');
    });

    it('deve gerar refreshToken com payload correto e tipo refresh', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      const decoded = jwt.verify(tokens.refreshToken, JWT_REFRESH_SECRET) as any;

      expect(decoded.userId).toBe('USER-0001');
      expect(decoded.userPlatformId).toBe('USER-0001');
      expect(decoded.email).toBe('test@test.com');
      expect(decoded.type).toBe('refresh');
    });

    it('deve gerar accessToken com expiracao de 15 minutos', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      const decoded = jwt.verify(tokens.accessToken, JWT_SECRET) as any;
      const expiresIn = decoded.exp - decoded.iat;

      expect(expiresIn).toBe(15 * 60); // 15 minutes in seconds
    });

    it('deve gerar refreshToken com expiracao de 30 dias', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      const decoded = jwt.verify(tokens.refreshToken, JWT_REFRESH_SECRET) as any;
      const expiresIn = decoded.exp - decoded.iat;

      expect(expiresIn).toBe(30 * 24 * 60 * 60); // 30 days in seconds
    });
  });

  describe('verifyAccessToken', () => {
    it('deve retornar payload para token valido', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      const result = AuthService.verifyAccessToken(tokens.accessToken);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('USER-0001');
      expect(result!.email).toBe('test@test.com');
      expect(result!.type).toBe('access');
    });

    it('deve retornar null para token invalido', () => {
      const result = AuthService.verifyAccessToken('token-invalido');

      expect(result).toBeNull();
    });

    it('deve retornar null para token expirado', () => {
      // Create a token that already expired
      const expiredToken = jwt.sign(
        { userId: 'USER-0001', userPlatformId: 'USER-0001', email: 'test@test.com', type: 'access' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      // Small delay to ensure expiry
      const result = AuthService.verifyAccessToken(expiredToken);

      expect(result).toBeNull();
    });

    it('deve retornar null para refreshToken usado como accessToken', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      // refreshToken is signed with JWT_REFRESH_SECRET, not JWT_SECRET
      const result = AuthService.verifyAccessToken(tokens.refreshToken);

      expect(result).toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    it('deve retornar payload para refreshToken valido', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      const result = AuthService.verifyRefreshToken(tokens.refreshToken);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('USER-0001');
      expect(result!.type).toBe('refresh');
    });

    it('deve retornar null para token invalido', () => {
      const result = AuthService.verifyRefreshToken('token-invalido');

      expect(result).toBeNull();
    });

    it('deve retornar null para accessToken usado como refreshToken', () => {
      const tokens = AuthService.generateTokens('USER-0001', 'USER-0001', 'test@test.com');

      const result = AuthService.verifyRefreshToken(tokens.accessToken);

      expect(result).toBeNull();
    });
  });

  describe('generateNextUserPlatformId', () => {
    it('deve retornar USER-0001 quando nao existem usuarios', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.generateNextUserPlatformId();

      expect(result).toBe('USER-0001');
    });

    it('deve incrementar o maior ID existente', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ userPlatformId: 'USER-0005' }]),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.generateNextUserPlatformId();

      expect(result).toBe('USER-0006');
    });

    it('deve formatar com zeros a esquerda (4 digitos)', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ userPlatformId: 'USER-0099' }]),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.generateNextUserPlatformId();

      expect(result).toBe('USER-0100');
    });

    it('deve retornar fallback baseado em timestamp quando DB falha', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('DB error')),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.generateNextUserPlatformId();

      expect(result).toMatch(/^USER-\d{4}$/);
    });
  });

  describe('isAccountLocked', () => {
    it('deve retornar locked false quando usuario nao existe', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.isAccountLocked('naoexiste@test.com');

      expect(result).toEqual({ locked: false });
    });

    it('deve retornar locked true com tempo restante quando conta esta bloqueada', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 3);

      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          failedLoginAttempts: 5,
          lockedUntil: futureDate,
        }]),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.isAccountLocked('locked@test.com');

      expect(result.locked).toBe(true);
      expect(result.remainingTime).toBeGreaterThan(0);
      expect(result.remainingTime).toBeLessThanOrEqual(3);
    });

    it('deve retornar locked false quando lock expirou e resetar attempts', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 1);

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          failedLoginAttempts: 5,
          lockedUntil: pastDate,
        }]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      // Mock the update chain for resetFailedAttempts
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      const result = await AuthService.isAccountLocked('expired-lock@test.com');

      expect(result.locked).toBe(false);
    });

    it('deve retornar locked false quando lockedUntil e null', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          failedLoginAttempts: 2,
          lockedUntil: null,
        }]),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.isAccountLocked('user@test.com');

      expect(result).toEqual({ locked: false });
    });

    it('deve retornar locked false quando DB falha', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('DB error')),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.isAccountLocked('user@test.com');

      expect(result).toEqual({ locked: false });
    });
  });

  describe('handleFailedLogin', () => {
    it('deve retornar attemptsRemaining 4 quando usuario nao existe', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.handleFailedLogin('naoexiste@test.com');

      expect(result).toEqual({ attemptsRemaining: 4, locked: false });
    });

    it('deve incrementar tentativas e retornar tentativas restantes', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ failedLoginAttempts: 2 }]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      const result = await AuthService.handleFailedLogin('user@test.com');

      // Current attempts = 2 + 1 = 3, max = 5, remaining = 5 - 3 = 2
      expect(result.attemptsRemaining).toBe(2);
      expect(result.locked).toBe(false);
    });

    it('deve bloquear conta apos 5 tentativas falhas (maxAttempts)', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ failedLoginAttempts: 4 }]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      const result = await AuthService.handleFailedLogin('user@test.com');

      expect(result.locked).toBe(true);
      expect(result.attemptsRemaining).toBe(0);
      expect(result.lockTime).toBe(5); // 5 minutes lock duration
    });

    it('deve tratar failedLoginAttempts null como 0', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ failedLoginAttempts: null }]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      const result = await AuthService.handleFailedLogin('user@test.com');

      // (null || 0) + 1 = 1, remaining = 5 - 1 = 4
      expect(result.attemptsRemaining).toBe(4);
      expect(result.locked).toBe(false);
    });

    it('deve retornar default quando DB falha', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('DB error')),
      };
      (db.select as any).mockReturnValue(mockChain);

      const result = await AuthService.handleFailedLogin('user@test.com');

      expect(result).toEqual({ attemptsRemaining: 4, locked: false });
    });
  });

  describe('resetFailedAttempts', () => {
    it('deve chamar update com failedLoginAttempts 0 e lockedUntil null', async () => {
      const mockSetFn = vi.fn().mockReturnThis();
      const mockWhereFn = vi.fn().mockResolvedValue(undefined);
      const mockUpdateChain = {
        set: mockSetFn,
        where: mockWhereFn,
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      await AuthService.resetFailedAttempts('user@test.com');

      expect(db.update).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
    });

    it('deve nao lancar excecao quando DB falha', async () => {
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('DB error')),
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      // Should not throw
      await expect(AuthService.resetFailedAttempts('user@test.com')).resolves.toBeUndefined();
    });
  });
});
