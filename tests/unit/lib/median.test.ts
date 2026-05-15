// Test-Writer (Modo TDD - Red Phase)
// Spec: Docs/specs/grade-planner-mediana-participantes.md
// Cobre RF-01 (helper median) + RF-02 (helper estimatedFieldSize).
//
// Modulo planejado: client/src/lib/median.ts — NAO existe ainda.
// Esperado: vermelho com "Cannot find module '@/lib/median'" no red phase.

import { describe, it, expect } from 'vitest';
import { median, estimatedFieldSize } from '@/lib/median';

describe('median()  (RF-01)', () => {
  it('retorna null para array vazio', () => {
    expect(median([])).toBeNull();
  });

  it('retorna o proprio elemento para array com 1 valor', () => {
    expect(median([42])).toBe(42);
  });

  it('retorna o valor do meio para array impar [1, 2, 3]', () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it('retorna a media aritmetica dos dois centrais para array par [1, 2, 3, 100]', () => {
    expect(median([1, 2, 3, 100])).toBe(2.5);
  });

  it('caso outlier do founder: [150, 200, 250, 300, 400, 500, 10000] = 300 (mediana resistente)', () => {
    // Confirma que a mediana NAO eh distorcida pelo outlier de 10000.
    // A media aritmetica seria ~1657; a mediana eh 300.
    expect(median([150, 200, 250, 300, 400, 500, 10000])).toBe(300);
  });

  it('aceita input em ordem arbitraria (sort interno funciona) — [3, 1, 2] = 2', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('eh puro: NAO muta o array de entrada (preserva ordem original apos chamada)', () => {
    const input = [3, 1, 4, 1, 5, 9, 2, 6];
    const snapshot = [...input];
    median(input);
    expect(input).toEqual(snapshot);
  });
});

describe('estimatedFieldSize()  (RF-02)', () => {
  it('aceita strings: guaranteed="10000" / buyIn="100" retorna 100', () => {
    expect(estimatedFieldSize({ guaranteed: '10000', buyIn: '100' })).toBe(100);
  });

  it('aceita numbers: guaranteed=10000 / buyIn=100 retorna 100', () => {
    expect(estimatedFieldSize({ guaranteed: 10000, buyIn: 100 })).toBe(100);
  });

  it('retorna null quando guaranteed <= 0 (zero)', () => {
    expect(estimatedFieldSize({ guaranteed: '0', buyIn: '100' })).toBeNull();
  });

  it('retorna null quando buyIn <= 0 (zero, freeroll)', () => {
    expect(estimatedFieldSize({ guaranteed: '100', buyIn: '0' })).toBeNull();
  });

  it('retorna null quando guaranteed eh undefined', () => {
    expect(estimatedFieldSize({ buyIn: '100' })).toBeNull();
  });

  it('retorna null quando buyIn eh undefined', () => {
    expect(estimatedFieldSize({ guaranteed: '100' })).toBeNull();
  });

  it('retorna null quando guaranteed eh string invalida (NaN parseado)', () => {
    expect(estimatedFieldSize({ guaranteed: 'abc', buyIn: '100' })).toBeNull();
  });

  it('arredondamento normal: guaranteed=550 / buyIn=11 retorna 50', () => {
    expect(estimatedFieldSize({ guaranteed: '550', buyIn: '11' })).toBe(50);
  });

  it('arredondamento Math.round: guaranteed=551 / buyIn=11 (=50.09) retorna 50', () => {
    expect(estimatedFieldSize({ guaranteed: '551', buyIn: '11' })).toBe(50);
  });
});
