/**
 * Wallet Reconciliation Helpers — Sprint Session-End Reconciliation V2
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-02: calculateExpectedDeltaPerWallet
 *  - RF-03: mapSiteToWallet
 *
 * ADR-045: tie-break proporcional ao saldo.
 * ADR-033: FX convention "1 USD vale N nativeCurrency".
 *
 * Helpers PUROS — sem acesso a DB, sem deps server-only. Importaveis tanto
 * pelo server quanto pelo client (single source of truth).
 */

export interface SiteAliasGroup {
  group: string;
  aliases: string[];
}

export const SITE_ALIAS_GROUPS: SiteAliasGroup[] = [
  {
    group: "WPN",
    aliases: ["BlackChip", "BlackChipPoker", "BCP", "AmericasCardroom", "ACR", "WPN"],
  },
  {
    group: "GG",
    aliases: ["GGPoker", "GG", "Natural8", "GGNetwork", "ClubGG"],
  },
  {
    group: "PokerStars",
    aliases: ["PokerStars", "Stars", "PS"],
  },
  {
    group: "PartyPoker",
    aliases: ["PartyPoker", "Party"],
  },
  {
    group: "888poker",
    aliases: ["888poker", "888"],
  },
  {
    group: "Suprema",
    aliases: ["Suprema", "SupremaPoker", "Liga Suprema", "LigaSuprema"],
  },
];

const SITE_ALIASES: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const { group, aliases } of SITE_ALIAS_GROUPS) {
    for (const alias of aliases) {
      const key = alias.toLowerCase();
      const existing = map.get(key) ?? [];
      if (!existing.includes(group)) existing.push(group);
      map.set(key, existing);
    }
    const selfKey = group.toLowerCase();
    const existingSelf = map.get(selfKey) ?? [];
    if (!existingSelf.includes(group)) existingSelf.push(group);
    map.set(selfKey, existingSelf);
  }
  return map;
})();

export function normalizeSiteToGroups(site: string | null | undefined): string[] {
  if (!site) return [];
  return SITE_ALIASES.get(site.toLowerCase()) ?? [];
}

export const SITE_DEFAULT_CURRENCY: Record<string, string> = {
  PokerStars: "USD",
  Stars: "USD",
  WPN: "USD",
  GG: "USD",
  GGNetwork: "USD",
  PartyPoker: "USD",
  "888poker": "USD",
  "888": "USD",
  Suprema: "BRL",
  SupremaPoker: "BRL",
  PPoker: "BRL",
  CoinPoker: "USDT",
  Chico: "USD",
  Revolution: "USD",
  // iPoker eh europeu — defaulta para EUR (ADR Bankroll-3 RF-3).
  iPoker: "EUR",
  "PS.ES": "EUR",
  Bodog: "USD",
};

export function getDefaultCurrencyForSite(site: string | null | undefined): string {
  if (!site) return "USD";
  if (SITE_DEFAULT_CURRENCY[site]) return SITE_DEFAULT_CURRENCY[site];
  const groups = normalizeSiteToGroups(site);
  for (const g of groups) {
    if (SITE_DEFAULT_CURRENCY[g]) return SITE_DEFAULT_CURRENCY[g];
  }
  return "USD";
}

// =============================================================================
// Sprint Bankroll-3 — RF-3: suggestedBindings (auto-bind torneio -> wallet)
// =============================================================================

export type SuggestedBindingConfidence =
  | "site_map"
  | "alias_group"
  | "fallback_usd";

export interface SuggestedBinding {
  platform: string;
  suggestedCurrency: string;
  confidence: SuggestedBindingConfidence;
}

/**
 * Para cada plataforma missing, sugere a moeda esperada.
 * - site_map: SITE_DEFAULT_CURRENCY[platform] direto.
 * - alias_group: match via grupo (ex: 'SupremaPoker' agrupa Suprema -> BRL).
 * - fallback_usd: sem match — sugere USD.
 */
export function buildSuggestedBindings(
  missingPlatforms: string[],
): SuggestedBinding[] {
  if (!Array.isArray(missingPlatforms) || missingPlatforms.length === 0) {
    return [];
  }
  return missingPlatforms.map((platform) => {
    if (SITE_DEFAULT_CURRENCY[platform]) {
      return {
        platform,
        suggestedCurrency: SITE_DEFAULT_CURRENCY[platform],
        confidence: "site_map" as const,
      };
    }
    const groups = normalizeSiteToGroups(platform);
    for (const g of groups) {
      if (SITE_DEFAULT_CURRENCY[g]) {
        return {
          platform,
          suggestedCurrency: SITE_DEFAULT_CURRENCY[g],
          confidence: "alias_group" as const,
        };
      }
    }
    return {
      platform,
      suggestedCurrency: "USD",
      confidence: "fallback_usd" as const,
    };
  });
}

export interface ReconcileWalletShape {
  id: string;
  platform: string;
  nativeCurrency: string;
  balance: number;
  status: "active" | "archived" | string;
}

export function mapSiteToWallet<T extends ReconcileWalletShape>(
  site: string,
  wallets: T[],
): T[] {
  const groups = normalizeSiteToGroups(site);
  if (groups.length === 0) return [];
  const groupSet = new Set(groups.map((g) => g.toLowerCase()));

  return wallets.filter((w) => {
    if ((w.status ?? "active") !== "active") return false;
    if (!w.platform) return false;
    const walletGroups = normalizeSiteToGroups(w.platform);
    for (const wg of walletGroups) {
      if (groupSet.has(wg.toLowerCase())) return true;
    }
    return groupSet.has(w.platform.toLowerCase());
  });
}

function isValidRate(rate: number | undefined | null): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

export function convertToNativeCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: Record<string, number>,
): number {
  if (!Number.isFinite(amount)) return 0;
  if (amount === 0) return 0;
  if (fromCurrency === toCurrency) return amount;

  let usd: number;
  if (fromCurrency === "USD") {
    usd = amount;
  } else {
    const fromRate = exchangeRates[fromCurrency];
    if (!isValidRate(fromRate)) return 0;
    usd = amount / fromRate;
  }

  if (toCurrency === "USD") {
    return Number.isFinite(usd) ? usd : 0;
  }
  const toRate = exchangeRates[toCurrency];
  if (!isValidRate(toRate)) return 0;
  const result = usd * toRate;
  return Number.isFinite(result) ? result : 0;
}

export interface TournamentInput {
  id: string;
  site: string;
  buyIn: number;
  prize: number;
  bounty: number;
  rebuys: number;
  addOnTaken: boolean;
  addOnCost: number;
  status: string;
  currency?: string;
}

export interface WalletDeltaEntry {
  walletId: string;
  expectedDelta: number;
  contributingTournaments: string[];
}

export interface OrphanContribution {
  site: string;
  currency: string;
  amount: number;
}

export interface CalculateExpectedDeltaResult {
  walletsDelta: WalletDeltaEntry[];
  orphanContribution: OrphanContribution[];
}

export interface CalculateExpectedDeltaInput {
  tournaments: TournamentInput[];
  wallets: ReconcileWalletShape[];
  exchangeRates: Record<string, number>;
}

export function calculateExpectedDeltaPerWallet(
  input: CalculateExpectedDeltaInput,
): CalculateExpectedDeltaResult {
  const { tournaments, wallets, exchangeRates } = input;
  const walletsMap = new Map<string, WalletDeltaEntry>();
  const orphanMap = new Map<string, OrphanContribution>();

  for (const t of tournaments) {
    if (t.status !== "finished") continue;

    const buyIn = Number(t.buyIn) || 0;
    const prize = Number(t.prize) || 0;
    const bounty = Number(t.bounty) || 0;
    const rebuys = Number(t.rebuys) || 0;
    const addOnCost = Number(t.addOnCost) || 0;
    const addOnTaken = !!t.addOnTaken;

    const contribution =
      prize + bounty - buyIn - rebuys * buyIn - (addOnTaken ? addOnCost : 0);

    const tournamentCurrency = t.currency ?? getDefaultCurrencyForSite(t.site);

    const candidates = mapSiteToWallet(t.site, wallets);

    if (candidates.length === 0) {
      const key = `${t.site}|${tournamentCurrency}`;
      const existing = orphanMap.get(key);
      if (existing) {
        existing.amount += contribution;
      } else {
        orphanMap.set(key, {
          site: t.site,
          currency: tournamentCurrency,
          amount: contribution,
        });
      }
      continue;
    }

    if (candidates.length === 1) {
      addToWallet(walletsMap, candidates[0], contribution, tournamentCurrency, t.id, exchangeRates);
      continue;
    }

    const sumBalances = candidates.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    for (const w of candidates) {
      const ratio =
        sumBalances > 0
          ? (Number(w.balance) || 0) / sumBalances
          : 1 / candidates.length;
      addToWallet(walletsMap, w, contribution * ratio, tournamentCurrency, t.id, exchangeRates);
    }
  }

  return {
    walletsDelta: Array.from(walletsMap.values()),
    orphanContribution: Array.from(orphanMap.values()),
  };
}

function addToWallet(
  walletsMap: Map<string, WalletDeltaEntry>,
  w: ReconcileWalletShape,
  portion: number,
  fromCurrency: string,
  tournamentId: string,
  exchangeRates: Record<string, number>,
): void {
  const converted = convertToNativeCurrency(
    portion,
    fromCurrency,
    w.nativeCurrency,
    exchangeRates,
  );
  const entry = walletsMap.get(w.id) ?? {
    walletId: w.id,
    expectedDelta: 0,
    contributingTournaments: [],
  };
  entry.expectedDelta += converted;
  if (!entry.contributingTournaments.includes(tournamentId)) {
    entry.contributingTournaments.push(tournamentId);
  }
  walletsMap.set(w.id, entry);
}
