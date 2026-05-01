/**
 * Coach tool — read_user_bankroll_history
 *
 * Sprint Bankroll-Reports-Detail (RF-07)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md (D12)
 * ADR-069
 *
 * Le history unificado (sessoes + manual_reports) via helper compartilhado
 * `getGrindSessionHistory` (mesma source que GET /api/grind-sessions/history).
 * Retorna entries com `type: 'session' | 'manual_report'` para Coach distinguir
 * "voce reportou perda externa" vs "voce perdeu na sessao registrada".
 *
 * Lessons:
 *   #10 — DRY de prompts: tool reusa source unica (nao duplica logica de cluster).
 */

import { z } from "zod";
import { getGrindSessionHistory } from "../../services/grindSessionHistory";

const inputSchema = z.object({
  limit: z.number().int().positive().max(200).optional(),
  filter: z.enum(["all", "sessions", "reports"]).optional(),
});

interface ReadUserBankrollHistoryInput {
  userId?: string; // ctx.userId tem precedencia
  limit?: number;
  filter?: "all" | "sessions" | "reports";
}

interface ReadUserBankrollHistoryOutput {
  entries: Array<{
    type: "session" | "manual_report";
    id: string;
    occurredAt: string;
    profitUsd: number;
    platformsAffected: string[];
    detailsAvailable: boolean;
    tournamentsCount?: number;
    transactionIds?: string[];
  }>;
}

/**
 * Tool exportada como objeto compativel com CoachTool registry,
 * mas com `execute()` direto (assinatura usada pelos tests do sprint).
 */
export const readUserBankrollHistoryTool = {
  name: "read_user_bankroll_history",
  description:
    "Le historico unificado de bankroll (sessoes registradas + manual_reports). " +
    "Cada entry tem `type: 'session' | 'manual_report'`: 'session' = jogo registrado " +
    "no app via grind; 'manual_report' = saldo reportado pelo usuario sem sessao " +
    "(ex: jogou fora do app, retirada externa). Use o type para distinguir analises " +
    "de pace de jogo vs movimentos extra-sessao no bankroll.",
  inputSchema,
  input_schema: {
    type: "object" as const,
    properties: {
      limit: { type: "number" },
      filter: { type: "string", enum: ["all", "sessions", "reports"] },
    },
  },
  parameters: {
    type: "object" as const,
    properties: {
      limit: { type: "number" },
      filter: { type: "string", enum: ["all", "sessions", "reports"] },
    },
  },
  requiresConfirmation: false,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,

  async execute(
    input: ReadUserBankrollHistoryInput,
  ): Promise<ReadUserBankrollHistoryOutput> {
    const userId = input.userId;
    if (!userId) {
      return { entries: [] };
    }
    const entries = await getGrindSessionHistory(userId, {
      filter: input.filter,
      limit: input.limit,
    });

    // Back-compat: se helper retornar entry sem `type`, default para 'session'.
    const tagged = (entries ?? []).map((e: any) => {
      if (!e.type) {
        return { ...e, type: "session" as const };
      }
      return e;
    });

    return { entries: tagged };
  },

  // Compat com CoachTool registry (handler signature)
  async handler(
    input: ReadUserBankrollHistoryInput,
    ctx: { userId: string },
  ): Promise<any> {
    const merged = { ...input, userId: ctx?.userId ?? input.userId };
    try {
      const result = await this.execute(merged);
      return {
        __type: "ToolResult",
        tool: "read_user_bankroll_history",
        ok: true,
        data: result,
      };
    } catch (err) {
      console.error("[read_user_bankroll_history] error", err);
      return {
        __type: "ToolResult",
        tool: "read_user_bankroll_history",
        ok: false,
        code: "internal_error",
        message: "Falha ao consultar historico de bankroll.",
      };
    }
  },
};
