/**
 * Jobs registry — agenda todos os crons in-process.
 *
 * Sprint F2 introduz o primeiro job (purgeSpotScreenshots). Outras sprints
 * adicionam jobs aqui no mesmo padrao.
 *
 * Sprint AI-1B (ADR-156): o cron weekly study plan (segunda 9h UTC) foi
 * APOSENTADO — a geracao do plano semanal de estudo eh agora absorvida pelo
 * gerador do Weekly Report. A funcao runWeeklyStudyPlan / generateWeeklyStudyPlan
 * continuam exportadas (reaproveitadas). No lugar, registra-se o report job runner
 * (enqueuer horario + processor a cada 15 min).
 */

import { registerSpotScreenshotsCron } from "./purgeSpotScreenshots";
import { registerNewsRefreshCron } from "./refreshNews";
import { registerFxRatesCron } from "./refreshFxRates";
import { registerStudyFreezesCron } from "./resetStudyFreezes";
// Sprint Spot-Anki-Reentry-3 — RF-2.3 cron drill spots materialization (06h UTC).
import { registerMaterializeDrillDifficultSpotsCron } from "./materializeDrillDifficultSpots";
// Sprint AI-1B — report job runner (enqueuer hourly + processor 15min).
import { registerReportJobRunner } from "./reportJobRunner";

export async function registerAllJobs(): Promise<void> {
  await registerSpotScreenshotsCron();
  await registerNewsRefreshCron();
  registerFxRatesCron();
  await registerStudyFreezesCron();
  await registerMaterializeDrillDifficultSpotsCron();
  // Sprint AI-1B (ADR-155/156) — substitui o `0 9 * * 1` aposentado.
  await registerReportJobRunner();
}
