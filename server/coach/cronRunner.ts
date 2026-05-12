// =============================================================================
// Coach Cron Runner — Sprint Coach-2B (ADR-087) + Sprint AI-1A / RF-04 (ADR-152)
//   + Sprint AI-1B (ADR-156/157): `0 6 * * 1` (generateCoachRecommendations)
//   APOSENTADO — absorvido pelo Weekly Report. Adicionados gap-check (B-GAPCHECK)
//   e B-IMPORT como ticks horarios filtrando hora local.
//
// node-cron in-process. Ativacao via NODE_ENV=production OU
// COACH_CRON_ENABLED=true.
//
// Schedules:
//   - * * * * *      cleanup pending coach_actions > 30min (ADR-077) — SEMPRE
//   - 0 * 28 * *     B-SNAPSHOT (filtra local hour=9)            ┐ proatividade —
//   - 0 * * * *      B-STUDY (filtra local hour=19, foco ativo)  ┤ NAO registrados
//   - 0 * * * *      B-GAPCHECK (sexta D-3, hora util)           ┤ se COACH_NUDGES_ENABLED=false
//   - 0 * * * *      B-IMPORT (cobranca de import, hora util)    ┘
// =============================================================================

import nodeCron from "node-cron";
import { storage } from "../storage";
import { processBSnapshotTick } from "./jobs/processBSnapshot";
import { processBStudyTick } from "./jobs/processBStudy";
// Sprint AI-1B: a logica de generateCoachRecommendations continua exportada
// (reaproveitada pelo gerador do Weekly Report) — mas o agendamento `0 6 * * 1`
// foi removido (ADR-156).
import { gapCheckTick } from "./jobs/gapCheck";
import { bImportTick } from "./jobs/bImport";
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

  // Sprint AI-1B (ADR-157) — gap-check D-3 (B-GAPCHECK) + B-IMPORT. Ticks
  // horarios filtrando hora local. Antes deste sprint este slot era o
  // `0 6 * * 1` do generateCoachRecommendations (aposentado, ADR-156).
  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-gap-check", () => gapCheckTick({}));
    } catch (err) {
      console.error("coach.cron.gap_check.tick.error", { err });
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-import", () => bImportTick({}));
    } catch (err) {
      console.error("coach.cron.b_import.tick.error", { err });
    }
  });

  started = true;
  console.info("coach.cron.started");
}
