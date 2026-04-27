/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-14 + P12: helper formatCurrency consistente em pt-BR
 *
 * Helper que sera exportado pelo implementer (NAO existe ainda):
 *   client/src/lib/format.ts
 *     - formatCurrency(amount: number, currency: 'USD'|'BRL'|'EUR'|'CNY'|string, locale?: string): string
 *
 * Saidas esperadas (pt-BR):
 *   USD -> "US$ 1.180,00"
 *   BRL -> "R$ 1.180,00"
 *   EUR -> "€ 1.180,00"
 *   CNY -> "¥ 1.180,00"
 *
 * Permitir variantes minimas no espacamento (NBSP vs espaco regular) — usamos
 * regex tolerante para o separador entre simbolo e numero, mas exigimos que
 * o resultado contenha o simbolo correto + valor formatado em PT-BR.
 */

import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../format';

// Aceita NBSP ( ) ou espaco regular como separador.
const SEP = /[\s ]?/;

describe('formatCurrency — USD em pt-BR (RF-14, P12)', () => {
  it('1180 USD -> "US$ 1.180,00"', () => {
    const result = formatCurrency(1180, 'USD', 'pt-BR');
    expect(result).toMatch(new RegExp(`^US\\$${SEP.source}1\\.180,00$`));
  });

  it('0 USD -> "US$ 0,00"', () => {
    const result = formatCurrency(0, 'USD', 'pt-BR');
    expect(result).toMatch(new RegExp(`^US\\$${SEP.source}0,00$`));
  });

  it('valor com decimais 1180.50 -> "US$ 1.180,50"', () => {
    const result = formatCurrency(1180.5, 'USD', 'pt-BR');
    expect(result).toMatch(/1\.180,50/);
    expect(result).toContain('US$');
  });
});

describe('formatCurrency — BRL em pt-BR', () => {
  it('1180.50 BRL -> "R$ 1.180,50"', () => {
    const result = formatCurrency(1180.5, 'BRL');
    expect(result).toMatch(new RegExp(`^R\\$${SEP.source}1\\.180,50$`));
  });

  it('0 BRL -> "R$ 0,00"', () => {
    const result = formatCurrency(0, 'BRL');
    expect(result).toMatch(/R\$/);
    expect(result).toContain('0,00');
  });
});

describe('formatCurrency — EUR em pt-BR', () => {
  it('1180 EUR -> "€ 1.180,00"', () => {
    const result = formatCurrency(1180, 'EUR');
    expect(result).toContain('€');
    expect(result).toMatch(/1\.180,00/);
  });

  it('0 EUR -> "€ 0,00"', () => {
    const result = formatCurrency(0, 'EUR');
    expect(result).toContain('€');
    expect(result).toMatch(/0,00/);
  });
});

describe('formatCurrency — CNY em pt-BR', () => {
  it('1180 CNY -> contem simbolo "¥" + "1.180,00"', () => {
    const result = formatCurrency(1180, 'CNY');
    expect(result).toMatch(/¥/);
    expect(result).toMatch(/1\.180,00/);
  });
});

describe('formatCurrency — valores negativos (delta)', () => {
  it('-50.50 USD -> contem sinal explicito de negativo', () => {
    const result = formatCurrency(-50.5, 'USD');
    expect(result).toMatch(/^-/);
    expect(result).toMatch(/50,50/);
    expect(result).toContain('US$');
  });

  it('-100 BRL -> sinal negativo presente', () => {
    const result = formatCurrency(-100, 'BRL');
    expect(result).toMatch(/^-/);
    expect(result).toContain('R$');
  });
});

describe('formatCurrency — large values', () => {
  it('1234567.89 USD em pt-BR -> "US$ 1.234.567,89"', () => {
    const result = formatCurrency(1234567.89, 'USD', 'pt-BR');
    expect(result).toContain('US$');
    expect(result).toMatch(/1\.234\.567,89/);
  });
});
