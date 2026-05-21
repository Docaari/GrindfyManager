/**
 * Sprint Estudos-Coach-Biblio-2 — RF-3.3 cron generateWeeklyStudyPlan.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.3
 * ADRs : 134 (service orquestrador), 107 (cron pattern News-3)
 *
 * Schedule: '0 9 * * 1' UTC = segunda 9h UTC (06h BRT).
 *
 * Comportamento:
 *   - Loop por users elegiveis (storage.listUsersForWeeklyStudyPlanCron)
 *   - SKIP se !isActive
 *   - SKIP se !hasCoachAccess
 *   - SKIP se !hasCoachQuotaRemaining
 *   - SKIP se ja existe plano para a semana (UNIQUE pre-check)
 *   - Try gerar plano per-user; catch error per-user (lesson #9)
 *   - Pacing 200ms entre iteracoes (Anthropic rate limit)
 */

import cron from "node-cron";
import { storage } from "../storage";
import { withAdvisoryLock } from "../lib/advisoryLock";
import { sleep } from "../utils/sleep";
import {
  generateWeeklyStudyPlan,
  hasCoachAccess,
  hasCoachQuotaRemaining,
} from "../services/studyWeeklyPlanService";

const CRON_EXPR = "0 9 * * 1"; // segunda 9h UTC
const PACING_MS = 200;

function utcMondayOfWeek(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dow = d.getUTCDay();
  const delta = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - delta);
  return d;
}

export async function runWeeklyStudyPlan(): Promise<void> {
  const weekStartDate = utcMondayOfWeek(new Date());
  const eligible =
    (await (storage as any).listUsersForWeeklyStudyPlanCron()) ?? [];
  const total = (eligible as any[]).length;
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  for (const u of eligible as any[]) {
    const userId = u?.userPlatformId;
    if (!userId) {
      skipped += 1;
      continue;
    }
    if (u?.isActive === false) {
      skipped += 1;
      continue;
    }
    try {
      // SKIP se ja existe plano (idempotency cron + manual via UPSERT).
      const existing = await (storage as any).getStudyWeeklyPlan(
        userId,
        weekStartDate,
      );
      if (existing) {
        skipped += 1;
        continue;
      }
      if (!(await hasCoachAccess(userId))) {
        skipped += 1;
        continue;
      }
      if (!(await hasCoachQuotaRemaining(userId))) {
        skipped += 1;
        continue;
      }
      await generateWeeklyStudyPlan({
        userId,
        source: "coach_auto",
        weekStartDate,
      });
      generated += 1;
    } catch (err: any) {
      // Lesson #9: log antes de fallback. Per-user error tolerance — nao
      // bloqueia outros users.
      console.error(
        "[cron/weeklyStudyPlan] per-user error",
        JSON.stringify({
          userId,
          error: err?.message ?? String(err),
        }),
      );
      failed += 1;
    }
    if (PACING_MS > 0) {
      await sleep(PACING_MS);
    }
  }
  console.info(
    "[cron/weeklyStudyPlan]",
    JSON.stringify({
      status: "complete",
      total,
      generated,
      skipped,
      failed,
      weekStart: weekStartDate.toISOString().slice(0, 10),
    }),
  );
}

export async function registerWeeklyStudyPlanCron(): Promise<void> {
  cron.schedule(CRON_EXPR, () => {
    // Wave D (ADR-144): advisory lock — Anthropic cost N× sem guard. UPSERT
    // dedupe mas chamada Claude ja queimou tokens.
    withAdvisoryLock("cron:weekly-study-plan", runWeeklyStudyPlan).catch((err) => {
      console.error("[cron/weeklyStudyPlan] erro top-level", err);
    });
  });
  console.info("[cron/weeklyStudyPlan] registrado", {
    expr: CRON_EXPR,
    tz: "UTC",
  });
}
