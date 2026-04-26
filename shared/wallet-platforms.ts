// FX CONVENTION: rates[ccy] = ccy units per 1 USD. See ADR-033.
// Multi-wallet platforms list. See Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-02).

import { z } from "zod";

export const WALLET_PLATFORMS = [
  // Redes de poker
  "Suprema",
  "GGNetwork",
  "PokerStars",
  "WPN",
  "888",
  "PartyPoker",
  "CoinPoker",
  "Chico",
  "Revolution",
  "iPoker",
  // Off-platform
  "OffPlatform_Bank",
  "OffPlatform_Crypto",
  "OffPlatform_Staker",
  "OffPlatform_Other",
  // Migration v1 -> v2
  "GenericUSD",
] as const;

export type WalletPlatform = typeof WALLET_PLATFORMS[number];

export const WalletPlatformSchema = z.enum(WALLET_PLATFORMS);

// Native currencies supported for wallets (matches DEFAULT_EXCHANGE_RATES post-QW-1)
export const WALLET_NATIVE_CURRENCIES = [
  "USD",
  "BRL",
  "EUR",
  "GBP",
  "CNY",
  "USDT",
  "BTC",
] as const;

export type WalletNativeCurrency = typeof WALLET_NATIVE_CURRENCIES[number];

export const WalletNativeCurrencySchema = z.enum(WALLET_NATIVE_CURRENCIES);

// QW-D: Labels human-readable usadas em selects da UI. Value continua sendo o
// enum tecnico para compat com schema; UI traduz via WALLET_PLATFORM_LABELS.
export const WALLET_PLATFORM_LABELS: Record<WalletPlatform, string> = {
  Suprema: "Suprema Poker",
  GGNetwork: "GGNetwork (GGPoker, Natural8)",
  PokerStars: "PokerStars",
  WPN: "WPN (ACR, BlackChip)",
  "888": "888poker",
  PartyPoker: "PartyPoker",
  CoinPoker: "CoinPoker",
  Chico: "Chico Network",
  Revolution: "Revolution Network",
  iPoker: "iPoker Network",
  OffPlatform_Bank: "Conta bancaria",
  OffPlatform_Crypto: "Conta cripto / exchange",
  OffPlatform_Staker: "Staker / makeup",
  OffPlatform_Other: "Outra (off-platform)",
  GenericUSD: "Generica (USD)",
};

// Grupos para renderizar selects organizados (poker primeiro, off-platform depois).
export const WALLET_PLATFORM_GROUPS: Array<{
  label: string;
  platforms: WalletPlatform[];
}> = [
  {
    label: "Redes de poker",
    platforms: [
      "Suprema",
      "GGNetwork",
      "PokerStars",
      "WPN",
      "888",
      "PartyPoker",
      "CoinPoker",
      "Chico",
      "Revolution",
      "iPoker",
    ],
  },
  {
    label: "Off-platform",
    platforms: [
      "OffPlatform_Bank",
      "OffPlatform_Crypto",
      "OffPlatform_Staker",
      "OffPlatform_Other",
    ],
  },
  {
    label: "Outros",
    platforms: ["GenericUSD"],
  },
];
