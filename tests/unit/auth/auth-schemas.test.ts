import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../../../shared/schema';

describe('registerSchema', () => {
  it('deve aceitar dados validos com name, email, password e confirmPassword iguais', () => {
    const data = {
      name: 'Test User',
      email: 'test@test.com',
      password: 'senha12345',
      confirmPassword: 'senha12345',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(true);
  });

  it('deve aceitar registro sem name (campo opcional)', () => {
    const data = {
      email: 'test@test.com',
      password: 'senha12345',
      confirmPassword: 'senha12345',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(true);
  });

  it('deve rejeitar email invalido', () => {
    const data = {
      email: 'not-an-email',
      password: 'senha12345',
      confirmPassword: 'senha12345',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.error.issues.find(i => i.path.includes('email'));
      expect(emailError).toBeDefined();
    }
  });

  it('deve rejeitar senha menor que 8 caracteres', () => {
    const data = {
      email: 'test@test.com',
      password: '1234567', // 7 chars
      confirmPassword: '1234567',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordError = result.error.issues.find(i => i.path.includes('password'));
      expect(passwordError).toBeDefined();
    }
  });

  it('deve aceitar senha com exatamente 8 caracteres (limite)', () => {
    const data = {
      email: 'test@test.com',
      password: '12345678', // 8 chars exactly
      confirmPassword: '12345678',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(true);
  });

  it('deve rejeitar quando senhas nao coincidem', () => {
    const data = {
      email: 'test@test.com',
      password: 'senha12345',
      confirmPassword: 'senhadiferente',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find(i => i.path.includes('confirmPassword'));
      expect(confirmError).toBeDefined();
      expect(confirmError!.message).toBe('Senhas não coincidem');
    }
  });

  it('deve rejeitar quando email esta ausente', () => {
    const data = {
      password: 'senha12345',
      confirmPassword: 'senha12345',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando password esta ausente', () => {
    const data = {
      email: 'test@test.com',
      confirmPassword: 'senha12345',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando confirmPassword esta ausente', () => {
    const data = {
      email: 'test@test.com',
      password: 'senha12345',
    };

    const result = registerSchema.safeParse(data);

    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('deve aceitar email e password validos', () => {
    const data = {
      email: 'test@test.com',
      password: 'qualquerSenha',
    };

    const result = loginSchema.safeParse(data);

    expect(result.success).toBe(true);
  });

  it('deve aceitar campo rememberMe opcional como boolean', () => {
    const data = {
      email: 'test@test.com',
      password: 'senha',
      rememberMe: true,
    };

    const result = loginSchema.safeParse(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(true);
    }
  });

  it('deve rejeitar email invalido', () => {
    const data = {
      email: 'invalido',
      password: 'senha',
    };

    const result = loginSchema.safeParse(data);

    expect(result.success).toBe(false);
  });

  it('deve rejeitar password vazio', () => {
    const data = {
      email: 'test@test.com',
      password: '',
    };

    const result = loginSchema.safeParse(data);

    expect(result.success).toBe(false);
  });

  it('deve aceitar password de 1 caractere (min 1 para login)', () => {
    const data = {
      email: 'test@test.com',
      password: 'a',
    };

    const result = loginSchema.safeParse(data);

    // loginSchema requires min(1), so single char should pass
    expect(result.success).toBe(true);
  });
});

describe('forgotPasswordSchema', () => {
  it('deve aceitar email valido', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'test@test.com' });

    expect(result.success).toBe(true);
  });

  it('deve rejeitar email invalido', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'invalido' });

    expect(result.success).toBe(false);
  });

  it('deve rejeitar email ausente', () => {
    const result = forgotPasswordSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('deve aceitar token, password e confirmPassword validos', () => {
    const data = {
      token: 'some-valid-token',
      password: 'novaSenha123',
      confirmPassword: 'novaSenha123',
    };

    const result = resetPasswordSchema.safeParse(data);

    expect(result.success).toBe(true);
  });

  it('deve rejeitar password menor que 8 caracteres', () => {
    const data = {
      token: 'some-token',
      password: '1234567',
      confirmPassword: '1234567',
    };

    const result = resetPasswordSchema.safeParse(data);

    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando senhas nao coincidem', () => {
    const data = {
      token: 'some-token',
      password: 'novaSenha123',
      confirmPassword: 'outraSenha123',
    };

    const result = resetPasswordSchema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find(i => i.path.includes('confirmPassword'));
      expect(confirmError).toBeDefined();
    }
  });

  it('deve rejeitar token vazio', () => {
    const data = {
      token: '',
      password: 'novaSenha123',
      confirmPassword: 'novaSenha123',
    };

    const result = resetPasswordSchema.safeParse(data);

    expect(result.success).toBe(false);
  });
});

describe('verifyEmailSchema', () => {
  it('deve aceitar token valido', () => {
    const result = verifyEmailSchema.safeParse({ token: 'valid-token-string' });

    expect(result.success).toBe(true);
  });

  it('deve rejeitar token vazio', () => {
    const result = verifyEmailSchema.safeParse({ token: '' });

    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando token esta ausente', () => {
    const result = verifyEmailSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
