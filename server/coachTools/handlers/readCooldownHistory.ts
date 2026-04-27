// =============================================================================
// Tool: read_cooldown_history
// Sprint Cooldown-3 / RF-07
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07)
// ADR  : Docs/architecture/decisions/042-cooldown-coach-tool-registry.md
// Flow : Docs/architecture/flows/coach/sequence-cooldown-tool.mermaid (cenario A)
//
// Reusa storage methods do Sprint Cooldown-2 (sem adicionar novos):
//   - storage.getCooldownComplianceMetrics(userId, period)
//   - storage.getStarredHandsDistribution(userId, period)
//   - storage.getTopLessons(userId, period)
//   - storage.getCooldownImpactMetrics(userId, period)
//
// Output sanitizado (PII-free):
//   - NUNCA expoe notes, cGame, action, aGame[], bGame[], lesson cru
//   - Apenas counts, top 10 lesson tokens, deltas agregados
// =============================================================================

import { z } from 'zod';
import type { CoachTool } from '../registry';

// -----------------------------------------------------------------------------
// Input schema (period enum). userId vem do ToolContext, NAO do input.
// -----------------------------------------------------------------------------

const inputSchema = z.object({
  period: z.enum(['7d', '30d', '90d']),
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const TOP_LESSONS_CAP = 10;

interface CompliancePayload {
  total: number;
  completed: number;
  complianceRate: number;
}

interface ImpactPayload {
  withCooldown: { avgRoi: number };
  withoutCooldown: { avgRoi: number };
  delta: number;
}

function buildStarredAggregate(rows: Array<{ type: string; count: number }>) {
  const byType: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const t = String(r.type);
    const c = Number(r.count) || 0;
    byType[t] = (byType[t] ?? 0) + c;
    total += c;
  }
  return { byType, total };
}

function buildLessonTokens(
  rows: Array<{ token: string; count: number }>,
): string[] {
  // Storage ja retorna ordenado por count desc; truncamos a TOP_LESSONS_CAP.
  return rows
    .slice(0, TOP_LESSONS_CAP)
    .map((r) => String(r.token))
    .filter((s) => typeof s === 'string' && s.length > 0);
}

/**
 * Retorna impact apenas se ha grupo "with" (ao menos 1 cool-down completo)
 * E grupo "without" (ao menos 1 sessao sem cool-down).
 */
function buildImpact(
  compliance: CompliancePayload,
  raw: ImpactPayload,
):
  | {
      withCooldownAvgRoi: number;
      withoutCooldownAvgRoi: number;
      delta: number;
      withCount: number;
      withoutCount: number;
    }
  | undefined {
  const withCount = compliance.completed;
  const withoutCount = Math.max(0, compliance.total - compliance.completed);
  if (withCount <= 0 || withoutCount <= 0) return undefined;
  return {
    withCooldownAvgRoi: Number(raw.withCooldown?.avgRoi ?? 0),
    withoutCooldownAvgRoi: Number(raw.withoutCooldown?.avgRoi ?? 0),
    delta: Number(raw.delta ?? 0),
    withCount,
    withoutCount,
  };
}

// -----------------------------------------------------------------------------
// Tool descriptor
// -----------------------------------------------------------------------------

export const readCooldownHistoryTool: CoachTool<{ period: '7d' | '30d' | '90d' }, any> = {
  name: 'read_cooldown_history',
  description:
    'Le historico recente de rituais de cool-down do usuario (compliance, ' +
    'distribuicao de starred hands por tipo, top 10 tokens de licao, e impact ' +
    'em ROI quando ha grupo controle). Retorna apenas dados agregados — sem ' +
    'notes, cGame, action ou texto livre.',
  inputSchema,
  requiresConfirmation: false,
  auditLevel: 'log',
  gateByTier: ['pro', 'premium', 'admin'],

  async handler(input, ctx) {
    const period = input.period;
    const userId = ctx.userId;

    // Lazy import — evita TDZ em testes que mockam server/storage com closure
    // capturando const declarado abaixo de vi.mock (vitest 4 / rolldown hoisting).
    const { storage } = await import('../../storage');

    try {
      // Reusa storage Sprint 2 (paralelo).
      const [compliance, starred, lessons, impactRaw] = await Promise.all([
        storage.getCooldownComplianceMetrics(userId, period),
        storage.getStarredHandsDistribution(userId, period),
        storage.getTopLessons(userId, period),
        storage.getCooldownImpactMetrics(userId, period),
      ]);

      const data: any = {
        period,
        totalSessions: Number(compliance.total) || 0,
        cooldownCount: Number(compliance.completed) || 0,
        complianceRate: Number(compliance.complianceRate) || 0,
        starredHands: buildStarredAggregate(starred ?? []),
        recentLessons: buildLessonTokens(lessons ?? []),
      };

      const impact = buildImpact(compliance, impactRaw);
      if (impact !== undefined) {
        data.impact = impact;
      }

      return {
        __type: 'ToolResult',
        tool: 'read_cooldown_history',
        ok: true,
        data,
      };
    } catch (err) {
      // Loga (lessons-learned #9): nao engole erros silenciosamente.
      // eslint-disable-next-line no-console
      console.error('[read_cooldown_history] storage error', {
        userId,
        period,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        __type: 'ToolResult',
        tool: 'read_cooldown_history',
        ok: false,
        code: 'storage_error',
        message: 'Falha ao consultar historico de cool-down.',
      };
    }
  },
};
