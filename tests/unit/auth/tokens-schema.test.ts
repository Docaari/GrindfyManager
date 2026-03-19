/**
 * Schema runtime tests for authTokens table and legacy field removal.
 * Separated from tokens-to-db.test.ts to avoid vi.mock hoisting conflicts.
 */
import { describe, it, expect } from 'vitest';

// Import real schema (no vi.mock in this file)
import * as schema from '../../../shared/schema';

describe('Schema runtime: tabela authTokens', () => {
  it('deve exportar authTokens como tabela Drizzle', () => {
    expect(schema.authTokens).toBeDefined();
    expect(typeof schema.authTokens).toBe('object');
  });

  describe('campos da tabela authTokens', () => {
    it('deve ter campo id (varchar, primary key)', () => {
      expect(schema.authTokens.id).toBeDefined();
      expect(schema.authTokens.id.name).toBe('id');
    });

    it('deve ter campo userId (varchar, not null)', () => {
      expect(schema.authTokens.userId).toBeDefined();
      expect(schema.authTokens.userId.name).toBe('user_id');
    });

    it('deve ter campo email (varchar, not null)', () => {
      expect(schema.authTokens.email).toBeDefined();
      expect(schema.authTokens.email.name).toBe('email');
    });

    it('deve ter campo token (varchar, not null, unique)', () => {
      expect(schema.authTokens.token).toBeDefined();
      expect(schema.authTokens.token.name).toBe('token');
      expect(schema.authTokens.token.isUnique).toBe(true);
    });

    it('deve ter campo type (varchar, not null)', () => {
      expect(schema.authTokens.type).toBeDefined();
      expect(schema.authTokens.type.name).toBe('type');
    });

    it('deve ter campo expiresAt (timestamp, not null)', () => {
      expect(schema.authTokens.expiresAt).toBeDefined();
      expect(schema.authTokens.expiresAt.name).toBe('expires_at');
    });

    it('deve ter campo usedAt (timestamp, nullable)', () => {
      expect(schema.authTokens.usedAt).toBeDefined();
      expect(schema.authTokens.usedAt.name).toBe('used_at');
    });

    it('deve ter campo createdAt (timestamp, defaultNow)', () => {
      expect(schema.authTokens.createdAt).toBeDefined();
      expect(schema.authTokens.createdAt.name).toBe('created_at');
    });
  });

  describe('Zod schema para insert', () => {
    it('deve exportar insertAuthTokenSchema', () => {
      expect(schema.insertAuthTokenSchema).toBeDefined();
      expect(typeof schema.insertAuthTokenSchema.parse).toBe('function');
    });

    it('deve aceitar dados validos com type email_verification', () => {
      const validData = {
        userId: 'USER-0001',
        email: 'test@example.com',
        token: 'abc123hextoken',
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 86400000),
      };
      expect(() => schema.insertAuthTokenSchema.parse(validData)).not.toThrow();
    });

    it('deve aceitar dados validos com type password_reset', () => {
      const validData = {
        userId: 'USER-0002',
        email: 'reset@example.com',
        token: 'def456hextoken',
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 3600000),
      };
      expect(() => schema.insertAuthTokenSchema.parse(validData)).not.toThrow();
    });

    it('deve rejeitar dados sem campo email obrigatorio', () => {
      const invalidData = {
        userId: 'USER-0001',
        token: 'abc123',
        type: 'email_verification',
        expiresAt: new Date(),
      };
      expect(() => schema.insertAuthTokenSchema.parse(invalidData)).toThrow();
    });

    it('deve rejeitar dados sem campo token obrigatorio', () => {
      const invalidData = {
        userId: 'USER-0001',
        email: 'test@example.com',
        type: 'email_verification',
        expiresAt: new Date(),
      };
      expect(() => schema.insertAuthTokenSchema.parse(invalidData)).toThrow();
    });
  });

  describe('tipo AuthToken', () => {
    it('deve ter authTokens disponivel para inferir tipo AuthToken', () => {
      // AuthToken is a TypeScript type (typeof authTokens.$inferSelect)
      // At runtime we can only verify the table object exists and has the expected columns
      expect(schema.authTokens).toBeDefined();
      expect(schema.authTokens.id).toBeDefined();
      expect(schema.authTokens.userId).toBeDefined();
      expect(schema.authTokens.token).toBeDefined();
    });
  });
});

describe('Schema runtime: campos legados removidos da tabela users', () => {
  it('campo emailVerificationToken NAO deve existir', () => {
    expect((schema.users as any).emailVerificationToken).toBeUndefined();
  });

  it('campo passwordResetToken NAO deve existir', () => {
    expect((schema.users as any).passwordResetToken).toBeUndefined();
  });

  it('campo passwordResetExpires NAO deve existir', () => {
    expect((schema.users as any).passwordResetExpires).toBeUndefined();
  });
});
