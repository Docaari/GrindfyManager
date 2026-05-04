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

  cron.schedule("* * * * *", async () => {
    try {
      const expired = await (storage as any).markPendingExpired?.();
      if (typeof expired === "number" && expired > 0) {
        console.info("coach.cron.cleanup_pending", { expired });
      }
    } catch (err) {
      console.error("coach.cron.cleanup.error", { err });
    }
  });

  cron.schedule("0 * 28 * *", async () => {
    try {
      await processBSnapshotTick({});
    } catch (err) {
      console.error("coach.cron.b_snapshot.tick.error", { err });
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await processBStudyTick({});
    } catch (err) {
      console.error("coach.cron.b_study.tick.error", { err });
    }
  });

  // Sprint home-reform-4 / Item 4 (ADR-112) — segunda 06:00 BRT
  cron.schedule(
    "0 6 * * 1",
    async () => {
      try {
        await generateCoachRecommendationsTick({});
      } catch (err) {
        console.error("coach.cron.weekly_rec.tick.error", { err });
      }
    },
    { timezone: "America/Sao_Paulo" },
  );

  started = true;
  console.info("coach.cron.started");
}
