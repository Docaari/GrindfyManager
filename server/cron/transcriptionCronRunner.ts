// =============================================================================
// Transcription Cron Runner — Sprint Mini Player 3.2 / W-A2 (ADR-199)
//
// Agenda o tick de ingest de transcription previews (0 4 * * * UTC).
//
// Gates:
//   - TRANSCRIPTION_INGEST_ENABLED=false -> NAO registra schedule (skip total)
//
// Wave D (ADR-144): tick envolvido em withAdvisoryLock pra evitar duplicacao
// em multi-replica.
//
// Lesson #37: `import` estatico de node-cron (NAO require) para compat com
// vi.doMock + Vitest 4 (rolldown/oxc) em testes downstream.
// =============================================================================

import nodeCron from "node-cron";
import {
  runTranscriptionCronTick,
  TRANSCRIPTION_CRON_SCHEDULE,
  TRANSCRIPTION_CRON_TZ,
} from "./transcriptionCron";

let started = false;

export function startTranscriptionCron(): void {
  if (started) return;
  if (process.env.TRANSCRIPTION_INGEST_ENABLED === "false") {
    console.info("transcription.cron.disabled", { reason: "env_off" });
    return;
  }
  const cron: any = (nodeCron as any) ?? (nodeCron as any)?.default;
  if (!cron || typeof cron.schedule !== "function") {
    console.info("transcription.cron.disabled", {
      reason: "node-cron not available",
    });
    return;
  }
  cron.schedule(
    TRANSCRIPTION_CRON_SCHEDULE,
    async () => {
      try {
        const { withAdvisoryLock } = await import("../lib/advisoryLock");
        await withAdvisoryLock("cron:transcription-ingest", () =>
          runTranscriptionCronTick(),
        );
      } catch (err) {
        console.error("transcription.cron.tick.error", { err });
      }
    },
    { timezone: TRANSCRIPTION_CRON_TZ },
  );
  started = true;
  console.info("transcription.cron.scheduled", {
    schedule: TRANSCRIPTION_CRON_SCHEDULE,
    tz: TRANSCRIPTION_CRON_TZ,
  });
}

/** @internal Test-only — reseta o flag started para isolar tests. */
export function _resetStartedForTests(): void {
  started = false;
}
