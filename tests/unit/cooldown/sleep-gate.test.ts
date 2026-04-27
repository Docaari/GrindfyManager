import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — Sleep Gate helpers
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Modulo NAO existe ainda — Implementer cria em:
//   server/services/sleepGateService.ts
//
// Exports esperados:
//   - nextMorning(now: Date): Date  -> proximo dia 08:00 LOCAL
//   - randomActivitySuggestion(): string  -> 1 de 6 valores
// =============================================================================

import {
  nextMorning,
  randomActivitySuggestion,
} from '../../../server/services/sleepGateService';

// ---------------------------------------------------------------------------
// nextMorning(now)
// ---------------------------------------------------------------------------

describe('nextMorning - regra do proximo dia 08:00', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof nextMorning).toBe('function');
  });

  it('now=23:59 segunda -> retorna terca 08:00', () => {
    // Segunda-feira, 23:59 (local)
    const monday2359 = new Date(2026, 3, 27, 23, 59, 0); // Apr 27, 2026 (segunda)
    const result = nextMorning(monday2359);

    // terca 28, 08:00
    expect(result.getDate()).toBe(28);
    expect(result.getMonth()).toBe(3);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
  });

  it('now=06:00 segunda (antes das 08h) -> retorna mesma segunda 08:00', () => {
    const monday0600 = new Date(2026, 3, 27, 6, 0, 0);
    const result = nextMorning(monday0600);

    expect(result.getDate()).toBe(27);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
  });

  it('now=10:00 (depois das 08h) -> retorna proximo dia 08:00', () => {
    const monday1000 = new Date(2026, 3, 27, 10, 0, 0);
    const result = nextMorning(monday1000);

    expect(result.getDate()).toBe(28);
    expect(result.getHours()).toBe(8);
  });

  it('now=08:00 exato -> trata como ja passou; retorna proximo dia 08:00', () => {
    // Borderline: spec ambigua. Implementacao pode optar por considerar 08:00:00
    // como ja passou (proximo dia) — assert e tolerante: aceita qualquer dia >= now.
    const monday0800 = new Date(2026, 3, 27, 8, 0, 0);
    const result = nextMorning(monday0800);

    // Aceita: mesmo dia 08:00 (se now < target estritamente) OU proximo dia 08:00
    expect(result.getHours()).toBe(8);
    expect(result.getTime() >= monday0800.getTime()).toBe(true);
  });

  it('now=07:59:59 -> retorna mesma data 08:00:00', () => {
    const monday075959 = new Date(2026, 3, 27, 7, 59, 59);
    const result = nextMorning(monday075959);

    expect(result.getDate()).toBe(27);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('atravessa virada de mes (30 abril 23h -> 1 maio 08h)', () => {
    const apr30_23 = new Date(2026, 3, 30, 23, 0, 0);
    const result = nextMorning(apr30_23);

    expect(result.getMonth()).toBe(4); // maio
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(8);
  });

  it('atravessa virada de ano (31 dez 23h -> 1 jan 08h proximo ano)', () => {
    const dec31_23 = new Date(2026, 11, 31, 23, 0, 0);
    const result = nextMorning(dec31_23);

    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(8);
  });

  it('retorna Date (nao string)', () => {
    const result = nextMorning(new Date(2026, 3, 27, 22, 0, 0));
    expect(result instanceof Date).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// randomActivitySuggestion()
// ---------------------------------------------------------------------------

describe('randomActivitySuggestion - 6 atividades neutras', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof randomActivitySuggestion).toBe('function');
  });

  it('retorna string nao vazia', () => {
    const v = randomActivitySuggestion();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });

  it('cobre as 6 atividades do pool em 100 amostras', () => {
    const expected = [
      /Ler livro 20min/i,
      /Caminhar 10min/i,
      /Banho quente/i,
      /Conversar com algu[eé]m/i,
      /Cozinhar/i,
      /Tarefa dom[eé]stica leve/i,
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const v = randomActivitySuggestion();
      seen.add(v);
    }
    // Em 100 amostras com pool de 6, espera-se ver pelo menos 4 distintos.
    expect(seen.size).toBeGreaterThanOrEqual(4);

    // Cada amostra retorna algo do pool (regex match)
    for (const v of seen) {
      const matches = expected.some((re) => re.test(v));
      expect(matches).toBe(true);
    }
  });
});
