// =============================================================================
// logDailyGoalReportTool — ADR-241 (Metas: relatorio diario / calendario)
//
// Write tool (confirm v1). Registra o relatorio do dia no calendario de metas:
// medidas de direcao exercidas + nota + nº torneios + horas/conteudo de estudo +
// aprendizado + o que fez de bom/ruim. Idempotente por dia (UPSERT user+data).
// RF-06: SEM P&L. `date` default = hoje (UTC).
// =============================================================================

import { z } from "zod";

export const logDailyGoalReportInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  measuresExercised: z
    .array(
      z.object({
        measureId: z.string().min(1).max(48),
        sourceMetric: z.string().max(48).optional(),
        value: z.number().nullable().optional(),
      }),
    )
    .max(10)
    .optional(),
  note: z.string().max(2000).optional(),
  tournamentsPlayed: z.number().int().min(0).max(1000).optional(),
  studyHours: z.number().min(0).max(24).optional(),
  studyContent: z.string().max(2000).optional(),
  learning: z.string().max(2000).optional(),
  didGood: z.string().max(2000).optional(),
  didBad: z.string().max(2000).optional(),
});

export type LogDailyGoalReportInput = z.infer<typeof logDailyGoalReportInputSchema>;

function todayUtcYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod: any = await import("../../storage");
  return mod.storage;
}

// Campos editaveis do relatorio do dia (SSoT do payload — buildPayload + undo).
const EDITABLE_FIELDS = [
  "measuresExercised",
  "note",
  "tournamentsPlayed",
  "studyHours",
  "studyContent",
  "learning",
  "didGood",
  "didBad",
] as const;

function buildPayload(input: LogDailyGoalReportInput): any {
  const out: any = {};
  for (const f of EDITABLE_FIELDS) {
    if ((input as any)[f] !== undefined) out[f] = (input as any)[f];
  }
  return out;
}

async function preview(
  input: LogDailyGoalReportInput,
  ctx: { userId: string; injectedStorage?: any },
): Promise<any> {
  const date = input.date ?? todayUtcYmd();
  const storage = await resolveStorage(ctx.injectedStorage);
  // Promise.resolve(...) cobre storage mockado parcial sem getGoalDailyLog
  // (optional-chaining retorna undefined e undefined.catch lancaria TypeError).
  const before = await Promise.resolve(storage.getGoalDailyLog?.(ctx.userId, date)).catch(() => null);
  return {
    payloadBefore: before ?? null,
    payloadAfter: { date, ...buildPayload(input) },
  };
}

async function executeConfirmed(
  input: LogDailyGoalReportInput,
  ctx: { userId: string; injectedStorage?: any },
  _tx?: any,
): Promise<any> {
  const date = input.date ?? todayUtcYmd();
  const storage = await resolveStorage(ctx.injectedStorage);
  const before = await Promise.resolve(storage.getGoalDailyLog?.(ctx.userId, date)).catch(() => null);
  const saved = await storage.upsertGoalDailyLog(ctx.userId, date, buildPayload(input));
  return {
    payloadBefore: before ?? null,
    payloadAfter: saved,
    affectedEntityType: "goal_daily_log",
    affectedEntityId: saved?.id ?? null,
    output: {
      date,
      message: "Relatorio do dia registrado.",
    },
  };
}

async function undo(
  before: any,
  payloadAfter: any,
  ctx: { userId: string; injectedStorage?: any },
  _tx?: any,
): Promise<{ reversedEntityType: string; reversedEntityId?: string }> {
  const storage = await resolveStorage(ctx.injectedStorage);
  const date = payloadAfter?.logDate ?? payloadAfter?.date;
  // UPSERT idempotente -> undo restaura o estado anterior (se existia). Sem
  // estado anterior, re-grava vazio (no-op pratico). Best-effort. Deriva os
  // campos da lista unica (measuresExercised default [], demais default null).
  if (date) {
    const restore = Object.fromEntries(
      EDITABLE_FIELDS.map((f) => [f, before?.[f] ?? (f === "measuresExercised" ? [] : null)]),
    );
    await storage.upsertGoalDailyLog?.(ctx.userId, date, restore);
  }
  return { reversedEntityType: "goal_daily_log", reversedEntityId: payloadAfter?.id ?? undefined };
}

export const logDailyGoalReportTool = {
  name: "log_daily_goal_report",
  description:
    "Registra o relatorio do dia no calendario de metas (medidas de direcao exercidas, nota, nº torneios, horas/conteudo de estudo, aprendizado, o que fez de bom/ruim). Idempotente por dia. NUNCA registre P&L. Confirme antes.",
  inputSchema: logDailyGoalReportInputSchema,
  requiresConfirmation: true as const,
  auditLevel: "persist" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  preview,
  executeConfirmed,
  undo,
  handler: async () => {
    throw new Error("write_tool_use_executeConfirmed");
  },
};
