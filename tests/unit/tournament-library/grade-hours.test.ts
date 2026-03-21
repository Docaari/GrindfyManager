import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Grade Hours — configuracao de horario e funcoes utilitarias
//
// Os campos gradeStartHour/gradeEndHour AINDA NAO EXISTEM em user_settings.
// As funcoes generateTimeSlots e validateGradeHours AINDA NAO EXISTEM.
// O Implementer vai cria-los.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import { insertUserSettingsSchema } from '../../../shared/schema';
import {
  generateTimeSlots,
  validateGradeHours,
} from '../../../shared/grade-hours';

// =============================================================================
// Grupo 3: user_settings — novos campos gradeStartHour / gradeEndHour
// =============================================================================

describe('insertUserSettingsSchema — grade hours', () => {
  const validSettings = {
    userId: 'USER-0001',
  };

  // -------------------------------------------------------------------------
  // Happy path — defaults
  // -------------------------------------------------------------------------

  it('deve aceitar gradeStartHour com default 12', () => {
    const result = insertUserSettingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
    // O Implementer deve garantir default 12 no schema Drizzle
  });

  it('deve aceitar gradeEndHour com default 3', () => {
    const result = insertUserSettingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
    // O Implementer deve garantir default 3 no schema Drizzle
  });

  // -------------------------------------------------------------------------
  // Aceitar valores validos (0-23)
  // -------------------------------------------------------------------------

  it('deve aceitar gradeStartHour 0 (meia-noite)', () => {
    const data = { ...validSettings, gradeStartHour: 0 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar gradeStartHour 23', () => {
    const data = { ...validSettings, gradeStartHour: 23 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar gradeEndHour 0 (meia-noite)', () => {
    const data = { ...validSettings, gradeEndHour: 0 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar gradeEndHour 23', () => {
    const data = { ...validSettings, gradeEndHour: 23 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar gradeStartHour 18 e gradeEndHour 3 (noturno)', () => {
    const data = { ...validSettings, gradeStartHour: 18, gradeEndHour: 3 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Rejeitar valores fora do range
  // -------------------------------------------------------------------------

  it('deve rejeitar gradeStartHour -1', () => {
    const data = { ...validSettings, gradeStartHour: -1 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar gradeStartHour 24', () => {
    const data = { ...validSettings, gradeStartHour: 24 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar gradeEndHour -1', () => {
    const data = { ...validSettings, gradeEndHour: -1 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar gradeEndHour 24', () => {
    const data = { ...validSettings, gradeEndHour: 24 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Rejeitar decimais (deve ser inteiro)
  // -------------------------------------------------------------------------

  it('deve rejeitar gradeStartHour decimal (ex: 12.5)', () => {
    const data = { ...validSettings, gradeStartHour: 12.5 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar gradeEndHour decimal (ex: 3.7)', () => {
    const data = { ...validSettings, gradeEndHour: 3.7 };
    const result = insertUserSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Grupo 5: generateTimeSlots — funcao utilitaria
// =============================================================================

describe('generateTimeSlots', () => {

  // -------------------------------------------------------------------------
  // Happy path — range normal (sem cruzar meia-noite)
  // -------------------------------------------------------------------------

  it('deve gerar slots para range normal (18-23)', () => {
    const slots = generateTimeSlots(18, 23);
    expect(slots).toEqual(['18:00', '19:00', '20:00', '21:00', '22:00']);
  });

  it('deve gerar slots para range diurno (10-15)', () => {
    const slots = generateTimeSlots(10, 15);
    expect(slots).toEqual(['10:00', '11:00', '12:00', '13:00', '14:00']);
  });

  // -------------------------------------------------------------------------
  // Cruza meia-noite (wrap midnight)
  // -------------------------------------------------------------------------

  it('deve gerar slots cruzando meia-noite (22-3)', () => {
    const slots = generateTimeSlots(22, 3);
    expect(slots).toEqual(['22:00', '23:00', '00:00', '01:00', '02:00']);
  });

  it('deve gerar slots cruzando meia-noite (18-3) — padrao noturno', () => {
    const slots = generateTimeSlots(18, 3);
    expect(slots).toEqual([
      '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
      '00:00', '01:00', '02:00',
    ]);
  });

  // -------------------------------------------------------------------------
  // Range minimo (4 horas) e maximo (20 horas)
  // -------------------------------------------------------------------------

  it('deve gerar slots para range minimo de 4 horas (10-14)', () => {
    const slots = generateTimeSlots(10, 14);
    // startHour incluido, endHour excluido: 10, 11, 12, 13
    expect(slots).toEqual(['10:00', '11:00', '12:00', '13:00']);
  });

  it('deve gerar slots para range minimo cruzando meia-noite (23-3)', () => {
    const slots = generateTimeSlots(23, 3);
    expect(slots).toEqual(['23:00', '00:00', '01:00', '02:00']);
  });

  // -------------------------------------------------------------------------
  // Formato de saida
  // -------------------------------------------------------------------------

  it('deve formatar horas menores que 10 com zero a esquerda (ex: "01:00")', () => {
    const slots = generateTimeSlots(0, 4);
    expect(slots).toEqual(['00:00', '01:00', '02:00', '03:00']);
  });

  it('deve retornar array de strings no formato "HH:00"', () => {
    const slots = generateTimeSlots(12, 15);
    slots.forEach(slot => {
      expect(slot).toMatch(/^\d{2}:00$/);
    });
  });

  // -------------------------------------------------------------------------
  // Default do projeto (12-3)
  // -------------------------------------------------------------------------

  it('deve gerar slots para defaults do projeto (12-3)', () => {
    const slots = generateTimeSlots(12, 3);
    expect(slots).toEqual([
      '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
      '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
      '00:00', '01:00', '02:00',
    ]);
  });
});

// =============================================================================
// Grupo 5 (cont): validateGradeHours — funcao de validacao
// =============================================================================

describe('validateGradeHours', () => {

  // -------------------------------------------------------------------------
  // Aceitar — ranges validos
  // -------------------------------------------------------------------------

  it('deve aceitar range normal valido (18-23 = 5 horas)', () => {
    const result = validateGradeHours(18, 23);
    expect(result.valid).toBe(true);
  });

  it('deve aceitar range cruzando meia-noite (22-3 = 5 horas)', () => {
    const result = validateGradeHours(22, 3);
    expect(result.valid).toBe(true);
  });

  it('deve aceitar range de exatamente 4 horas (10-14)', () => {
    const result = validateGradeHours(10, 14);
    expect(result.valid).toBe(true);
  });

  it('deve aceitar range de exatamente 20 horas (6-2)', () => {
    const result = validateGradeHours(6, 2);
    expect(result.valid).toBe(true);
  });

  it('deve aceitar defaults do projeto (12-3 = 15 horas)', () => {
    const result = validateGradeHours(12, 3);
    expect(result.valid).toBe(true);
  });

  it('deve aceitar range de 4 horas cruzando meia-noite (23-3)', () => {
    const result = validateGradeHours(23, 3);
    expect(result.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Rejeitar — start === end
  // -------------------------------------------------------------------------

  it('deve rejeitar quando start e end sao iguais (0 horas)', () => {
    const result = validateGradeHours(18, 18);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Rejeitar — range < 4 horas
  // -------------------------------------------------------------------------

  it('deve rejeitar range de 1 hora (10-11)', () => {
    const result = validateGradeHours(10, 11);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('deve rejeitar range de 2 horas (20-22)', () => {
    const result = validateGradeHours(20, 22);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('deve rejeitar range de 3 horas (22-1)', () => {
    const result = validateGradeHours(22, 1);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Rejeitar — range > 20 horas
  // -------------------------------------------------------------------------

  it('deve rejeitar range de 21 horas (6-3)', () => {
    const result = validateGradeHours(6, 3);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('deve rejeitar range de 23 horas (0-23)', () => {
    const result = validateGradeHours(0, 23);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
