/**
 * Platform Currency — maps poker sites to their default currency.
 * Used for correct buy-in display (R$, $, etc.) across the grade planner.
 */

export const PLATFORM_CURRENCY: Record<string, { code: string; symbol: string }> = {
  PPoker: { code: 'BRL', symbol: 'R$' },
  Suprema: { code: 'BRL', symbol: 'R$' },
  SupremaPoker: { code: 'BRL', symbol: 'R$' },
  Bodog: { code: 'USD', symbol: '$' },
  PokerStars: { code: 'USD', symbol: '$' },
  GGPoker: { code: 'USD', symbol: '$' },
  GGNetwork: { code: 'USD', symbol: '$' },
  WPN: { code: 'USD', symbol: '$' },
  Chico: { code: 'USD', symbol: '$' },
  iPoker: { code: 'EUR', symbol: '\u20ac' },
  'PS.ES': { code: 'EUR', symbol: '\u20ac' },
  Coin: { code: 'USD', symbol: '$' },
  CoinPoker: { code: 'USD', symbol: '$' },
  WPT: { code: 'USD', symbol: '$' },
  PartyPoker: { code: 'USD', symbol: '$' },
  '888poker': { code: 'USD', symbol: '$' },
  Revolution: { code: 'USD', symbol: '$' },
};

const DEFAULT_CURRENCY = { code: 'USD', symbol: '$' };

/**
 * Returns the currency for a given poker site.
 * Defaults to USD for unknown sites.
 */
export function getCurrencyForSite(site: string): { code: string; symbol: string } {
  return PLATFORM_CURRENCY[site] || DEFAULT_CURRENCY;
}

/**
 * Formats a buy-in value with the correct currency symbol for a site.
 * Examples: "$22", "R$15", "\u20ac50"
 */
export function formatBuyIn(buyIn: number | string, site: string): string {
  const num = typeof buyIn === 'string' ? parseFloat(buyIn) : buyIn;
  if (isNaN(num)) return '$0';
  const { symbol } = getCurrencyForSite(site);
  const display = num % 1 === 0 ? num.toString() : num.toFixed(2);
  return `${symbol}${display}`;
}

/**
 * Groups total buy-in amounts by currency code.
 * Returns e.g. { USD: 77, BRL: 150 }
 */
export function groupBuyInsByCurrency(
  tournaments: { buyIn: string | number; site: string }[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t of tournaments) {
    const num = typeof t.buyIn === 'string' ? parseFloat(t.buyIn) : t.buyIn;
    if (isNaN(num)) continue;
    const { code } = getCurrencyForSite(t.site);
    result[code] = (result[code] || 0) + num;
  }
  return result;
}

/** Currency code to symbol mapping */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  BRL: 'R$',
  EUR: '\u20ac',
};

/**
 * Formats grouped buy-in totals into a display string.
 * Examples: "$77", "$77 + R$150", "R$150 + \u20ac50"
 * Order: USD first, then BRL, then EUR, then others.
 */
export function formatGroupedBuyIns(grouped: Record<string, number>): string {
  const order = ['USD', 'BRL', 'EUR'];
  const keys = Object.keys(grouped).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    const aIdx = ai === -1 ? order.length : ai;
    const bIdx = bi === -1 ? order.length : bi;
    return aIdx - bIdx;
  });

  if (keys.length === 0) return '$0';

  return keys
    .filter((k) => grouped[k] > 0)
    .map((code) => {
      const symbol = CURRENCY_SYMBOLS[code] || `${code} `;
      const value = grouped[code];
      const display = value % 1 === 0 ? value.toString() : value.toFixed(2);
      return `${symbol}${display}`;
    })
    .join(' + ') || '$0';
}
