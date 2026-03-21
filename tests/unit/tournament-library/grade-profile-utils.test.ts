import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Profile Utils — funcoes utilitarias para perfis A/B/C/OFF
//
// O modulo shared/grade-profile-utils.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo com as 4 funcoes abaixo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import {
  isProfileActive,
  canAcceptTournament,
  getProfileColor,
  getProfileLabel,
} from '../../../shared/grade-profile-utils';

// =============================================================================
// Grupo 1a: isProfileActive
// =============================================================================

describe('isProfileActive', () => {
  it('deve retornar true para perfil "A"', () => {
    expect(isProfileActive('A')).toBe(true);
  });

  it('deve retornar true para perfil "B"', () => {
    expect(isProfileActive('B')).toBe(true);
  });

  it('deve retornar true para perfil "C"', () => {
    expect(isProfileActive('C')).toBe(true);
  });

  it('deve retornar false para perfil "OFF"', () => {
    expect(isProfileActive('OFF')).toBe(false);
  });

  it('deve retornar false para null', () => {
    expect(isProfileActive(null as any)).toBe(false);
  });

  it('deve retornar false para undefined', () => {
    expect(isProfileActive(undefined as any)).toBe(false);
  });
});

// =============================================================================
// Grupo 1b: canAcceptTournament
// =============================================================================

describe('canAcceptTournament', () => {
  it('deve retornar true para perfil "A" — dia jogavel aceita torneios', () => {
    expect(canAcceptTournament('A')).toBe(true);
  });

  it('deve retornar false para perfil "OFF" — dia OFF nao aceita torneios', () => {
    expect(canAcceptTournament('OFF')).toBe(false);
  });

  it('deve retornar false para null — equivale a OFF', () => {
    expect(canAcceptTournament(null as any)).toBe(false);
  });
});

// =============================================================================
// Grupo 1c: getProfileColor
// =============================================================================

describe('getProfileColor', () => {
  it('deve retornar "emerald" para perfil "A"', () => {
    expect(getProfileColor('A')).toBe('emerald');
  });

  it('deve retornar "blue" para perfil "B"', () => {
    expect(getProfileColor('B')).toBe('blue');
  });

  it('deve retornar "amber" para perfil "C"', () => {
    expect(getProfileColor('C')).toBe('amber');
  });

  it('deve retornar "gray" para perfil "OFF"', () => {
    expect(getProfileColor('OFF')).toBe('gray');
  });

  it('deve retornar "gray" para null', () => {
    expect(getProfileColor(null as any)).toBe('gray');
  });

  it('deve retornar "gray" para undefined', () => {
    expect(getProfileColor(undefined as any)).toBe('gray');
  });
});

// =============================================================================
// Grupo 1d: getProfileLabel
// =============================================================================

describe('getProfileLabel', () => {
  it('deve retornar "Perfil A" para perfil "A"', () => {
    expect(getProfileLabel('A')).toBe('Perfil A');
  });

  it('deve retornar "Perfil B" para perfil "B"', () => {
    expect(getProfileLabel('B')).toBe('Perfil B');
  });

  it('deve retornar "Perfil C" para perfil "C"', () => {
    expect(getProfileLabel('C')).toBe('Perfil C');
  });

  it('deve retornar "Dia OFF" para perfil "OFF"', () => {
    expect(getProfileLabel('OFF')).toBe('Dia OFF');
  });

  it('deve retornar "Dia OFF" para null', () => {
    expect(getProfileLabel(null as any)).toBe('Dia OFF');
  });
});
