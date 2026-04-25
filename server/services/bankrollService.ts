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
  maxBuyInDisplay: { USD: number | null; BRL?: number };
  // MED-3 fix (UX-2 2026-04-25): novos campos para evitar derivacao fragil
  // da taxa BRL no client (BankrollWidget).
  amountDisplay: { USD: number | null; BRL?: number };
  exchangeRateBRL: number | null;
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

function validateRuleOrThrow(rule: string): number {
  const parsed = parseRule(rule);
  if (!parsed.valid) {
    // Mensagem incluindo range (spec criterio)
    throw new Error(`Rule invalida: use "1pct", "2pct", "5pct" ou custom:<N> com N entre 0.1 e 20 (uma casa decimal).`);
  }
  return parsed.pct;
}

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
  // `maxBuyInBRL/maxBuyInUSD` — fragil (NaN se shape mudasse, divisao por
  // valor pequeno introduzia erro). Agora server eh fonte unica.
  const exchangeRateBRL = exchangeRates.BRL ?? null;

  const display: { USD: number | null; BRL?: number } = {
    USD: thresholds.hardLimitUSD,
  };
  if (thresholds.hardLimitUSD != null && exchangeRateBRL != null) {
    display.BRL = thresholds.hardLimitUSD * exchangeRateBRL;
  }

  const amountDisplay: { USD: number | null; BRL?: number } = {
    USD: amount,
  };
  if (amount != null && exchangeRateBRL != null) {
    amountDisplay.BRL = amount * exchangeRateBRL;
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
  const settings = await storage.getUserSettings(userId);
  const snapshots = await storage.getBankrollSnapshots(userId);
  return buildStateFromSettings(settings, snapshots.length);
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
    try {
      selectorCache.invalidateAllForUser(userId);
    } catch (err) {
      console.error("bankrollService: selectorCache.invalidateAllForUser failed for user", userId, err);
    }
    try {
      bankrollCache.invalidateAllForUser(userId);
    } catch (err) {
      console.error("bankrollService: bankrollCache.invalidateAllForUser failed for user", userId, err);
    }
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

  try {
    selectorCache.invalidateAllForUser(userId);
  } catch (err) {
    console.error("bankrollService: selectorCache.invalidateAllForUser failed for user", userId, err);
  }
  try {
    bankrollCache.invalidateAllForUser(userId);
  } catch (err) {
    console.error("bankrollService: bankrollCache.invalidateAllForUser failed for user", userId, err);
  }

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

export const bankrollService = {
  getBankrollState,
  updateBankroll,
  recordSnapshot,
  getBankrollHistory,
};
