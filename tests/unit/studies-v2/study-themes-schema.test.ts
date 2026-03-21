import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Testes TDD (RED phase): Schema de Validacao para Study Themes
// Estes schemas definem as regras de validacao que o Implementer deve criar
// em shared/schema.ts como parte da feature Studies Reform.
//
// Os schemas sao definidos inline aqui para validar a ESPECIFICACAO.
// O Implementer deve criar schemas equivalentes no codigo de producao.
// =============================================================================

// ---------------------------------------------------------------------------
// Schema de criacao de tema (equivalente ao futuro insertStudyThemeSchema)
// ---------------------------------------------------------------------------

const createStudyThemeSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1, 'Nome e obrigatorio').max(50, 'Nome deve ter no maximo 50 caracteres'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser hex valida (#XXXXXX)').default('#16a34a'),
  emoji: z.string().max(4, 'Emoji deve ter no maximo 4 caracteres').default(''),
  isFavorite: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

// ---------------------------------------------------------------------------
// Schema de atualizacao de tema (parcial, todos campos opcionais exceto id)
// ---------------------------------------------------------------------------

const updateStudyThemeSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emoji: z.string().max(4).optional(),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Testes: createStudyThemeSchema
// ---------------------------------------------------------------------------

describe('createStudyThemeSchema', () => {
  const validTheme = {
    userId: 'USER-0001',
    name: 'IP vs BB',
  };

  describe('campos obrigatorios', () => {
    it('deve aceitar tema com campos obrigatorios minimos (userId + name)', () => {
      const result = createStudyThemeSchema.safeParse(validTheme);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar tema sem userId', () => {
      const { userId, ...data } = validTheme;
      const result = createStudyThemeSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar tema sem name', () => {
      const { name, ...data } = validTheme;
      const result = createStudyThemeSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar tema com name vazio', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, name: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = result.error.issues.find(i => i.path.includes('name'));
        expect(nameError).toBeDefined();
      }
    });

    it('deve rejeitar tema com userId vazio', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, userId: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('validacao de name', () => {
    it('deve aceitar name com exatamente 50 caracteres (limite)', () => {
      const name = 'A'.repeat(50);
      const result = createStudyThemeSchema.safeParse({ ...validTheme, name });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar name com 51 caracteres (excede limite)', () => {
      const name = 'A'.repeat(51);
      const result = createStudyThemeSchema.safeParse({ ...validTheme, name });
      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = result.error.issues.find(i => i.path.includes('name'));
        expect(nameError).toBeDefined();
      }
    });

    it('deve aceitar name com 1 caractere (minimo)', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, name: 'X' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar name com caracteres especiais e acentos', () => {
      const result = createStudyThemeSchema.safeParse({
        ...validTheme,
        name: '3bet Pot - Posicao IP',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('validacao de color (hex)', () => {
    it('deve usar #16a34a como cor padrao quando nao informada', () => {
      const result = createStudyThemeSchema.safeParse(validTheme);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.color).toBe('#16a34a');
      }
    });

    it('deve aceitar cor hex valida com 7 caracteres (#XXXXXX)', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, color: '#ff5733' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar cor hex com letras maiusculas (#FF5733)', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, color: '#FF5733' });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar cor hex sem # no inicio', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, color: 'ff5733' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar cor hex com 4 caracteres (#FFF shorthand)', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, color: '#FFF' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar cor com caracteres invalidos (#GGGGGG)', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, color: '#GGGGGG' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar string vazia como cor', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, color: '' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar cor com 8 caracteres (#FF5733AA — hex com alpha)', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, color: '#FF5733AA' });
      expect(result.success).toBe(false);
    });
  });

  describe('validacao de emoji', () => {
    it('deve usar string vazia como emoji padrao', () => {
      const result = createStudyThemeSchema.safeParse(validTheme);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.emoji).toBe('');
      }
    });

    it('deve aceitar emoji simples (1-2 chars)', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, emoji: '🎯' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar emoji com ate 4 caracteres', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, emoji: '🏆🎲' });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar emoji com mais de 4 caracteres', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, emoji: '🎯🏆🎲🃏🎰' });
      expect(result.success).toBe(false);
    });
  });

  describe('valores padrao', () => {
    it('deve usar isFavorite=false como padrao', () => {
      const result = createStudyThemeSchema.safeParse(validTheme);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFavorite).toBe(false);
      }
    });

    it('deve usar sortOrder=0 como padrao', () => {
      const result = createStudyThemeSchema.safeParse(validTheme);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortOrder).toBe(0);
      }
    });

    it('deve aceitar isFavorite=true', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, isFavorite: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFavorite).toBe(true);
      }
    });

    it('deve aceitar sortOrder como inteiro positivo', () => {
      const result = createStudyThemeSchema.safeParse({ ...validTheme, sortOrder: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortOrder).toBe(5);
      }
    });
  });

  describe('todos os campos preenchidos', () => {
    it('deve aceitar tema com todos os campos validos', () => {
      const fullTheme = {
        userId: 'USER-0001',
        name: 'IP vs BB',
        color: '#3b82f6',
        emoji: '🎯',
        isFavorite: true,
        sortOrder: 3,
      };
      const result = createStudyThemeSchema.safeParse(fullTheme);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(fullTheme);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Testes: updateStudyThemeSchema
// ---------------------------------------------------------------------------

describe('updateStudyThemeSchema', () => {
  it('deve aceitar atualizacao apenas do name', () => {
    const result = updateStudyThemeSchema.safeParse({ name: 'Novo Nome' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar atualizacao apenas da cor', () => {
    const result = updateStudyThemeSchema.safeParse({ color: '#ff0000' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar atualizacao apenas do isFavorite', () => {
    const result = updateStudyThemeSchema.safeParse({ isFavorite: true });
    expect(result.success).toBe(true);
  });

  it('deve aceitar atualizacao apenas do sortOrder', () => {
    const result = updateStudyThemeSchema.safeParse({ sortOrder: 10 });
    expect(result.success).toBe(true);
  });

  it('deve aceitar objeto vazio (nenhum campo para atualizar)', () => {
    const result = updateStudyThemeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('deve rejeitar name vazio na atualizacao', () => {
    const result = updateStudyThemeSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar cor invalida na atualizacao', () => {
    const result = updateStudyThemeSchema.safeParse({ color: 'red' });
    expect(result.success).toBe(false);
  });
});
