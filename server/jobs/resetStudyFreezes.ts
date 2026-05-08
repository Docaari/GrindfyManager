/**
 * Sprint Estudos-Habito-1 (RF-2.3 / ADR-128 §2.3) — cron resetStudyFreezesMonthly.
 *
 * Schedule: '5 0 * * *' UTC = todo dia 00:05 UTC.
 *
 * Comportamento idempotent: UPDATE com WHERE last_freeze_reset_month != current_month
 * — virou no-op em runs repetidos no mesmo mes.
 *
 * Falha do cron eh recuperavel via lazy reset em bumpStudyStreak (defesa em
 * profundidade). Esse handler captura erros + loga sem rethrow.
 */

import cron from "node-cron";
import { db } from "../db";
import { users } from "@shared/schema";
import { sql, or, isNull, ne } from "drizzle-orm";

const CRON_EXPR = "5 0 * * *";

function formatYearMonthUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function runResetStudyFreezesMonthly(): Promise<void> {
  const currentMonth = formatYearMonthUTC(new Date());
  try {
    await db
      .update(users)
      .set({
        studyStreakFreezesUsedThisMonth: 0,
        lastFreezeResetMonth: currentMonth,
      })
      .where(or(
        isNull(users.lastFreezeResetMonth),
        ne(users.lastFreezeResetMonth, currentMonth),
      ));
    console.info(
      "[cron/resetStudyFreezes]",
      JSON.stringify({ status: "ok", month: currentMonth }),
    );
  } catch (err: any) {
    console.error(
      "[cron/resetStudyFreezes]",
      JSON.stringify({
        status: "failed",
        month: currentMonth,
        error: err?.message ?? String(err),
      }),
    );
    // Nao re-throw — cron handler deve ser robusto. Defesa em profundidade
    // via lazy reset em bumpStudyStreak.
  }
}

export async function registerStudyFreezesCron(): Promise<void> {
  cron.schedule(
    CRON_EXPR,
    () => {
      runResetStudyFreezesMonthly().catch((err) => {
        console.error("[cron/resetStudyFreezes] erro top-level", err);
      });
    },
    { timezone: "UTC" },
  );
  console.info("[cron/resetStudyFreezes] registrado", { expr: CRON_EXPR, tz: "UTC" });
}
