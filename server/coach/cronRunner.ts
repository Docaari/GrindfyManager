// =============================================================================
// Coach Cron Runner — Sprint Coach-2B (ADR-087) + Sprint AI-1A / RF-04 (ADR-152)
//
// node-cron in-process. Ativacao via NODE_ENV=production OU
// COACH_CRON_ENABLED=true.
//
// Schedules:
//   - * * * * *      cleanup pending coach_actions > 30min (ADR-077) — SEMPRE
//   - 0 * 28 * *     B-SNAPSHOT (filtra local hour=9)            ┐ proatividade —
//   - 0 * * * *      B-STUDY (filtra local hour=19, foco ativo)  ┤ NAO registrados
//   - 0 6 * * 1      generateCoachRecommendations (segunda 6h)   ┘ se COACH_NUDGES_ENABLED=false
// =============================================================================

import nodeCron from "node-cron";
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
  const cron: any = (nodeCron as any) ?? (nodeCron as any)?.default;
  if (!cron || typeof cron.schedule !== "function") {
    console.info("coach.cron.disabled", { reason: "node-cron not available" });
    return;
  }

  // Wave D (ADR-144): cada tick envolvido em withAdvisoryLock. Cleanup pending
  // (1min) eh especialmente sensivel — 60×N replicas/dia = waste massivo.
  // Cleanup NAO eh proatividade -> sempre registrado, independente do kill switch.
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

  // Sprint AI-1A / RF-04 — kill switch global. COACH_NUDGES_ENABLED=false NAO
  // registra os schedules de proatividade (B-SNAPSHOT, B-STUDY,
  // generateCoachRecommendations). O cleanup acima continua.
  if (process.env.COACH_NUDGES_ENABLED === "false") {
    started = true;
    console.info("coach.cron.nudges_disabled");
    return;
  }

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
