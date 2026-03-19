import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../../../server/db', () => {
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  const mockSelectChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  };
  const mockUpdateChain = {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
  const mockDeleteChain = {
    where: vi.fn().mockResolvedValue(undefined),
  };
  return {
    db: {
      insert: mockInsert,
      select: vi.fn().mockReturnValue(mockSelectChain),
      update: vi.fn().mockReturnValue(mockUpdateChain),
      delete: vi.fn().mockReturnValue(mockDeleteChain),
    },
  };
});

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  lt: vi.fn((...args: any[]) => ({ type: 'lt', args })),
  isNull: vi.fn((arg: any) => ({ type: 'isNull', arg })),
}));

// Mock @shared/schema
vi.mock('@shared/schema', () => ({
  users: {
    id: 'users.id',
    email: 'users.email',
    emailVerified: 'users.email_verified',
  },
  authTokens: {
    id: 'auth_tokens.id',
    userId: 'auth_tokens.user_id',
    email: 'auth_tokens.email',
    token: 'auth_tokens.token',
    type: 'auth_tokens.type',
    expiresAt: 'auth_tokens.expires_at',
    usedAt: 'auth_tokens.used_at',
    createdAt: 'auth_tokens.created_at',
  },
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid'),
}));

// Mock nodemailer - must be before importing EmailService
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
      verify: vi.fn().mockResolvedValue(true),
    })),
  },
}));

import { EmailService } from '../../../server/emailService';

// Get mocked db for setup
const { db } = await import('../../../server/db') as any;

describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock chains
    db.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    db.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
  });

  describe('generateEmailVerificationToken', () => {
    it('deve retornar um token hex string', async () => {
      const token = await EmailService.generateEmailVerificationToken('user-123', 'test@test.com');

      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('deve gerar tokens diferentes a cada chamada', async () => {
      const token1 = await EmailService.generateEmailVerificationToken('user-1', 'a@test.com');
      const token2 = await EmailService.generateEmailVerificationToken('user-2', 'b@test.com');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyEmailToken', () => {
    it('deve retornar userId e email para token valido', async () => {
      const mockWhere = vi.fn().mockResolvedValue([{
        id: 'tok-1', userId: 'user-123', email: 'test@test.com',
        token: 'abc', type: 'email_verification',
        expiresAt: new Date(Date.now() + 86400000), usedAt: null,
      }]);
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) });

      const result = await EmailService.verifyEmailToken('abc');

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-123');
      expect(result!.email).toBe('test@test.com');
    });

    it('deve retornar null para token inexistente', async () => {
      const result = await EmailService.verifyEmailToken('token-que-nao-existe');
      expect(result).toBeNull();
    });

    it('deve retornar null para token expirado', async () => {
      const mockWhere = vi.fn().mockResolvedValue([{
        id: 'tok-1', userId: 'user-123', email: 'test@test.com',
        token: 'expired', type: 'email_verification',
        expiresAt: new Date(Date.now() - 1000), usedAt: null, // already expired
      }]);
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) });

      const result = await EmailService.verifyEmailToken('expired');
      expect(result).toBeNull();
    });
  });

  describe('generatePasswordResetToken', () => {
    it('deve retornar um token hex string de 64 caracteres', async () => {
      const token = await EmailService.generatePasswordResetToken('user-123', 'test@test.com');

      expect(typeof token).toBe('string');
      expect(token.length).toBe(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('deve gerar tokens diferentes para o mesmo usuario', async () => {
      const token1 = await EmailService.generatePasswordResetToken('user-123', 'test@test.com');
      const token2 = await EmailService.generatePasswordResetToken('user-123', 'test@test.com');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyPasswordResetToken', () => {
    it('deve retornar userId e email para token valido', async () => {
      const mockWhere = vi.fn().mockResolvedValue([{
        id: 'tok-2', userId: 'user-456', email: 'reset@test.com',
        token: 'def', type: 'password_reset',
        expiresAt: new Date(Date.now() + 3600000), usedAt: null,
      }]);
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) });

      const result = await EmailService.verifyPasswordResetToken('def');

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-456');
      expect(result!.email).toBe('reset@test.com');
    });

    it('deve retornar null para token inexistente', async () => {
      const result = await EmailService.verifyPasswordResetToken('token-invalido');
      expect(result).toBeNull();
    });

    it('deve retornar null para token expirado (reset expira em 1 hora)', async () => {
      const mockWhere = vi.fn().mockResolvedValue([{
        id: 'tok-3', userId: 'user-123', email: 'test@test.com',
        token: 'exp-reset', type: 'password_reset',
        expiresAt: new Date(Date.now() - 1000), usedAt: null,
      }]);
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) });

      const result = await EmailService.verifyPasswordResetToken('exp-reset');
      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('deve executar delete no banco para tokens expirados', async () => {
      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      db.delete.mockReturnValue({ where: mockDeleteWhere });

      await EmailService.cleanupExpiredTokens();

      expect(db.delete).toHaveBeenCalled();
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it('deve chamar db.delete (nao iterar Maps)', async () => {
      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      db.delete.mockReturnValue({ where: mockDeleteWhere });

      await EmailService.cleanupExpiredTokens();

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('getEmailVerificationTemplate', () => {
    it('deve retornar HTML contendo a URL de verificacao', () => {
      const url = 'https://app.grindfy.com/verify-email?token=abc123';
      const html = EmailService.getEmailVerificationTemplate(url);

      expect(html).toContain(url);
      expect(html).toContain('Confirmar Email');
      expect(html).toContain('Grindfy');
    });

    it('deve conter informacao sobre expiracao de 24 horas', () => {
      const html = EmailService.getEmailVerificationTemplate('https://example.com');

      expect(html).toContain('24 horas');
    });
  });

  describe('getPasswordResetTemplate', () => {
    it('deve retornar HTML contendo a URL de reset', () => {
      const url = 'https://app.grindfy.com/reset-password/token123';
      const html = EmailService.getPasswordResetTemplate(url);

      expect(html).toContain(url);
      expect(html).toContain('Redefinir Senha');
    });

    it('deve conter informacao sobre expiracao de 1 hora', () => {
      const html = EmailService.getPasswordResetTemplate('https://example.com');

      expect(html).toContain('1 hora');
    });
  });

  describe('getWelcomeEmailTemplate', () => {
    it('deve retornar HTML de boas-vindas', () => {
      const html = EmailService.getWelcomeEmailTemplate('Ricardo');

      expect(html).toContain('Grindfy');
      expect(html).toContain('verificada');
    });
  });
});
