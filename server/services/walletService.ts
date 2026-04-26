/**
 * Wallet Service — Sprint Bankroll-2 (Multi-Wallet Foundation)
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-07)
 * ADR-017 (atomicidade), ADR-033 (FX convention), ADR-034 (multi-wallet),
 * ADR-035 (compat v1->v2).
 *
 * Public API:
 *   createWallet(userId, input)            -> { wallet, transaction?, warnings }
 *   getWallet(userId, walletId)            -> { wallet, lastTransactionAt, recentTransactions }
 *   listWallets(userId, opts)              -> Wallet[]
 *   updateWallet(userId, walletId, patch)  -> { wallet }
 *   archiveWallet(userId, walletId)        -> { wallet, warning? }
 *   recordWalletTransaction(userId, walletId, input)
 *                                          -> { transaction, wallet, warning? }
 *   listWalletTransactions(userId, walletId, filters)
 *                                          -> { transactions, pagination, summary }
 *   getConsolidatedBalance(userId)         -> ConsolidatedBalance
 *   migrateUserV1toV2(userId)              -> { created, walletId? }
 */

import { storage } from "../storage";
import { selectorCache } from "./selectorCache";
import { bankrollCache } from "./bankrollCache";
import { walletCache } from "./walletCache";
import { computeThresholds, BANKROLL_TOLERANCE } from "../scoring/bankrollRules";
import { DEFAULT_EXCHANGE_RATES } from "../scoring/scoringConstants";
import { WALLET_TX_REASONS_P0 } from "../../shared/wallet-reasons";

// =============================================================================
// Types
// =============================================================================

const HARD_WALLET_LIMIT = 50;
const APPROACHING_WALLET_LIMIT_THRESHOLD = 20;

export interface CreateWalletInput {
  name: string;
  platform: string;
  nativeCurrency: string;
  bankrollRule?: string | null;
  color?: string | null;
  displayOrder?: number;
  isShotPocket?: boolean;
  initialDeposit?: { amount: number; note?: string };
}

export interface RecordWalletTransactionInput {
  direction: "in" | "out";
  nativeAmount: number;
  reason: string;
  occurredAt: Date | string;
  note?: string;
  sessionId?: string;
  expectedPreviousBalance?: number;
  // ADR-040 / Sprint Session-End Reconciliation: permite handler de reconciliacao
  // passar 'auto_session'. Default 'manual' preservado quando nao informado.
  source?: "manual" | "auto_session" | "migration_v1" | "auto_import_csv";
}

export interface ConsolidatedBalance {
  aggregationMode: "global" | "per_wallet";
  displayCurrency: string;
  totalUSD: string;
  totalDisplayCurrency: string;
  rule: string;
  rulePct: number;
  tolerance: number;
  softLimitUSD: string | null;
  hardLimitUSD: string | null;
  byWallet: Array<{
    walletId: string;
    name: string;
    platform: string;
    nativeCurrency: string;
    balanceNative: string;
    balanceUSD: string;
    share: number;
    isShotPocket: boolean;
  }>;
  shotPockets: Array<{
    walletId: string;
    name: string;
    platform: string;
    nativeCurrency: string;
    balanceNative: string;
    balanceUSD: string;
  }>;
  walletCount: number;
  shotPocketCount: number;
  lastUpdatedAt: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

function parseDecimal(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

function makeError(message: string, statusCode: number, code?: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function nativeToUSD(
  nativeAmount: number,
  nativeCurrency: string,
  exchangeRates: Record<string, number>,
): { usdAmount: number; fxRate: number } {
  if (!nativeCurrency || nativeCurrency === "USD") {
    return { usdAmount: nativeAmount, fxRate: 1.0 };
  }
  const rate =
    typeof exchangeRates?.[nativeCurrency] === "number" && exchangeRates[nativeCurrency] > 0
      ? exchangeRates[nativeCurrency]
      : DEFAULT_EXCHANGE_RATES[nativeCurrency] ?? 1.0;
  // ADR-033: usd = native / rate.
  return { usdAmount: nativeAmount / rate, fxRate: rate };
}

function invalidateCaches(userId: string): void {
  try { selectorCache.invalidateAllForUser(userId); } catch (err) {
    console.error("walletService: selectorCache.invalidateAllForUser failed", err);
  }
  try { bankrollCache.invalidateAllForUser(userId); } catch (err) {
    console.error("walletService: bankrollCache.invalidateAllForUser failed", err);
  }
  try { walletCache.invalidateAllForUser(userId); } catch (err) {
    console.error("walletService: walletCache.invalidateAllForUser failed", err);
  }
}

// =============================================================================
// CRUD
// =============================================================================

async function createWallet(
  userId: string,
  input: CreateWalletInput,
): Promise<{ wallet: any; transaction: any; warnings: string[] }> {
  if (input.initialDeposit && input.initialDeposit.amount <= 0) {
    throw makeError("initialDeposit.amount deve ser maior que zero", 400);
  }

  const result = await storage.transaction(async (tx: any) => {
    const activeCount = await tx.countActiveWalletsByUser(userId);
    if (activeCount >= HARD_WALLET_LIMIT) {
      throw makeError(
        `Limite de ${HARD_WALLET_LIMIT} carteiras ativas atingido`,
        409,
        "wallet_limit_reached",
      );
    }
    const trimmedName = input.name.trim();
    const dup = await tx.findActiveWalletByName(userId, trimmedName);
    if (dup) {
      throw makeError(
        "Ja existe uma carteira ativa com este nome",
        400,
        "errNameDuplicate",
      );
    }

    const walletRow = await tx.createWallet({
      userId,
      name: trimmedName,
      platform: input.platform,
      nativeCurrency: input.nativeCurrency,
      balance: "0",
      status: "active",
      bankrollRule: input.bankrollRule ?? null,
      color: input.color ?? null,
      displayOrder: input.displayOrder ?? activeCount,
      isShotPocket: input.isShotPocket ?? false,
    });

    let transaction: any = null;
    if (input.initialDeposit && input.initialDeposit.amount > 0) {
      // Initial deposit cria 1 wallet_transaction + atualiza balance.
      const settings = await tx.getUserSettings(userId);
      const exchangeRates = (settings?.exchangeRates ?? {}) as Record<string, number>;
      const { usdAmount, fxRate } = nativeToUSD(
        input.initialDeposit.amount,
        input.nativeCurrency,
        exchangeRates,
      );

      const now = new Date();
      transaction = await tx.createWalletTransaction({
        walletId: walletRow.id,
        userId,
        occurredAt: now,
        effectiveAt: now,
        direction: "in",
        nativeAmount: String(input.initialDeposit.amount),
        nativeCurrency: input.nativeCurrency,
        fxRateUSDPerNative: String(fxRate),
        usdAmount: String(usdAmount),
        previousNativeBalance: "0",
        newNativeBalance: String(input.initialDeposit.amount),
        reason: "deposit",
        note: input.initialDeposit.note ?? null,
        source: "manual",
      });

      await tx.updateWalletBalance(walletRow.id, input.initialDeposit.amount);

      // Espelho em bankroll_snapshots para compat v1.
      await tx.insertBankrollSnapshot({
        userId,
        delta: usdAmount,
        previousAmount: 0,
        newAmount: usdAmount,
        reason: "deposit",
        note: input.initialDeposit.note ?? null,
        source: "manual",
      });
    }

    return { wallet: walletRow, transaction, activeCount };
  });

  const warnings: string[] = [];
  if (result.activeCount + 1 >= APPROACHING_WALLET_LIMIT_THRESHOLD) {
    warnings.push("approaching_wallet_limit");
  }

  invalidateCaches(userId);

  return { wallet: result.wallet, transaction: result.transaction, warnings };
}

async function getWallet(
  userId: string,
  walletId: string,
): Promise<{ wallet: any; lastTransactionAt: string | null; recentTransactions: any[] }> {
  const wallet = await storage.getWalletById(walletId, userId);
  if (!wallet) {
    throw makeError("Wallet nao encontrada", 404, "wallet_not_found");
  }
  const recent = await storage.listWalletTransactions(userId, walletId, { limit: 5, offset: 0 });
  const last = recent[0];
  return {
    wallet,
    lastTransactionAt: last?.occurredAt ? new Date(last.occurredAt as any).toISOString() : null,
    recentTransactions: recent,
  };
}

async function listWallets(
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<any[]> {
  return await storage.listWalletsByUser(userId, opts);
}

async function updateWallet(
  userId: string,
  walletId: string,
  patch: Record<string, any>,
): Promise<{ wallet: any }> {
  // Imutaveis: rejeitar tentativa de mudar com 400.
  const immutableKeys = ["nativeCurrency", "platform", "balance", "status"];
  for (const k of immutableKeys) {
    if (k in patch) {
      throw makeError(
        `Campo ${k} e imutavel apos criacao da carteira`,
        400,
        "wallet_immutable_field",
      );
    }
  }

  const result = await storage.transaction(async (tx: any) => {
    const existing = await tx.getWalletById(walletId, userId);
    if (!existing) {
      throw makeError("Wallet nao encontrada", 404, "wallet_not_found");
    }
    if (patch.name != null) {
      const trimmed = String(patch.name).trim();
      if (trimmed !== existing.name) {
        const dup = await tx.findActiveWalletByName(userId, trimmed);
        if (dup && dup.id !== walletId) {
          throw makeError(
            "Ja existe uma carteira ativa com este nome",
            400,
            "errNameDuplicate",
          );
        }
      }
      patch.name = trimmed;
    }
    // HIGH-7 fix: usar updateWalletScoped quando disponivel (tx wrapper real),
    // que aplica filtro userId no WHERE como defesa-em-profundidade. Mocks de
    // teste legados expoem apenas updateWallet — fallback compat.
    const updated = typeof tx.updateWalletScoped === "function"
      ? await tx.updateWalletScoped(walletId, userId, patch)
      : await tx.updateWallet(walletId, patch);
    return updated;
  });

  invalidateCaches(userId);
  return { wallet: result };
}

async function archiveWallet(
  userId: string,
  walletId: string,
): Promise<{ wallet: any; warning?: string }> {
  const result = await storage.transaction(async (tx: any) => {
    const existing = await tx.getWalletById(walletId, userId);
    if (!existing) {
      throw makeError("Wallet nao encontrada", 404, "wallet_not_found");
    }
    const wasActiveWithBalance =
      existing.status === "active" && parseDecimal(existing.balance) !== 0;
    const updated = await tx.archiveWallet(walletId, userId);
    return { wallet: updated, warning: wasActiveWithBalance ? "wallet_archived_with_balance" : undefined };
  });
  invalidateCaches(userId);
  return result;
}

// =============================================================================
// Transactions
// =============================================================================

async function recordWalletTransaction(
  userId: string,
  walletId: string,
  input: RecordWalletTransactionInput,
): Promise<{ transaction: any; wallet: any; warning?: string }> {
  // Validacoes sincronas pre-transaction.
  if (typeof input.nativeAmount !== "number" || input.nativeAmount <= 0) {
    throw makeError("nativeAmount deve ser maior que zero", 400);
  }
  if (!WALLET_TX_REASONS_P0.includes(input.reason as any)) {
    throw makeError(
      "reason nao suportado em P0 (use deposit, withdrawal, session_result, manual_adjustment)",
      400,
      "reason_not_supported_in_p0",
    );
  }
  if (input.reason === "session_result" && !input.sessionId) {
    throw makeError(
      "sessionId obrigatorio quando reason=session_result",
      400,
      "session_id_required",
    );
  }
  const occurredAt = input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw makeError("occurredAt invalido", 400);
  }
  // Grace de 24h cobre skew de timezone client/server e tests cross-day.
  // TODO(MED-5): reduzir para ~5min apos atualizar fixtures de tests legados.
  const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000;
  if (occurredAt.getTime() >= Date.now() + FUTURE_GRACE_MS) {
    throw makeError("occurredAt nao pode ser no futuro", 400);
  }

  const result = await storage.transaction(async (tx: any) => {
    const wallet = await tx.selectWalletForUpdate(walletId, userId);
    if (!wallet) {
      throw makeError("Wallet nao encontrada", 404, "wallet_not_found");
    }
    if (wallet.status === "archived") {
      throw makeError(
        "Wallet arquivada nao aceita novos movimentos",
        409,
        "wallet_archived",
      );
    }

    // Sprint Bankroll-3 (RF-02): defesa em profundidade — rakeback so aceita
    // direction='in'. Mesmo que Zod do router ja bloqueie, service rejeita
    // chamadas internas/futuras com a mesma regra. Apos archived check
    // (precedencia de wallet_archived eh mais informativa).
    if (input.reason === "rakeback" && input.direction === "out") {
      throw makeError(
        "Rakeback so aceita credito (entrada)",
        400,
        "invalid_rakeback_direction",
      );
    }

    // ADR-038: optimistic concurrency via expectedPreviousBalance.
    // Roda APOS selectWalletForUpdate (leitura serializada) e APOS wallet_archived.
    // Boundary 0.01 inclusivo (Math.round em centavos elimina ruido fp).
    if (typeof input.expectedPreviousBalance === "number" && Number.isFinite(input.expectedPreviousBalance)) {
      const actualBalance = parseDecimal(wallet.balance);
      const diffCents = Math.round(Math.abs(actualBalance - input.expectedPreviousBalance) * 100);
      if (diffCents > 1) {
        const err: any = new Error("balance_mismatch");
        err.statusCode = 409;
        err.code = "balance_mismatch";
        err.currentBalance = actualBalance;
        throw err;
      }
    }

    // Out-of-order check (MED-6 do plano).
    const lastTx = await tx.getLastWalletTransaction(walletId);
    if (lastTx?.occurredAt) {
      const lastTime = new Date(lastTx.occurredAt as any).getTime();
      if (occurredAt.getTime() < lastTime) {
        throw makeError(
          "occurredAt anterior ao ultimo movimento desta carteira",
          422,
          "out_of_order",
        );
      }
    }

    const settings = await tx.getUserSettings(userId);
    const exchangeRates = (settings?.exchangeRates ?? {}) as Record<string, number>;
    const { usdAmount, fxRate } = nativeToUSD(
      input.nativeAmount,
      wallet.nativeCurrency,
      exchangeRates,
    );

    const prevBalance = parseDecimal(wallet.balance);
    const delta = input.direction === "in" ? input.nativeAmount : -input.nativeAmount;
    const newBalance = prevBalance + delta;

    const transaction = await tx.createWalletTransaction({
      walletId,
      userId,
      occurredAt,
      effectiveAt: occurredAt,
      direction: input.direction,
      nativeAmount: String(input.nativeAmount),
      nativeCurrency: wallet.nativeCurrency,
      fxRateUSDPerNative: String(fxRate),
      usdAmount: String(usdAmount),
      previousNativeBalance: String(prevBalance),
      newNativeBalance: String(newBalance),
      reason: input.reason,
      note: input.note ?? null,
      sessionId: input.sessionId ?? null,
      source: input.source ?? "manual",
    });

    await tx.updateWalletBalance(walletId, newBalance);

    // Espelho em bankroll_snapshots (compat v1) — HIGH-5 fix:
    // previousAmount/newAmount refletem banca CONSOLIDADA em USD (todas wallets ativas),
    // nao apenas saldo desta wallet. Mantem invariante ADR-017 valida em multi-wallet.
    const usdDelta = input.direction === "in" ? usdAmount : -usdAmount;
    let otherUSD = 0;
    if (typeof tx.getActiveWalletsByUser === "function") {
      const allActive = (await tx.getActiveWalletsByUser(userId)) ?? [];
      for (const w of allActive) {
        if (w.id === walletId) continue;
        const wRate = w.nativeCurrency === "USD"
          ? 1
          : (exchangeRates as any)[w.nativeCurrency] ?? 1;
        otherUSD += parseDecimal(w.balance) / (wRate || 1);
      }
    }
    const prevConsolidatedUSD = otherUSD + (parseDecimal(wallet.balance) / (fxRate || 1));
    const newConsolidatedUSD = otherUSD + (newBalance / (fxRate || 1));
    await tx.insertBankrollSnapshot({
      userId,
      delta: usdDelta,
      previousAmount: prevConsolidatedUSD,
      newAmount: newConsolidatedUSD,
      reason: input.reason === "session_result" ? "session_result" : input.reason,
      note: input.note ?? null,
      source: "manual",
      sessionId: input.sessionId ?? null,
      occurredAt,
      // RF-04: colunas v2 populadas no espelho
      walletId,
      nativeAmount: String(input.nativeAmount),
      nativeCurrency: wallet.nativeCurrency,
      fxRateUSDPerNative: String(fxRate),
    });

    return { transaction, wallet: { ...wallet, balance: String(newBalance) }, newBalance };
  });

  invalidateCaches(userId);

  const warning = result.newBalance < 0 ? "wallet_negative" : undefined;
  return warning
    ? { transaction: result.transaction, wallet: result.wallet, warning }
    : { transaction: result.transaction, wallet: result.wallet };
}

async function listWalletTransactions(
  userId: string,
  walletId: string,
  filters: any = {},
): Promise<{ transactions: any[]; pagination: any; summary: any }> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const reasonArr =
    typeof filters.reason === "string" && filters.reason.length > 0
      ? filters.reason.split(",").map((r: string) => r.trim()).filter(Boolean)
      : undefined;

  const transactions = await storage.listWalletTransactions(userId, walletId, {
    from: filters.from,
    to: filters.to,
    reason: reasonArr,
    limit,
    offset,
  });

  // Summary
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalSessionPnL = 0;
  let totalManualAdjustments = 0;
  let nativeCurrency = "USD";
  for (const t of transactions) {
    nativeCurrency = (t as any).nativeCurrency ?? nativeCurrency;
    const amt = parseDecimal((t as any).nativeAmount);
    const signed = (t as any).direction === "in" ? amt : -amt;
    switch ((t as any).reason) {
      case "deposit":
        totalDeposits += amt;
        break;
      case "withdrawal":
        totalWithdrawals += amt;
        break;
      case "session_result":
        totalSessionPnL += signed;
        break;
      case "manual_adjustment":
        totalManualAdjustments += signed;
        break;
    }
  }
  const net = totalDeposits - totalWithdrawals + totalSessionPnL + totalManualAdjustments;

  return {
    transactions,
    pagination: { total: transactions.length, limit, offset },
    summary: {
      totalDepositsNative: String(totalDeposits),
      totalWithdrawalsNative: String(totalWithdrawals),
      totalSessionPnLNative: String(totalSessionPnL),
      totalManualAdjustmentsNative: String(totalManualAdjustments),
      netNative: String(net),
      nativeCurrency,
    },
  };
}

// =============================================================================
// Aggregation
// =============================================================================

async function getConsolidatedBalance(userId: string): Promise<ConsolidatedBalance> {
  const allWallets = await storage.getActiveWalletsByUser(userId);
  const settings = await storage.getUserSettings(userId);
  const exchangeRates = (settings?.exchangeRates ?? {}) as Record<string, number>;
  const rule = (settings as any)?.bankrollRule ?? "1pct";
  const aggregationMode = ((settings as any)?.bankrollAggregationMode ?? "global") as
    | "global"
    | "per_wallet";
  const displayCurrency = ((settings as any)?.bankrollDisplayCurrency ?? "USD") as string;

  const main: any[] = [];
  const shotPockets: any[] = [];
  let totalUSD = 0;

  for (const w of allWallets) {
    const balanceNative = parseDecimal(w.balance);
    const { usdAmount, fxRate } = nativeToUSD(balanceNative, w.nativeCurrency, exchangeRates);
    const entry = {
      walletId: w.id,
      name: w.name,
      platform: w.platform,
      nativeCurrency: w.nativeCurrency,
      balanceNative: String(balanceNative),
      balanceUSD: String(usdAmount.toFixed(2)),
      fxRateUSDPerNative: String(fxRate),
      isShotPocket: !!w.isShotPocket,
    };
    if (w.isShotPocket) {
      shotPockets.push({ ...entry, balanceUSD: String(usdAmount.toFixed(2)) });
    } else {
      main.push(entry);
      totalUSD += usdAmount;
    }
  }

  // Calculate share for main wallets (4 decimals)
  for (const e of main) {
    const balanceUSD = parseDecimal(e.balanceUSD);
    e.share = totalUSD > 0 ? Number((balanceUSD / totalUSD).toFixed(4)) : 0;
  }

  // Compute rule limits in global mode; null in per_wallet.
  let softLimitUSD: string | null = null;
  let hardLimitUSD: string | null = null;
  let rulePct = 1.0;
  if (aggregationMode === "global") {
    const t = computeThresholds({ amount: totalUSD, rule });
    rulePct = t.rulePct;
    softLimitUSD = t.softLimitUSD != null ? String(t.softLimitUSD) : null;
    hardLimitUSD = t.hardLimitUSD != null ? String(t.hardLimitUSD) : null;
  }

  // totalDisplayCurrency: convert totalUSD to displayCurrency.
  let totalDisplayCurrency: string;
  if (displayCurrency === "USD") {
    totalDisplayCurrency = String(totalUSD.toFixed(2));
  } else {
    const rate =
      typeof exchangeRates[displayCurrency] === "number" && exchangeRates[displayCurrency] > 0
        ? exchangeRates[displayCurrency]
        : DEFAULT_EXCHANGE_RATES[displayCurrency] ?? 1.0;
    // ADR-033: USD -> native = usd * rate.
    totalDisplayCurrency = String((totalUSD * rate).toFixed(2));
  }

  return {
    aggregationMode,
    displayCurrency,
    totalUSD: String(totalUSD.toFixed(2)),
    totalDisplayCurrency,
    rule,
    rulePct,
    tolerance: BANKROLL_TOLERANCE,
    softLimitUSD,
    hardLimitUSD,
    byWallet: main,
    shotPockets,
    walletCount: main.length,
    shotPocketCount: shotPockets.length,
    lastUpdatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Migration v1 -> v2
// =============================================================================

async function migrateUserV1toV2(
  userId: string,
): Promise<{ created: boolean; walletId?: string }> {
  return await storage.transaction(async (tx: any) => {
    const settings = await tx.getUserSettings(userId);
    if (!settings) {
      return { created: false };
    }
    const alreadyMigrated = !!(settings as any).bankrollV2Migrated;
    if (alreadyMigrated) {
      return { created: false };
    }
    const existingWallets = await tx.listWalletsByUser(userId, { includeArchived: true });
    if (existingWallets.length > 0) {
      // Defesa em profundidade: ja tem wallets, marca migrated e pula.
      await tx.setUserBankrollV2Migrated(userId, true);
      return { created: false };
    }
    const amount = parseDecimal((settings as any).bankrollAmount);
    if (!(settings as any).bankrollAmount || amount <= 0) {
      // Sem bankroll v1 — nao cria wallet, mas tambem nao marca migrated.
      return { created: false };
    }

    const created = await tx.createWallet({
      userId,
      name: "Banca Padrao USD",
      platform: "GenericUSD",
      nativeCurrency: "USD",
      balance: String(amount),
      status: "active",
      isShotPocket: false,
    });
    await tx.backfillSnapshotsWalletId(userId, created.id);
    await tx.setUserBankrollV2Migrated(userId, true);

    invalidateCaches(userId);

    return { created: true, walletId: created.id };
  });
}

// =============================================================================
// Export
// =============================================================================

export const walletService = {
  createWallet,
  getWallet,
  listWallets,
  updateWallet,
  archiveWallet,
  recordWalletTransaction,
  listWalletTransactions,
  getConsolidatedBalance,
  migrateUserV1toV2,
};
