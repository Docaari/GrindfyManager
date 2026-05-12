// =============================================================================
// Coach System Builder — Sprint Coach-1 / RF-01 + Sprint AI-0B / RF-01..RF-03
//
// Separa o system prompt em dois blocos:
//   - Estatico (cacheado via Anthropic prompt caching): base prompt unico
//     "Grindfy AI" + safety rules + competitor block + citations + confidence +
//     perfil do usuario + stats snapshot + ultimo resumo arquivado.
//   - Dinamico (sem cache): linha de "lente inicial" (conforme coachType),
//     sessao ativa, break feedbacks, leaks, weekly plan, study progress,
//     page context. Reescrito a cada mensagem.
//
// Sprint AI-0B (ADR-148): os 3 base prompts por coach (MENTAL_BASE /
// TOURNAMENT_BASE / TECHNICAL_BASE) e o getBasePrompt(coachType) foram
// consolidados num unico GRINDFY_AI_BASE. O coachType so muda UMA linha (a
// "lente inicial") no bloco DINAMICO — fora do cache.
//
// Fontes: Docs/specs/sprint-ai-0b.md (RF-01, RF-02, RF-03)
//         Docs/architecture/decisions/148-grindfy-ai-consolidation-single-agent-with-lens.md
//         Docs/architecture/decisions/019-coach-prompt-cache-strategy.md
//         Docs/architecture/decisions/147 (citations/confidence — fonte unica)
// =============================================================================

import {
  SAFETY_RULES,
  SAFETY_RULES_COMPETITOR_BLOCK,
  CITATIONS_RULES,
  CONFIDENCE_RULES,
} from './coachSafetyPrompts';

export type CoachType = 'mental' | 'tournament' | 'technical';

export interface StaticInputs {
  /** Perfil basico do jogador (nome, plano, data de criacao, volume total).
   *  Dado estavel dentro de uma sessao -> entra no bloco STATIC (cacheado). */
  userProfile?: { name?: string | null; subscriptionPlan?: string | null; createdAt?: any; totalTournaments?: number | null } | null;
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
// GRINDFY_AI_BASE — base prompt unico do agente (Sprint AI-0B / RF-01).
//
// Fonte UNICA (lesson #10). NAO ha mais variantes por coach. Mudar este texto
// quebra o cache key do bloco STATIC da Anthropic UMA vez (planejado, aceitavel).
// =============================================================================

export const GRINDFY_AI_BASE = `Voce e o Grindfy AI, o copiloto de carreira dos jogadores profissionais de poker MTT do Grindfy. Voce e um par/companheiro de grind: direto, pragmatico, baseado em dados — nunca um guru distante.

Voce cobre, de forma integrada, as cinco areas da carreira do jogador:
1. Analise de dados — performance, ROI por dimensao (site, buy-in, formato, dia), ITM, mesa final, leaks tecnicos.
2. Assistente de grind — grade semanal, warm-up, sessao em tempo real, energia/foco/confianca.
3. Coach (mental + tecnico) — tilt, rotina, disciplina, ICM, ranges, conceitos, areas de estudo.
4. Bankroll — banca multi-wallet, snapshots, rakeback, regras de gestao, simulacoes de variancia.
5. Tournament Selector — selecao de torneios (scoring), planejamento de grade, otimizacao de volume.

Voce tem ferramentas (tools) que buscam o detalhe sob demanda: ROI por dimensao, leaks, sugestoes de torneio, simulacao de banca, stats de HUD, biblioteca de aulas, etc. Use as tools sempre que precisar de um numero exato ou de detalhe — nao chute. Quando nao tiver uma tool ou um dado, diga "[nao sei: <motivo>]" em vez de inventar.

Toda metrica quantitativa que vier de uma tool ou do contexto da pagina precisa de citacao inline da fonte no formato [fonte: ...] (regras detalhadas abaixo).`;

export function getGrindfyAiBasePrompt(): string {
  return GRINDFY_AI_BASE;
}

// =============================================================================
// Linha de "lente inicial" por coachType (Sprint AI-0B / RF-03).
// Esta linha eh A UNICA COISA que varia com coachType no system prompt — e fica
// no bloco DINAMICO (fora do cache), entao trocar de aba nao invalida o cache.
// =============================================================================

function getInitialLensLine(coachType: CoachType): string {
  switch (coachType) {
    case 'mental':
      return 'Lente inicial: o usuario abriu o chat com foco no mental game (foco, tilt, preparo, rotina) — comece por ai, mas voce pode e deve falar de qualquer assunto se a conversa pedir.';
    case 'tournament':
      return 'Lente inicial: o usuario abriu o chat com foco em selecao de torneios e planejamento de grade — comece por ai, mas voce pode e deve falar de qualquer assunto se a conversa pedir.';
    case 'technical':
      return 'Lente inicial: o usuario abriu o chat com foco em analise tecnica e leaks no jogo — comece por ai, mas voce pode e deve falar de qualquer assunto se a conversa pedir.';
    default:
      return 'Lente inicial: o usuario abriu o chat para falar com o Grindfy AI — voce pode falar de qualquer assunto.';
  }
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
//
// O parametro `coachType` eh preservado na assinatura (back-compat) mas NAO eh
// usado no corpo do bloco: o bloco STATIC eh IDENTICO entre os 3 coachType (so
// 1 cache key). A "lente inicial" vai pro DINAMICO (buildDynamicSystemBlock).
// =============================================================================

export function buildStaticSystemBlock(
  _coachType: CoachType,
  inputs: StaticInputs = {},
): SystemBlock {
  const parts: string[] = [];
  parts.push(GRINDFY_AI_BASE);
  parts.push(SAFETY_RULES);
  // Sprint Biblioteca-1 / RF-09 (ADR-075): hard-block concorrentes em STATIC
  // block para preservar cache hit (atualizar lista quebra cache UMA vez).
  parts.push(SAFETY_RULES_COMPETITOR_BLOCK);
  // Sprint Coach Sprint 0 — RF-04 + RF-05 (ADR-086); reforcado em AI-0A / RF-14
  // (ADR-147 §3 — citacoes/confianca passam a ter fonte unica em coachSafetyPrompts).
  parts.push(CITATIONS_RULES);
  parts.push(CONFIDENCE_RULES);

  const up = inputs.userProfile;
  if (up && (up.name || up.subscriptionPlan || up.totalTournaments != null)) {
    const profileLines: string[] = [];
    if (up.name) profileLines.push(`Nome: ${up.name}`);
    if (up.subscriptionPlan) profileLines.push(`Plano: ${up.subscriptionPlan}`);
    if (up.createdAt) profileLines.push(`Criado em: ${up.createdAt}`);
    if (up.totalTournaments != null) profileLines.push(`Total de torneios: ${up.totalTournaments}`);
    if (profileLines.length > 0) parts.push(`\n## Perfil do jogador:\n${profileLines.join('\n')}`);
  }

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
//
// Sprint AI-0B / RF-02: o contexto deixa de ser gateado por coachType. Weekly
// plan e study progress entram SEMPRE (quando ha dado), independente do
// coachType. A unica coisa que varia com coachType eh a primeira linha (lente).
// =============================================================================

export function buildDynamicSystemBlock(
  coachType: CoachType,
  inputs: DynamicInputs = {},
): SystemBlock {
  const parts: string[] = [];

  // 1. Linha de lente inicial (RF-03) — primeira linha, sempre.
  parts.push(getInitialLensLine(coachType));

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

  // Weekly plan — Sprint AI-0B / RF-02: entra sempre (nao mais gated por coachType).
  if (inputs.weeklyPlan) {
    const w = inputs.weeklyPlan as any;
    parts.push(
      `\n## Plano Semanal Atual:\n- Target buy-ins: ${w.targetBuyins ?? 'N/A'}\n- Target profit: ${w.targetProfit ?? 'N/A'}\n- Target volume: ${w.targetVolume ?? 'N/A'}`,
    );
  }

  // Study progress — Sprint AI-0B / RF-02: entra sempre (nao mais gated por coachType).
  if (inputs.studyProgress && Array.isArray(inputs.studyProgress) && inputs.studyProgress.length > 0) {
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
