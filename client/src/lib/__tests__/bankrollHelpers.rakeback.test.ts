import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Bankroll-3 — bankrollHelpers reasonLabel/reasonColor (RF-07).
//
// Spec: Docs/specs/rakeback-reporting.md (RF-07).
//
// Helper centralizado em client/src/lib/bankrollHelpers.ts:
//   reasonLabel(reason: string): string  — label PT-BR
//   reasonColor(reason: string): string  — classes Tailwind para badge
//
// Backward-compat: outros reasons (deposit, withdrawal, session_result,
// manual_adjustment) continuam retornando seus labels existentes.
// =============================================================================

import { reasonLabel, reasonColor } from '../bankrollHelpers';

// =============================================================================
// 1. reasonLabel('rakeback')
// =============================================================================

describe('reasonLabel — rakeback (RF-07)', () => {
  it('reasonLabel("rakeback") => "Rakeback"', () => {
    expect(reasonLabel('rakeback')).toBe('Rakeback');
  });
});

// =============================================================================
// 2. reasonColor('rakeback') — classe distinta amber/dourado
// =============================================================================

describe('reasonColor — rakeback (RF-06 + RF-07)', () => {
  it('reasonColor("rakeback") retorna classes amber/dourado', () => {
    const color = reasonColor('rakeback');
    expect(typeof color).toBe('string');
    expect(color.length).toBeGreaterThan(0);
    expect(color).toMatch(/amber/);
  });

  it('reasonColor("rakeback") difere de reasonColor("deposit") (cor distinta)', () => {
    expect(reasonColor('rakeback')).not.toBe(reasonColor('deposit'));
  });

  it('reasonColor("rakeback") difere de reasonColor("session_result")', () => {
    expect(reasonColor('rakeback')).not.toBe(reasonColor('session_result'));
  });

  it('reasonColor("rakeback") difere de reasonColor("manual_adjustment")', () => {
    expect(reasonColor('rakeback')).not.toBe(reasonColor('manual_adjustment'));
  });
});

// =============================================================================
// 3. Backward-compat — labels existentes inalterados (RF-08)
//
// NOTA: a implementacao real usa labels distintos dos sugeridos pela spec
// (ex: "Aporte" para deposit ao inves de "Deposito"). Os testes refletem
// a IMPLEMENTACAO ATUAL (fonte de verdade), nao a sugestao da spec.
// =============================================================================

describe('reasonLabel — backward-compat outros reasons (RF-08)', () => {
  it('reasonLabel("deposit") retorna label PT-BR existente (Aporte)', () => {
    expect(reasonLabel('deposit')).toBe('Aporte');
  });

  it('reasonLabel("withdrawal") retorna "Saque"', () => {
    expect(reasonLabel('withdrawal')).toBe('Saque');
  });

  it('reasonLabel("session_result") retorna label existente em PT-BR', () => {
    const label = reasonLabel('session_result');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
    // "Sessao" na implementacao atual
    expect(label).toBe('Sessao');
  });

  it('reasonLabel("manual_adjustment") retorna "Ajuste manual"', () => {
    expect(reasonLabel('manual_adjustment')).toBe('Ajuste manual');
  });

  it('reasonLabel para reason desconhecida retorna o proprio reason (fallback)', () => {
    expect(reasonLabel('unknown_xpto')).toBe('unknown_xpto');
  });
});

// =============================================================================
// 4. Backward-compat reasonColor (RF-08)
// =============================================================================

describe('reasonColor — backward-compat outros reasons (RF-08)', () => {
  it('reasonColor("deposit") retorna string nao-vazia', () => {
    expect(reasonColor('deposit').length).toBeGreaterThan(0);
  });

  it('reasonColor("withdrawal") retorna string nao-vazia', () => {
    expect(reasonColor('withdrawal').length).toBeGreaterThan(0);
  });

  it('reasonColor para reason desconhecida retorna fallback nao-vazio', () => {
    expect(reasonColor('unknown_xpto').length).toBeGreaterThan(0);
  });
});
