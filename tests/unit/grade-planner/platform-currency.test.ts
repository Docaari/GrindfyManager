import { describe, it, expect } from 'vitest';
import {
  PLATFORM_CURRENCY,
  getCurrencyForSite,
  formatBuyIn,
  groupBuyInsByCurrency,
  formatGroupedBuyIns,
} from '@shared/platform-currency';

// =============================================================================
// getCurrencyForSite
// =============================================================================

describe('getCurrencyForSite', () => {
  it('returns BRL for PPoker', () => {
    expect(getCurrencyForSite('PPoker')).toEqual({ code: 'BRL', symbol: 'R$' });
  });

  it('returns BRL for Suprema', () => {
    expect(getCurrencyForSite('Suprema')).toEqual({ code: 'BRL', symbol: 'R$' });
  });

  it('returns BRL for SupremaPoker', () => {
    expect(getCurrencyForSite('SupremaPoker')).toEqual({ code: 'BRL', symbol: 'R$' });
  });

  it('returns USD for PokerStars', () => {
    expect(getCurrencyForSite('PokerStars')).toEqual({ code: 'USD', symbol: '$' });
  });

  it('returns USD for GGPoker', () => {
    expect(getCurrencyForSite('GGPoker')).toEqual({ code: 'USD', symbol: '$' });
  });

  it('returns USD for Bodog', () => {
    expect(getCurrencyForSite('Bodog')).toEqual({ code: 'USD', symbol: '$' });
  });

  it('returns EUR for iPoker', () => {
    expect(getCurrencyForSite('iPoker')).toEqual({ code: 'EUR', symbol: '\u20ac' });
  });

  it('returns EUR for PS.ES', () => {
    expect(getCurrencyForSite('PS.ES')).toEqual({ code: 'EUR', symbol: '\u20ac' });
  });

  it('defaults to USD for unknown sites', () => {
    expect(getCurrencyForSite('UnknownSite')).toEqual({ code: 'USD', symbol: '$' });
  });

  it('defaults to USD for empty string', () => {
    expect(getCurrencyForSite('')).toEqual({ code: 'USD', symbol: '$' });
  });
});

// =============================================================================
// formatBuyIn
// =============================================================================

describe('formatBuyIn', () => {
  it('formats USD buy-in with $ symbol', () => {
    expect(formatBuyIn(22, 'PokerStars')).toBe('$22');
  });

  it('formats BRL buy-in with R$ symbol', () => {
    expect(formatBuyIn(15, 'Suprema')).toBe('R$15');
  });

  it('formats EUR buy-in with euro symbol', () => {
    expect(formatBuyIn(50, 'iPoker')).toBe('\u20ac50');
  });

  it('formats decimal buy-in correctly', () => {
    expect(formatBuyIn(5.5, 'PokerStars')).toBe('$5.50');
  });

  it('formats string buy-in', () => {
    expect(formatBuyIn('22', 'PokerStars')).toBe('$22');
  });

  it('formats string decimal buy-in', () => {
    expect(formatBuyIn('22.50', 'PokerStars')).toBe('$22.50');
  });

  it('handles NaN buy-in', () => {
    expect(formatBuyIn('abc', 'PokerStars')).toBe('$0');
  });

  it('defaults to USD for unknown site', () => {
    expect(formatBuyIn(10, 'UnknownSite')).toBe('$10');
  });
});

// =============================================================================
// groupBuyInsByCurrency
// =============================================================================

describe('groupBuyInsByCurrency', () => {
  it('groups single currency correctly', () => {
    const tournaments = [
      { buyIn: '22', site: 'PokerStars' },
      { buyIn: '55', site: 'GGPoker' },
    ];
    expect(groupBuyInsByCurrency(tournaments)).toEqual({ USD: 77 });
  });

  it('groups multiple currencies', () => {
    const tournaments = [
      { buyIn: '22', site: 'PokerStars' },
      { buyIn: '55', site: 'GGPoker' },
      { buyIn: '15', site: 'Suprema' },
      { buyIn: '30', site: 'PPoker' },
    ];
    expect(groupBuyInsByCurrency(tournaments)).toEqual({ USD: 77, BRL: 45 });
  });

  it('handles empty array', () => {
    expect(groupBuyInsByCurrency([])).toEqual({});
  });

  it('handles numeric buy-in values', () => {
    const tournaments = [
      { buyIn: 22, site: 'PokerStars' },
      { buyIn: 15, site: 'Suprema' },
    ];
    expect(groupBuyInsByCurrency(tournaments)).toEqual({ USD: 22, BRL: 15 });
  });

  it('skips NaN buy-in values', () => {
    const tournaments = [
      { buyIn: 'abc', site: 'PokerStars' },
      { buyIn: '22', site: 'PokerStars' },
    ];
    expect(groupBuyInsByCurrency(tournaments)).toEqual({ USD: 22 });
  });

  it('groups three currencies', () => {
    const tournaments = [
      { buyIn: '22', site: 'PokerStars' },
      { buyIn: '15', site: 'Suprema' },
      { buyIn: '50', site: 'iPoker' },
    ];
    expect(groupBuyInsByCurrency(tournaments)).toEqual({ USD: 22, BRL: 15, EUR: 50 });
  });
});

// =============================================================================
// formatGroupedBuyIns
// =============================================================================

describe('formatGroupedBuyIns', () => {
  it('formats single USD currency', () => {
    expect(formatGroupedBuyIns({ USD: 77 })).toBe('$77');
  });

  it('formats single BRL currency', () => {
    expect(formatGroupedBuyIns({ BRL: 150 })).toBe('R$150');
  });

  it('formats USD + BRL', () => {
    expect(formatGroupedBuyIns({ USD: 77, BRL: 150 })).toBe('$77 + R$150');
  });

  it('formats all three currencies in correct order', () => {
    expect(formatGroupedBuyIns({ EUR: 50, BRL: 150, USD: 77 })).toBe('$77 + R$150 + \u20ac50');
  });

  it('returns "$0" for empty object', () => {
    expect(formatGroupedBuyIns({})).toBe('$0');
  });

  it('skips zero-value currencies', () => {
    expect(formatGroupedBuyIns({ USD: 77, BRL: 0 })).toBe('$77');
  });

  it('formats decimal values', () => {
    expect(formatGroupedBuyIns({ USD: 77.5 })).toBe('$77.50');
  });

  it('formats integer values without decimals', () => {
    expect(formatGroupedBuyIns({ USD: 77 })).toBe('$77');
  });
});

// =============================================================================
// PLATFORM_CURRENCY mapping
// =============================================================================

describe('PLATFORM_CURRENCY', () => {
  it('has BRL entries for Brazilian platforms', () => {
    expect(PLATFORM_CURRENCY.PPoker.code).toBe('BRL');
    expect(PLATFORM_CURRENCY.Suprema.code).toBe('BRL');
    expect(PLATFORM_CURRENCY.SupremaPoker.code).toBe('BRL');
  });

  it('has USD entries for major international platforms', () => {
    expect(PLATFORM_CURRENCY.PokerStars.code).toBe('USD');
    expect(PLATFORM_CURRENCY.GGPoker.code).toBe('USD');
    expect(PLATFORM_CURRENCY.Bodog.code).toBe('USD');
    expect(PLATFORM_CURRENCY.WPN.code).toBe('USD');
  });

  it('has EUR entries for European platforms', () => {
    expect(PLATFORM_CURRENCY.iPoker.code).toBe('EUR');
    expect(PLATFORM_CURRENCY['PS.ES'].code).toBe('EUR');
  });
});
