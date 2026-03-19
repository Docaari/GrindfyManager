/**
 * Spec 3: Mover tokens de verificacao/reset de Map() em memoria para tabela no banco
 *
 * Schema runtime tests are in tokens-schema.test.ts (separate file to avoid vi.mock hoisting).
 * This file contains: source-level schema verification + EmailService behavior tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// SECTION 1: Schema source-level verification (regex-based, no runtime import)
// Verifica o arquivo schema.ts diretamente para garantir estrutura correta
// ---------------------------------------------------------------------------
describe('Schema source: authTokens table definition', () => {
  const schemaPath = path.resolve(__dirname, '../../../shared/schema.ts');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  it('deve conter export da tabela authTokens com pgTable("auth_tokens")', () => {
    expect(schemaContent).toMatch(/export const authTokens\s*=\s*pgTable\(\s*["']auth_tokens["']/);
  });

  it('deve ter FK userId referenciando users.userPlatformId', () => {
    // Match within authTokens definition: userId references users.userPlatformId
    const authTokensBlock = schemaContent.match(
      /export const authTokens = pgTable[\s\S]*?userId:\s*varchar\([^)]+\)[^,]*\.references\(\(\)\s*=>\s*users\.(\w+)/
    );
    expect(authTokensBlock).not.toBeNull();
    expect(authTokensBlock![1]).toBe('userPlatformId');
  });

  it('deve ter onDelete cascade na FK userId', () => {
    const cascadeMatch = schemaContent.match(
      /export const authTokens = pgTable[\s\S]*?userId:[\s\S]*?onDelete:\s*["']cascade["']/
    );
    expect(cascadeMatch).not.toBeNull();
  });

  it('deve ter indice idx_auth_tokens_token', () => {
    expect(schemaContent).toContain('idx_auth_tokens_token');
  });

  it('deve ter indice idx_auth_tokens_user_type', () => {
    expect(schemaContent).toContain('idx_auth_tokens_user_type');
  });

  it('deve ter indice idx_auth_tokens_expires', () => {
    expect(schemaContent).toContain('idx_auth_tokens_expires');
  });

  it('NAO deve conter emailVerificationToken na definicao de users', () => {
    // The users table definition should not have this field
    const usersBlock = schemaContent.match(
      /export const users = pgTable\("users",\s*\{([\s\S]*?)\}\)/
    );
    expect(usersBlock).not.toBeNull();
    expect(usersBlock![1]).not.toContain('emailVerificationToken');
    expect(usersBlock![1]).not.toContain('email_verification_token');
  });

  it('NAO deve conter passwordResetToken na definicao de users', () => {
    const usersBlock = schemaContent.match(
      /export const users = pgTable\("users",\s*\{([\s\S]*?)\}\)/
    );
    expect(usersBlock).not.toBeNull();
    expect(usersBlock![1]).not.toContain('passwordResetToken');
    expect(usersBlock![1]).not.toContain('password_reset_token');
  });

  it('NAO deve conter passwordResetExpires na definicao de users', () => {
    const usersBlock = schemaContent.match(
      /export const users = pgTable\("users",\s*\{([\s\S]*?)\}\)/
    );
    expect(usersBlock).not.toBeNull();
    expect(usersBlock![1]).not.toContain('passwordResetExpires');
    expect(usersBlock![1]).not.toContain('password_reset_expires');
  });
});

// ---------------------------------------------------------------------------
// SECTION 3: EmailService behavior tests
// Verificam que o EmailService usa banco em vez de Maps
// ---------------------------------------------------------------------------

// We need to mock db BEFORE importing EmailService
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

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  lt: vi.fn((...args: any[]) => ({ type: 'lt', args })),
  isNull: vi.fn((arg: any) => ({ type: 'isNull', arg })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}));

vi.mock('@shared/schema', () => ({
  users: {
    id: 'users.id',
    email: 'users.email',
    emailVerified: 'users.email_verified',
    status: 'users.status',
    updatedAt: 'users.updated_at',
    firstName: 'users.first_name',
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

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid-id'),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
      verify: vi.fn().mockResolvedValue(true),
    })),
  },
}));

describe('EmailService: tokens persistidos no banco', () => {
  let EmailService: any;
  let db: any;
  let schemaModule: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-import to get fresh mocks
    db = (await import('../../../server/db')).db;
    schemaModule = await import('@shared/schema');
    const mod = await import('../../../server/emailService');
    EmailService = mod.EmailService;
  });

  describe('Maps removidos', () => {
    it('emailVerificationTokens Map NAO deve existir no modulo', async () => {
      const emailServicePath = path.resolve(__dirname, '../../../server/emailService.ts');
      const source = fs.readFileSync(emailServicePath, 'utf-8');

      // Should NOT contain Map-based token storage
      expect(source).not.toMatch(/const emailVerificationTokens\s*=\s*new Map/);
    });

    it('passwordResetTokens Map NAO deve existir no modulo', () => {
      const emailServicePath = path.resolve(__dirname, '../../../server/emailService.ts');
      const source = fs.readFileSync(emailServicePath, 'utf-8');

      expect(source).not.toMatch(/const passwordResetTokens\s*=\s*new Map/);
    });
  });

  describe('generateEmailVerificationToken', () => {
    it('deve chamar db.insert() na tabela authTokens', async () => {
      // Setup mock chain
      const mockValues = vi.fn().mockResolvedValue(undefined);
      db.insert.mockReturnValue({ values: mockValues });

      // Also mock delete for invalidation of previous tokens
      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      db.delete.mockReturnValue({ where: mockDeleteWhere });

      const token = await EmailService.generateEmailVerificationToken('USER-0001', 'test@example.com');

      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes hex

      // Must call db.insert with authTokens table
      expect(db.insert).toHaveBeenCalledWith(schemaModule.authTokens);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'USER-0001',
          email: 'test@example.com',
          type: 'email_verification',
        })
      );
    });

    it('deve invalidar tokens anteriores do mesmo usuario e tipo antes de inserir', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      db.insert.mockReturnValue({ values: mockValues });

      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      db.delete.mockReturnValue({ where: mockDeleteWhere });

      await EmailService.generateEmailVerificationToken('USER-0001', 'test@example.com');

      // Should call db.delete to invalidate previous tokens
      expect(db.delete).toHaveBeenCalledWith(schemaModule.authTokens);
    });
  });

  describe('generatePasswordResetToken', () => {
    it('deve chamar db.insert() na tabela authTokens com type password_reset', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      db.insert.mockReturnValue({ values: mockValues });

      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      db.delete.mockReturnValue({ where: mockDeleteWhere });

      const token = await EmailService.generatePasswordResetToken('USER-0002', 'reset@example.com');

      expect(typeof token).toBe('string');
      expect(token.length).toBe(64);

      expect(db.insert).toHaveBeenCalledWith(schemaModule.authTokens);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'USER-0002',
          email: 'reset@example.com',
          type: 'password_reset',
        })
      );
    });
  });

  describe('verifyEmailToken', () => {
    it('deve buscar token via db.select() na tabela authTokens', async () => {
      const mockWhere = vi.fn().mockResolvedValue([
        {
          id: 'tok-1',
          userId: 'USER-0001',
          email: 'test@example.com',
          token: 'abc123',
          type: 'email_verification',
          expiresAt: new Date(Date.now() + 86400000),
          usedAt: null,
          createdAt: new Date(),
        },
      ]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      db.select.mockReturnValue({ from: mockFrom });

      const result = await EmailService.verifyEmailToken('abc123');

      expect(db.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(schemaModule.authTokens);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('USER-0001');
      expect(result!.email).toBe('test@example.com');
    });

    it('deve retornar null para token inexistente ou expirado', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      db.select.mockReturnValue({ from: mockFrom });

      const result = await EmailService.verifyEmailToken('token-invalido');

      expect(result).toBeNull();
    });
  });

  describe('verifyPasswordResetToken', () => {
    it('deve buscar token via db.select() na tabela authTokens', async () => {
      const mockWhere = vi.fn().mockResolvedValue([
        {
          id: 'tok-2',
          userId: 'USER-0002',
          email: 'reset@example.com',
          token: 'def456',
          type: 'password_reset',
          expiresAt: new Date(Date.now() + 3600000),
          usedAt: null,
          createdAt: new Date(),
        },
      ]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      db.select.mockReturnValue({ from: mockFrom });

      const result = await EmailService.verifyPasswordResetToken('def456');

      expect(db.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(schemaModule.authTokens);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('USER-0002');
      expect(result!.email).toBe('reset@example.com');
    });

    it('deve retornar null para token inexistente', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      db.select.mockReturnValue({ from: mockFrom });

      const result = await EmailService.verifyPasswordResetToken('nao-existe');

      expect(result).toBeNull();
    });
  });

  describe('token consumido marcado com usedAt', () => {
    it('verifyUserEmail deve marcar token com usedAt via db.update() (nao deletar do Map)', async () => {
      // Mock verifyEmailToken to return valid data
      const mockSelectWhere = vi.fn().mockResolvedValue([
        {
          id: 'tok-1',
          userId: 'USER-0001',
          email: 'test@example.com',
          token: 'verify-token',
          type: 'email_verification',
          expiresAt: new Date(Date.now() + 86400000),
          usedAt: null,
        },
      ]);
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      db.select.mockReturnValue({ from: mockSelectFrom });

      // Mock update chain
      const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      db.update.mockReturnValue({ set: mockUpdateSet });

      await EmailService.verifyUserEmail('verify-token');

      // Should call db.update to set usedAt on the token
      // At least one update call should target authTokens
      const updateCalls = db.update.mock.calls;
      const updatedAuthTokens = updateCalls.some(
        (call: any[]) => call[0] === schemaModule.authTokens
      );
      expect(updatedAuthTokens).toBe(true);

      // Should set usedAt (not delete)
      const setCalls = mockUpdateSet.mock.calls;
      const setUsedAt = setCalls.some(
        (call: any[]) => call[0] && 'usedAt' in call[0]
      );
      expect(setUsedAt).toBe(true);
    });

    it('verifyUserEmailWithData deve marcar token com usedAt via db.update()', async () => {
      const mockSelectWhere = vi.fn()
        .mockResolvedValueOnce([
          {
            id: 'tok-1',
            userId: 'USER-0001',
            email: 'test@example.com',
            token: 'data-token',
            type: 'email_verification',
            expiresAt: new Date(Date.now() + 86400000),
            usedAt: null,
          },
        ])
        .mockResolvedValue([
          {
            id: 'USER-0001',
            email: 'test@example.com',
            firstName: 'Test',
            emailVerified: false,
          },
        ]);
      const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
      db.select.mockReturnValue({ from: mockSelectFrom });

      const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      db.update.mockReturnValue({ set: mockUpdateSet });

      const result = await EmailService.verifyUserEmailWithData('data-token');

      // Should update authTokens with usedAt
      const updateCalls = db.update.mock.calls;
      const updatedAuthTokens = updateCalls.some(
        (call: any[]) => call[0] === schemaModule.authTokens
      );
      expect(updatedAuthTokens).toBe(true);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('deve executar DELETE via db na tabela authTokens (nao iterar Maps)', async () => {
      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      db.delete.mockReturnValue({ where: mockDeleteWhere });

      await EmailService.cleanupExpiredTokens();

      // Should call db.delete with authTokens table
      expect(db.delete).toHaveBeenCalledWith(schemaModule.authTokens);
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it('o codigo fonte NAO deve iterar Maps no cleanup', () => {
      const emailServicePath = path.resolve(__dirname, '../../../server/emailService.ts');
      const source = fs.readFileSync(emailServicePath, 'utf-8');

      // The cleanup method should not iterate Maps
      // Look for the Map iteration pattern within cleanupExpiredTokens
      const cleanupBlock = source.match(
        /cleanupExpiredTokens[\s\S]*?(?=\n\s{2}\w|\n\s{2}\/\/\s[A-Z]|\nstatic|\n\})/
      );
      if (cleanupBlock) {
        expect(cleanupBlock[0]).not.toContain('emailVerificationTokens.entries()');
        expect(cleanupBlock[0]).not.toContain('passwordResetTokens.entries()');
        expect(cleanupBlock[0]).not.toContain('emailVerificationTokens.delete');
        expect(cleanupBlock[0]).not.toContain('passwordResetTokens.delete');
      }
    });
  });

  describe('EmailService source: sem referencia a Maps', () => {
    it('o modulo emailService.ts NAO deve usar .set() em Maps de token', () => {
      const emailServicePath = path.resolve(__dirname, '../../../server/emailService.ts');
      const source = fs.readFileSync(emailServicePath, 'utf-8');

      expect(source).not.toContain('emailVerificationTokens.set(');
      expect(source).not.toContain('passwordResetTokens.set(');
    });

    it('o modulo emailService.ts NAO deve usar .get() em Maps de token', () => {
      const emailServicePath = path.resolve(__dirname, '../../../server/emailService.ts');
      const source = fs.readFileSync(emailServicePath, 'utf-8');

      expect(source).not.toContain('emailVerificationTokens.get(');
      expect(source).not.toContain('passwordResetTokens.get(');
    });

    it('o modulo emailService.ts NAO deve usar .delete() em Maps de token', () => {
      const emailServicePath = path.resolve(__dirname, '../../../server/emailService.ts');
      const source = fs.readFileSync(emailServicePath, 'utf-8');

      expect(source).not.toContain('emailVerificationTokens.delete(');
      expect(source).not.toContain('passwordResetTokens.delete(');
    });
  });
});
