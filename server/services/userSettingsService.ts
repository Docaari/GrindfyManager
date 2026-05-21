// =============================================================================
// userSettingsService — Sprint TS-3 (ADR-178 §2.2)
//
// Helper para resolver settings de user que afetam features (ex: bankrollMode
// do Tournament Selector). Lazy storage import (lesson #34) — testavel via
// 3o arg `injectedStorage`.
// =============================================================================

import type { BankrollMode } from "../scoring/bankrollModeFilter";

export async function resolveBankrollMode(
  userId: string,
  injectedStorage?: any,
): Promise<BankrollMode> {
  try {
    const storage = injectedStorage ?? (await import("../storage")).storage;
    const settings = await storage.getUserSettings?.(userId);
    const raw = settings?.tournamentSelectorBankrollMode ?? settings?.tournament_selector_bankroll_mode;
    if (raw === "all" || raw === "hide" || raw === "warn") return raw;
    return "warn";
  } catch (err) {
    console.error("userSettingsService.resolveBankrollMode failed:", err);
    return "warn";
  }
}
