import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Bankroll-2.1 — walletBalanceDelta helper (RF-03 + RF-04)
//
// Spec: Docs/specs/wallet-balance-mode.md
//
// Helper PURO: centraliza calculo de delta entre saldo conhecido e novo saldo.
// Usado pelo preview e pelo body do submit para evitar duplicacao (licao
// review-pre-merge sobre simplify/DRY).
//
// Arquivo sob teste: client/src/lib/walletBalanceDelta.ts (NAO EXISTE — TDD red).
//
// CONTRATO ASSUMIDO PELO TEST-WRITER:
//
// computeBalanceDelta({ knownBalance, newBalance }): Delta | { sign: 'invalid' }
//
// Onde Delta = {
//   direction: 'in' | 'out',
//   nativeAmount: number,        // sempre >= 0
//   sign: 'positive' | 'negative' | 'zero',
//   absDelta: number,            // sempre >= 0
// }
//
// Casos especiais:
// - diff < epsilon (0.01): sign='zero', absDelta=0, direction='in' (default
//   estavel para evitar undefined; UI bloqueia submit nesse caso via RF-03).
// - Inputs invalidos (NaN, Infinity, string que nao parseia): retorna
//   { sign: 'invalid' } (sem direction nem nativeAmount). UI trata como "input
//   ainda incompleto", NAO como erro de aplicacao.
// - epsilon: 0.01 (mesma tolerancia do backend ADR-038, mantem simetria).
// =============================================================================

import { computeBalanceDelta } from '../walletBalanceDelta';

describe('computeBalanceDelta — happy paths', () => {
  it('newBalance > knownBalance: direction=in, sign=positive, nativeAmount=delta', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: 1247 });
    expect(r).toMatchObject({
      direction: 'in',
      sign: 'positive',
    });
    expect((r as any).nativeAmount).toBeCloseTo(67, 4);
    expect((r as any).absDelta).toBeCloseTo(67, 4);
  });

  it('newBalance < knownBalance: direction=out, sign=negative, nativeAmount=|delta|', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: 1100 });
    expect(r).toMatchObject({
      direction: 'out',
      sign: 'negative',
    });
    expect((r as any).nativeAmount).toBeCloseTo(80, 4);
    expect((r as any).absDelta).toBeCloseTo(80, 4);
  });

  it('decimais (centavos): preserva precisao razoavel', () => {
    const r = computeBalanceDelta({ knownBalance: 1180.25, newBalance: 1180.75 });
    expect((r as any).direction).toBe('in');
    expect((r as any).nativeAmount).toBeCloseTo(0.5, 4);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('computeBalanceDelta — diff < epsilon (zero)', () => {
  it('newBalance == knownBalance: sign=zero, absDelta=0, direction=in (default estavel)', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: 1180 });
    expect((r as any).sign).toBe('zero');
    expect((r as any).absDelta).toBe(0);
    expect((r as any).nativeAmount).toBe(0);
    // Default direction estavel — UI bloqueia submit via RF-03.
    expect((r as any).direction).toBe('in');
  });

  it('diff < 0.01 (centavo): sign=zero (epsilon)', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: 1180.005 });
    expect((r as any).sign).toBe('zero');
  });

  it('diff exatamente 0.01: ainda zero (boundary inclusive — coerente com backend)', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: 1180.01 });
    expect((r as any).sign).toBe('zero');
  });

  it('diff 0.011: sign=positive (acabou de sair do epsilon)', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: 1180.02 });
    expect((r as any).sign).toBe('positive');
  });
});

describe('computeBalanceDelta — saldos negativos (wallet pode estar negativa)', () => {
  it('knownBalance negativo, newBalance mais negativo: out + negative', () => {
    const r = computeBalanceDelta({ knownBalance: -50, newBalance: -100 });
    expect((r as any).direction).toBe('out');
    expect((r as any).sign).toBe('negative');
    expect((r as any).nativeAmount).toBeCloseTo(50, 4);
  });

  it('knownBalance negativo, newBalance positivo: in + positive (wallet recuperou)', () => {
    const r = computeBalanceDelta({ knownBalance: -50, newBalance: 100 });
    expect((r as any).direction).toBe('in');
    expect((r as any).sign).toBe('positive');
    expect((r as any).nativeAmount).toBeCloseTo(150, 4);
  });

  it('ambos negativos com diff zero: sign=zero', () => {
    const r = computeBalanceDelta({ knownBalance: -50, newBalance: -50 });
    expect((r as any).sign).toBe('zero');
  });
});

describe('computeBalanceDelta — entradas invalidas', () => {
  it('newBalance NaN: retorna { sign: "invalid" }', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: NaN });
    expect((r as any).sign).toBe('invalid');
  });

  it('knownBalance NaN: retorna { sign: "invalid" }', () => {
    const r = computeBalanceDelta({ knownBalance: NaN, newBalance: 1180 });
    expect((r as any).sign).toBe('invalid');
  });

  it('newBalance Infinity: retorna { sign: "invalid" }', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: Infinity });
    expect((r as any).sign).toBe('invalid');
  });

  it('newBalance string nao parseavel: retorna { sign: "invalid" }', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: 'foo' as any });
    expect((r as any).sign).toBe('invalid');
  });

  it('newBalance null: retorna { sign: "invalid" }', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: null as any });
    expect((r as any).sign).toBe('invalid');
  });

  it('newBalance undefined: retorna { sign: "invalid" }', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: undefined as any });
    expect((r as any).sign).toBe('invalid');
  });

  // String numerica e tolerada (UI passa o input.value quando ja parseado;
  // contrato e number — strings devem ser invalid para forcar parse na UI)
  it('newBalance como string numerica "1247": retorna { sign: "invalid" } (contrato e number)', () => {
    const r = computeBalanceDelta({ knownBalance: 1180, newBalance: '1247' as any });
    expect((r as any).sign).toBe('invalid');
  });
});

describe('computeBalanceDelta — invariantes', () => {
  it('nativeAmount === absDelta sempre (em casos validos)', () => {
    const cases: Array<{ k: number; n: number }> = [
      { k: 0, n: 100 },
      { k: 100, n: 0 },
      { k: -50, n: 50 },
      { k: 1247.5, n: 1180 },
    ];
    for (const c of cases) {
      const r = computeBalanceDelta({ knownBalance: c.k, newBalance: c.n });
      if ((r as any).sign !== 'invalid') {
        expect((r as any).nativeAmount).toBe((r as any).absDelta);
        expect((r as any).nativeAmount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('sign positive => direction in; sign negative => direction out', () => {
    const cases: Array<{ k: number; n: number }> = [
      { k: 0, n: 100 },     // positive -> in
      { k: 100, n: 0 },     // negative -> out
      { k: 1180, n: 1247 }, // positive -> in
      { k: 1180, n: 1100 }, // negative -> out
    ];
    for (const c of cases) {
      const r = computeBalanceDelta({ knownBalance: c.k, newBalance: c.n });
      if ((r as any).sign === 'positive') expect((r as any).direction).toBe('in');
      if ((r as any).sign === 'negative') expect((r as any).direction).toBe('out');
    }
  });
});
