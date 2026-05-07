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
  Champion: { code: 'EUR', symbol: '\u20ac' },
  ChampionsPoker: { code: 'EUR', symbol: '\u20ac' },
  Coin: { code: 'USD', symbol: '$' },
  CoinPoker: { code: 'USD', symbol: '$' },
  WPT: { code: 'USD', symbol: '$' },
  PartyPoker: { code: 'USD', symbol: '$' },
  '888poker': { code: 'USD', symbol: '$' },
  Revolution: { code: 'USD', symbol: '$' },
};

const DEFAULT_CURRENCY = { code: 'USD', symbol: '$' };

// Alias map (case-insensitive) -> canonical site key em PLATFORM_CURRENCY.
// Cobre variacoes vindas de imports CSV, library labels (ex: "iPoker Network"),
// e digitacao mista. Manter em sync com SITE_ALIAS_GROUPS de wallet-reconciliation.
const SITE_ALIASES: Record<string, string> = {
  // iPoker (EUR)
  'ipoker': 'iPoker',
  'ipoker network': 'iPoker',
  'ipokernetwork': 'iPoker',
  // PokerStars regional EUR
  'ps.es': 'PS.ES',
  'ps.fr': 'PS.ES',
  'ps.pt': 'PS.ES',
  'pokerstars.es': 'PS.ES',
  // Champion (EUR)
  'champion': 'Champion',
  'championspoker': 'Champion',
  'champions poker': 'Champion',
  'champions': 'Champion',
  // Suprema (BRL)
  'suprema': 'Suprema',
  'supremapoker': 'SupremaPoker',
  'liga suprema': 'Suprema',
  'ligasuprema': 'Suprema',
  // PPoker (BRL)
  'ppoker': 'PPoker',
  // PokerStars (USD global)
  'pokerstars': 'PokerStars',
  'stars': 'PokerStars',
  // GG
  'gg': 'GGNetwork',
  'ggpoker': 'GGPoker',
  'ggnetwork': 'GGNetwork',
  'natural8': 'GGNetwork',
  'clubgg': 'GGNetwork',
  // WPN
  'wpn': 'WPN',
  'acr': 'WPN',
  'americascardroom': 'WPN',
  'blackchip': 'WPN',
  'blackchippoker': 'WPN',
  // Outros
  'partypoker': 'PartyPoker',
  'party': 'PartyPoker',
  '888poker': '888poker',
  '888': '888poker',
  'bodog': 'Bodog',
  'ignition': 'Bodog',
  'chico': 'Chico',
  'revolution': 'Revolution',
  'coinpoker': 'CoinPoker',
  'coin': 'Coin',
  'wpt': 'WPT',
  'wpt global': 'WPT',
};

/**
 * Returns the currency for a given poker site.
 * Case-insensitive; resolve aliases comuns (ex: "iPoker Network" -> "iPoker").
 * Defaults to USD for unknown sites.
 */
export function getCurrencyForSite(site: string): { code: string; symbol: string } {
  if (!site) return DEFAULT_CURRENCY;
  // Match exato primeiro (preserva keys com chars especiais como '888poker').
  const direct = PLATFORM_CURRENCY[site];
  if (direct) return direct;
  // Normalize: lowercase + trim.
  const key = site.toLowerCase().trim();
  const alias = SITE_ALIASES[key];
  if (alias) {
    const viaAlias = PLATFORM_CURRENCY[alias];
    if (viaAlias) return viaAlias;
  }
  // Fallback: case-insensitive scan dos canonicos.
  for (const [canonical, ccy] of Object.entries(PLATFORM_CURRENCY)) {
    if (canonical.toLowerCase() === key) return ccy;
  }
  return DEFAULT_CURRENCY;
}

// ---------------------------------------------------------------------------
// Network aggregation (Sprint Grind-Cards-Reform v2 \u2014 CA-17).
// Mapeia variacoes de site (ACR, BlackChip, GGPoker, Natural8, etc) para
// a network agregada (WPN, GGNetwork, PokerStars, etc). Sites desconhecidos
// agregam em 'Outras'.
// ---------------------------------------------------------------------------

const SITE_NETWORK: Record<string, string> = {
  // WPN
  wpn: 'WPN',
  acr: 'WPN',
  americascardroom: 'WPN',
  'americas cardroom': 'WPN',
  blackchip: 'WPN',
  blackchippoker: 'WPN',
  // GGNetwork
  ggpoker: 'GGNetwork',
  ggnetwork: 'GGNetwork',
  natural8: 'GGNetwork',
  clubgg: 'GGNetwork',
  gg: 'GGNetwork',
  // PokerStars (engloba regionais EUR)
  pokerstars: 'PokerStars',
  stars: 'PokerStars',
  'ps.es': 'PokerStars',
  'ps.fr': 'PokerStars',
  'ps.pt': 'PokerStars',
  'pokerstars.es': 'PokerStars',
  // Outros
  partypoker: 'PartyPoker',
  party: 'PartyPoker',
  '888poker': '888poker',
  '888': '888poker',
  bodog: 'Bodog',
  ignition: 'Bodog',
  chico: 'Chico',
  ipoker: 'iPoker',
  'ipoker network': 'iPoker',
  coinpoker: 'CoinPoker',
  coin: 'CoinPoker',
  revolution: 'Revolution',
  wpt: 'WPT',
  'wpt global': 'WPT',
  champion: 'Champion',
  championspoker: 'Champion',
  'champions poker': 'Champion',
  suprema: 'Suprema',
  supremapoker: 'Suprema',
  'liga suprema': 'Suprema',
  ppoker: 'PPoker',
};

/**
 * Returns the network key (e.g. 'WPN', 'GGNetwork') for a given poker site.
 * Case-insensitive + trim aplicado. Sites desconhecidos / null / undefined /
 * vazio retornam 'Outras'.
 */
export function getNetworkForSite(site: string | null | undefined): string {
  if (site === null || site === undefined) return 'Outras';
  const key = String(site).toLowerCase().trim();
  if (key.length === 0) return 'Outras';
  return SITE_NETWORK[key] ?? 'Outras';
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
