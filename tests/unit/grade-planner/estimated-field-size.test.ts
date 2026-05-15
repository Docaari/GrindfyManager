// Test-Writer (Modo TDD - Red Phase)
// Spec: Docs/specs/grade-planner-mediana-participantes.md (RF-02)
// Cobre estimatedFieldSize com edge cases adicionais (negativo, virgula, mix).
//
// Modulo planejado: client/src/lib/median.ts — NAO existe ainda.

import { describe, it, expect } from 'vitest';
import { estimatedFieldSize } from '@/lib/median';

describe('estimatedFieldSize() — edge cases (RF-02)', () => {
  it('caso happy path: { guaranteed: 10000, buyIn: 100 } -> 100', () => {
    expect(estimatedFieldSize({ guaranteed: 10000, buyIn: 100 })).toBe(100);
  });

  it('string aceita: { guaranteed: "10000", buyIn: "100" } -> 100', () => {
    expect(estimatedFieldSize({ guaranteed: '10000', buyIn: '100' })).toBe(100);
  });

  it('guaranteed=0 -> null (sem garantido valido)', () => {
    expect(estimatedFieldSize({ guaranteed: 0, buyIn: 100 })).toBeNull();
  });

  it('buyIn=0 -> null (freeroll)', () => {
    expect(estimatedFieldSize({ guaranteed: 10000, buyIn: 0 })).toBeNull();
  });

  it('guaranteed=undefined -> null', () => {
    expect(estimatedFieldSize({ guaranteed: undefined, buyIn: 100 })).toBeNull();
  });

  it('buyIn=undefined -> null', () => {
    expect(estimatedFieldSize({ guaranteed: 10000, buyIn: undefined })).toBeNull();
  });

  it('guaranteed="abc" -> null (NaN parseFloat)', () => {
    expect(estimatedFieldSize({ guaranteed: 'abc', buyIn: '100' })).toBeNull();
  });

  it('guaranteed negativo -> null (-100 / 100)', () => {
    expect(estimatedFieldSize({ guaranteed: -100, buyIn: 100 })).toBeNull();
  });

  it('buyIn negativo -> null (100 / -10)', () => {
    expect(estimatedFieldSize({ guaranteed: 100, buyIn: -10 })).toBeNull();
  });

  it('arredondamento padrao: 550 / 11 -> 50', () => {
    expect(estimatedFieldSize({ guaranteed: '550', buyIn: '11' })).toBe(50);
  });

  it('arredondamento para baixo: 551 / 11 (= 50.09) -> 50', () => {
    expect(estimatedFieldSize({ guaranteed: '551', buyIn: '11' })).toBe(50);
  });

  it('arredondamento para cima: 5550 / 11 (= 504.5) -> 505', () => {
    expect(estimatedFieldSize({ guaranteed: '5550', buyIn: '11' })).toBe(505);
  });

  it('mix de string + number: { guaranteed: "10000", buyIn: 100 } -> 100', () => {
    expect(estimatedFieldSize({ guaranteed: '10000', buyIn: 100 })).toBe(100);
  });
});
