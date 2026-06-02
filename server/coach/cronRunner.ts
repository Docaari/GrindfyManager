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
// AI-2A nudges (ADR-167).
import { bDownswingTick } from "./jobs/bDownswing";
import { bVolumeTick } from "./jobs/bVolume";
import { bGradeTick } from "./jobs/bGrade";
// Coach AI UX Overhaul (Wave 3 / #7) — B-MENTAL + B-LIFE (opt-in, default off).
import { bMentalTick } from "./jobs/bMental";
import { bLifeTick } from "./jobs/bLife";
// Coach AI UX Overhaul (Wave 4 / #8) — B-FOLLOWUP (accountability de compromissos).
import { bFollowupTick } from "./jobs/bFollowup";
// EST-5 (ADR-226) — Interactive Monday Ritual (recap de segunda 9h local).
import { weeklyReviewMondayTick } from "./jobs/weeklyReviewMonday";
// Sprint D / RF-03.1 (ADR-184) — housekeeping, fora do gate COACH_NUDGES_ENABLED.
import { expireTicketsTick } from "../jobs/expireTickets";
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

  // Sprint D / RF-03.1 (ADR-184) — expire-tickets cron diario 03:00 UTC.
  // Housekeeping de dados (NAO proatividade) — fica FORA do gate
  // COACH_NUDGES_ENABLED. Mesmo com kill switch ON, este cron roda.
  cron.schedule("0 3 * * *", async () => {
    try {
      await withAdvisoryLock("cron:expire-tickets", () => expireTicketsTick({}));
    } catch (err) {
      console.error("coach.cron.expire_tickets.tick.error", { err });
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

  // Sprint AI-2A (ADR-167) — 3 nudges novos. Todos gateados pelo kill switch
  // global (acima). Hourly ticks que filtram dia/hora local internamente.
  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-downswing", () => bDownswingTick({}));
    } catch (err) {
      console.error("coach.cron.b_downswing.tick.error", { err });
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-volume", () => bVolumeTick({}));
    } catch (err) {
      console.error("coach.cron.b_volume.tick.error", { err });
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-grade", () => bGradeTick({}));
    } catch (err) {
      console.error("coach.cron.b_grade.tick.error", { err });
    }
  });

  // Coach AI UX Overhaul (Wave 3 / #7) — B-MENTAL (C-game recorrente, 20h local)
  // + B-LIFE (volume sem folga, 11h local). Opt-in: o toggle nasce false, entao
  // so disparam pra quem ativou. Gateados pelo kill switch global (acima).
  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-mental", () => bMentalTick({}));
    } catch (err) {
      console.error("coach.cron.b_mental.tick.error", { err });
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-life", () => bLifeTick({}));
    } catch (err) {
      console.error("coach.cron.b_life.tick.error", { err });
    }
  });

  // Coach AI UX Overhaul (#8) — cobranca de compromissos vencidos (accountability).
  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-b-followup", () => bFollowupTick({}));
    } catch (err) {
      console.error("coach.cron.b_followup.tick.error", { err });
    }
  });

  // EST-5 (ADR-226) — ritual de segunda. Hourly tick que filtra dia/hora local
  // (segunda 9h) internamente. Gateado pelo kill switch global (acima).
  cron.schedule("0 * * * *", async () => {
    try {
      await withAdvisoryLock("cron:coach-weekly-review", () =>
        weeklyReviewMondayTick({}),
      );
    } catch (err) {
      console.error("coach.cron.weekly_review.tick.error", { err });
    }
  });

  started = true;
  console.info("coach.cron.started");
}
