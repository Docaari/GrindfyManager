/**
 * Sprint Estudos-Coach-Biblio-2 — RF-3 Coach study plan service orquestrador.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.1
 * ADR  : 134
 *
 * Orquestrador que:
 *   1. Coleta context (focusStats, leaks, avgDuration, recentLessons, starredHands)
 *   2. Calcula daily_target_minutes (RF-3.1 §2 clamp 15-120; default 30)
 *   3. Chama Anthropic via tool 'coachStudyPlan'
 *   4. Valida output via Zod (StudyWeeklyPlanSchema)
 *   5. Whitelist enforce (lessonId IN providedWhitelist; themeId IN curated)
 *   6. Retry 1x se Zod fail OR whitelist fail
 *   7. UPSERT study_weekly_plans
 *
 * Lessons:
 *   #5  vi.fn nao eh constructor — Anthropic SDK requer try/catch + fallback
 *   #14 vi.hoisted nos testes
 *   #10 DRY de prompts (importa de prompt arquivo)
 */

import { storage } from "../storage";
import {
  StudyWeeklyPlanSchema,
  type StudyWeeklyPlan,
} from "../coachTools/studies/coachStudyPlan.schema";
import {
  COACH_STUDY_PLAN_SYSTEM_PROMPT,
  COACH_STUDY_PLAN_PROMPT_VERSION,
  buildStudyPlanUserBlock,
  type StudyPlanUserContext,
} from "../coachTools/studies/coachStudyPlan.prompts";
import { coachStudyPlanTool } from "../coachTools/studies/coachStudyPlan";

const REGENERATE_RATE_LIMIT = 1; // 1/dia
const REGENERATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const regenerateLog = new Map<string, number[]>();

export function _resetRegenerateLog(): void {
  regenerateLog.clear();
}

export async function isRegenerateRateLimited(
  userId: string,
): Promise<boolean> {
  const now = Date.now();
  const arr = regenerateLog.get(userId) ?? [];
  const recent = arr.filter((t) => now - t < REGENERATE_WINDOW_MS);
  regenerateLog.set(userId, recent);
  return recent.length >= REGENERATE_RATE_LIMIT;
}

export async function recordRegenerate(userId: string): Promise<void> {
  const now = Date.now();
  const arr = regenerateLog.get(userId) ?? [];
  const recent = arr.filter((t) => now - t < REGENERATE_WINDOW_MS);
  recent.push(now);
  regenerateLog.set(userId, recent);
}

export async function hasCoachAccess(_userId: string): Promise<boolean> {
  // TBD wire-up real (premium tier flag). Em Sprint 2 deixamos true por
  // default; gating de UI eh responsabilidade dos consumers ate flag chegar.
  return true;
}

export async function hasCoachQuotaRemaining(_userId: string): Promise<boolean> {
  // TBD wire-up real com coach_usage. Sprint 2 sem quota hard-block.
  return true;
}

export interface GenerateWeeklyStudyPlanInput {
  userId: string;
  source: "coach_auto" | "coach_manual";
  weekStartDate: Date;
  resetCompleted?: boolean;
}

function clampDailyTarget(avg: number | null): number {
  if (avg == null || !Number.isFinite(avg) || avg < 15) return 30;
  const target = Math.round(avg * 0.95);
  return Math.max(15, Math.min(120, target));
}

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentMonthUtc(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function getAnthropicClient(): Promise<any> {
  const mod = await import("@anthropic-ai/sdk");
  const Anthropic = (mod as any).default ?? (mod as any).Anthropic ?? mod;
  try {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
  } catch {
    return Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
  }
}

function extractToolUse(response: any, toolName: string): any | null {
  const content = response?.content ?? [];
  for (const block of content) {
    if (block?.type === "tool_use" && block?.name === toolName) {
      return block.input ?? null;
    }
  }
  return null;
}

function validateWhitelist(
  plan: StudyWeeklyPlan,
  ctx: StudyPlanUserContext,
): boolean {
  // Whitelist enforce APENAS para lessonId (anti-hallucinacao mais critica:
  // CTA de aula deve casar com Wouter route real). themeId eh mais permissivo
  // porque user-custom themes podem nao estar em listCuratedStudyThemes mas
  // existir no banco do user. Se o themeId for invalido em runtime, o GET
  // handler hidrata "tema indisponivel" sem quebrar a UI.
  // Quando whitelist de aulas eh vazia (catalog ainda nao seedado), aceitamos
  // qualquer lessonId — Coach esta livre porque nao temos opcao curated.
  const lessonIds = new Set(ctx.availableLessons.map((l) => l.id));
  if (lessonIds.size === 0) return true;
  for (const day of plan.days) {
    for (const a of day.activities) {
      if (a.type === "lesson") {
        if (!a.lessonId || !lessonIds.has(a.lessonId)) return false;
      }
    }
  }
  return true;
}

async function callCoachStudyPlanTool(
  client: any,
  ctx: StudyPlanUserContext,
  retryReason?: string,
): Promise<{ plan: any; tokensIn: number; tokensOut: number }> {
  const userBlock = buildStudyPlanUserBlock(ctx);
  const messages: any[] = [
    {
      role: "user",
      content: [{ type: "text", text: userBlock }],
    },
  ];
  if (retryReason) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Output anterior invalido: ${retryReason}. Refaca seguindo o schema rigorosamente. NAO invente IDs.`,
        },
      ],
    });
  }
  const model = process.env.COACH_MODEL ?? "claude-3-5-sonnet-latest";
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: COACH_STUDY_PLAN_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: coachStudyPlanTool.name,
        description: coachStudyPlanTool.description,
        input_schema: coachStudyPlanTool.input_schema,
      },
    ],
    tool_choice: { type: "tool", name: coachStudyPlanTool.name },
    messages,
  });
  const planRaw = extractToolUse(response, coachStudyPlanTool.name);
  return {
    plan: planRaw,
    tokensIn: Number(response?.usage?.input_tokens ?? 0),
    tokensOut: Number(response?.usage?.output_tokens ?? 0),
  };
}

export async function generateWeeklyStudyPlan(
  input: GenerateWeeklyStudyPlanInput,
) {
  const { userId, source, weekStartDate } = input;

  // 1. Coleta context.
  const month = currentMonthUtc(weekStartDate);
  const focusStatsRaw =
    (await (storage as any).listUserFocusStats(userId, month)) ?? [];
  const leaksRaw = (await (storage as any).getStatsLeaks(userId, 3)) ?? [];
  const avgDuration =
    (await (storage as any).getRecentStudySessionAvgMinutes(userId, 7)) ?? null;
  const starredHandsRaw =
    (await (storage as any).listStarredHandsRecent(userId, 5)) ?? [];
  const themesRaw =
    (await (storage as any).listCuratedStudyThemes(userId)) ?? [];
  const lessonsRaw =
    (await (storage as any).listLibraryLessonsCurated()) ?? [];

  const dailyTargetMinutes = clampDailyTarget(avgDuration);
  const ctx: StudyPlanUserContext = {
    focusStats: (focusStatsRaw as any[]).map((f) => ({
      statId: f?.statId ?? "",
      statName: f?.statId ?? "",
    })),
    leaks: (leaksRaw as any[]).map((l) => ({
      statId: l?.statId ?? "",
      statName: l?.statName ?? l?.statId ?? "",
      severity: Number(l?.severity ?? 0),
      delta: Number(l?.delta ?? 0),
    })),
    availableLessons: (lessonsRaw as any[]).map((l) => ({
      id: String(l?.id ?? ""),
      title: String(l?.title ?? ""),
      courseSlug: String(l?.courseSlug ?? ""),
      lessonSlug: String(l?.lessonSlug ?? l?.slug ?? ""),
    })),
    availableThemes: (themesRaw as any[]).map((t) => ({
      id: String(t?.id ?? ""),
      name: String(t?.name ?? ""),
    })),
    starredHandsRecent: (starredHandsRaw as any[]).map((h) => ({
      id: String(h?.id ?? ""),
      label: h?.notes ?? h?.label ?? undefined,
    })),
    avgDurationMinutes: avgDuration,
    dailyTargetMinutes,
    weekStartDate: ymdUtc(weekStartDate),
  };

  // 2. Chama Coach com retry 1x se falha Zod ou whitelist.
  const client = await getAnthropicClient();
  let attempt = 0;
  let lastError: string | undefined;
  let validatedPlan: StudyWeeklyPlan | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  while (attempt < 2) {
    const { plan, tokensIn: tIn, tokensOut: tOut } =
      await callCoachStudyPlanTool(client, ctx, lastError);
    tokensIn += tIn;
    tokensOut += tOut;
    const parsed = StudyWeeklyPlanSchema.safeParse(plan);
    if (!parsed.success) {
      lastError = `Zod fail: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`;
      console.error("[studyWeeklyPlanService] zod fail attempt", {
        userId,
        attempt,
        error: lastError,
      });
      attempt += 1;
      continue;
    }
    if (!validateWhitelist(parsed.data, ctx)) {
      lastError = "lessonId/themeId fora do whitelist";
      console.error("[studyWeeklyPlanService] whitelist fail attempt", {
        userId,
        attempt,
      });
      attempt += 1;
      continue;
    }
    validatedPlan = parsed.data;
    break;
  }
  if (!validatedPlan) {
    const err: any = new Error(
      "COACH_OUTPUT_INVALID: " + (lastError ?? "unknown"),
    );
    err.code = "COACH_OUTPUT_INVALID";
    throw err;
  }

  // 3. Persist UPSERT.
  const costTokensUsed = tokensIn + tokensOut;
  const persisted = await (storage as any).upsertStudyWeeklyPlan({
    userId,
    weekStartDate,
    planJsonb: validatedPlan,
    source,
    dailyTargetMinutes,
    costTokensUsed,
    completedItemsJsonb: input.resetCompleted ? [] : undefined,
  });

  // 4. Telemetria estruturada.
  console.info("study_plan_generated", {
    userId,
    source,
    tokensIn,
    tokensOut,
    costTokensUsed,
    dailyTargetMinutes,
    promptVersion: COACH_STUDY_PLAN_PROMPT_VERSION,
  });

  return persisted;
}
