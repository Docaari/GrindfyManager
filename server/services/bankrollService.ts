/**
 * Bankroll Service — Sprint 2 (RF-01 a RF-04)
 *
 * Fonte: docs/specs/bankroll-management.md
 *        docs/architecture/flows/bankroll/sequence-configure.md
 *        docs/architecture/decisions/017-bankroll-snapshot-vs-derived.md
 *        docs/architecture/decisions/018-bankroll-tolerance-hardcoded.md
 *
 * API:
 *   getBankrollState(userId)                -> estado atual (configured, amount, maxBuyIn, etc.)
 *   updateBankroll(userId, { amount, rule, reason, note })   -> RF-02 (upsert + snapshot)
 *   recordSnapshot(userId, { delta, reason, note, occurredAt })
 *                                            -> RF-03 (aporte / saque / ajuste)
 *   getBankrollHistory(userId, filters)     -> RF-04 (paginacao + serie + summary)
 */

import { storage } from "../storage";
import { selectorCache } from "./selectorCache";
import { bankrollCache } from "./bankrollCache";
import {
  parseRule,
  computeThresholds,
  BANKROLL_TOLERANCE,
} from "../scoring/bankrollRules";

// ============================================================================
// Types
// ============================================================================

export type BankrollReason =
  | "initial"
  | "deposit"
  | "withdrawal"
  | "session_result"
  | "manual_adjustment";

export interface BankrollState {
  configured: boolean;
  amount: number | null;
  currency: string;
  rule: string;
  rulePct: number;
  tolerance: number;
  maxBuyInUSD: number | null;
  softLimitUSD: number | null;
  hardLimitUSD: number | null;
  maxBuyInDisplay: { USD: number | null; BRL?: number; EUR?: number };
  // MED-3 fix (UX-2 2026-04-25): novos campos para evitar derivacao fragil
  // da taxa BRL no client (BankrollWidget).
  // Bankroll-Reform 2026-05-05: extendido EUR no breakdown card.
  amountDisplay: { USD: number | null; BRL?: number; EUR?: number };
  exchangeRateBRL: number | null;
  exchangeRateEUR: number | null;
  lastUpdatedAt: string | null;
  snapshotCount: number;
}

export interface UpdateBankrollInput {
  amount?: number | null;
  rule?: string;
  reason?: BankrollReason;
  note?: string | null;
}

export interface RecordSnapshotInput {
  delta: number;
  reason: BankrollReason;
  note?: string | null;
  occurredAt?: Date | string;
}

export interface BankrollHistoryFilters {
  from?: string;
  to?: string;
  granularity?: "day" | "week" | "month";
  reason?: string;
  limit?: number;
  offset?: number;
}

export interface BankrollHistoryResponse {
  snapshots: any[];
  series: Array<{
    bucket: string;
    balance: number;
    movements: number;
    delta: number;
  }>;
  summary: {
    totalDeposits: number;
    totalWithdrawals: number;
    totalSessionPnL: number;
    totalManualAdjustments: number;
    netChange: number;
    startBalance: number;
    endBalance: number;
  };
  pagination: { total: number; limit: number; offset: number };
}

// ============================================================================
// Helpers
// ============================================================================

function parseDecimal(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

function sanitizeRatesObject(input: any): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const n = typeof v === "number" ? v : Number(v);
    if (typeof k === "string" && k.length >= 2 && Number.isFinite(n) && n > 0) {
      out[k] = n;
    }
  }
  return out;
}

function toDateOrNull(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDateYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeekISO(d: Date): Date {
  // Week ISO: segunda = 1, domingo = 7. Bucket do lunes.
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay(); // 0-6 (0=domingo)
  const diff = day === 0 ? 6 : day - 1; // dias desde segunda
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function invalidateBankrollCaches(userId: string): void {
  const caches = [
    ["selectorCache", selectorCache],
    ["bankrollCache", bankrollCache],
  ] as const;
  for (const [name, cache] of caches) {
    try {
      cache.invalidateAllForUser(userId);
    } catch (err) {
      console.error(`bankrollService: ${name}.invalidateAllForUser failed for user`, userId, err);
    }
  }
}

function validateRuleOrThrow(rule: string): number {
  const parsed = parseRule(rule);
  if (!parsed.valid) {
    // Mensagem incluindo range (spec criterio)
    throw new Error(`Rule invalida: use "1pct", "2pct", "5pct" ou custom:<N> com N entre 0.1 e 20 (uma casa decimal).`);
  }
  return parsed.pct;
}

// QW-1 RF-06: telemetria pos-deploy detecta rate < 1.0 (suspeita legacy).
// Set por (userId, processo) — emit unico por usuario.
const LEGACY_FX_WARNED_USERS = new Set<string>();

function buildStateFromSettings(
  settings: any,
  snapshotCount: number,
): BankrollState {
  const amountStr = settings?.bankrollAmount;
  const amount = amountStr == null ? null : parseDecimal(amountStr);
  const configured = amount != null;
  const rule = settings?.bankrollRule ?? "1pct";
  const thresholds = computeThresholds({ amount, rule });
  const exchangeRates = (settings?.exchangeRates ?? {}) as Record<string, number>;
  // MED-3 fix (UX-2 2026-04-25): expoe exchangeRateBRL e amountDisplay
  // explicitos. Antes, o BankrollWidget derivava taxa via
  // `maxBuyInBRL/maxBuyInUSD` — fragil. Agora server eh fonte unica.
  // QW-1 RF-03 (ADR-033): rate=5.0 significa "1 USD vale 5 BRL".
  // Conversao USD -> native: native = usd * rate. Guard para rate <= 0.
  const exchangeRateBRLRaw = exchangeRates.BRL;
  const exchangeRateBRL =
    typeof exchangeRateBRLRaw === "number" && exchangeRateBRLRaw > 0
      ? exchangeRateBRLRaw
      : null;

  // QW-1 RF-06: telemetria — usuario com rate < 1.0 e suspeito de convencao
  // antiga (legacy "USD por unidade"). Emitir warning unico por (userId, sessao).
  if (
    typeof exchangeRateBRLRaw === "number" &&
    exchangeRateBRLRaw > 0 &&
    exchangeRateBRLRaw < 1.0 &&
    settings?.userId
  ) {
    const userId = String(settings.userId);
    if (!LEGACY_FX_WARNED_USERS.has(userId)) {
      LEGACY_FX_WARNED_USERS.add(userId);
      console.warn("bankroll_fx_rate_suspect_legacy", {
        userId,
        ccy: "BRL",
        rate: exchangeRateBRLRaw,
        expected: ">= 1.0 in new convention (ADR-033)",
      });
    }
  }

  // Bankroll-Reform 2026-05-05: expor EUR para breakdown no card "Banca atual".
  const exchangeRateEURRaw = exchangeRates.EUR;
  const exchangeRateEUR =
    typeof exchangeRateEURRaw === "number" && exchangeRateEURRaw > 0
      ? exchangeRateEURRaw
      : null;

  // ADR-033: USD -> native (display) = usdAmount * rate.
  const display: { USD: number | null; BRL?: number; EUR?: number } = {
    USD: thresholds.hardLimitUSD,
  };
  if (thresholds.hardLimitUSD != null && exchangeRateBRL != null) {
    display.BRL = thresholds.hardLimitUSD * exchangeRateBRL;
  }
  if (thresholds.hardLimitUSD != null && exchangeRateEUR != null) {
    display.EUR = thresholds.hardLimitUSD * exchangeRateEUR;
  }

  const amountDisplay: { USD: number | null; BRL?: number; EUR?: number } = {
    USD: amount,
  };
  if (amount != null && exchangeRateBRL != null) {
    amountDisplay.BRL = amount * exchangeRateBRL;
  }
  if (amount != null && exchangeRateEUR != null) {
    amountDisplay.EUR = amount * exchangeRateEUR;
  }

  return {
    configured,
    amount,
    currency: "USD",
    rule,
    rulePct: thresholds.rulePct,
    tolerance: BANKROLL_TOLERANCE,
    maxBuyInUSD: thresholds.hardLimitUSD,
    softLimitUSD: thresholds.softLimitUSD,
    hardLimitUSD: thresholds.hardLimitUSD,
    maxBuyInDisplay: display,
    amountDisplay,
    exchangeRateBRL,
    exchangeRateEUR,
    lastUpdatedAt: settings?.updatedAt
      ? (settings.updatedAt instanceof Date
          ? settings.updatedAt.toISOString()
          : String(settings.updatedAt))
      : null,
    snapshotCount,
  };
}

// ============================================================================
// Service
// ============================================================================

async function getBankrollState(userId: string): Promise<BankrollState> {
  // ADR-035 RF-4: GET /api/bankroll vira wrapper sobre getConsolidatedBalance.
  // Em multi-wallet, amount = soma USD de todas wallets active. Mantem shape v1
  // para Tournament Selector, Coach AI e BankrollWidget legado.
  const settings = await storage.getUserSettings(userId);
  const snapshots = await storage.getBankrollSnapshots(userId);

  let consolidated: { totalUSD: string; walletCount: number; aggregationMode: string } | null = null;
  try {
    const mod = await import("./walletService");
    consolidated = await mod.walletService.getConsolidatedBalance(userId);
  } catch {
    consolidated = null;
  }

  const totalUSD = consolidated ? parseDecimal(consolidated.totalUSD) : null;
  const walletCount = consolidated?.walletCount ?? 0;

  // Quando ha wallets, amount = consolidated; quando nao ha (pre-migration), fallback v1.
  const settingsForState =
    walletCount > 0 && totalUSD !== null
      ? { ...(settings ?? {}), bankrollAmount: String(totalUSD) }
      : settings;

  const state = buildStateFromSettings(settingsForState as any, snapshots.length);
  (state as any).walletCount = walletCount;
  (state as any).aggregationMode =
    consolidated?.aggregationMode ??
    (settings as any)?.bankrollAggregationMode ??
    "global";
  return state;
}

async function updateBankroll(
  userId: string,
  input: UpdateBankrollInput,
): Promise<BankrollState> {
  const targetRule = input.rule ?? "1pct";
  validateRuleOrThrow(targetRule);

  const cacheShouldInvalidate = await storage.transaction(async (tx: any) => {
    const current = await tx.getUserBankrollForUpdate(userId);
    const currentAmount = current?.bankrollAmount == null ? null : parseDecimal(current.bankrollAmount);
    const currentRule = current?.bankrollRule ?? "1pct";

    const amountChanged = input.amount !== undefined && input.amount !== currentAmount;
    const ruleChanged = input.rule !== undefined && input.rule !== currentRule;

    // Se apenas rule mudou, nao cria snapshot
    if (!amountChanged && ruleChanged) {
      await tx.updateUserBankroll({ userId, amount: currentAmount, rule: targetRule });
      return true;
    }

    if (amountChanged) {
      // reason obrigatorio se o usuario ja tinha banca configurada
      const wasConfigured = currentAmount != null;
      if (wasConfigured && !input.reason) {
        throw new Error("reason obrigatorio quando amount muda em usuario ja configurado");
      }
      const effectiveReason: BankrollReason = input.reason ?? "initial";
      const targetAmount = input.amount;
      const previousAmount = currentAmount ?? 0;
      // Quando "desconfigurar" (amount=null), persistimos newAmount=0 mas o settings recebe null
      const newAmountForSnapshot = targetAmount == null ? 0 : targetAmount;
      const delta = newAmountForSnapshot - previousAmount;

      if (delta !== 0) {
        await tx.updateUserBankroll({ userId, amount: targetAmount, rule: targetRule });
        await tx.insertBankrollSnapshot({
          userId,
          delta,
          previousAmount,
          newAmount: newAmountForSnapshot,
          reason: effectiveReason,
          note: input.note ?? null,
          source: "manual",
        });
      } else {
        // amount "mudou" mas e o mesmo valor numerico — trata como rule-only update
        await tx.updateUserBankroll({ userId, amount: currentAmount, rule: targetRule });
      }
      return true;
    }

    // Nada mudou
    return false;
  });

  if (cacheShouldInvalidate) {
    invalidateBankrollCaches(userId);
  }

  return getBankrollState(userId);
}

async function recordSnapshot(
  userId: string,
  input: RecordSnapshotInput,
): Promise<{ snapshot: any; bankroll: BankrollState; warning?: string }> {
  // Validacoes sincronas (antes da transacao)
  if (typeof input.delta !== "number" || Number.isNaN(input.delta) || input.delta === 0) {
    throw new Error("delta deve ser diferente de zero");
  }
  if (input.reason === "initial") {
    throw new Error("reason=initial so e permitido em updateBankroll (primeira configuracao)");
  }
  const validReasons: BankrollReason[] = ["deposit", "withdrawal", "session_result", "manual_adjustment"];
  if (!validReasons.includes(input.reason)) {
    throw new Error("reason invalido");
  }
  if (input.occurredAt) {
    const d = toDateOrNull(input.occurredAt);
    if (!d || d.getTime() > Date.now()) {
      throw new Error("occurredAt nao pode ser no futuro");
    }
  }

  // Bankroll-Launch-Fix P0 #2: rejeitar gravacao em user_settings.bankroll_amount
  // (v1 escalar) quando ha wallets active. Em multi-wallet, transacoes precisam
  // ir via POST /api/wallets/:id/transactions (atualiza ledger consistente +
  // mirror snapshot consolidado). Caller deve usar endpoints de wallet em vez
  // de POST /api/bankroll/snapshot.
  let walletCountSafe = 0;
  try {
    walletCountSafe = await storage.countActiveWalletsByUser(userId);
  } catch (err) {
    console.warn(
      "[bankrollService.recordSnapshot] countActiveWalletsByUser falhou; assume 0:",
      (err as any)?.message,
    );
  }
  if (walletCountSafe > 0) {
    const e: any = new Error(
      "Use endpoints de wallet (POST /api/wallets/:id/transactions) para registrar transacoes em multi-wallet",
    );
    e.statusCode = 409;
    e.code = "multi_wallet_active";
    throw e;
  }

  const { snapshot, newAmount, previousAmount } = await storage.transaction(async (tx: any) => {
    const current = await tx.getUserBankrollForUpdate(userId);
    if (!current || current.bankrollAmount == null) {
      const err: any = new Error("Configure a banca antes de registrar movimentos");
      err.statusCode = 409;
      throw err;
    }

    const prev = parseDecimal(current.bankrollAmount);
    const next = prev + input.delta;

    await tx.updateUserBankroll({
      userId,
      amount: next,
      rule: current.bankrollRule ?? "1pct",
    });

    const snap = await tx.insertBankrollSnapshot({
      userId,
      delta: input.delta,
      previousAmount: prev,
      newAmount: next,
      reason: input.reason,
      note: input.note ?? null,
      source: "manual",
      occurredAt: input.occurredAt ? toDateOrNull(input.occurredAt) ?? undefined : undefined,
    });

    return { snapshot: snap, newAmount: next, previousAmount: prev };
  });

  invalidateBankrollCaches(userId);

  const state = await getBankrollState(userId);
  const warning = newAmount < 0 ? "bankroll_negative" : undefined;

  return warning ? { snapshot, bankroll: state, warning } : { snapshot, bankroll: state };
}

async function getBankrollHistory(
  userId: string,
  filters: BankrollHistoryFilters,
): Promise<BankrollHistoryResponse> {
  // Validacoes
  if (filters.from && filters.to) {
    if (new Date(filters.from).getTime() > new Date(filters.to).getTime()) {
      const err: any = new Error("from nao pode ser maior que to (invalid range)");
      err.statusCode = 400;
      throw err;
    }
  }
  if (filters.granularity && !["day", "week", "month"].includes(filters.granularity)) {
    const err: any = new Error("granularity invalida (use day, week ou month)");
    err.statusCode = 400;
    throw err;
  }

  const limitClamped = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const granularity = filters.granularity ?? "day";

  const reasonArray = filters.reason
    ? filters.reason.split(",").map((r) => r.trim()).filter(Boolean)
    : undefined;

  // Cache lookup (Q-Arch-4 — MED-1 reviewer fix)
  // Key: (userId, from, to, granularity, reason, limit, offset). TTL 5min.
  const cacheKey = JSON.stringify({
    from: filters.from ?? null,
    to: filters.to ?? null,
    granularity,
    reason: reasonArray ?? null,
    limit: limitClamped,
    offset,
  });
  const cached = bankrollCache.get<BankrollHistoryResponse>(userId, cacheKey);
  if (cached) {
    return cached;
  }

  const storageFilters: any = {
    from: filters.from,
    to: filters.to,
    reason: reasonArray,
    limit: limitClamped,
    offset,
  };

  const snapshots = await storage.getBankrollSnapshots(userId, storageFilters);
  const settings = await storage.getUserSettings(userId);
  const currentAmount = settings?.bankrollAmount == null ? 0 : parseDecimal(settings.bankrollAmount);

  if (snapshots.length === 0 && (settings?.bankrollAmount == null)) {
    const empty: BankrollHistoryResponse = {
      snapshots: [],
      series: [],
      summary: {
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalSessionPnL: 0,
        totalManualAdjustments: 0,
        netChange: 0,
        startBalance: 0,
        endBalance: 0,
      },
      pagination: { total: 0, limit: limitClamped, offset },
    };
    bankrollCache.set(userId, cacheKey, empty);
    return empty;
  }

  // Summary por reason
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalSessionPnL = 0;
  let totalManualAdjustments = 0;
  for (const s of snapshots) {
    const d = parseDecimal((s as any).delta);
    switch ((s as any).reason) {
      case "deposit":
        totalDeposits += d;
        break;
      case "withdrawal":
        totalWithdrawals += Math.abs(d);
        break;
      case "session_result":
        totalSessionPnL += d;
        break;
      case "manual_adjustment":
        totalManualAdjustments += d;
        break;
    }
  }

  // ordenacao ASC para series (o storage devolve DESC)
  const asc = [...snapshots].sort((a: any, b: any) => {
    const da = new Date(a.occurredAt).getTime();
    const db2 = new Date(b.occurredAt).getTime();
    return da - db2;
  });

  const startBalance = asc.length > 0 ? parseDecimal((asc[0] as any).previousAmount) : currentAmount;
  const endBalance = asc.length > 0 ? parseDecimal((asc[asc.length - 1] as any).newAmount) : currentAmount;
  const netChange = asc.reduce((acc: number, s: any) => acc + parseDecimal(s.delta), 0);

  // Monta series com forward-fill
  const series = buildSeries(asc, filters.from, filters.to, granularity, startBalance);

  const response: BankrollHistoryResponse = {
    snapshots,
    series,
    summary: {
      totalDeposits,
      totalWithdrawals,
      totalSessionPnL,
      totalManualAdjustments,
      netChange,
      startBalance,
      endBalance,
    },
    pagination: { total: snapshots.length, limit: limitClamped, offset },
  };
  bankrollCache.set(userId, cacheKey, response);
  return response;
}

function bucketKey(d: Date, granularity: "day" | "week" | "month"): string {
  if (granularity === "day") return isoDateYMD(d);
  if (granularity === "week") return isoDateYMD(startOfWeekISO(d));
  return isoDateYMD(startOfMonth(d));
}

function buildSeries(
  snapshots: any[],
  fromStr: string | undefined,
  toStr: string | undefined,
  granularity: "day" | "week" | "month",
  startBalance: number,
): Array<{ bucket: string; balance: number; movements: number; delta: number }> {
  if (!fromStr || !toStr) {
    // sem range definido — gera 1 bucket por snapshot
    const buckets = new Map<string, { balance: number; movements: number; delta: number }>();
    let running = startBalance;
    for (const s of snapshots) {
      const d = new Date(s.occurredAt);
      const k = bucketKey(d, granularity);
      running = parseDecimal(s.newAmount);
      const existing = buckets.get(k);
      const deltaVal = parseDecimal(s.delta);
      if (existing) {
        existing.balance = running;
        existing.movements += 1;
        existing.delta += deltaVal;
      } else {
        buckets.set(k, { balance: running, movements: 1, delta: deltaVal });
      }
    }
    return Array.from(buckets.entries())
      .map(([bucket, data]) => ({ bucket, ...data }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  const from = new Date(fromStr + "T00:00:00Z");
  const to = new Date(toStr + "T23:59:59Z");
  const out: Array<{ bucket: string; balance: number; movements: number; delta: number }> = [];

  // index snapshots por bucket
  const byBucket = new Map<string, { movements: number; delta: number; lastNew: number }>();
  for (const s of snapshots) {
    const d = new Date(s.occurredAt);
    const k = bucketKey(d, granularity);
    const prev = byBucket.get(k);
    const deltaVal = parseDecimal(s.delta);
    const newVal = parseDecimal(s.newAmount);
    if (prev) {
      prev.movements += 1;
      prev.delta += deltaVal;
      prev.lastNew = newVal;
    } else {
      byBucket.set(k, { movements: 1, delta: deltaVal, lastNew: newVal });
    }
  }

  let running = startBalance;
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    const key = bucketKey(cursor, granularity);
    const data = byBucket.get(key);
    if (data) {
      running = data.lastNew;
      out.push({ bucket: key, balance: running, movements: data.movements, delta: data.delta });
    } else {
      out.push({ bucket: key, balance: running, movements: 0, delta: 0 });
    }

    if (granularity === "day") {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else if (granularity === "week") {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  // dedup se a chave ja existe (granularity=week pode repetir bucket)
  const dedup = new Map<string, typeof out[number]>();
  for (const row of out) {
    dedup.set(row.bucket, row);
  }
  return Array.from(dedup.values());
}

// =============================================================================
// Sprint Bankroll-3 — RF-2: Auto-snapshot pos-cooldown
// =============================================================================

interface CreateAutoSnapshotInput {
  userId: string;
  /** Sprint Bankroll-3 RF-2: cooldownLogId quando origin='auto-cooldown' */
  cooldownLogId?: string;
  occurredAt?: Date | string;
  /**
   * Sprint Bankroll-Reports-Detail (RF-03): permite outras origens (ex:
   * 'manual-report' disparado por wallet_transactions.reason='manual_report').
   * Quando ausente, defaults para 'auto-cooldown' (back-compat).
   */
  origin?: "auto-cooldown" | "manual-report" | "manual" | "transfer" | "import";
  /**
   * Sprint Bankroll-Reports-Detail (RF-03): sourceRefId customizado (ex:
   * wallet_transactions.id para manual-report). Quando ausente, usa
   * cooldownLogId.
   */
  sourceRefId?: string | null;
}

/**
 * Cria snapshot consolidado pos-cooldown OU pos-manual-report (Sprint
 * Bankroll-Reports-Detail RF-03).
 * - origin: 'auto-cooldown' (default) | 'manual-report' (novo).
 * - source='auto_session' (mantem semantica enum existente).
 * - sourceRefId=cooldownLogId | tx.id (idempotencia via unique parcial em RF-8).
 * - delta = newAmount - previousAmount (USD consolidado vs ultimo snapshot).
 *
 * Falhas (DB, unique violation, etc) NAO propagam — retorna null + log.
 * Skip silencioso quando bankrollManagementEnabled=false.
 */
async function createAutoSnapshot(
  input: CreateAutoSnapshotInput,
): Promise<any | null> {
  const { userId, cooldownLogId, occurredAt } = input ?? ({} as CreateAutoSnapshotInput);
  const origin = input?.origin ?? "auto-cooldown";
  const sourceRefId = input?.sourceRefId ?? cooldownLogId ?? null;

  // Validacao de entrada — sem DB calls.
  // sourceRefId obrigatorio para qualquer origem (idempotencia + audit).
  if (!userId || !sourceRefId) {
    return null;
  }

  // HIGH-5 fix (round 2): fail closed em erro de getUserSettings.
  let settings: any = null;
  try {
    settings = await storage.getUserSettings(userId);
  } catch (err) {
    console.warn(
      "[bankrollService.createAutoSnapshot] getUserSettings falhou (fail closed):",
      (err as any)?.message,
    );
    return null;
  }
  // bankrollManagementEnabled default true (skip apenas quando explicitamente false).
  if (settings && settings.bankrollManagementEnabled === false) {
    return null;
  }

  // Sprint FX-1 RF-09: rates do dia do snapshot (NAO momento da gravacao).
  // Cascata: user override > system_fx_rates(date) > FALLBACK_FX_RATES.
  // wallets.exchangeRates NAO entra no merge para snapshots novos (ADR-034).
  const snapshotOccurredAt = occurredAt
    ? occurredAt instanceof Date ? occurredAt : new Date(occurredAt)
    : new Date();
  const snapshotDate = snapshotOccurredAt.toISOString().slice(0, 10);

  let systemRatesForDate: Record<string, number> = {};
  try {
    const fxMod = await import("./fx/fxRatesPersistence");
    const sysMap = await fxMod.getRatesForDate(snapshotDate);
    for (const [ccy, sr] of Object.entries(sysMap)) {
      if (sr && typeof sr.ratePerUsd === "number" && sr.ratePerUsd > 0) {
        systemRatesForDate[ccy] = sr.ratePerUsd;
      }
    }
  } catch (err) {
    console.warn(
      "[bankrollService.createAutoSnapshot] getRatesForDate falhou:",
      (err as any)?.message,
    );
  }

  if (Object.keys(systemRatesForDate).length === 0) {
    console.warn(
      "[bankrollService.createAutoSnapshot] system rates vazios — usando FALLBACK_FX_RATES",
      { userId, date: snapshotDate },
    );
  }

  const userOverride = sanitizeRatesObject((settings as any)?.exchangeRates);

  // Sprint FX-1 RF-09: helper merge — user > system > FALLBACK. Sem wallets.
  const fxModule = await import("./fxResolver");
  const ratesForSnapshot: Record<string, number> = {
    ...fxModule.FALLBACK_FX_RATES,
    ...systemRatesForDate,
    ...userOverride,
    USD: 1,
  };

  // Consolidated balance via walletService (import dinamico para evitar ciclo).
  let totalUSD = 0;
  try {
    const mod = await import("./walletService");
    const consolidated = await mod.walletService.getConsolidatedBalance(
      userId,
      { rates: ratesForSnapshot, date: snapshotDate },
    );
    totalUSD = parseDecimal(consolidated?.totalUSD ?? "0");
  } catch (err) {
    console.error("[bankrollService.createAutoSnapshot] getConsolidatedBalance falhou:", (err as any)?.message);
    return null;
  }

  // Previous amount = newAmount do ultimo snapshot. 0 se nao existe.
  let previousAmount = 0;
  try {
    const snapshots = await storage.getBankrollSnapshots(userId, { limit: 1 } as any);
    if (Array.isArray(snapshots) && snapshots.length > 0) {
      previousAmount = parseDecimal((snapshots[0] as any).newAmount);
    }
  } catch (err) {
    console.warn("[bankrollService.createAutoSnapshot] getBankrollSnapshots falhou:", (err as any)?.message);
    // Continue com previousAmount=0
  }

  const delta = totalUSD - previousAmount;
  const occurred = occurredAt
    ? occurredAt instanceof Date ? occurredAt : new Date(occurredAt)
    : new Date();

  const noteByOrigin =
    origin === "manual-report"
      ? `Snapshot pos-manual-report ${sourceRefId}`
      : `Auto-snapshot pos-cooldown ${sourceRefId}`;

  // Bankroll-Launch-Fix P1 #4: dedup por dia+origin. Antes do INSERT, verifica
  // se ja existe snapshot do mesmo userId+origin no mesmo dia (UTC) do
  // occurredAt. Se sim, retorna o existente sem gravar duplicata. Evita
  // multiplos snapshots auto-cooldown/manual-report no mesmo dia inflando
  // o ledger e enganando series temporais.
  try {
    const dayStart = new Date(Date.UTC(
      occurred.getUTCFullYear(),
      occurred.getUTCMonth(),
      occurred.getUTCDate(),
      0, 0, 0, 0,
    ));
    const dayEnd = new Date(Date.UTC(
      occurred.getUTCFullYear(),
      occurred.getUTCMonth(),
      occurred.getUTCDate(),
      23, 59, 59, 999,
    ));
    const sameDay = await storage.getBankrollSnapshots(userId, {
      from: dayStart,
      to: dayEnd,
      limit: 50,
    } as any);
    if (Array.isArray(sameDay) && sameDay.length > 0) {
      const existing = sameDay.find(
        (s: any) => s?.origin === origin,
      );
      if (existing) {
        console.warn(
          "[bankrollService.createAutoSnapshot] dedup: snapshot ja existe para userId+origin+dia",
          { userId, origin, date: dayStart.toISOString().slice(0, 10), existingId: (existing as any).id },
        );
        return existing;
      }
    }
  } catch (err) {
    // Falha na dedup nao bloqueia: prossegue para INSERT (unique index pega
    // duplicatas idempotentes via sourceRefId).
    console.warn(
      "[bankrollService.createAutoSnapshot] dedup check falhou; prosseguindo com INSERT:",
      (err as any)?.message,
    );
  }

  try {
    const snapshot = await storage.insertBankrollSnapshot({
      userId,
      delta: String(delta),
      previousAmount: String(previousAmount),
      newAmount: String(totalUSD),
      reason: "manual_adjustment",
      note: noteByOrigin,
      source: "auto_session",
      origin,
      sourceRefId,
      occurredAt: occurred,
    } as any);

    // Invalidate caches
    try { bankrollCache.invalidateAllForUser(userId); } catch {}
    try { selectorCache.invalidateAllForUser(userId); } catch {}

    return snapshot;
  } catch (err: any) {
    if (err?.code === "23505") {
      console.warn("[bankrollService.createAutoSnapshot] duplicate (idempotency):", sourceRefId);
    } else {
      console.error("[bankrollService.createAutoSnapshot] insertBankrollSnapshot falhou:", err?.message);
    }
    return null;
  }
}

export const bankrollService = {
  getBankrollState,
  updateBankroll,
  recordSnapshot,
  getBankrollHistory,
  createAutoSnapshot,
};
