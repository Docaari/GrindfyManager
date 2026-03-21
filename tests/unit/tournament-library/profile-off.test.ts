import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: profile_states — suporte a valor 'OFF'
//
// O schema atual aceita activeProfile como varchar sem restricao de enum.
// O Implementer deve adicionar validacao Zod para aceitar apenas A/B/C/OFF/null.
// O default deve mudar de null para 'OFF'.
//
// Todos os testes devem FALHAR (red phase) — as validacoes de enum ainda nao existem.
// =============================================================================

// ---------------------------------------------------------------------------
// Import do schema que sera ALTERADO pelo Implementer
// ---------------------------------------------------------------------------
import { insertProfileStateSchema } from '../../../shared/schema';

// =============================================================================
// Grupo 4: profile_states — activeProfile aceita A/B/C/OFF
// =============================================================================

describe('insertProfileStateSchema — suporte OFF', () => {
  const validProfileState = {
    userId: 'USER-0001',
    dayOfWeek: 1, // Monday
  };

  // -------------------------------------------------------------------------
  // Valores validos do enum
  // -------------------------------------------------------------------------

  it('deve aceitar activeProfile "A"', () => {
    const data = { ...validProfileState, activeProfile: 'A' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar activeProfile "B"', () => {
    const data = { ...validProfileState, activeProfile: 'B' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar activeProfile "C"', () => {
    const data = { ...validProfileState, activeProfile: 'C' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar activeProfile "OFF"', () => {
    const data = { ...validProfileState, activeProfile: 'OFF' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Compatibilidade: null tratado como OFF
  // -------------------------------------------------------------------------

  it('deve aceitar activeProfile null (compatibilidade com dados antigos)', () => {
    const data = { ...validProfileState, activeProfile: null };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile state sem activeProfile (campo opcional, default OFF)', () => {
    const result = insertProfileStateSchema.safeParse(validProfileState);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Rejeitar valores invalidos
  // -------------------------------------------------------------------------

  it('deve rejeitar activeProfile "D"', () => {
    const data = { ...validProfileState, activeProfile: 'D' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar activeProfile "X"', () => {
    const data = { ...validProfileState, activeProfile: 'X' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar activeProfile string vazia', () => {
    const data = { ...validProfileState, activeProfile: '' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar activeProfile "off" (case-sensitive, deve ser "OFF")', () => {
    const data = { ...validProfileState, activeProfile: 'off' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar activeProfile "a" (case-sensitive, deve ser "A")', () => {
    const data = { ...validProfileState, activeProfile: 'a' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar activeProfile numerico', () => {
    const data = { ...validProfileState, activeProfile: 1 };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Campos obrigatorios (regressao — garantir que nao quebra)
  // -------------------------------------------------------------------------

  it('deve continuar exigindo userId', () => {
    const { userId, ...data } = { ...validProfileState, activeProfile: 'A' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve continuar exigindo dayOfWeek', () => {
    const { dayOfWeek, ...data } = { ...validProfileState, activeProfile: 'A' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Todos os dias da semana (regressao)
  // -------------------------------------------------------------------------

  it('deve aceitar OFF para todos os dias da semana (0-6)', () => {
    for (let day = 0; day <= 6; day++) {
      const data = { userId: 'USER-0001', dayOfWeek: day, activeProfile: 'OFF' };
      const result = insertProfileStateSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });
});
