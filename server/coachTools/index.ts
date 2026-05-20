// =============================================================================
// Coach Tools — Side-effect entrypoint
//
// Importar este modulo registra TODAS as tools canonicas do Coach no registry
// singleton (ADR-145 — estado canonico pos-AI-0A).
//
// Read tools:
//   - read_cooldown_history (Cooldown-3)
//   - read_user_hud_stats v2 (Stats-V2)
//   - read_user_bankroll_history (Bankroll-Reports-Detail)
//   - read_theme_with_linked_stats_and_spots (+ alias read_theme_with_linked_spots)
//   - recommend_lesson (Biblioteca-1)
//   - query_dimension (AI-0A — religada)
//   - find_top_leaks (AI-0A — religada, era stub)
//   - get_tournament_suggestions (AI-0A — registrada do zero)
//   - explain_tournament_score (AI-0A — registrada do zero)
//   - simulate_bankroll_scenario (AI-0A — religada, era stub)
//   - verify_leak_progress (Coach-2B handler, registrada em AI-0A)
//
// Write tools (Coach-2B handlers, registrados em AI-0A — confirmacao SEMPRE v1):
//   - register_tournament_in_grade
//   - record_wallet_transaction (confirmationLevel: 'strict')
//   - start_grind_session
//   - log_session_completed
//   - log_leak_focus
//   - log_study_session
//
// NAO ha mais nenhuma tool stub aqui (RF-13). O flag de tool incompleta
// permanece definido na interface CoachTool e o filtro defensivo em
// server/routes/coach.ts continua — custo zero, ADR-145 §6.
// =============================================================================

import { registerTool, type CoachTool } from './registry';
import { readCooldownHistoryTool } from './handlers/readCooldownHistory';
import { readUserHudStatsToolV2 } from '../coach/tools/readUserHudStatsV2';
import { readUserBankrollHistoryTool } from '../coach/tools/readUserBankrollHistory';
import { readThemeWithLinkedSpotsTool } from './readThemeWithLinkedSpots';
import {
  readThemeWithLinkedStatsAndSpotsTool,
  readThemeWithLinkedSpotsToolAlias,
} from './readThemeWithLinkedStatsAndSpots';
import { recommendLessonTool } from './recommendLesson';
// AI-0A — read tools religadas / registradas do zero.
import { queryDimensionTool } from './handlers/queryDimension';
import { findTopLeaksTool } from './handlers/findTopLeaks';
import { getTournamentSuggestionsTool } from './handlers/getTournamentSuggestions';
import { explainTournamentScoreTool } from './handlers/explainTournamentScore';
import { simulateBankrollScenarioTool } from './handlers/simulateBankrollScenario';
import { verifyLeakProgressTool } from './handlers/verifyLeakProgress';
// AI-1C — bulk batching wrapper para query_dimension (RF-06, ADR-160).
import { bulkQueryDimensionsTool } from './handlers/bulkQueryDimensions';
// AI-0A — write tools (handlers de Coach-2B), confirmacao SEMPRE v1.
import { registerTournamentInGradeTool } from './handlers/registerTournamentInGrade';
import { recordWalletTransactionTool } from './handlers/recordWalletTransaction';
import { startGrindSessionTool } from './handlers/startGrindSession';
import { logSessionCompletedTool } from './handlers/logSessionCompleted';
import { logLeakFocusTool } from './handlers/logLeakFocus';
import { logStudySessionTool } from './handlers/logStudySession';
// AI-2A — write tools + diagnostic tools (9 novas).
import { bulkProposeGradeTool } from './handlers/bulkProposeGrade';
import { scheduleStudyBlockTool } from './handlers/scheduleStudyBlock';
import { createStudyThemeTool } from './handlers/createStudyTheme';
import { markOffDayTool } from './handlers/markOffDay';
import { analyzeVarianceTool } from './handlers/analyzeVariance';
import { diagnosePlateauTool } from './handlers/diagnosePlateau';
import { computeGrindStudyRatioTool } from './handlers/computeGrindStudyRatio';
import { calculateEffectiveRakeTool } from './handlers/calculateEffectiveRake';
import { queryPoolIntelligenceTool } from './handlers/queryPoolIntelligence';
// AI-2B — career goals + mental hand + IRPF summary (4 tools).
import { defineCareerGoalTool } from './handlers/defineCareerGoal';
import { evaluateCareerGoalTool } from './handlers/evaluateCareerGoal';
import { logMentalHandTool } from './handlers/logMentalHand';
import { computeIrpfSummaryTool } from './handlers/computeIrpfSummary';

// -----------------------------------------------------------------------------
// Registration (idempotent via try/catch — silencia "tool_already_registered"
// caso o caller importe duas vezes em modulos sem reset).
// -----------------------------------------------------------------------------

function safeRegister(tool: CoachTool): void {
  try {
    registerTool(tool, { core: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes('tool_already_registered')) {
      return;
    }
    throw err;
  }
}

// Read tools pre-existentes.
safeRegister(readCooldownHistoryTool);
safeRegister(readUserHudStatsToolV2);
safeRegister(readUserBankrollHistoryTool as unknown as CoachTool);
safeRegister(readThemeWithLinkedStatsAndSpotsTool as unknown as CoachTool);
safeRegister(readThemeWithLinkedSpotsToolAlias as unknown as CoachTool);
safeRegister(recommendLessonTool as unknown as CoachTool);

// AI-0A — read tools religadas / registradas do zero (RF-01..05, RF-12).
safeRegister(queryDimensionTool);
safeRegister(findTopLeaksTool);
safeRegister(getTournamentSuggestionsTool);
safeRegister(explainTournamentScoreTool);
safeRegister(simulateBankrollScenarioTool);
safeRegister(verifyLeakProgressTool as unknown as CoachTool);

// AI-1C — bulk batching (RF-06).
safeRegister(bulkQueryDimensionsTool);

// AI-0A — write tools (RF-06..11), confirmacao SEMPRE v1 (ADR-146).
safeRegister(registerTournamentInGradeTool as unknown as CoachTool);
safeRegister(recordWalletTransactionTool as unknown as CoachTool);
safeRegister(startGrindSessionTool as unknown as CoachTool);
safeRegister(logSessionCompletedTool as unknown as CoachTool);
safeRegister(logLeakFocusTool as unknown as CoachTool);
safeRegister(logStudySessionTool as unknown as CoachTool);

// AI-2A — write tools (RF-02..05) + diagnostic tools (RF-06.1..5) — 9 tools.
safeRegister(bulkProposeGradeTool as unknown as CoachTool);
safeRegister(scheduleStudyBlockTool as unknown as CoachTool);
safeRegister(createStudyThemeTool as unknown as CoachTool);
safeRegister(markOffDayTool as unknown as CoachTool);
safeRegister(analyzeVarianceTool as unknown as CoachTool);
safeRegister(diagnosePlateauTool as unknown as CoachTool);
safeRegister(computeGrindStudyRatioTool as unknown as CoachTool);
safeRegister(calculateEffectiveRakeTool as unknown as CoachTool);
safeRegister(queryPoolIntelligenceTool as unknown as CoachTool);

// AI-2B — career goals + mental hand + IRPF summary (4 tools).
safeRegister(defineCareerGoalTool as unknown as CoachTool);
safeRegister(evaluateCareerGoalTool as unknown as CoachTool);
safeRegister(logMentalHandTool as unknown as CoachTool);
safeRegister(computeIrpfSummaryTool as unknown as CoachTool);

export {
  readCooldownHistoryTool,
  readUserHudStatsToolV2,
  readUserBankrollHistoryTool,
  readThemeWithLinkedSpotsTool,
  readThemeWithLinkedStatsAndSpotsTool,
  readThemeWithLinkedSpotsToolAlias,
  recommendLessonTool,
  queryDimensionTool,
  findTopLeaksTool,
  getTournamentSuggestionsTool,
  explainTournamentScoreTool,
  simulateBankrollScenarioTool,
  verifyLeakProgressTool,
  registerTournamentInGradeTool,
  recordWalletTransactionTool,
  startGrindSessionTool,
  logSessionCompletedTool,
  logLeakFocusTool,
  logStudySessionTool,
  bulkQueryDimensionsTool,
  // AI-2A
  bulkProposeGradeTool,
  scheduleStudyBlockTool,
  createStudyThemeTool,
  markOffDayTool,
  analyzeVarianceTool,
  diagnosePlateauTool,
  computeGrindStudyRatioTool,
  calculateEffectiveRakeTool,
  queryPoolIntelligenceTool,
  // AI-2B
  defineCareerGoalTool,
  evaluateCareerGoalTool,
  logMentalHandTool,
  computeIrpfSummaryTool,
};

// Agregado para introspeccao por testes (lesson #8 — testes validam presenca
// individual, nunca length absoluta). Inclui as 17 tools canonicas + 1 alias
// + bulk_query_dimensions (AI-1C) + 9 AI-2A.
export const coachTools = [
  readCooldownHistoryTool,
  readUserHudStatsToolV2,
  readUserBankrollHistoryTool,
  readThemeWithLinkedStatsAndSpotsTool,
  readThemeWithLinkedSpotsToolAlias,
  recommendLessonTool,
  queryDimensionTool,
  findTopLeaksTool,
  getTournamentSuggestionsTool,
  explainTournamentScoreTool,
  simulateBankrollScenarioTool,
  verifyLeakProgressTool,
  registerTournamentInGradeTool,
  recordWalletTransactionTool,
  startGrindSessionTool,
  logSessionCompletedTool,
  logLeakFocusTool,
  logStudySessionTool,
  bulkQueryDimensionsTool,
  bulkProposeGradeTool,
  scheduleStudyBlockTool,
  createStudyThemeTool,
  markOffDayTool,
  analyzeVarianceTool,
  diagnosePlateauTool,
  computeGrindStudyRatioTool,
  calculateEffectiveRakeTool,
  queryPoolIntelligenceTool,
  // AI-2B
  defineCareerGoalTool,
  evaluateCareerGoalTool,
  logMentalHandTool,
  computeIrpfSummaryTool,
];
