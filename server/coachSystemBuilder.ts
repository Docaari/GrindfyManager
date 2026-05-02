// =============================================================================
// Coach System Builder — Sprint Coach-1 / RF-01
// Separa o system prompt em dois blocos:
//   - Estatico (cacheado via Anthropic prompt caching): base prompt + safety
//     rules + perfil do usuario + stats snapshot + ultimo resumo arquivado.
//   - Dinamico (sem cache): sessao ativa, break feedbacks, leaks, weekly plan,
//     study progress. Reescrito a cada mensagem.
//
// Fontes: docs/specs/coach-sprint-1-fundacao-economica.md (RF-01)
//         Docs/architecture/decisions/019-coach-prompt-cache-strategy.md
// =============================================================================

import {
  SAFETY_RULES,
  SAFETY_RULES_COMPETITOR_BLOCK,
  CONFIDENCE_AND_CITATIONS_BACKTICKED as CITATION_AND_CONFIDENCE_INSTRUCTIONS,
  CITATIONS_RULES,
  CONFIDENCE_RULES,
} from './coachSafetyPrompts';

export type CoachType = 'mental' | 'tournament' | 'technical';

export interface StaticInputs {
  aiProfile?: string | null;
  statsSnapshot?: any | null;
  lastSummary?: string | null;
}

export interface DynamicInputs {
  activeGrind?: any | null;
  breakFeedbacks?: any[] | null;
  leaks?: any[] | null;
  weeklyPlan?: any | null;
  studyProgress?: any[] | null;
  /** Sprint Coach-2A / RF-01 — page context injetado no bloco DINAMICO. */
  pageContext?: any;
}

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

// =============================================================================
// Base prompts dos 3 coaches.
// =============================================================================

const MENTAL_BASE = `Voce e o Coach Mental do Grindfy, especializado em mental game para jogadores profissionais de poker MTT.

Seu papel e ajudar o jogador a melhorar foco, controle emocional, tilt management, preparacao mental e rotina de grind.`;

const TOURNAMENT_BASE = `Voce e o Coach de Torneios do Grindfy, especializado em game selection e otimizacao de grade para jogadores profissionais de poker MTT.

Seu papel e ajudar o jogador a otimizar sua selecao de torneios, analisar performance por site/formato/buy-in e planejar grades semanais.`;

const TECHNICAL_BASE = `Voce e o Coach Tecnico do Grindfy, especializado em analise tecnica e leak detection para jogadores profissionais de poker MTT.

Seu papel e ajudar o jogador a identificar e corrigir leaks no jogo, analisar performance tecnica e sugerir areas de estudo.`;

function getBasePrompt(coachType: CoachType): string {
  if (coachType === 'mental') return MENTAL_BASE;
  if (coachType === 'tournament') return TOURNAMENT_BASE;
  return TECHNICAL_BASE;
}

// =============================================================================
// Helpers de formatacao
// =============================================================================

function formatStats(stats: any): string {
  if (!stats || typeof stats !== 'object') return '';
  const parts: string[] = [];
  if (stats.roi !== undefined && stats.roi !== null) parts.push(`ROI: ${stats.roi}%`);
  if (stats.profit !== undefined && stats.profit !== null) parts.push(`Profit: ${stats.profit}`);
  if (stats.volume !== undefined && stats.volume !== null) parts.push(`Volume: ${stats.volume}`);
  if (stats.abi !== undefined && stats.abi !== null) parts.push(`ABI: ${stats.abi}`);
  if (parts.length === 0) return '';
  return `\n## Stats Snapshot:\n${parts.join('\n')}`;
}

// =============================================================================
// buildStaticSystemBlock — cacheado (TTL ~5 min)
// =============================================================================

export function buildStaticSystemBlock(
  coachType: CoachType,
  inputs: StaticInputs = {},
): SystemBlock {
  const parts: string[] = [];
  parts.push(getBasePrompt(coachType));
  parts.push(SAFETY_RULES);
  // Sprint Biblioteca-1 / RF-09 (ADR-075): hard-block concorrentes em STATIC
  // block para preservar cache hit (atualizar lista quebra cache UMA vez).
  parts.push(SAFETY_RULES_COMPETITOR_BLOCK);
  parts.push(CITATION_AND_CONFIDENCE_INSTRUCTIONS);
  // Sprint Coach Sprint 0 — RF-04 + RF-05 (ADR-086)
  parts.push(CITATIONS_RULES);
  parts.push(CONFIDENCE_RULES);

  if (inputs.aiProfile && String(inputs.aiProfile).trim().length > 0) {
    parts.push(`\n## Perfil do Jogador (memoria de longo prazo):\n${inputs.aiProfile}`);
  }

  const statsText = formatStats(inputs.statsSnapshot);
  if (statsText) parts.push(statsText);

  if (inputs.lastSummary && String(inputs.lastSummary).trim().length > 0) {
    parts.push(`\n## Resumo da sessao anterior:\n${inputs.lastSummary}`);
  }

  return {
    type: 'text',
    text: parts.join('\n'),
    cache_control: { type: 'ephemeral' },
  };
}

// =============================================================================
// buildDynamicSystemBlock — nao cacheado (reescrito a cada request)
// =============================================================================

export function buildDynamicSystemBlock(
  coachType: CoachType,
  inputs: DynamicInputs = {},
): SystemBlock {
  const parts: string[] = [];

  if (inputs.activeGrind) {
    const g = inputs.activeGrind as any;
    parts.push(
      `\n## Sessao de Grind Ativa:\n- Status: ${g.status || 'active'}\n- Profit/Loss: ${g.profitLoss ?? 'N/A'}\n- Foco medio: ${g.focoMedio ?? 'N/A'}\n- Energia media: ${g.energiaMedia ?? 'N/A'}\n- Confianca media: ${g.confiancaMedia ?? 'N/A'}`,
    );
  }

  if (inputs.breakFeedbacks && Array.isArray(inputs.breakFeedbacks) && inputs.breakFeedbacks.length > 0) {
    const lines = inputs.breakFeedbacks.map((f: any) =>
      `- Foco: ${f.foco ?? 'N/A'}, Energia: ${f.energia ?? 'N/A'}, Confianca: ${f.confianca ?? 'N/A'}, IE: ${f.inteligenciaEmocional ?? 'N/A'}${f.interferencias ? `, Interferencias: ${f.interferencias}` : ''}`,
    );
    parts.push(`\n## Break Feedbacks recentes:\n${lines.join('\n')}`);
  }

  if (inputs.leaks && Array.isArray(inputs.leaks) && inputs.leaks.length > 0) {
    const lines = inputs.leaks.map((l: any) =>
      `- [Severidade ${l.severity || 'N/A'}] ${l.description || ''}`,
    );
    parts.push(`\n## Leaks Detectados em tempo real:\n${lines.join('\n')}`);
  }

  // Weekly plan — relevante principalmente para tournament coach
  if (coachType === 'tournament' && inputs.weeklyPlan) {
    const w = inputs.weeklyPlan as any;
    parts.push(
      `\n## Plano Semanal Atual:\n- Target buy-ins: ${w.targetBuyins ?? 'N/A'}\n- Target profit: ${w.targetProfit ?? 'N/A'}\n- Target volume: ${w.targetVolume ?? 'N/A'}`,
    );
  }

  // Study progress — relevante principalmente para technical coach
  if (coachType === 'technical' && inputs.studyProgress && Array.isArray(inputs.studyProgress) && inputs.studyProgress.length > 0) {
    const lines = inputs.studyProgress.map((s: any) =>
      `- ${s.category || s.title || 'N/A'}: knowledge ${s.knowledgeScore ?? 0}% (${s.status || 'N/A'})`,
    );
    parts.push(`\n## Progresso de Estudo:\n${lines.join('\n')}`);
  }

  // Sprint Coach-2A / RF-01 — page context (whitelist Zod aplicada via
  // sanitizePageContext em server/coachPageContext.ts). Bloco DINAMICO,
  // sem cache_control (ADR-019).
  if (inputs.pageContext) {
    try {
      // Lazy require para evitar ciclo de import.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { buildPageContextSection } = require('./coachPageContext');
      const section = buildPageContextSection(inputs.pageContext);
      if (section) {
        parts.push(`\n${section}`);
      }
    } catch {
      // graceful degradation — pageContext invalido nao quebra prompt.
    }
  }

  return {
    type: 'text',
    text: parts.join('\n'),
    // sem cache_control — dinamico
  };
}

// =============================================================================
// buildSystemArray — monta o array final para a API Anthropic
// Respeita feature flag COACH_PROMPT_CACHE_ENABLED=false (fallback legacy).
// =============================================================================

export function buildSystemArray(
  coachType: CoachType,
  staticInputs: StaticInputs,
  dynamicInputs: DynamicInputs,
): SystemBlock[] | string {
  const cacheEnabled = process.env.COACH_PROMPT_CACHE_ENABLED !== 'false';

  const staticBlock = buildStaticSystemBlock(coachType, staticInputs);
  const dynamicBlock = buildDynamicSystemBlock(coachType, dynamicInputs);

  if (!cacheEnabled) {
    // Legacy: combinar tudo como string, sem cache_control
    const combined = [staticBlock.text, dynamicBlock.text].filter(t => t && t.trim().length > 0).join('\n');
    return combined;
  }

  const blocks: SystemBlock[] = [staticBlock];
  if (dynamicBlock.text && dynamicBlock.text.trim().length > 0) {
    blocks.push(dynamicBlock);
  }
  return blocks;
}
