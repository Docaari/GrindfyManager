// Characterization test — schemas copied from client/src/pages/Studies.tsx
// Documents the CURRENT validation behavior. All tests must PASS.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Schema definitions copied from Studies.tsx (lines 115-130, 2176-2182, 2393-2397)
// These are defined inside the module and cannot be imported directly.
// =============================================================================

const createStudyCardSchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio"),
  description: z.string().optional(),
  category: z.string().min(1, "Categoria e obrigatoria"),
  difficulty: z.enum(["Iniciante", "Intermediario", "Avancado"]),
  estimatedTime: z.number().min(1, "Tempo estimado deve ser maior que 0"),
  priority: z.enum(["Baixa", "Media", "Alta"]),
  objectives: z.string().optional(),
  studyDays: z.array(z.string()).optional(),
  studyStartTime: z.string().optional(),
  studyDuration: z.number().optional(),
  isRecurring: z.boolean().optional(),
  weeklyFrequency: z.number().optional(),
  studyDescription: z.string().optional(),
});

const createMaterialSchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio"),
  type: z.enum(["video", "article", "file", "link"]),
  url: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
});

const createNoteSchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio"),
  content: z.string().min(1, "Conteudo e obrigatorio"),
  tags: z.string().optional(),
});

// =============================================================================
// createStudyCardSchema
// =============================================================================

describe('createStudyCardSchema', () => {
  const validCard = {
    title: '3bet Defense Strategy',
    category: '3bet',
    difficulty: 'Intermediario' as const,
    estimatedTime: 8,
    priority: 'Alta' as const,
  };

  it('deve aceitar card com campos obrigatorios minimos', () => {
    const result = createStudyCardSchema.safeParse(validCard);
    expect(result.success).toBe(true);
  });

  it('deve aceitar card com todos os campos opcionais preenchidos', () => {
    const data = {
      ...validCard,
      description: 'Aprenda a defender contra 3bets',
      objectives: 'Melhorar win rate',
      studyDays: ['monday', 'wednesday', 'friday'],
      studyStartTime: '10:00',
      studyDuration: 60,
      isRecurring: true,
      weeklyFrequency: 3,
      studyDescription: 'Foco em ranges otimizados',
    };
    const result = createStudyCardSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- title ---

  it('deve rejeitar title vazio', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, title: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar title ausente', () => {
    const { title, ...noTitle } = validCard;
    const result = createStudyCardSchema.safeParse(noTitle);
    expect(result.success).toBe(false);
  });

  // --- category ---

  it('deve rejeitar category vazia', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, category: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar category ausente', () => {
    const { category, ...noCat } = validCard;
    const result = createStudyCardSchema.safeParse(noCat);
    expect(result.success).toBe(false);
  });

  // --- difficulty ---

  it('deve aceitar difficulty Iniciante', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, difficulty: 'Iniciante' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar difficulty Avancado', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, difficulty: 'Avancado' });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar difficulty invalida', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, difficulty: 'Expert' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar difficulty ausente', () => {
    const { difficulty, ...noDiff } = validCard;
    const result = createStudyCardSchema.safeParse(noDiff);
    expect(result.success).toBe(false);
  });

  // --- estimatedTime ---

  it('deve aceitar estimatedTime igual a 1 (minimo)', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, estimatedTime: 1 });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar estimatedTime igual a 0', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, estimatedTime: 0 });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar estimatedTime negativo', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, estimatedTime: -5 });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar estimatedTime ausente', () => {
    const { estimatedTime, ...noTime } = validCard;
    const result = createStudyCardSchema.safeParse(noTime);
    expect(result.success).toBe(false);
  });

  // --- priority ---

  it('deve aceitar priority Baixa', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, priority: 'Baixa' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar priority Media', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, priority: 'Media' });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar priority invalida', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, priority: 'Urgente' });
    expect(result.success).toBe(false);
  });

  // --- optional fields accept undefined ---

  it('deve aceitar description undefined', () => {
    const result = createStudyCardSchema.safeParse(validCard);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it('deve aceitar studyDays como array vazio', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, studyDays: [] });
    expect(result.success).toBe(true);
  });

  it('deve aceitar studyDuration como 0', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, studyDuration: 0 });
    expect(result.success).toBe(true);
  });

  it('deve aceitar weeklyFrequency como 0', () => {
    const result = createStudyCardSchema.safeParse({ ...validCard, weeklyFrequency: 0 });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// createMaterialSchema
// =============================================================================

describe('createMaterialSchema', () => {
  const validMaterial = {
    title: 'Video sobre 3bet ranges',
    type: 'video' as const,
  };

  it('deve aceitar material com campos obrigatorios minimos', () => {
    const result = createMaterialSchema.safeParse(validMaterial);
    expect(result.success).toBe(true);
  });

  it('deve aplicar default not_started para status quando omitido', () => {
    const result = createMaterialSchema.safeParse(validMaterial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('not_started');
    }
  });

  it('deve aceitar todos os campos opcionais preenchidos', () => {
    const data = {
      ...validMaterial,
      url: 'https://example.com/video',
      description: 'Excelente video',
      status: 'completed' as const,
    };
    const result = createMaterialSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- title ---

  it('deve rejeitar title vazio', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, title: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar title ausente', () => {
    const result = createMaterialSchema.safeParse({ type: 'video' });
    expect(result.success).toBe(false);
  });

  // --- type enum ---

  it('deve aceitar type video', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, type: 'video' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar type article', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, type: 'article' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar type file', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, type: 'file' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar type link', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, type: 'link' });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar type invalido', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, type: 'podcast' });
    expect(result.success).toBe(false);
  });

  // --- status enum ---

  it('deve aceitar status not_started', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, status: 'not_started' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar status in_progress', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, status: 'in_progress' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar status completed', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, status: 'completed' });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar status invalido', () => {
    const result = createMaterialSchema.safeParse({ ...validMaterial, status: 'archived' });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// createNoteSchema
// =============================================================================

describe('createNoteSchema', () => {
  const validNote = {
    title: 'Anotacoes sobre ICM',
    content: 'ICM pressure aumenta perto da bubble...',
  };

  it('deve aceitar nota com campos obrigatorios', () => {
    const result = createNoteSchema.safeParse(validNote);
    expect(result.success).toBe(true);
  });

  it('deve aceitar nota com tags opcionais', () => {
    const result = createNoteSchema.safeParse({ ...validNote, tags: 'icm, bubble' });
    expect(result.success).toBe(true);
  });

  // --- title ---

  it('deve rejeitar title vazio', () => {
    const result = createNoteSchema.safeParse({ ...validNote, title: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar title ausente', () => {
    const result = createNoteSchema.safeParse({ content: 'algo' });
    expect(result.success).toBe(false);
  });

  // --- content ---

  it('deve rejeitar content vazio', () => {
    const result = createNoteSchema.safeParse({ ...validNote, content: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar content ausente', () => {
    const result = createNoteSchema.safeParse({ title: 'Titulo' });
    expect(result.success).toBe(false);
  });

  // --- tags optional ---

  it('deve aceitar tags undefined', () => {
    const result = createNoteSchema.safeParse(validNote);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toBeUndefined();
    }
  });

  it('deve aceitar tags como string vazia', () => {
    const result = createNoteSchema.safeParse({ ...validNote, tags: '' });
    expect(result.success).toBe(true);
  });
});
