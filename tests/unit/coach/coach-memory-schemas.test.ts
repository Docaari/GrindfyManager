import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Schemas Zod para as tabelas de memoria do AI Coach
//
// Testa os schemas de insert para user_ai_profile e monthly_coach_summaries.
// Os schemas serao criados em shared/schema.ts (AINDA NAO EXISTEM)
//
// Todos devem FALHAR (red phase) — Implementer criara os schemas.
// =============================================================================

import {
  insertUserAiProfileSchema,
  insertMonthlyCoachSummarySchema,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// insertUserAiProfileSchema
// ---------------------------------------------------------------------------
describe('insertUserAiProfileSchema', () => {
  const validProfile = {
    userId: 'USER-0001',
    content: '- Objetivo: chegar a $50 ABI ate dezembro\n- Estilo: tight-aggressive\n- Contexto: profissional full-time',
    version: 1,
    tokenCount: 45,
  };

  it('deve aceitar perfil com todos os campos validos', () => {
    const result = insertUserAiProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it('deve aceitar perfil com apenas userId (campos opcionais)', () => {
    const result = insertUserAiProfileSchema.safeParse({
      userId: 'USER-0001',
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar perfil sem userId', () => {
    const result = insertUserAiProfileSchema.safeParse({
      content: 'algum conteudo',
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar content vazio (default)', () => {
    const result = insertUserAiProfileSchema.safeParse({
      userId: 'USER-0001',
      content: '',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar content ate 2000 caracteres', () => {
    const longContent = 'x'.repeat(2000);
    const result = insertUserAiProfileSchema.safeParse({
      userId: 'USER-0001',
      content: longContent,
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar content acima de 2000 caracteres', () => {
    const tooLongContent = 'x'.repeat(2001);
    const result = insertUserAiProfileSchema.safeParse({
      userId: 'USER-0001',
      content: tooLongContent,
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar version como numero inteiro positivo', () => {
    const result = insertUserAiProfileSchema.safeParse({
      userId: 'USER-0001',
      version: 5,
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar tokenCount como numero inteiro', () => {
    const result = insertUserAiProfileSchema.safeParse({
      userId: 'USER-0001',
      tokenCount: 200,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertMonthlyCoachSummarySchema
// ---------------------------------------------------------------------------
describe('insertMonthlyCoachSummarySchema', () => {
  const validSummary = {
    userId: 'USER-0001',
    coachType: 'mental',
    month: '2026-04',
    summary: 'Jogador trabalhou tilt control e melhorou foco nas ultimas sessoes.',
    sessionsCompacted: 5,
    tokenCount: 120,
  };

  it('deve aceitar summary com todos os campos validos', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse(validSummary);
    expect(result.success).toBe(true);
  });

  it('deve aceitar coachType "mental"', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      coachType: 'mental',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar coachType "tournament"', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      coachType: 'tournament',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar coachType "technical"', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      coachType: 'technical',
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar coachType invalido', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      coachType: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar sem userId', () => {
    const { userId, ...rest } = validSummary;
    const result = insertMonthlyCoachSummarySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar sem coachType', () => {
    const { coachType, ...rest } = validSummary;
    const result = insertMonthlyCoachSummarySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar sem month', () => {
    const { month, ...rest } = validSummary;
    const result = insertMonthlyCoachSummarySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar sem summary', () => {
    const { summary, ...rest } = validSummary;
    const result = insertMonthlyCoachSummarySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // Validacao de formato de month (YYYY-MM)
  it('deve aceitar month no formato YYYY-MM', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      month: '2026-12',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar month "2025-01" (janeiro)', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      month: '2025-01',
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar month com formato invalido (DD/MM/YYYY)', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      month: '01/04/2026',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar month com formato invalido (YYYY-M)', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      month: '2026-4',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar month com mes invalido (13)', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      month: '2026-13',
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar sessionsCompacted como numero inteiro', () => {
    const result = insertMonthlyCoachSummarySchema.safeParse({
      ...validSummary,
      sessionsCompacted: 12,
    });
    expect(result.success).toBe(true);
  });
});
