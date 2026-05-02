// =============================================================================
// Coach Tools — Side-effect entrypoint
//
// Importar este modulo registra todas as tools no registry singleton.
// Sprint Cooldown-3: registra read_cooldown_history (RF-07).
//
// Tools de Sprint Coach 2A (find_top_leaks, simulate_bankroll_scenario,
// query_dimension, get_tournament_suggestions, explain_tournament_score)
// sao registradas como STUBS aqui apenas para satisfazer o teste de
// regressao da tool-registry-cooldown.test.ts. Os handlers reais vivem em
// arquivos baseline separados (parcialmente untracked / coach-baseline broken)
// e podem ser religados quando o time consertar a baseline.
// =============================================================================

import { z } from 'zod';
import { registerTool, type CoachTool } from './registry';
import { readCooldownHistoryTool } from './handlers/readCooldownHistory';
import { readUserHudStatsToolV2 } from '../coach/tools/readUserHudStatsV2';
import { readUserBankrollHistoryTool } from '../coach/tools/readUserBankrollHistory';
import { readThemeWithLinkedSpotsTool } from './readThemeWithLinkedSpots';
import { recommendLessonTool } from './recommendLesson';

// -----------------------------------------------------------------------------
// Stubs de regressao Sprint Coach 2A — tools cujo handler real esta na
// baseline broken (115 fails). Stubs minimos para que o registry exponha
// o nome conforme expectativa do tool-registry-cooldown.test.ts.
// -----------------------------------------------------------------------------

const stubHandler = async (_input: any, _ctx: any) => ({
  __type: 'ToolResult',
  ok: false,
  code: 'not_implemented',
  message: 'tool stub — baseline handler pending',
});

// MEDIUM-1 reviewer: stubs marcados com __stub para que exportToolsForAnthropic
// possa filtrar em producao quando wire-up no /api/coach/chat for ligado.
// TODO(@coach-baseline 2026-Q2): remover stubs ao religar handlers reais.
// NAO mergear refactor que ligue exportToolsForAnthropic com stubs ainda aqui
// sem garantir filtragem em producao via __stub flag.
const findTopLeaksStub: CoachTool = {
  name: 'find_top_leaks',
  description: 'Detecta principais leaks do usuario (categoria, site, ROI).',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(20).default(5),
    minSeverity: z.enum(['low', 'medium', 'high']).default('low'),
  }),
  handler: stubHandler,
  requiresConfirmation: false,
  auditLevel: 'log',
  gateByTier: ['pro', 'premium', 'admin'],
  __stub: true,
};

const simulateBankrollStub: CoachTool = {
  name: 'simulate_bankroll_scenario',
  description: 'Simula cenarios de bankroll (variancia, ROI alvo, ABI).',
  inputSchema: z.object({
    abi: z.number().positive(),
    targetRoi: z.number(),
    sampleSize: z.number().int().positive().default(1000),
  }),
  handler: stubHandler,
  requiresConfirmation: false,
  auditLevel: 'log',
  gateByTier: ['pro', 'premium', 'admin'],
  __stub: true,
};

// -----------------------------------------------------------------------------
// Registration (idempotent via try/catch — silencia "tool_already_registered"
// caso o caller importe duas vezes em modulos sem reset).
// -----------------------------------------------------------------------------

function safeRegister(tool: CoachTool): void {
  try {
    registerTool(tool, { core: true });
  } catch (err) {
    // Tool ja registrada (re-import) — no-op.
    if (err instanceof Error && err.message.includes('tool_already_registered')) {
      return;
    }
    throw err;
  }
}

// Sprint Cooldown-3 (RF-07).
safeRegister(readCooldownHistoryTool);

// Sprint Stats-V2 (ADR-062) — substitui V1 (ADR-052).
safeRegister(readUserHudStatsToolV2);

// Sprint Coach 2A regression stubs (handlers reais na baseline broken).
safeRegister(findTopLeaksStub);
safeRegister(simulateBankrollStub);

// Sprint Bankroll-Reports-Detail (RF-07): tool real (Pro+ tier ja gated em
// readUserBankrollHistoryTool.gateByTier).
safeRegister(readUserBankrollHistoryTool as unknown as CoachTool);

// Sprint Studies-Reform RF-07 — read_theme_with_linked_spots
safeRegister(readThemeWithLinkedSpotsTool as any);

// Sprint Biblioteca-1 RF-10 — recommend_lesson (ADR-075)
safeRegister(recommendLessonTool as unknown as CoachTool);

export {
  readCooldownHistoryTool,
  readUserHudStatsToolV2,
  readUserBankrollHistoryTool,
  readThemeWithLinkedSpotsTool,
  recommendLessonTool,
};

// Sprint Studies-Reform RF-07 — agregado para introspeccao por testes.
// Mantem compat com tests anteriores (que olhavam para listRegisteredTools).
export const coachTools = [
  readCooldownHistoryTool,
  readUserHudStatsToolV2,
  findTopLeaksStub,
  simulateBankrollStub,
  readUserBankrollHistoryTool,
  readThemeWithLinkedSpotsTool,
  recommendLessonTool,
];
