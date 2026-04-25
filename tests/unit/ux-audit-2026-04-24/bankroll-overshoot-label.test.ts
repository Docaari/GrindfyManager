import { describe, it, expect } from 'vitest';
import { formatBankrollOvershootLabel } from '../../../client/src/lib/scoringHelpers';

// =============================================================================
// UX Audit 2026-04-24 — TS-C: Badge bankroll delta em $
// =============================================================================

describe('formatBankrollOvershootLabel', () => {
  it('formata delta pequeno (<$10) com 1 casa decimal', () => {
    // buyIn=$55, limit=$50 => overshoot=$5.00, pct=10%
    expect(formatBankrollOvershootLabel(55, 50)).toBe('$5.0 acima (10%)');
  });

  it('formata delta medio como inteiro arredondado', () => {
    // buyIn=$75, limit=$50 => overshoot=$25, pct=50%
    expect(formatBankrollOvershootLabel(75, 50)).toBe('$25 acima (50%)');
  });

  it('formata overshoot extremo com pct alto', () => {
    // buyIn=$150, limit=$50 => overshoot=$100, pct=200%
    expect(formatBankrollOvershootLabel(150, 50)).toBe('$100 acima (200%)');
  });

  it('retorna fallback quando buyInUSD ausente', () => {
    expect(formatBankrollOvershootLabel(null, 50)).toBe('Fora do bankroll');
    expect(formatBankrollOvershootLabel(undefined, 50)).toBe('Fora do bankroll');
  });

  it('retorna fallback quando hardLimit ausente ou zero', () => {
    expect(formatBankrollOvershootLabel(100, null)).toBe('Fora do bankroll');
    expect(formatBankrollOvershootLabel(100, undefined)).toBe('Fora do bankroll');
    expect(formatBankrollOvershootLabel(100, 0)).toBe('Fora do bankroll');
  });

  it('retorna fallback quando inputs invalidos', () => {
    expect(formatBankrollOvershootLabel(NaN, 50)).toBe('Fora do bankroll');
    expect(formatBankrollOvershootLabel(100, NaN)).toBe('Fora do bankroll');
    expect(formatBankrollOvershootLabel(Infinity, 50)).toBe('Fora do bankroll');
  });

  it('retorna fallback quando buy-in <= limite (defensivo)', () => {
    // Se bankrollOk=true e essa funcao for chamada por engano, nao mostra delta absurdo
    expect(formatBankrollOvershootLabel(50, 50)).toBe('Fora do bankroll');
    expect(formatBankrollOvershootLabel(40, 50)).toBe('Fora do bankroll');
  });

  // ===========================================================================
  // UX-2 polish (2026-04-25): BRL display quando preferredCurrency=BRL
  // ===========================================================================

  describe('preferredCurrency=BRL com exchangeRateBRL', () => {
    it('formata em BRL quando preferredCurrency=BRL e taxa valida', () => {
      // buyIn=$75, limit=$50 => overshoot=$25 USD => R$130 com taxa 5.2
      expect(
        formatBankrollOvershootLabel(75, 50, { preferredCurrency: 'BRL', exchangeRateBRL: 5.2 }),
      ).toBe('R$130 acima (50%)');
    });

    it('mantem 1 casa decimal para overshoot pequeno em BRL', () => {
      // buyIn=$51, limit=$50 => overshoot=$1 USD => R$5.2
      expect(
        formatBankrollOvershootLabel(51, 50, { preferredCurrency: 'BRL', exchangeRateBRL: 5.2 }),
      ).toBe('R$5.2 acima (2%)');
    });

    it('cai pra USD quando preferredCurrency=USD mesmo com taxa fornecida', () => {
      expect(
        formatBankrollOvershootLabel(75, 50, { preferredCurrency: 'USD', exchangeRateBRL: 5.2 }),
      ).toBe('$25 acima (50%)');
    });

    it('cai pra USD quando exchangeRateBRL ausente', () => {
      expect(
        formatBankrollOvershootLabel(75, 50, { preferredCurrency: 'BRL' }),
      ).toBe('$25 acima (50%)');
    });

    it('cai pra USD quando exchangeRateBRL invalido', () => {
      expect(
        formatBankrollOvershootLabel(75, 50, { preferredCurrency: 'BRL', exchangeRateBRL: 0 }),
      ).toBe('$25 acima (50%)');
      expect(
        formatBankrollOvershootLabel(75, 50, { preferredCurrency: 'BRL', exchangeRateBRL: NaN }),
      ).toBe('$25 acima (50%)');
    });

    it('comportamento sem options eh identico ao antes do polish (regressao)', () => {
      expect(formatBankrollOvershootLabel(75, 50)).toBe('$25 acima (50%)');
      expect(formatBankrollOvershootLabel(150, 50)).toBe('$100 acima (200%)');
    });
  });
});
