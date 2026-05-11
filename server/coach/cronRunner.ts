// =============================================================================
// Coach Cron Runner — Sprint Coach-2B (ADR-087)
//
// node-cron in-process. Ativacao via NODE_ENV=production OU
// COACH_CRON_ENABLED=true.
//
// Schedules:
//   - * * * * *      cleanup pending coach_actions > 30min (ADR-077)
//   - 0 * 28 * *     B-SNAPSHOT (filtra local hour=9)
//   - 0 * * * *      B-STUDY (filtra local hour=19, foco ativo)
// =============================================================================

import { storage } from "../storage";
import { processBSnapshotTick } from "./jobs/processBSnapshot";
import { processBStudyTick } from "./jobs/processBStudy";
import { generateCoachRecommendationsTick } from "./jobs/generateCoachRecommendations";
import { withAdvisoryLock } from "../lib/advisoryLock";

let started = false;

function isCronEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.COACH_CRON_ENABLED === "true"
  );
}

export function startCoachCrons(): void {
  if (started) return;
  if (!isCronEnabled()) {
    console.info("coach.cron.disabled", { reason: "env_off" });
    return;
  }
  let cron: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cron = require("node-cron");
  } catch {
    console.info("coach.cron.disabled", { reason: "node-cron not installed" });
    return;
  }

  // Wave D (ADR-144): cada tick envolvido em withAdvisoryLock. Cleanup pending
  // (1min) eh especialmente sensivel — 60×N replicas/dia = waste massivo.
  cron.schedule("* * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-cleanup", async () => {
        const expired = await (storage as any).markPendingExpired?.();
        if (typeof expired === "number" && expired > 0) {
          console.info("coach.cron.cleanup_pending", { expired });
        }
      });
    } catch (err) {
      console.error("coach.cron.cleanup.error", { err });
    }
  });

  cron.schedule("0 * 28 * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-snapshot", () => processBSnapshotTick({}));
    } catch (err) {
      console.error("coach.cron.b_snapshot.tick.error", { err });
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-study", () => processBStudyTick({}));
    } catch (err) {
      console.error("coach.cron.b_study.tick.error", { err });
    }
  });

  // Sprint home-reform-4 / Item 4 (ADR-112) — segunda 06:00 BRT
  cron.schedule(
    "0 6 * * 1",
    async () => {
      try {
        await withAdvisoryLock("cron:coach-weekly-rec", () =>
          generateCoachRecommendationsTick({}),
        );
      } catch (err) {
        console.error("coach.cron.weekly_rec.tick.error", { err });
      }
    },
    { timezone: "America/Sao_Paulo" },
  );

  started = true;
  console.info("coach.cron.started");
}
