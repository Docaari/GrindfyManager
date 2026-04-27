// =============================================================================
// Coach Page Context — Zod whitelist por route (discriminated union strict).
//
// Sprint Coach-2A / RF-01 — ADR-025 (whitelist Zod, anti prompt injection).
// Sprint Cooldown-3 / RF-07 — ADR-043 (variante cooldown-log).
//
// Cada variante eh strict (rejeita campos extras) para evitar que atacantes
// injetem payloads textuais. PII (notes, cGame, action, aGame[], bGame[],
// lesson texto livre, triggers[]) e bloqueado em todas as variantes.
// =============================================================================

import { z } from 'zod';
import { STARRED_HAND_TYPES } from '@shared/schema';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const activeFiltersSchema = z
  .object({
    site: z.string().max(100).optional(),
    category: z.string().max(50).optional(),
    speed: z.string().max(50).optional(),
  })
  .strict();

const profileEnum = z.enum(['A', 'B', 'C']);
const dayEnum = z.number().int().min(0).max(6);
const dateRangeEnum = z.enum(['7d', '30d', '60d', '90d', 'all']);
const sessionStatusEnum = z.enum([
  'active',
  'paused',
  'completed',
  'archived',
]);
const coachTypeEnum = z.enum(['mental', 'tournament', 'technical']);

// -----------------------------------------------------------------------------
// Sprint Coach-2A — variantes existentes
// -----------------------------------------------------------------------------

const gradePlannerSchema = z
  .object({
    route: z.literal('grade-planner'),
    day: dayEnum.optional(),
    profile: profileEnum.optional(),
    activeFilters: activeFiltersSchema.optional(),
    focusedTournamentId: z.string().max(50).optional(),
  })
  .strict();

const grindLiveSchema = z
  .object({
    route: z.literal('grind-live'),
    activeSessionId: z.string().max(50).optional(),
    sessionStatus: sessionStatusEnum.optional(),
    registeredTournamentsCount: z.number().int().min(0).max(200).optional(),
    currentProfit: z.number().optional(),
  })
  .strict();

const dashboardSchema = z
  .object({
    route: z.literal('dashboard'),
    dateRange: dateRangeEnum.optional(),
    activeFilters: activeFiltersSchema.optional(),
  })
  .strict();

const coachAiSchema = z
  .object({
    route: z.literal('coach-ai'),
    activeCoachType: coachTypeEnum.optional(),
  })
  .strict();

// -----------------------------------------------------------------------------
// Sprint Cooldown-3 — variante cooldown-log (ADR-043)
//
// PII rejeitado em sub-objetos (abGameAnswers / tiltSelfAssessment) via .strict().
// -----------------------------------------------------------------------------

const cooldownBlockEnum = z.enum(['hands', 'abc', 'tilt', 'sleep', 'quick']);
// HIGH-1 reviewer: enum sincronizado com STARRED_HAND_TYPES da schema base
// para evitar drift que rejeita keys validas (soulread, hero-call, sick, other).
const starredTypeEnum = z.enum(STARRED_HAND_TYPES as readonly [string, ...string[]]);

// abGameAnswers sanitizado: APENAS booleans (presence checks).
// Rejeita aGame[], bGame[], cGame, lesson (PII texto livre).
const abGameAnswersSchema = z
  .object({
    hasAGame: z.boolean(),
    hasBGame: z.boolean(),
    hasCGame: z.boolean(),
    hasLesson: z.boolean(),
  })
  .strict();

// tiltSelfAssessment sanitizado: sliders + counts + dominantTrigger string curta.
// Rejeita triggers[] (array completo) e action (texto livre).
const tiltSelfAssessmentSchema = z
  .object({
    feltTilt: z.number().int().min(0).max(10),
    keptTilting: z.number().int().min(0).max(10),
    presence: z.number().int().min(0).max(10),
    triggersCount: z.number().int().min(0).max(20).optional(),
    dominantTrigger: z.string().max(50).optional(),
  })
  .strict();

const lessonTokenSchema = z.string().min(1).max(30);

const cooldownLogSchema = z
  .object({
    route: z.literal('cooldown-log'),
    cooldownLogId: z.string().max(50),
    sessionId: z.string().max(50),
    mode: z.enum(['full', 'quick']),
    blocksCompleted: z.array(cooldownBlockEnum).max(5),
    completedAt: z.union([z.string(), z.date(), z.null()]),
    abGameAnswers: abGameAnswersSchema.optional(),
    tiltSelfAssessment: tiltSelfAssessmentSchema.optional(),
    starredHandsCount: z.number().int().min(0).max(50),
    starredHandsByType: z
      .record(starredTypeEnum, z.number().int().min(0))
      .optional(),
    recentLessonTokens: z.array(lessonTokenSchema).max(10).optional(),
  })
  .strict();

// -----------------------------------------------------------------------------
// Discriminated union
// -----------------------------------------------------------------------------

export const pageContextSchema = z.discriminatedUnion('route', [
  gradePlannerSchema,
  grindLiveSchema,
  dashboardSchema,
  coachAiSchema,
  cooldownLogSchema,
]);

export type PageContext = z.infer<typeof pageContextSchema>;

/**
 * Sanitiza page context — retorna parsed se valido, null caso contrario.
 * Aplica scrub recursivo de tokens conhecidos de prompt injection ANTES de
 * validar via Zod (ADR-025).
 */
export function sanitizePageContext(input: unknown): PageContext | null {
  const scrubbed = scrubInjectionTokens(input);
  const r = pageContextSchema.safeParse(scrubbed);
  return r.success ? r.data : null;
}

// -----------------------------------------------------------------------------
// Prompt-injection token scrubbing — recursivo
// Lista conservadora de instrucoes manipulativas (case-insensitive).
// -----------------------------------------------------------------------------

const INJECTION_TOKENS = [
  /ignore\s+(?:previous|all|prior)\s*(?:instructions?|messages?)?/gi,
  /\bignore\b/gi,
  /reveal\s+(?:system|hidden|secret)\s*(?:prompt|message|key)?/gi,
  /\breveal\b/gi,
  /forget\s+(?:everything|previous)/gi,
  /disregard\s+(?:above|previous)/gi,
];

function scrubString(s: string): string {
  let out = s;
  for (const re of INJECTION_TOKENS) {
    out = out.replace(re, '[redacted]');
  }
  return out;
}

function scrubInjectionTokens(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return scrubString(input);
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(scrubInjectionTokens);
  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = scrubInjectionTokens(v);
  }
  return out;
}

// -----------------------------------------------------------------------------
// buildPageContextSection — formata page context para injecao no prompt
// dinamico (sem cache_control, ADR-019). Retorna string com cabecalho fixo.
// -----------------------------------------------------------------------------

export function buildPageContextSection(input: unknown): string {
  const ctx = sanitizePageContext(input);
  if (!ctx) return '';
  const lines: string[] = ['## Contexto da pagina atual', `Rota: ${ctx.route}`];

  // Append campos relevantes por variante (apenas inspect — nao expoe PII).
  switch (ctx.route) {
    case 'grade-planner':
      if (ctx.day !== undefined) lines.push(`Dia: ${ctx.day}`);
      if (ctx.profile) lines.push(`Perfil: ${ctx.profile}`);
      if (ctx.focusedTournamentId)
        lines.push(`Torneio em foco: ${ctx.focusedTournamentId}`);
      break;
    case 'grind-live':
      if (ctx.activeSessionId)
        lines.push(`Sessao ativa: ${ctx.activeSessionId}`);
      if (ctx.sessionStatus) lines.push(`Status: ${ctx.sessionStatus}`);
      if (ctx.registeredTournamentsCount !== undefined)
        lines.push(`Torneios registrados: ${ctx.registeredTournamentsCount}`);
      break;
    case 'dashboard':
      if (ctx.dateRange) lines.push(`Periodo: ${ctx.dateRange}`);
      break;
    case 'coach-ai':
      if (ctx.activeCoachType)
        lines.push(`Coach ativo: ${ctx.activeCoachType}`);
      break;
    case 'cooldown-log':
      lines.push(`Cool-down: ${ctx.cooldownLogId} (modo ${ctx.mode})`);
      lines.push(`Sessao: ${ctx.sessionId}`);
      lines.push(`Maos destacadas: ${ctx.starredHandsCount}`);
      break;
  }

  return lines.join('\n');
}
