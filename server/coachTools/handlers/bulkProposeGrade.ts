// =============================================================================
// bulkProposeGrade — Sprint AI-2A / RF-02 (ADR-165)
//
// Sugere grade da semana em pacote. Strict/non-strict + dedup intra-pacote +
// conflicts vs grade existente + off-days + wallet check.
//
// Lessons aplicadas:
//   - #9 try/catch por dayOfWeek (scoring_error nao trava outros).
//   - #34 injectedStorage 3o arg.
//   - #11 default minimo.
// =============================================================================

import { z } from "zod";

export const bulkProposeGradeInputSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStartDate must be YYYY-MM-DD"),
  profile: z.enum(["A", "B", "C"]),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .default([1, 2, 3, 4, 5, 6, 0]),
  maxTournaments: z.number().int().min(1).max(20).optional().default(15),
  strict: z.boolean().optional().default(false),
});

export type BulkProposeGradeInput = z.infer<typeof bulkProposeGradeInputSchema>;

interface Proposed {
  dayOfWeek: number;
  site: string;
  name: string;
  time: string;
  type: string;
  speed?: string;
  buyIn: number;
  prioridade?: number;
}

interface Conflict {
  dayOfWeek: number;
  reason: string;
  detail?: string;
  site?: string;
  name?: string;
  time?: string;
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

async function getWalletBalanceUsd(userId: string): Promise<number> {
  try {
    const ws: any = await import("../../services/walletService");
    const fn = ws.getConsolidatedBalance ?? ws.default?.getConsolidatedBalance;
    if (typeof fn !== "function") return Number.POSITIVE_INFINITY;
    const res = await fn(userId);
    if (typeof res === "number") return res;
    if (res && typeof res === "object") return Number(res.totalUSD ?? res.totalUsd ?? 0);
    return Number.POSITIVE_INFINITY;
  } catch (err) {
    console.error("bulk_propose_grade.balance.error", { userId, err });
    return Number.POSITIVE_INFINITY; // safe-allow — nao bloqueia por DB transitorio
  }
}

function dateOfDayOfWeek(weekStartDate: string, dayOfWeek: number): Date {
  // weekStartDate (assumed monday) + offset days
  const [y, m, d] = weekStartDate.split("-").map((s) => Number(s));
  const start = new Date(Date.UTC(y, m - 1, d));
  // Map: Monday=1, Sunday=0/7 — we use Monday=1..Saturday=6, Sunday=0/7
  // Convention: dayOfWeek matches JS Date.getDay() (0=Sun..6=Sat)
  // From a Monday weekStart, offset = (dayOfWeek + 6) % 7
  const offset = (dayOfWeek + 6) % 7;
  start.setUTCDate(start.getUTCDate() + offset);
  return start;
}

async function buildPreview(
  input: BulkProposeGradeInput,
  ctx: any,
): Promise<{
  proposed: Proposed[];
  conflicts: Conflict[];
  strictWouldReject: boolean;
  summary: { totalBuyIn: number; estimatedHours: number; count: number };
}> {
  const store = await resolveStorage(ctx?.injectedStorage);
  const daysOfWeek = input.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 0];

  const proposed: Proposed[] = [];
  const conflicts: Conflict[] = [];

  // Off days
  let offDays: Date[] = [];
  try {
    offDays = (await store.listOffDaysForUser?.(ctx.userId)) ?? [];
  } catch (err) {
    console.error("bulk_propose_grade.offdays.error", { userId: ctx.userId, err });
  }
  const offDayKeys = new Set(offDays.map((d) => new Date(d).toISOString().slice(0, 10)));

  // Planned existentes
  let planned: any[] = [];
  try {
    planned = (await store.listPlannedTournaments?.(ctx.userId)) ?? [];
  } catch (err) {
    console.error("bulk_propose_grade.list_planned.error", { userId: ctx.userId, err });
    planned = [];
  }

  // Para cada dia
  for (const day of daysOfWeek) {
    const dayDate = dateOfDayOfWeek(input.weekStartDate, day);
    const dayKey = dayDate.toISOString().slice(0, 10);

    if (offDayKeys.has(dayKey)) {
      conflicts.push({ dayOfWeek: day, reason: "off_day", detail: dayKey });
      continue;
    }

    let suggestions: any[] = [];
    try {
      suggestions = (await store.getTournamentSuggestions?.({
        userId: ctx.userId,
        dayOfWeek: day,
        profile: input.profile,
        weekStartDate: input.weekStartDate,
      })) ?? [];
    } catch (err) {
      conflicts.push({
        dayOfWeek: day,
        reason: "scoring_error",
        detail: err instanceof Error ? err.message : String(err),
      });
      console.error("bulk_propose_grade.scoring.error", { day, err });
      continue;
    }

    // Verifica time_overlap intra-pacote (no mesmo day)
    const seenTimes = new Set<string>();
    for (const s of suggestions) {
      const time = s.time ?? "00:00";
      if (seenTimes.has(time)) {
        conflicts.push({
          dayOfWeek: day,
          reason: "time_overlap",
          site: s.site,
          name: s.name,
          time,
        });
        continue;
      }
      seenTimes.add(time);

      // already_in_grade?
      const inGrade = planned.find(
        (p: any) =>
          p.site === s.site &&
          p.name === s.name &&
          (p.time === time || (p.time ?? "").slice(0, 5) === time.slice(0, 5)) &&
          Number(p.dayOfWeek) === day,
      );
      if (inGrade) {
        conflicts.push({
          dayOfWeek: day,
          reason: "already_in_grade",
          site: s.site,
          name: s.name,
          time,
        });
        continue;
      }

      proposed.push({
        dayOfWeek: day,
        site: s.site,
        name: s.name,
        time,
        type: s.type ?? "Vanilla",
        speed: s.speed ?? "Normal",
        buyIn: Number(s.buyIn ?? 0),
        prioridade: s.prioridade ?? 2,
      });
      if (proposed.length >= input.maxTournaments) break;
    }
    if (proposed.length >= input.maxTournaments) break;
  }

  // Wallet check (total buy-in vs balance*2)
  const totalBuyIn = proposed.reduce((a, p) => a + p.buyIn, 0);
  const balance = await getWalletBalanceUsd(ctx.userId);
  if (totalBuyIn * 2 > balance) {
    conflicts.push({
      dayOfWeek: -1,
      reason: "wallet_below_threshold",
      detail: `total ${totalBuyIn} * 2 > balance ${balance}`,
    });
  }

  const estimatedHours = Math.round(proposed.length * 3 * 10) / 10; // ~3h per MTT
  const summary = { totalBuyIn, estimatedHours, count: proposed.length };
  const strictWouldReject = conflicts.length > 0;
  return { proposed, conflicts, strictWouldReject, summary };
}

async function fetchPayloadBefore(
  input: BulkProposeGradeInput,
  ctx: any,
  _tx: any,
): Promise<{ preview: any }> {
  const parsed = bulkProposeGradeInputSchema.parse(input);
  const preview = await buildPreview(parsed, ctx);
  return { preview };
}

async function executeConfirmed(
  input: BulkProposeGradeInput,
  ctx: any,
  _tx: any,
): Promise<any> {
  const parsed = bulkProposeGradeInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);
  const preview = await buildPreview(parsed, ctx);
  if (parsed.strict && preview.strictWouldReject) {
    throw new Error("strict_conflict");
  }
  const createdIds: string[] = [];
  const skippedReasons: string[] = [];

  for (const p of preview.proposed) {
    try {
      const row = await store.createPlannedTournament?.({
        userId: ctx.userId,
        site: p.site,
        name: p.name,
        time: p.time,
        type: p.type,
        speed: p.speed,
        buyIn: p.buyIn,
        dayOfWeek: p.dayOfWeek,
        profile: parsed.profile,
        prioridade: p.prioridade,
        weekStartDate: parsed.weekStartDate,
      });
      if (row?.id) createdIds.push(row.id);
    } catch (err) {
      skippedReasons.push(err instanceof Error ? err.message : String(err));
      console.error("bulk_propose_grade.create.error", { p, err });
    }
  }

  return {
    payloadAfter: {
      createdIds,
      summary: preview.summary,
      skipped: skippedReasons.length,
      skippedReasons,
    },
    affectedEntityType: "planned_tournament",
    affectedEntityId: createdIds.join(","),
    output: {
      registered: createdIds.length,
      skipped: skippedReasons.length,
      conflicts: preview.conflicts,
    },
  };
}

async function undo(
  _before: any,
  payloadAfter: any,
  ctx: any,
  _tx: any,
): Promise<{ reversedEntityType: string }> {
  const store = await resolveStorage(ctx?.injectedStorage);
  const ids: string[] = payloadAfter?.createdIds ?? [];
  if (ids.length > 0 && typeof store.deletePlannedTournamentsByIds === "function") {
    await store.deletePlannedTournamentsByIds(ids);
  }
  return { reversedEntityType: "planned_tournament" };
}

export const bulkProposeGradeTool = {
  name: "bulk_propose_grade" as const,
  description:
    "Propoe um pacote da grade semanal em lote (multiplos dias). Modo strict rejeita qualquer conflito; non-strict registra o resto.",
  inputSchema: bulkProposeGradeInputSchema,
  requiresConfirmation: true as const,
  auditLevel: "persist" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  fetchPayloadBefore,
  executeConfirmed,
  undo,
  handler: async () => {
    throw new Error("write_tool_use_executeConfirmed");
  },
};
