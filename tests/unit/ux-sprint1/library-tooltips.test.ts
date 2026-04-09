import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-06 e RF-07 — Tooltips de confidence e volatilidade (FP-19, FP-20)
//
// Funcoes puras que determinam conteudo e estilo dos tooltips:
//   - `getConfidenceTooltip`: retorna texto do tooltip para grade de confidence
//   - `getVolatilityTooltip`: retorna texto do tooltip para SD Buyins
//   - `getVolatilityColor`: retorna classe CSS baseada no valor de SD
//   - `getVolatilityLevel`: retorna nivel de volatilidade (low/medium/high)
//
// Modulo esperado: `client/src/components/tournament-library/tooltip-helpers.ts`
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem como modulo separado.
// =============================================================================

// Estas funcoes AINDA NAO EXISTEM como modulo separado
// import {
//   getConfidenceTooltip,
//   getVolatilityTooltip,
//   getVolatilityColor,
//   getVolatilityLevel,
// } from '../../../client/src/components/tournament-library/tooltip-helpers';

// Stubs
let getConfidenceTooltip: (grade: string) => string;
let getVolatilityTooltip: () => string;
let getVolatilityColor: (sdBuyins: number) => string;
let getVolatilityLevel: (sdBuyins: number) => 'low' | 'medium' | 'high';

try {
  const mod = require('../../../client/src/components/tournament-library/tooltip-helpers');
  if (mod.getConfidenceTooltip) getConfidenceTooltip = mod.getConfidenceTooltip;
  if (mod.getVolatilityTooltip) getVolatilityTooltip = mod.getVolatilityTooltip;
  if (mod.getVolatilityColor) getVolatilityColor = mod.getVolatilityColor;
  if (mod.getVolatilityLevel) getVolatilityLevel = mod.getVolatilityLevel;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// getConfidenceTooltip — RF-06: tooltip para badges A-F
// ---------------------------------------------------------------------------

describe('getConfidenceTooltip', () => {
  it('deve retornar tooltip correto para grade A', () => {
    const tooltip = getConfidenceTooltip('A');
    expect(tooltip).toContain('2000+');
    expect(tooltip).toContain('altamente confiavel');
  });

  it('deve retornar tooltip correto para grade B', () => {
    const tooltip = getConfidenceTooltip('B');
    expect(tooltip).toContain('1000-1999');
    expect(tooltip).toContain('confiavel');
  });

  it('deve retornar tooltip correto para grade C', () => {
    const tooltip = getConfidenceTooltip('C');
    expect(tooltip).toContain('500-999');
    expect(tooltip).toContain('moderado');
  });

  it('deve retornar tooltip correto para grade D', () => {
    const tooltip = getConfidenceTooltip('D');
    expect(tooltip).toContain('200-499');
    expect(tooltip).toContain('baixa confiabilidade');
  });

  it('deve retornar tooltip correto para grade F', () => {
    const tooltip = getConfidenceTooltip('F');
    expect(tooltip).toContain('50-199');
    expect(tooltip).toContain('dados insuficientes');
  });

  it('deve retornar string vazia para grade invalida', () => {
    const tooltip = getConfidenceTooltip('X');
    expect(tooltip).toBe('');
  });

  it('deve incluir a letra da grade no inicio do tooltip', () => {
    expect(getConfidenceTooltip('A')).toMatch(/^A/);
    expect(getConfidenceTooltip('B')).toMatch(/^B/);
    expect(getConfidenceTooltip('C')).toMatch(/^C/);
    expect(getConfidenceTooltip('D')).toMatch(/^D/);
    expect(getConfidenceTooltip('F')).toMatch(/^F/);
  });
});

// ---------------------------------------------------------------------------
// getVolatilityTooltip — RF-07: tooltip explicativo para SD Buyins
// ---------------------------------------------------------------------------

describe('getVolatilityTooltip', () => {
  it('deve mencionar "desvio padrao" ou "SD" na explicacao', () => {
    const tooltip = getVolatilityTooltip();
    expect(tooltip.toLowerCase()).toMatch(/desvio padr[aã]o|sd/i);
  });

  it('deve incluir referencia dos ranges de cor', () => {
    const tooltip = getVolatilityTooltip();
    expect(tooltip).toContain('<3');
    expect(tooltip).toContain('3-6');
    expect(tooltip).toContain('>6');
  });

  it('deve mencionar variancia ou previsibilidade', () => {
    const tooltip = getVolatilityTooltip();
    expect(tooltip.toLowerCase()).toMatch(/vari[aâ]ncia|previs[ií]vel|previsibilidade/i);
  });
});

// ---------------------------------------------------------------------------
// getVolatilityColor — RF-07: cor contextual para volatilidade
// ---------------------------------------------------------------------------

describe('getVolatilityColor', () => {
  // Verde: SD < 3 (baixa variancia)
  it('deve retornar cor verde (emerald) para SD < 3', () => {
    expect(getVolatilityColor(0)).toContain('emerald');
  });

  it('deve retornar cor verde (emerald) para SD = 2.9', () => {
    expect(getVolatilityColor(2.9)).toContain('emerald');
  });

  // Amarelo: SD 3-6 (media variancia)
  it('deve retornar cor amarela (yellow) para SD = 3', () => {
    expect(getVolatilityColor(3)).toContain('yellow');
  });

  it('deve retornar cor amarela (yellow) para SD = 4.5', () => {
    expect(getVolatilityColor(4.5)).toContain('yellow');
  });

  it('deve retornar cor amarela (yellow) para SD = 6', () => {
    expect(getVolatilityColor(6)).toContain('yellow');
  });

  // Vermelho: SD > 6 (alta variancia)
  it('deve retornar cor vermelha (red) para SD = 6.1', () => {
    expect(getVolatilityColor(6.1)).toContain('red');
  });

  it('deve retornar cor vermelha (red) para SD = 10', () => {
    expect(getVolatilityColor(10)).toContain('red');
  });

  // Classes CSS Tailwind esperadas
  it('deve retornar classe Tailwind text-emerald-400 para baixa volatilidade', () => {
    expect(getVolatilityColor(1.5)).toBe('text-emerald-400');
  });

  it('deve retornar classe Tailwind text-yellow-400 para media volatilidade', () => {
    expect(getVolatilityColor(4)).toBe('text-yellow-400');
  });

  it('deve retornar classe Tailwind text-red-400 para alta volatilidade', () => {
    expect(getVolatilityColor(8)).toBe('text-red-400');
  });
});

// ---------------------------------------------------------------------------
// getVolatilityLevel — RF-07: nivel de volatilidade
// ---------------------------------------------------------------------------

describe('getVolatilityLevel', () => {
  it('deve retornar "low" para SD < 3', () => {
    expect(getVolatilityLevel(0)).toBe('low');
    expect(getVolatilityLevel(1.5)).toBe('low');
    expect(getVolatilityLevel(2.9)).toBe('low');
  });

  it('deve retornar "medium" para SD >= 3 e SD <= 6', () => {
    expect(getVolatilityLevel(3)).toBe('medium');
    expect(getVolatilityLevel(4.5)).toBe('medium');
    expect(getVolatilityLevel(6)).toBe('medium');
  });

  it('deve retornar "high" para SD > 6', () => {
    expect(getVolatilityLevel(6.1)).toBe('high');
    expect(getVolatilityLevel(10)).toBe('high');
    expect(getVolatilityLevel(25)).toBe('high');
  });

  it('deve tratar threshold exato SD=3 como "medium" (limite inferior)', () => {
    expect(getVolatilityLevel(3)).toBe('medium');
  });

  it('deve tratar threshold exato SD=6 como "medium" (limite superior)', () => {
    expect(getVolatilityLevel(6)).toBe('medium');
  });
});
