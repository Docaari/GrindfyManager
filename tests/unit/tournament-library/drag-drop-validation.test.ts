import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Drop Validation — valida se um drop e permitido
//
// O modulo shared/drag-drop-utils.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo com as funcoes abaixo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import { validateDrop } from '../../../shared/drag-drop-utils';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

function makeSource(overrides: Record<string, any> = {}) {
  return {
    type: 'library' as const,
    tournamentId: 'lib-abc123',
    ...overrides,
  };
}

function makeCellSource(overrides: Record<string, any> = {}) {
  return {
    type: 'cell' as const,
    tournamentId: 'pt-xyz789',
    fromDay: 1,
    fromTime: '19:00',
    ...overrides,
  };
}

function makeDestination(overrides: Record<string, any> = {}) {
  return {
    dayOfWeek: 2,
    time: '20:00',
    profile: 'A',
    ...overrides,
  };
}

// =============================================================================
// Grupo 1: validateDrop — biblioteca/celula -> celula da grade
// =============================================================================

describe('validateDrop', () => {

  // ---------------------------------------------------------------------------
  // Happy path: drop permitido em dia ativo
  // ---------------------------------------------------------------------------

  it('deve permitir drop de library em dia com perfil A', () => {
    const result = validateDrop(makeSource(), makeDestination({ profile: 'A' }));

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('deve permitir drop de library em dia com perfil B', () => {
    const result = validateDrop(makeSource(), makeDestination({ profile: 'B' }));

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('deve permitir drop de library em dia com perfil C', () => {
    const result = validateDrop(makeSource(), makeDestination({ profile: 'C' }));

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('deve permitir drop de celula (reposicionar) em dia com perfil A', () => {
    const result = validateDrop(makeCellSource(), makeDestination({ profile: 'A' }));

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Drop rejeitado: dia OFF
  // ---------------------------------------------------------------------------

  it('deve rejeitar drop em dia com perfil OFF', () => {
    const result = validateDrop(makeSource(), makeDestination({ profile: 'OFF' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Dia OFF não aceita torneios');
  });

  it('deve rejeitar reposicionamento de chip para dia OFF', () => {
    const result = validateDrop(makeCellSource(), makeDestination({ profile: 'OFF' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Dia OFF não aceita torneios');
  });

  // ---------------------------------------------------------------------------
  // Drop rejeitado: perfil null/undefined (equivale a OFF)
  // ---------------------------------------------------------------------------

  it('deve rejeitar drop quando perfil do destino e null', () => {
    const result = validateDrop(makeSource(), makeDestination({ profile: null }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Dia OFF não aceita torneios');
  });

  it('deve rejeitar drop quando perfil do destino e undefined', () => {
    const result = validateDrop(makeSource(), makeDestination({ profile: undefined }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Dia OFF não aceita torneios');
  });

  // ---------------------------------------------------------------------------
  // Drop cancelado: sem destination
  // ---------------------------------------------------------------------------

  it('deve rejeitar drop quando destination e null (drop fora de celula)', () => {
    const result = validateDrop(makeSource(), null);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Drop cancelado');
  });

  it('deve rejeitar drop quando destination e undefined', () => {
    const result = validateDrop(makeSource(), undefined);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Drop cancelado');
  });

  // ---------------------------------------------------------------------------
  // Drop rejeitado: horario invalido
  // ---------------------------------------------------------------------------

  it('deve rejeitar drop com horario vazio', () => {
    const result = validateDrop(makeSource(), makeDestination({ time: '' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Horário inválido');
  });

  it('deve rejeitar drop com horario null', () => {
    const result = validateDrop(makeSource(), makeDestination({ time: null }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Horário inválido');
  });

  it('deve rejeitar drop com horario em formato invalido', () => {
    const result = validateDrop(makeSource(), makeDestination({ time: '25:00' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Horário inválido');
  });

  it('deve rejeitar drop com horario "abc"', () => {
    const result = validateDrop(makeSource(), makeDestination({ time: 'abc' }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Horário inválido');
  });

  // ---------------------------------------------------------------------------
  // Edge cases: horarios validos nos limites
  // ---------------------------------------------------------------------------

  it('deve permitir drop com horario "00:00" (meia-noite)', () => {
    const result = validateDrop(makeSource(), makeDestination({ time: '00:00' }));

    expect(result.allowed).toBe(true);
  });

  it('deve permitir drop com horario "23:00"', () => {
    const result = validateDrop(makeSource(), makeDestination({ time: '23:00' }));

    expect(result.allowed).toBe(true);
  });

  it('deve permitir drop com horario "03:00" (madrugada — comum em poker)', () => {
    const result = validateDrop(makeSource(), makeDestination({ time: '03:00' }));

    expect(result.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Edge cases: dayOfWeek valido
  // ---------------------------------------------------------------------------

  it('deve permitir drop no domingo (dayOfWeek=0)', () => {
    const result = validateDrop(makeSource(), makeDestination({ dayOfWeek: 0 }));

    expect(result.allowed).toBe(true);
  });

  it('deve permitir drop no sabado (dayOfWeek=6)', () => {
    const result = validateDrop(makeSource(), makeDestination({ dayOfWeek: 6 }));

    expect(result.allowed).toBe(true);
  });
});
