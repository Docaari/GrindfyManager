import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Testes TDD (RED phase): Schema de Validacao para Study Tabs
// Schemas inline que definem as regras de validacao que o Implementer deve criar.
// =============================================================================

// ---------------------------------------------------------------------------
// Schema de criacao de aba
// ---------------------------------------------------------------------------

const createStudyTabSchema = z.object({
  themeId: z.string().min(1, 'themeId e obrigatorio'),
  name: z.string().min(1, 'Nome e obrigatorio').max(30, 'Nome deve ter no maximo 30 caracteres'),
  content: z.array(z.any()).default([]),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

// ---------------------------------------------------------------------------
// Schema de atualizacao de aba
// ---------------------------------------------------------------------------

const updateStudyTabSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  content: z.array(z.any()).optional(),
  sortOrder: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Testes: createStudyTabSchema
// ---------------------------------------------------------------------------

describe('createStudyTabSchema', () => {
  const validTab = {
    themeId: 'theme-abc123',
    name: 'Flop',
  };

  describe('campos obrigatorios', () => {
    it('deve aceitar aba com campos obrigatorios minimos (themeId + name)', () => {
      const result = createStudyTabSchema.safeParse(validTab);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar aba sem themeId', () => {
      const { themeId, ...data } = validTab;
      const result = createStudyTabSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar aba com themeId vazio', () => {
      const result = createStudyTabSchema.safeParse({ ...validTab, themeId: '' });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar aba sem name', () => {
      const { name, ...data } = validTab;
      const result = createStudyTabSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar aba com name vazio', () => {
      const result = createStudyTabSchema.safeParse({ ...validTab, name: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = result.error.issues.find(i => i.path.includes('name'));
        expect(nameError).toBeDefined();
      }
    });
  });

  describe('validacao de name', () => {
    it('deve aceitar name com exatamente 30 caracteres (limite)', () => {
      const name = 'A'.repeat(30);
      const result = createStudyTabSchema.safeParse({ ...validTab, name });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar name com 31 caracteres (excede limite)', () => {
      const name = 'A'.repeat(31);
      const result = createStudyTabSchema.safeParse({ ...validTab, name });
      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = result.error.issues.find(i => i.path.includes('name'));
        expect(nameError).toBeDefined();
      }
    });

    it('deve aceitar name com 1 caractere (minimo)', () => {
      const result = createStudyTabSchema.safeParse({ ...validTab, name: 'X' });
      expect(result.success).toBe(true);
    });

    it('deve aceitar nomes das abas padrao', () => {
      for (const tabName of ['Flop', 'Turn', 'River', 'Tendencias']) {
        const result = createStudyTabSchema.safeParse({ ...validTab, name: tabName });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('valores padrao', () => {
    it('deve usar content como array vazio por padrao', () => {
      const result = createStudyTabSchema.safeParse(validTab);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toEqual([]);
        expect(Array.isArray(result.data.content)).toBe(true);
      }
    });

    it('deve usar isDefault=false por padrao', () => {
      const result = createStudyTabSchema.safeParse(validTab);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isDefault).toBe(false);
      }
    });

    it('deve usar sortOrder=0 por padrao', () => {
      const result = createStudyTabSchema.safeParse(validTab);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortOrder).toBe(0);
      }
    });
  });

  describe('validacao de content (JSON BlockNote)', () => {
    it('deve aceitar content como array vazio', () => {
      const result = createStudyTabSchema.safeParse({ ...validTab, content: [] });
      expect(result.success).toBe(true);
    });

    it('deve aceitar content com blocos BlockNote (objetos genericos)', () => {
      const content = [
        { id: '1', type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        { id: '2', type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      ];
      const result = createStudyTabSchema.safeParse({ ...validTab, content });
      expect(result.success).toBe(true);
    });

    it('deve aceitar content com bloco de imagem', () => {
      const content = [
        { id: '3', type: 'image', props: { url: '/uploads/study-images/abc.png', width: 800 } },
      ];
      const result = createStudyTabSchema.safeParse({ ...validTab, content });
      expect(result.success).toBe(true);
    });

    it('deve aceitar content com bloco toggle (acordeao)', () => {
      const content = [
        {
          id: '4',
          type: 'toggle',
          props: { title: 'Board AKx' },
          children: [
            { id: '5', type: 'paragraph', content: [{ type: 'text', text: 'Notas sobre AKx' }] },
          ],
        },
      ];
      const result = createStudyTabSchema.safeParse({ ...validTab, content });
      expect(result.success).toBe(true);
    });
  });

  describe('todos os campos preenchidos', () => {
    it('deve aceitar aba com todos os campos validos', () => {
      const fullTab = {
        themeId: 'theme-abc123',
        name: 'Flop',
        content: [{ id: '1', type: 'paragraph', content: [] }],
        isDefault: true,
        sortOrder: 1,
      };
      const result = createStudyTabSchema.safeParse(fullTab);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.themeId).toBe('theme-abc123');
        expect(result.data.name).toBe('Flop');
        expect(result.data.isDefault).toBe(true);
        expect(result.data.sortOrder).toBe(1);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Testes: updateStudyTabSchema
// ---------------------------------------------------------------------------

describe('updateStudyTabSchema', () => {
  it('deve aceitar atualizacao apenas do name', () => {
    const result = updateStudyTabSchema.safeParse({ name: 'Novo Nome' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar atualizacao apenas do content', () => {
    const content = [{ id: '1', type: 'paragraph', content: [] }];
    const result = updateStudyTabSchema.safeParse({ content });
    expect(result.success).toBe(true);
  });

  it('deve aceitar atualizacao apenas do sortOrder', () => {
    const result = updateStudyTabSchema.safeParse({ sortOrder: 5 });
    expect(result.success).toBe(true);
  });

  it('deve aceitar objeto vazio (nenhum campo para atualizar)', () => {
    const result = updateStudyTabSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('deve rejeitar name vazio na atualizacao', () => {
    const result = updateStudyTabSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar name com mais de 30 caracteres na atualizacao', () => {
    const result = updateStudyTabSchema.safeParse({ name: 'A'.repeat(31) });
    expect(result.success).toBe(false);
  });
});
