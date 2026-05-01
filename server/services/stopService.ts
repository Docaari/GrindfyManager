/**
 * stopService — Sprint Bankroll-3 RF-6
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-6, D3)
 * ADR-060: Stop-loss/stop-win semantica e timezone.
 *
 * API:
 *   stopService.assertNotStopLocked(userId): throws { code:'STOP_LOCKED', ... } se locked
 *   stopService.evaluateStops(userId, sessionId): { stopReached, lockedUntil? }
 *   stopService.getCurrentDayDeltaUsd(userId): number
 *   stopService.releaseLock(userId): void
 *
 * Convencao USD via fxResolver. Reset diario 00:00 user TZ (fallback UTC).
 * Stop-loss bloqueia. Stop-win NAO bloqueia (telemetria apenas, banner client).
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

interface StopLockedError extends Error {
  code: "STOP_LOCKED";
  httpStatus: 423;
  lockedUntil: string;
  remainingMs: number;
  body: { code: "STOP_LOCKED"; lockedUntil: string; remainingMs: number; reason: string };
}

function makeStopLockedError(lockedUntil: Date): StopLockedError {
  const lockedUntilIso = lockedUntil.toISOString();
  const remainingMs = Math.max(0, lockedUntil.getTime() - Date.now());
  const err = new Error(`STOP_LOCKED until ${lockedUntilIso}`) as StopLockedError;
  err.code = "STOP_LOCKED";
  err.httpStatus = 423;
  err.lockedUntil = lockedUntilIso;
  err.remainingMs = remainingMs;
  err.body = {
    code: "STOP_LOCKED",
    lockedUntil: lockedUntilIso,
    remainingMs,
    reason: "stop_loss",
  };
  return err;
}

function parseDecimal(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcula o inicio do dia atual no TZ do usuario.
 * TZ invalida ou nao informada -> UTC.
 */
function getStartOfUserDay(timezone?: string | null): Date {
  if (timezone) {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour12: false,
      });
      const parts: Record<string, string> = {};
      for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
      // Construct date in UTC matching local Y/M/D 00:00.
      const d = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    } catch {
      // fallback to UTC midnight below
    }
  }
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function assertNotStopLocked(userId: string): Promise<void> {
  if (!userId) return;
  const settings: any = await storage.getUserSettings(userId).catch(() => null);
  if (!settings) return;
  if (settings.bankrollManagementEnabled === false) return;
  const lockUntil = settings.stopLockUntil ? new Date(settings.stopLockUntil) : null;
  if (!lockUntil || Number.isNaN(lockUntil.getTime())) return;
  if (lockUntil.getTime() > Date.now()) {
    throw makeStopLockedError(lockUntil);
  }
}

interface EvaluateStopsResult {
  stopReached: "loss" | "win" | null;
  lockedUntil?: string;
}

async function evaluateStops(
  userId: string,
  sessionId: string,
): Promise<EvaluateStopsResult> {
  if (!userId) return { stopReached: null };
  const settings: any = await storage.getUserSettings(userId).catch(() => null);
  if (!settings || settings.bankrollManagementEnabled === false) {
    return { stopReached: null };
  }
  const stopLossUsd = settings.stopLossUsd != null ? parseDecimal(settings.stopLossUsd) : null;
  const stopWinUsd = settings.stopWinUsd != null ? parseDecimal(settings.stopWinUsd) : null;
  if (stopLossUsd == null && stopWinUsd == null) {
    return { stopReached: null };
  }
  const lockHours = Number(settings.stopLockDurationHours ?? 12);

  // Calcular delta USD do dia.
  const deltaUsd = await getCurrentDayDeltaUsd(userId);

  // stop-loss: delta <= -stopLoss
  if (stopLossUsd != null && deltaUsd <= -Math.abs(stopLossUsd)) {
    const lockedUntil = new Date(Date.now() + lockHours * 3600 * 1000);
    try {
      await storage.upsertUserSettings({
        userId,
        stopLockUntil: lockedUntil,
      } as any);
    } catch (err) {
      console.error("[stopService.evaluateStops] upsertUserSettings failed:", (err as any)?.message);
    }
    return { stopReached: "loss", lockedUntil: lockedUntil.toISOString() };
  }

  // stop-win: delta >= stopWin (telemetria apenas, NAO bloqueia)
  if (stopWinUsd != null && deltaUsd >= stopWinUsd) {
    return { stopReached: "win" };
  }

  return { stopReached: null };
}

async function safeCall<T>(fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    const result = await fn();
    return result ?? fallback;
  } catch {
    return fallback;
  }
}

async function getCurrentDayDeltaUsd(userId: string): Promise<number> {
  if (!userId) return 0;

  const storageAny = storage as any;
  const user = await safeCall<any>(() => storageAny.getUserById?.(userId), null);
  const startOfDay = getStartOfUserDay(user?.timezone ?? "UTC");

  const sessions: any[] = await safeCall(
    () => storageAny.listGrindSessionsByUser?.(userId),
    [] as any[],
  );

  const completedSessionIds = sessions
    .filter((s) => s.status === "completed")
    .filter((s) => {
      const ts = s.completedAt ? new Date(s.completedAt) : null;
      return !!ts && !Number.isNaN(ts.getTime()) && ts.getTime() >= startOfDay.getTime();
    })
    .map((s) => s.id);

  if (completedSessionIds.length === 0) return 0;

  const tournaments: any[] = await safeCall(
    () => storageAny.listSessionTournamentsBySessions?.(userId, completedSessionIds),
    [] as any[],
  );

  const fx = await safeCall(
    () => fxResolver.resolveExchangeRates(userId),
    { rates: { USD: 1 } } as any,
  );
  const rates: Record<string, number> = fx?.rates ?? {};

  let deltaUsd = 0;
  for (const t of tournaments) {
    const invested = parseDecimal(t.totalInvested ?? t.buyIn ?? 0);
    const payouts =
      parseDecimal(t.payouts ?? 0)
      + parseDecimal(t.prize ?? 0)
      + parseDecimal(t.bounty ?? 0);
    const native = payouts - invested;
    const ccy = getCurrencyForSite(t.site ?? "USD").code;
    const rate = rates[ccy] ?? 1;
    deltaUsd += rate > 0 ? native / rate : native;
  }

  return deltaUsd;
}

async function releaseLock(userId: string): Promise<void> {
  if (!userId) return;
  await storage.upsertUserSettings({
    userId,
    stopLockUntil: null,
  } as any);
}

export const stopService = {
  assertNotStopLocked,
  evaluateStops,
  getCurrentDayDeltaUsd,
  releaseLock,
};
