/**
 * Sprint Estudos-Coach-Biblio-2 — RF-4 Coach session insights service orquestrador.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.3
 * ADRs : 133 (cache em tabela) + 134 (tools modulares)
 *
 * Orquestrador que:
 *   1. Ownership + finalized check
 *   2. Cache check (24h em tabela coach_session_insights)
 *   3. Coleta context (session, tournaments, spots, focusStats, lessons)
 *   4. Chama Anthropic via tool 'coachSessionInsights'
 *   5. Valida output via Zod (SessionInsightsSchema)
 *   6. Whitelist enforce: handId IN sessionSpotIds
 *   7. Retry 1x se Zod fail OR whitelist fail
 *   8. UPSERT coach_session_insights (UNIQUE grind_session_id)
 *
 * Lessons:
 *   #5 vi.fn nao constructor — Anthropic via try/catch
 *   #14 vi.hoisted nos testes
 */

import { storage } from "../storage";
import {
  SessionInsightsSchema,
  type SessionInsights,
} from "../coachTools/grind-live/coachSessionInsights.schema";
import {
  COACH_SESSION_INSIGHTS_SYSTEM_PROMPT,
  COACH_SESSION_INSIGHTS_PROMPT_VERSION,
  buildSessionInsightsUserBlock,
  type SessionInsightsUserContext,
} from "../coachTools/grind-live/coachSessionInsights.prompts";
import { coachSessionInsightsTool } from "../coachTools/grind-live/coachSessionInsights";

const REGENERATE_RATE_LIMIT_PER_SESSION = 3;
const regenerateLog = new Map<string, number[]>();
const REGENERATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function _resetForTests(): void {
  regenerateLog.clear();
}

export async function isCoachInsightsRateLimited(
  sessionId: string,
): Promise<boolean> {
  const now = Date.now();
  const arr = regenerateLog.get(sessionId) ?? [];
  const recent = arr.filter((t) => now - t < REGENERATE_WINDOW_MS);
  regenerateLog.set(sessionId, recent);
  return recent.length >= REGENERATE_RATE_LIMIT_PER_SESSION;
}

export async function recordCoachInsightsRegenerate(
  sessionId: string,
): Promise<void> {
  const now = Date.now();
  const arr = regenerateLog.get(sessionId) ?? [];
  const recent = arr.filter((t) => now - t < REGENERATE_WINDOW_MS);
  recent.push(now);
  regenerateLog.set(sessionId, recent);
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
  insights: SessionInsights,
  ctx: SessionInsightsUserContext,
): boolean {
  // Anti-hallucinacao SO se aplica quando o whitelist tem entries — Coach
  // pode estar livre quando contexto eh muito magro (sessao sem spots, sem
  // catalog). Quando whitelist eh populada, IDs fora dela viram retry.
  const spotIds = new Set(ctx.sessionSpotIds);
  if (spotIds.size > 0) {
    for (const h of insights.topHands) {
      if (!spotIds.has(h.handId)) return false;
    }
    for (const s of insights.spotsToReview) {
      if (!spotIds.has(s.spotId)) return false;
    }
  }
  const lessonIds = new Set(ctx.availableLessons.map((l) => l.id));
  if (lessonIds.size > 0) {
    for (const l of insights.suggestedLessons) {
      if (!lessonIds.has(l.lessonId)) return false;
    }
  }
  return true;
}

async function callCoachSessionInsightsTool(
  client: any,
  ctx: SessionInsightsUserContext,
  retryReason?: string,
): Promise<{ insights: any; tokensIn: number; tokensOut: number; model: string }> {
  const userBlock = buildSessionInsightsUserBlock(ctx);
  const messages: any[] = [
    { role: "user", content: [{ type: "text", text: userBlock }] },
  ];
  if (retryReason) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Output anterior invalido: ${retryReason}. Refaca seguindo o schema. NAO invente IDs.`,
        },
      ],
    });
  }
  const model = process.env.COACH_MODEL ?? "claude-3-5-sonnet-latest";
  const response = await client.messages.create({
    model,
    max_tokens: 3000,
    system: [
      {
        type: "text",
        text: COACH_SESSION_INSIGHTS_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: coachSessionInsightsTool.name,
        description: coachSessionInsightsTool.description,
        input_schema: coachSessionInsightsTool.input_schema,
      },
    ],
    tool_choice: { type: "tool", name: coachSessionInsightsTool.name },
    messages,
  });
  const insightsRaw = extractToolUse(response, coachSessionInsightsTool.name);
  return {
    insights: insightsRaw,
    tokensIn: Number(response?.usage?.input_tokens ?? 0),
    tokensOut: Number(response?.usage?.output_tokens ?? 0),
    model: String(response?.model ?? model),
  };
}

export interface GetOrGenerateInput {
  userId: string;
  sessionId: string;
  force?: boolean;
}

export async function getOrGenerateCoachSessionInsights(
  input: GetOrGenerateInput,
): Promise<{
  cached: boolean;
  generatedAt: string;
  expiresAt: string;
  insights: SessionInsights;
}> {
  const { userId, sessionId, force } = input;

  // 1. Ownership + finalized check.
  const session = await (storage as any).getGrindSession(sessionId);
  if (!session) {
    const e: any = new Error("SESSION_NOT_FOUND");
    e.code = "SESSION_NOT_FOUND";
    throw e;
  }
  if (session.userId !== userId) {
    const e: any = new Error("NOT_OWNER");
    e.code = "NOT_OWNER";
    throw e;
  }
  // status pode ser 'completed', 'finalized', etc. Aceitar 'completed'.
  if (session.status !== "completed" && session.status !== "finalized") {
    const e: any = new Error("SESSION_NOT_FINALIZED");
    e.code = "SESSION_NOT_FINALIZED";
    throw e;
  }

  // 2. Cache check (skipa se force=true).
  if (!force) {
    const cached = await (storage as any).getCoachSessionInsights(
      sessionId,
      userId,
    );
    if (cached) {
      // Sprint Spot-Anki-Reentry-3 RF-4 — enriquece spotsToReview com
      // reentryCandidate/reentryAlreadyActive/reentryReason. Stateless:
      // computado a cada GET (campos NAO persistidos em jsonb).
      const cachedInsights = cached.insightsJsonb as SessionInsights;
      let enriched = cachedInsights;
      try {
        const { enrichSpotsToReviewWithReentry } = await import(
          "./spotReentry/enrichSpotsToReview"
        );
        const enrichedSpots = await enrichSpotsToReviewWithReentry(
          (cachedInsights as any).spotsToReview ?? [],
          userId,
        );
        enriched = {
          ...cachedInsights,
          spotsToReview: enrichedSpots as any,
        };
      } catch (enrichErr) {
        // Enrichment best-effort: log e segue sem campos extras.
        console.warn(
          "[coachSessionInsightsService] enrich failed (cached path)",
          enrichErr,
        );
      }
      return {
        cached: true,
        generatedAt: new Date(cached.generatedAt).toISOString(),
        expiresAt: new Date(cached.expiresAt).toISOString(),
        insights: enriched,
      };
    }
  }

  // 3. Coleta context.
  const tournaments =
    (await (storage as any).getTournamentsByGrindSession(sessionId)) ?? [];
  const spots =
    (await (storage as any).getStarredHandsByGrindSession(sessionId)) ?? [];
  const month = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const focusStatsRaw =
    (await (storage as any).listUserFocusStats(userId, month)) ?? [];
  const lessonsRaw =
    (await (storage as any).listLibraryLessonsCurated()) ?? [];

  const profitUsd = (tournaments as any[]).reduce(
    (acc, t) => acc + Number(t?.profitUsd ?? 0),
    0,
  );
  const sessionDate =
    session.date != null
      ? new Date(session.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const durationHours = Number(session?.durationHours ?? 0);

  const ctx: SessionInsightsUserContext = {
    sessionDate,
    tournamentsCount: (tournaments as any[]).length,
    durationHours,
    profitUsd,
    spots: (spots as any[]).map((s) => ({
      id: String(s?.id ?? ""),
      label: s?.notes ?? s?.label ?? "Spot sem label",
    })),
    sessionSpotIds: (spots as any[]).map((s) => String(s?.id ?? "")),
    focusStats: (focusStatsRaw as any[]).map((f) => ({
      statId: String(f?.statId ?? ""),
      statName: String(f?.statId ?? ""),
    })),
    availableLessons: (lessonsRaw as any[]).map((l) => ({
      id: String(l?.id ?? ""),
      title: String(l?.title ?? ""),
      courseSlug: String(l?.courseSlug ?? ""),
      lessonSlug: String(l?.lessonSlug ?? l?.slug ?? ""),
    })),
  };

  // 4. Chama Coach com retry 1x.
  const client = await getAnthropicClient();
  let attempt = 0;
  let lastError: string | undefined;
  let validatedInsights: SessionInsights | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let model = "";
  while (attempt < 2) {
    const {
      insights,
      tokensIn: tIn,
      tokensOut: tOut,
      model: m,
    } = await callCoachSessionInsightsTool(client, ctx, lastError);
    tokensIn += tIn;
    tokensOut += tOut;
    model = m;
    const parsed = SessionInsightsSchema.safeParse(insights);
    if (!parsed.success) {
      lastError = `Zod fail: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`;
      console.error("[coachSessionInsightsService] zod fail", {
        userId,
        sessionId,
        attempt,
        error: lastError,
      });
      attempt += 1;
      continue;
    }
    if (!validateWhitelist(parsed.data, ctx)) {
      lastError = "handId/spotId/lessonId fora do whitelist";
      console.error("[coachSessionInsightsService] whitelist fail", {
        userId,
        sessionId,
        attempt,
      });
      attempt += 1;
      continue;
    }
    validatedInsights = parsed.data;
    break;
  }
  if (!validatedInsights) {
    const err: any = new Error(
      "COACH_OUTPUT_INVALID: " + (lastError ?? "unknown"),
    );
    err.code = "COACH_OUTPUT_INVALID";
    throw err;
  }

  // 5. UPSERT.
  const persisted = await (storage as any).upsertCoachSessionInsights({
    userId,
    grindSessionId: sessionId,
    insightsJsonb: validatedInsights,
    costTokensUsed: tokensIn + tokensOut,
    model,
    promptVersion: COACH_SESSION_INSIGHTS_PROMPT_VERSION,
    tokensIn,
    tokensOut,
  });

  console.info("coach_session_insights_generated", {
    userId,
    sessionId,
    tokensIn,
    tokensOut,
    cached: false,
  });

  // Sprint Spot-Anki-Reentry-3 RF-4 — enrich spotsToReview pos-generate.
  let enrichedFresh: SessionInsights = validatedInsights;
  try {
    const { enrichSpotsToReviewWithReentry } = await import(
      "./spotReentry/enrichSpotsToReview"
    );
    const enrichedSpots = await enrichSpotsToReviewWithReentry(
      (validatedInsights as any).spotsToReview ?? [],
      userId,
    );
    enrichedFresh = {
      ...validatedInsights,
      spotsToReview: enrichedSpots as any,
    };
  } catch (enrichErr) {
    console.warn(
      "[coachSessionInsightsService] enrich failed (fresh path)",
      enrichErr,
    );
  }

  return {
    cached: false,
    generatedAt: new Date(persisted.generatedAt ?? Date.now()).toISOString(),
    expiresAt: new Date(
      persisted.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString(),
    insights: enrichedFresh,
  };
}

export async function regenerateCoachSessionInsights(
  input: GetOrGenerateInput,
) {
  return await getOrGenerateCoachSessionInsights({ ...input, force: true });
}
