/**
 * Jobs registry — agenda todos os crons in-process.
 *
 * Sprint F2 introduz o primeiro job (purgeSpotScreenshots). Outras sprints
 * adicionam jobs aqui no mesmo padrao.
 */

import { registerSpotScreenshotsCron } from "./purgeSpotScreenshots";
import { registerNewsRefreshCron } from "./refreshNews";
import { registerFxRatesCron } from "./refreshFxRates";
import { registerStudyFreezesCron } from "./resetStudyFreezes";
// Sprint Estudos-Coach-Biblio-2 — RF-3.3 cron weekly study plan (segunda 9h UTC).
import { registerWeeklyStudyPlanCron } from "./generateWeeklyStudyPlan";

export async function registerAllJobs(): Promise<void> {
  await registerSpotScreenshotsCron();
  await registerNewsRefreshCron();
  registerFxRatesCron();
  await registerStudyFreezesCron();
  await registerWeeklyStudyPlanCron();
}
