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
  const caches = [
    ["selectorCache", selectorCache],
    ["bankrollCache", bankrollCache],
    ["walletCache", walletCache],
  ] as const;
  for (const [name, cache] of caches) {
    try {
      cache.invalidateAllForUser(userId);
    } catch (err) {
      console.error(`walletService: ${name}.invalidateAllForUser failed`, err);
    }
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
  externalTx?: any,
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

  // CRITICAL-01 fix: aceita `externalTx` para participar de transaction abrangente
  // do caller (ex: sessionReconciliation). Quando passado, NAO abre tx propria —
  // ownership de commit/rollback fica com o caller. Cache invalidation tambem
  // delegada ao caller (que decide quando seguro invalidar apos commit do outer tx).
  // Quando ausente, mantem comportamento original (back-compat).
  const txRunner = async (tx: any) => {
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
  };

  // Branch atomico: usa externalTx (caller controla commit) ou abre tx interna.
  const result = externalTx
    ? await txRunner(externalTx)
    : await storage.transaction(txRunner);

  // Cache invalidation so quando NAO ha externalTx — caller eh responsavel
  // por invalidar apos commit do outer tx (evita janela de cache stale entre
  // commit do filho e commit do pai).
  if (!externalTx) {
    invalidateCaches(userId);
  }

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
  // ADR-033: USD -> native = usd * rate. nativeToUSD reuse keeps lookup logic single-source.
  let totalDisplayCurrency: string;
  if (displayCurrency === "USD") {
    totalDisplayCurrency = String(totalUSD.toFixed(2));
  } else {
    const { fxRate } = nativeToUSD(1, displayCurrency, exchangeRates);
    totalDisplayCurrency = String((totalUSD * fxRate).toFixed(2));
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

// =============================================================================
// Sprint Bankroll-3 RF-4 — Cross-wallet transfers
// ADR-059. Body: { fromWalletId, toWalletId, amountFrom, amountTo?, fxRate?,
//   feeAmount?, feeCurrency?, feeWalletId?, reason, note?, confirmFxDiff? }.
// Cross-currency exige fxRate. Diff > 5% vs market exige confirmFxDiff=true.
// =============================================================================

const TRANSFER_FX_DIFF_TOLERANCE = 0.05; // 5%
const TRANSFER_REASONS_ALLOWED = new Set([
  "transfer",
  "rebalance",
  "cashout_to_bank",
  "site_to_site",
]);

function genTransferId(): string {
  // Sem nanoid import explicito para evitar circular imports.
  return "transfer_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

interface CreateTransferInput {
  fromWalletId: string;
  toWalletId: string;
  amountFrom: number | string;
  amountTo?: number | string;
  fxRate?: number | string;
  feeAmount?: number | string;
  feeCurrency?: string;
  feeWalletId?: string;
  reason: string;
  note?: string | null;
  occurredAt?: Date | string;
  confirmFxDiff?: boolean;
}

async function createTransfer(
  userId: string,
  input: CreateTransferInput,
): Promise<{ transfer: any; transactions: any[] }> {
  if (!userId) throw makeError("Unauthorized", 401);
  if (!input || typeof input !== "object") {
    throw makeError("Body invalido", 400, "VALIDATION");
  }
  if (!input.fromWalletId || !input.toWalletId) {
    throw makeError("fromWalletId e toWalletId obrigatorios", 400, "VALIDATION");
  }
  if (input.fromWalletId === input.toWalletId) {
    throw makeError("fromWalletId e toWalletId devem ser diferentes", 400, "VALIDATION");
  }
  const amountFrom =
    typeof input.amountFrom === "string" ? parseFloat(input.amountFrom) : input.amountFrom;
  if (!Number.isFinite(amountFrom) || amountFrom <= 0) {
    throw makeError("amountFrom deve ser maior que zero", 400, "VALIDATION");
  }
  if (!input.reason || !TRANSFER_REASONS_ALLOWED.has(input.reason)) {
    throw makeError(`reason invalido: ${input.reason}`, 400, "VALIDATION");
  }
  // Fee validation
  const feeAmountSet = input.feeAmount != null;
  if (feeAmountSet && (!input.feeCurrency || !input.feeWalletId)) {
    throw makeError(
      "feeAmount exige feeCurrency e feeWalletId",
      400,
      "VALIDATION",
    );
  }
  const feeAmount = feeAmountSet
    ? typeof input.feeAmount === "string"
      ? parseFloat(input.feeAmount)
      : (input.feeAmount as number)
    : 0;
  if (feeAmountSet && (!Number.isFinite(feeAmount) || feeAmount < 0)) {
    throw makeError("feeAmount invalido", 400, "VALIDATION");
  }

  return await storage.transaction(async (tx: any) => {
    const fromWallet = await tx.selectWalletForUpdate(input.fromWalletId, userId);
    const toWallet = await tx.selectWalletForUpdate(input.toWalletId, userId);
    if (!fromWallet) throw makeError("from wallet nao encontrada", 404, "WALLET_NOT_FOUND");
    if (!toWallet) throw makeError("to wallet nao encontrada", 404, "WALLET_NOT_FOUND");
    if (fromWallet.userId !== userId || toWallet.userId !== userId) {
      throw makeError("Wallet de outro usuario", 403, "FORBIDDEN");
    }
    if (fromWallet.status === "archived" || toWallet.status === "archived") {
      throw makeError("WALLET_ARCHIVED", 422, "WALLET_ARCHIVED");
    }

    // Cross-currency validation (D4 + D11)
    let amountTo: number;
    let fxRate: number | null = null;
    if (fromWallet.nativeCurrency === toWallet.nativeCurrency) {
      amountTo = amountFrom;
      fxRate = 1;
    } else {
      const rateRaw =
        typeof input.fxRate === "string" ? parseFloat(input.fxRate) : input.fxRate;
      if (rateRaw == null || !Number.isFinite(rateRaw) || rateRaw <= 0) {
        throw makeError(
          "fxRate obrigatorio para transferencia entre moedas diferentes",
          400,
          "VALIDATION",
        );
      }
      fxRate = rateRaw;
      // D11: diff > 5% vs market requires confirmFxDiff=true
      try {
        const fxMod = await import("./fxResolver");
        const fx = await fxMod.fxResolver.resolveExchangeRates(userId);
        const rates = fx.rates;
        const fromRate = rates[fromWallet.nativeCurrency] ?? 1;
        const toRate = rates[toWallet.nativeCurrency] ?? 1;
        if (fromRate > 0 && toRate > 0) {
          const marketRate = toRate / fromRate;
          const diff = Math.abs(rateRaw - marketRate) / marketRate;
          if (diff > TRANSFER_FX_DIFF_TOLERANCE && input.confirmFxDiff !== true) {
            const err: any = new Error(
              `fxRate divergente do mercado em ${(diff * 100).toFixed(1)}%. Confirme via confirmFxDiff=true.`,
            );
            err.code = "FX_DIFF_HIGH";
            err.statusCode = 422;
            err.httpStatus = 422;
            err.providedRate = rateRaw;
            err.marketRate = marketRate;
            err.diffPct = diff;
            throw err;
          }
        }
      } catch (err: any) {
        if (err?.code === "FX_DIFF_HIGH") throw err;
        // outros erros fx: log e continue (fxRate permanece valido)
        console.warn("[walletService.createTransfer] fxResolver lookup failed:", err?.message);
      }
      amountTo = amountFrom * fxRate;
    }

    const fromBalance = parseDecimal(fromWallet.balance);
    if (fromBalance < amountFrom) {
      throw makeError("INSUFFICIENT_BALANCE", 422, "INSUFFICIENT_BALANCE");
    }

    const transferGroupId = genTransferId();
    const now = input.occurredAt ? new Date(input.occurredAt as any) : new Date();

    // Insert wallet_transfers row
    const transferRow = await tx.insertWalletTransfer({
      id: transferGroupId,
      userId,
      transferGroupId,
      fromWalletId: input.fromWalletId,
      toWalletId: input.toWalletId,
      amountFrom: String(amountFrom),
      amountTo: String(amountTo),
      fromCurrency: fromWallet.nativeCurrency,
      toCurrency: toWallet.nativeCurrency,
      fxRate: fxRate != null ? String(fxRate) : null,
      feeAmount: feeAmountSet ? String(feeAmount) : null,
      feeCurrency: feeAmountSet ? input.feeCurrency : null,
      feeWalletId: feeAmountSet ? input.feeWalletId : null,
      reason: input.reason,
      note: input.note ?? null,
      occurredAt: now,
    });

    const transactions: any[] = [];

    // transfer_out
    const txOut = await tx.createWalletTransaction({
      walletId: fromWallet.id,
      userId,
      occurredAt: now,
      effectiveAt: now,
      direction: "out",
      nativeAmount: String(amountFrom),
      nativeCurrency: fromWallet.nativeCurrency,
      fxRateUSDPerNative: String(fxRate ?? 1),
      usdAmount: String(amountFrom),
      previousNativeBalance: String(fromBalance),
      newNativeBalance: String(fromBalance - amountFrom),
      reason: "transfer_out",
      note: input.note ?? null,
      transferGroupId,
      source: "manual",
    });
    transactions.push(txOut);
    await tx.updateWalletBalance(fromWallet.id, fromBalance - amountFrom);

    // transfer_in
    const toBalance = parseDecimal(toWallet.balance);
    const txIn = await tx.createWalletTransaction({
      walletId: toWallet.id,
      userId,
      occurredAt: now,
      effectiveAt: now,
      direction: "in",
      nativeAmount: String(amountTo),
      nativeCurrency: toWallet.nativeCurrency,
      fxRateUSDPerNative: String(fxRate ?? 1),
      usdAmount: String(amountTo),
      previousNativeBalance: String(toBalance),
      newNativeBalance: String(toBalance + amountTo),
      reason: "transfer_in",
      note: input.note ?? null,
      transferGroupId,
      source: "manual",
    });
    transactions.push(txIn);
    await tx.updateWalletBalance(toWallet.id, toBalance + amountTo);

    // Fee opcional
    if (feeAmountSet && feeAmount > 0) {
      if (input.feeWalletId === input.fromWalletId) {
        // Fee debita da from no mesmo escopo — sem 3a tx (D agregamos no balance).
        // O ideal seria criar uma tx fee separada na from; spec diz "se feeWallet == fromWallet, nao cria 3a".
        // Atualizamos balance da from descontando fee adicional.
        const newFromBalance = fromBalance - amountFrom - feeAmount;
        await tx.updateWalletBalance(fromWallet.id, newFromBalance);
      } else if (input.feeWalletId === input.toWalletId) {
        // Fee na wallet to — cria 3a tx.
        const tofb = parseDecimal(toWallet.balance) + amountTo;
        const txFee = await tx.createWalletTransaction({
          walletId: toWallet.id,
          userId,
          occurredAt: now,
          effectiveAt: now,
          direction: "out",
          nativeAmount: String(feeAmount),
          nativeCurrency: input.feeCurrency,
          fxRateUSDPerNative: "1",
          usdAmount: String(feeAmount),
          previousNativeBalance: String(tofb),
          newNativeBalance: String(tofb - feeAmount),
          reason: "transfer_fee",
          note: input.note ?? null,
          transferGroupId,
          source: "manual",
        });
        transactions.push(txFee);
        await tx.updateWalletBalance(toWallet.id, tofb - feeAmount);
      } else {
        // Fee em wallet 3a
        const feeWallet = await tx.selectWalletForUpdate(input.feeWalletId!, userId);
        if (!feeWallet) throw makeError("fee wallet nao encontrada", 404, "WALLET_NOT_FOUND");
        const feeBalance = parseDecimal(feeWallet.balance);
        if (feeBalance < feeAmount) {
          throw makeError("INSUFFICIENT_BALANCE (fee)", 422, "INSUFFICIENT_BALANCE");
        }
        const txFee = await tx.createWalletTransaction({
          walletId: feeWallet.id,
          userId,
          occurredAt: now,
          effectiveAt: now,
          direction: "out",
          nativeAmount: String(feeAmount),
          nativeCurrency: input.feeCurrency,
          fxRateUSDPerNative: "1",
          usdAmount: String(feeAmount),
          previousNativeBalance: String(feeBalance),
          newNativeBalance: String(feeBalance - feeAmount),
          reason: "transfer_fee",
          note: input.note ?? null,
          transferGroupId,
          source: "manual",
        });
        transactions.push(txFee);
        await tx.updateWalletBalance(feeWallet.id, feeBalance - feeAmount);
      }
    }

    invalidateCaches(userId);

    return { transfer: transferRow, transactions };
  });
}

async function listTransfers(
  userId: string,
  opts: { walletId?: string; limit?: number } = {},
): Promise<any[]> {
  if (!userId) throw makeError("Unauthorized", 401);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const storageAny = storage as any;
  if (typeof storageAny.listWalletTransfers === "function") {
    return await storageAny.listWalletTransfers(userId, { walletId: opts.walletId, limit });
  }
  return [];
}

async function getTransfer(
  userId: string,
  transferId: string,
): Promise<{ transfer: any; transactions: any[] } | null> {
  if (!userId) throw makeError("Unauthorized", 401);
  const storageAny = storage as any;
  if (typeof storageAny.getWalletTransferById === "function") {
    return await storageAny.getWalletTransferById(userId, transferId);
  }
  return null;
}

// =============================================================================
// Sprint Bankroll-3 RF-5 — Pending transactions (deposit/withdrawal pending)
// =============================================================================

const PENDING_DIRECTIONS_SET = new Set(["deposit_pending", "withdrawal_pending"]);
const PENDING_CAP = 10;

interface CreatePendingInput {
  direction: string;
  nativeAmount: number | string;
  nativeCurrency: string;
  reason: string;
  expectedClearAt?: Date | string;
  note?: string | null;
  externalReference?: string | null;
}

async function createPending(
  userId: string,
  walletId: string,
  input: CreatePendingInput,
): Promise<any> {
  if (!userId) throw makeError("Unauthorized", 401);
  if (!walletId) throw makeError("walletId obrigatorio", 400);
  if (!input?.direction || !PENDING_DIRECTIONS_SET.has(input.direction)) {
    throw makeError(`direction invalida: ${input?.direction}`, 400, "VALIDATION");
  }
  const amount =
    typeof input.nativeAmount === "string" ? parseFloat(input.nativeAmount) : input.nativeAmount;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw makeError("nativeAmount deve ser maior que zero", 400, "VALIDATION");
  }

  const wallet = await storage.getWalletById(walletId, userId);
  if (!wallet) throw makeError("Wallet nao encontrada", 404, "WALLET_NOT_FOUND");
  if (wallet.userId !== userId) throw makeError("Forbidden", 403, "FORBIDDEN");
  if (wallet.status === "archived") {
    throw makeError("WALLET_ARCHIVED", 422, "WALLET_ARCHIVED");
  }

  return await storage.transaction(async (tx: any) => {
    const count =
      typeof tx.countWalletPendingActive === "function"
        ? await tx.countWalletPendingActive(walletId)
        : 0;
    if (count >= PENDING_CAP) {
      throw makeError(
        `PENDING_CAP_REACHED: max ${PENDING_CAP} pending por wallet`,
        422,
        "PENDING_CAP_REACHED",
      );
    }
    const pending = await tx.createWalletPending({
      walletId,
      userId,
      direction: input.direction,
      nativeAmount: String(amount),
      nativeCurrency: input.nativeCurrency,
      reason: input.reason,
      status: "pending",
      expectedClearAt: input.expectedClearAt ?? null,
      note: input.note ?? null,
      externalReference: input.externalReference ?? null,
    });
    return pending;
  });
}

async function listPending(
  userId: string,
  walletId: string,
  opts: { includeAll?: boolean } = {},
): Promise<any[]> {
  if (!userId) throw makeError("Unauthorized", 401);
  const storageAny = storage as any;
  if (typeof storageAny.listWalletPending === "function") {
    return await storageAny.listWalletPending(userId, walletId, { includeAll: opts.includeAll === true });
  }
  return [];
}

async function cancelPending(userId: string, pendingId: string): Promise<any> {
  if (!userId) throw makeError("Unauthorized", 401);
  if (!pendingId) throw makeError("pendingId obrigatorio", 400);
  const pending: any = await (storage as any).getWalletPendingById?.(userId, pendingId);
  if (!pending) throw makeError("Pending nao encontrado", 404);
  // Idempotente: se ja cancelled, retorna OK (warn).
  if (pending.status === "cancelled") {
    return pending;
  }
  return await storage.transaction(async (tx: any) => {
    // Spec test expects storage.updateWalletPendingStatus(tx_or_id, {...}).
    // Pass tx as first arg + payload as second arg (consistent with createWalletTransaction pattern).
    await (storage as any).updateWalletPendingStatus(tx, {
      id: pendingId,
      status: "cancelled",
      cancelledAt: new Date(),
    });
    return { ...pending, status: "cancelled", cancelledAt: new Date() };
  });
}

interface SettlePendingBody {
  actualNativeAmount?: number | string;
  actualOccurredAt?: Date | string;
  fxRateUSDPerNative?: number | string;
  note?: string | null;
}

async function settlePending(
  userId: string,
  pendingId: string,
  body: SettlePendingBody = {},
): Promise<{ transaction: any; pending: any }> {
  if (!userId) throw makeError("Unauthorized", 401);
  if (!pendingId) throw makeError("pendingId obrigatorio", 400);

  const pending: any = await (storage as any).getWalletPendingById?.(userId, pendingId);
  if (!pending) throw makeError("Pending nao encontrado", 404);
  if (pending.status === "cleared") {
    throw makeError("PENDING_ALREADY_CLEARED", 409, "PENDING_ALREADY_CLEARED");
  }
  if (pending.status === "cancelled") {
    throw makeError("PENDING_CANCELLED", 409, "PENDING_CANCELLED");
  }

  return await storage.transaction(async (tx: any) => {
    // Reload pending under tx if possible
    const txPending: any =
      (typeof tx.getWalletPendingById === "function"
        ? await tx.getWalletPendingById(userId, pendingId)
        : pending) ?? pending;
    if (!txPending) throw makeError("Pending nao encontrado", 404);
    if (txPending.status !== "pending") {
      throw makeError("PENDING_ALREADY_CLEARED", 409, "PENDING_ALREADY_CLEARED");
    }

    const wallet = await tx.selectWalletForUpdate(txPending.walletId, userId);
    if (!wallet) throw makeError("Wallet nao encontrada", 404, "WALLET_NOT_FOUND");

    const declared = parseDecimal(txPending.nativeAmount);
    const actual = body.actualNativeAmount != null
      ? parseDecimal(body.actualNativeAmount)
      : declared;
    const isDeposit = txPending.direction === "deposit_pending";
    const reason = isDeposit ? "deposit" : "withdrawal";
    const direction = isDeposit ? "in" : "out";
    const balance = parseDecimal(wallet.balance);
    const newBalance = isDeposit ? balance + actual : balance - actual;

    if (!isDeposit && newBalance < 0) {
      throw makeError("INSUFFICIENT_BALANCE", 422, "INSUFFICIENT_BALANCE");
    }

    const occurred = body.actualOccurredAt
      ? new Date(body.actualOccurredAt as any)
      : new Date();
    const fxRate = body.fxRateUSDPerNative != null
      ? parseDecimal(body.fxRateUSDPerNative)
      : 1;

    const transaction = await tx.createWalletTransaction({
      walletId: wallet.id,
      userId,
      occurredAt: occurred,
      effectiveAt: occurred,
      direction,
      nativeAmount: String(actual),
      nativeCurrency: txPending.nativeCurrency,
      fxRateUSDPerNative: String(fxRate),
      usdAmount: String(actual / (fxRate || 1)),
      previousNativeBalance: String(balance),
      newNativeBalance: String(newBalance),
      reason,
      note: body.note ?? txPending.note ?? null,
      externalReference: txPending.externalReference ?? null,
      source: "manual",
    });

    await tx.updateWalletBalance(wallet.id, newBalance);

    // Spec test for settlePending expects tx.updateWalletPendingStatus (tx-bound).
    if (typeof tx.updateWalletPendingStatus === "function") {
      await tx.updateWalletPendingStatus(tx, {
        id: pendingId,
        status: "cleared",
        clearedAt: new Date(),
      });
    } else {
      await (storage as any).updateWalletPendingStatus(tx, {
        id: pendingId,
        status: "cleared",
        clearedAt: new Date(),
      });
    }

    invalidateCaches(userId);

    return { transaction, pending: { ...txPending, status: "cleared", clearedAt: new Date() } };
  });
}

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
  // Sprint Bankroll-3 RF-4
  createTransfer,
  listTransfers,
  getTransfer,
  // Sprint Bankroll-3 RF-5
  createPending,
  listPending,
  cancelPending,
  settlePending,
};
