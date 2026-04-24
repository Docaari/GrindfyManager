import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): funcoes puras parseRule + computeThresholds
//
// Fonte: docs/specs/bankroll-management.md (RF-01, RF-02, RF-10)
//        docs/architecture/decisions/018-bankroll-tolerance-hardcoded.md
//        docs/architecture/bankroll-index.md (Resumo Tecnico -> bankrollRules)
//
// Contrato esperado (import path canonico: server/scoring/bankrollRules.ts):
//   export const BANKROLL_TOLERANCE = 1.5
//   export function parseRule(rule: string | null | undefined):
//     { pct: number; valid: boolean; raw: string }
//   export function computeThresholds({ amount, rule }):
//     { softLimitUSD: number; hardLimitUSD: number; maxBuyInUSD: number; rulePct: number }
//
// Em um modulo separado da antiga bankrollThreshold() em routes/tournament-selector.ts,
// que agora deve importar esta implementacao (lição do Sprint 1).
// =============================================================================

import {
  parseRule,
  computeThresholds,
  BANKROLL_TOLERANCE,
} from '../../../server/scoring/bankrollRules';

describe('BANKROLL_TOLERANCE (constante)', () => {
  it('e exatamente 1.5 (ADR-018, spec Q1)', () => {
    expect(BANKROLL_TOLERANCE).toBe(1.5);
  });

  it('e imutavel (nao um objeto mutavel)', () => {
    expect(typeof BANKROLL_TOLERANCE).toBe('number');
  });
});

describe('parseRule', () => {
  describe('regras pre-definidas', () => {
    it('parseRule("1pct") => { pct: 1.0, valid: true }', () => {
      const r = parseRule('1pct');
      expect(r.valid).toBe(true);
      expect(r.pct).toBe(1.0);
    });

    it('parseRule("2pct") => { pct: 2.0, valid: true }', () => {
      const r = parseRule('2pct');
      expect(r.valid).toBe(true);
      expect(r.pct).toBe(2.0);
    });

    it('parseRule("5pct") => { pct: 5.0, valid: true }', () => {
      const r = parseRule('5pct');
      expect(r.valid).toBe(true);
      expect(r.pct).toBe(5.0);
    });
  });

  describe('regras custom fracionarias (spec Q2 - 1 casa decimal)', () => {
    it('parseRule("custom:3") => { pct: 3.0, valid: true }', () => {
      const r = parseRule('custom:3');
      expect(r.valid).toBe(true);
      expect(r.pct).toBe(3.0);
    });

    it('parseRule("custom:3.5") => { pct: 3.5, valid: true } (1 casa decimal aceita)', () => {
      const r = parseRule('custom:3.5');
      expect(r.valid).toBe(true);
      expect(r.pct).toBe(3.5);
    });

    it('parseRule("custom:0.1") => valid (limite inferior permitido)', () => {
      const r = parseRule('custom:0.1');
      expect(r.valid).toBe(true);
      expect(r.pct).toBeCloseTo(0.1, 5);
    });

    it('parseRule("custom:20") => valid (limite superior permitido)', () => {
      const r = parseRule('custom:20');
      expect(r.valid).toBe(true);
      expect(r.pct).toBe(20);
    });

    it('parseRule("custom:20.0") => valid (limite superior com decimal)', () => {
      const r = parseRule('custom:20.0');
      expect(r.valid).toBe(true);
      expect(r.pct).toBe(20.0);
    });
  });

  describe('regras invalidas (range fora de [0.1, 20])', () => {
    it('parseRule("custom:0.05") => valid=false (abaixo de 0.1)', () => {
      const r = parseRule('custom:0.05');
      expect(r.valid).toBe(false);
    });

    it('parseRule("custom:25") => valid=false (acima de 20)', () => {
      const r = parseRule('custom:25');
      expect(r.valid).toBe(false);
    });

    it('parseRule("custom:0") => valid=false', () => {
      const r = parseRule('custom:0');
      expect(r.valid).toBe(false);
    });

    it('parseRule("custom:-1") => valid=false (negativo)', () => {
      const r = parseRule('custom:-1');
      expect(r.valid).toBe(false);
    });
  });

  describe('regras invalidas (formato/casas decimais)', () => {
    it('parseRule("custom:3.55") => valid=false (2 casas decimais - spec Q2)', () => {
      const r = parseRule('custom:3.55');
      expect(r.valid).toBe(false);
    });

    it('parseRule("custom:3.5.1") => valid=false (multi-dot)', () => {
      const r = parseRule('custom:3.5.1');
      expect(r.valid).toBe(false);
    });

    it('parseRule("custom:abc") => valid=false (NaN)', () => {
      const r = parseRule('custom:abc');
      expect(r.valid).toBe(false);
    });

    it('parseRule("custom:") => valid=false (valor ausente)', () => {
      const r = parseRule('custom:');
      expect(r.valid).toBe(false);
    });

    it('parseRule("3pct") => valid=false (variante nao-listada)', () => {
      const r = parseRule('3pct');
      expect(r.valid).toBe(false);
    });

    it('parseRule("random") => valid=false', () => {
      const r = parseRule('random');
      expect(r.valid).toBe(false);
    });

    it('parseRule("") => valid=false (string vazia)', () => {
      const r = parseRule('');
      expect(r.valid).toBe(false);
    });

    it('parseRule(null) => valid=false', () => {
      const r = parseRule(null as any);
      expect(r.valid).toBe(false);
    });

    it('parseRule(undefined) => valid=false', () => {
      const r = parseRule(undefined as any);
      expect(r.valid).toBe(false);
    });
  });

  describe('fallback graceful (invalido -> 1pct conforme spec RF-01)', () => {
    it('parseRule invalido retorna fallback quando service decide (apenas valida=false aqui)', () => {
      // parseRule eh puro: reporta valid:false. O caller (bankrollService)
      // decide usar fallback "1pct" e emitir warning log. Spec RF-01 criterio:
      // "Usuario com rule 'invalid' -> fallback para '1pct' e warning log".
      const r = parseRule('invalid');
      expect(r.valid).toBe(false);
      // Nao testamos fallback aqui — responsabilidade do service.
    });
  });
});

describe('computeThresholds', () => {
  describe('regras pre-definidas', () => {
    it('amount=1000 rule="1pct" => softLimitUSD=10, hardLimitUSD=15, maxBuyInUSD=15', () => {
      const r = computeThresholds({ amount: 1000, rule: '1pct' });
      expect(r.softLimitUSD).toBe(10);
      expect(r.hardLimitUSD).toBe(15);
      expect(r.maxBuyInUSD).toBe(15); // alias historico: maxBuyInUSD == hardLimitUSD (ADR-018)
      expect(r.rulePct).toBe(1.0);
    });

    it('amount=1000 rule="2pct" => softLimit=20, hardLimit=30', () => {
      const r = computeThresholds({ amount: 1000, rule: '2pct' });
      expect(r.softLimitUSD).toBe(20);
      expect(r.hardLimitUSD).toBe(30);
      expect(r.rulePct).toBe(2.0);
    });

    it('amount=1000 rule="5pct" => softLimit=50, hardLimit=75', () => {
      const r = computeThresholds({ amount: 1000, rule: '5pct' });
      expect(r.softLimitUSD).toBe(50);
      expect(r.hardLimitUSD).toBe(75);
      expect(r.rulePct).toBe(5.0);
    });
  });

  describe('regras custom fracionarias', () => {
    it('amount=1000 rule="custom:3.5" => softLimit=35, hardLimit=52.5', () => {
      const r = computeThresholds({ amount: 1000, rule: 'custom:3.5' });
      expect(r.softLimitUSD).toBeCloseTo(35, 5);
      expect(r.hardLimitUSD).toBeCloseTo(52.5, 5);
      expect(r.rulePct).toBe(3.5);
    });

    it('amount=500 rule="custom:3" => softLimit=15, hardLimit=22.5 (caso jogador pequeno com shot)', () => {
      const r = computeThresholds({ amount: 500, rule: 'custom:3' });
      expect(r.softLimitUSD).toBe(15);
      expect(r.hardLimitUSD).toBeCloseTo(22.5, 5);
    });
  });

  describe('edge cases', () => {
    it('amount=0 => thresholds zerados', () => {
      const r = computeThresholds({ amount: 0, rule: '1pct' });
      expect(r.softLimitUSD).toBe(0);
      expect(r.hardLimitUSD).toBe(0);
      expect(r.maxBuyInUSD).toBe(0);
    });

    it('amount=null => thresholds null (banca nao configurada)', () => {
      const r = computeThresholds({ amount: null as any, rule: '1pct' });
      expect(r.softLimitUSD).toBeNull();
      expect(r.hardLimitUSD).toBeNull();
      expect(r.maxBuyInUSD).toBeNull();
    });

    it('rule invalida em computeThresholds usa fallback "1pct" + retorna valor', () => {
      const r = computeThresholds({ amount: 1000, rule: 'bogus' });
      // Spec RF-01: fallback para 1pct quando rule invalida
      expect(r.rulePct).toBe(1.0);
      expect(r.softLimitUSD).toBe(10);
      expect(r.hardLimitUSD).toBe(15);
    });

    it('amount negativo (banca em bust/overdraft) ainda calcula (nao bloqueia)', () => {
      // Spec Q6: banca negativa permitida com warning. computeThresholds segue a regra.
      const r = computeThresholds({ amount: -100, rule: '1pct' });
      expect(r.softLimitUSD).toBe(-1);
      expect(r.hardLimitUSD).toBeCloseTo(-1.5, 5);
    });
  });

  describe('invariante: hardLimit = softLimit * BANKROLL_TOLERANCE', () => {
    it('vale para todos os casos validos (samples)', () => {
      const cases = [
        { amount: 1000, rule: '1pct' },
        { amount: 500, rule: '2pct' },
        { amount: 2500, rule: '5pct' },
        { amount: 1000, rule: 'custom:3.5' },
        { amount: 300, rule: 'custom:0.5' },
      ];
      for (const c of cases) {
        const r = computeThresholds(c);
        expect(r.hardLimitUSD).toBeCloseTo(r.softLimitUSD * BANKROLL_TOLERANCE, 5);
      }
    });
  });
});
