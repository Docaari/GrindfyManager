// =============================================================================
// recommendLessonForUser — Sprint home-reform-4 / Item 4 (RF-03, ADR-113).
//
// Servico que retorna 1 recomendacao de lesson para 1 user (ou null).
// 5 tiers em cascata:
//   Tier 0  short-circuit user sem dados (volume=0 + leaks=[])
//   Tier 1  Coach IA via Anthropic (preferido)
//   Tier 2  fallback leak->tag (deterministico)
//   Tier 3  fallback popular (seed-randomizado por user/semana)
//   Tier 4  fallback recente (catalog popular vazio)
//   Tier 5  null
//
// Lessons aplicadas:
//   #9  try/catch granular: nunca propaga erro do LLM, sempre cai pro fallback.
//   #10 (DRY) Sprint AI-3.2 / RF-B2: SDK Anthropic acessado via callReportLlm
//       (paridade weekly/monthly/daily/quarterly/summarizer).
// =============================================================================

import { createHash } from "crypto";
import { storage } from "../storage";
import { getTagsForLeakCode } from "./leakToTag";
import {
  getCoachLessonRecommendationSystemPrompt,
  formatLessonRecommendationCatalog,
} from "./prompts/lessonRecommendation";
// Sprint AI-3.2 fix wave / HIGH-1 — top-level import (era lazy `await import`
// dentro de `tryCoachIA`). Path mismatch quebrava mocks
// `vi.doMock("./anthropicClient")` quando escritos pos resetModules.
import { callReportLlm } from "./anthropicClient";

export interface CoachLeakSummaryInput {
  code: string;
  severity: "low" | "medium" | "high";
  evidence?: { n?: number; value?: number };
  description?: string;
}

export interface CatalogLessonInput {
  id: string;
  title: string;
  courseTitle?: string;
  moduleTitle?: string;
  categoryId?: string;
  tags?: string[];
  learningObjectives?: string[];
  durationSeconds?: number | null;
}

export interface RecommendInput {
  userId: string;
  leaks: CoachLeakSummaryInput[];
  analytics: {
    last7DaysRoi: number;
    last7DaysVolume: number;
    last7DaysProfit: number;
    last30DaysRoi: number;
  };
  activeProfile?: "A" | "B" | "C" | null;
  accessibleLessonIds?: string[];
  lastConsumedLessonIds?: string[];
  catalogLessons: CatalogLessonInput[];
  /** ISO date (YYYY-MM-DD) opcional usado no seed do popular. Default = new Date(). */
  weekStartDate?: string;
}

export interface RecommendResult {
  lessonId: string;
  reason: string;
  source:
    | "coach"
    | "fallback_leak_tag"
    | "fallback_popular"
    | "fallback_recent";
  chatSessionId?: string;
}

const REASON_MIN = 20;
const REASON_MAX = 240;

// =============================================================================
// Helpers
// =============================================================================

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function ensureReason(reason: string, fallback: string): string {
  const r = String(reason ?? "").trim();
  if (r.length < REASON_MIN) return fallback;
  return truncate(r, REASON_MAX);
}

function pickWithSeed<T>(items: T[], seed: string): T {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const idx = parseInt(hash, 16) % items.length;
  return items[idx];
}

function excludeIds<T extends { id: string }>(
  items: T[],
  exclude: string[],
): T[] {
  if (!exclude || exclude.length === 0) return items;
  const set = new Set(exclude);
  return items.filter((x) => !set.has(x.id));
}

function excludeIdStrings(ids: string[], exclude: string[]): string[] {
  if (!exclude || exclude.length === 0) return ids;
  const set = new Set(exclude);
  return ids.filter((id) => !set.has(id));
}

// =============================================================================
// Tier 1 — Coach IA
//
// System prompt + catalog formatter movidos para
// `server/coach/prompts/lessonRecommendation.ts` apos achado MEDIUM do reviewer
// (lesson #10: divergencia de prompt quebra cache da Anthropic). Versionado la.
// =============================================================================

function formatUserContext(input: RecommendInput): string {
  const leakLines = (input.leaks ?? [])
    .slice(0, 5)
    .map(
      (l) =>
        `- ${l.code} (severity ${l.severity}): ${l.description ?? "(sem descricao)"}`,
    )
    .join("\n");
  return [
    `Perfil ativo: ${input.activeProfile ?? "indefinido"}`,
    `Analytics ultimos 7 dias:`,
    `  ROI: ${input.analytics.last7DaysRoi}%`,
    `  Volume: ${input.analytics.last7DaysVolume}`,
    `  Profit USD: ${input.analytics.last7DaysProfit}`,
    `  ROI 30d: ${input.analytics.last30DaysRoi}%`,
    `Leaks ativos:`,
    leakLines || "(nenhum)",
  ].join("\n");
}

async function tryCoachIA(
  input: RecommendInput,
): Promise<RecommendResult | null> {
  // Sprint AI-3.2 / RF-B2 (ADR-203) — delega para callReportLlm (5/5 generators
  // lockstep: weekly + monthly + daily + quarterly + summarizer + recommendLesson).
  // Sprint AI-3.2 fix wave / HIGH-1 — import movido pro top-level (ver header).

  const eligible = excludeIds(
    input.catalogLessons ?? [],
    input.lastConsumedLessonIds ?? [],
  );
  if (eligible.length === 0) return null;

  const model = process.env.COACH_MODEL ?? "claude-3-5-sonnet-latest";
  const systemPrompt = getCoachLessonRecommendationSystemPrompt();
  const catalogText = formatLessonRecommendationCatalog(eligible);
  const userText = formatUserContext(input);

  let out: Awaited<ReturnType<typeof callReportLlm>>;
  try {
    out = await callReportLlm({
      systemPrompt,
      // Combina catalog + user context num userPromptBuilder unico.
      userPromptBuilder: () => `${catalogText}\n\n${userText}`,
      model,
      bundle: {},
      maxTokens: 200,
      parseOnError: "fallback-degraded",
    });
  } catch (err) {
    console.error("coach.recommend.anthropic.error", {
      userId: input.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (out.degradedReason) {
    return null;
  }

  // Sprint home-reform-4 / Item 4 — token logging pos achado MEDIUM do reviewer.
  const usage: any = out.usage ?? {};
  console.info("coach.cron.weekly_rec.tokens", {
    userId: input.userId,
    model,
    inputTokens: usage.input_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    cacheReadInputTokens: usage.cache_read_input_tokens,
    outputTokens: usage.output_tokens,
  });

  // callReportLlm já fez JSON.parse — content vem como objeto ou {} se SDK ausente.
  const parsedContent: any = out.content ?? {};
  if (typeof parsedContent.lesson_id !== "string" || typeof parsedContent.reason !== "string") {
    return null;
  }
  const parsed = { lesson_id: parsedContent.lesson_id, reason: parsedContent.reason };

  const validIds = new Set(eligible.map((l) => l.id));
  if (!validIds.has(parsed.lesson_id)) return null;

  const reason = ensureReason(
    parsed.reason,
    "Recomendacao do Coach IA alinhada ao seu momento atual.",
  );

  return {
    lessonId: parsed.lesson_id,
    reason,
    source: "coach",
  };
}

// =============================================================================
// Tier 2 — leak->tag deterministico
// =============================================================================

function tryLeakTagFallback(
  input: RecommendInput,
): RecommendResult | null {
  const leaks = input.leaks ?? [];
  // requer leak severity high OU medium
  const priorityLeak =
    leaks.find((l) => l.severity === "high") ??
    leaks.find((l) => l.severity === "medium");
  if (!priorityLeak) return null;

  const tags = getTagsForLeakCode(priorityLeak.code);
  if (!tags || tags.length === 0) return null;

  const eligible = excludeIds(
    input.catalogLessons,
    input.lastConsumedLessonIds ?? [],
  );
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  const matches = eligible.filter((l) => {
    const lessonTags = (l.tags ?? []).map((t) => String(t).toLowerCase());
    if (lessonTags.some((t) => tagSet.has(t))) return true;
    if (l.categoryId && tagSet.has(String(l.categoryId).toLowerCase()))
      return true;
    return false;
  });

  if (matches.length === 0) return null;

  // Sprint home-reform-4 / Item 4 — fix INFO Tier 2 sem seed:
  // antes era `matches[0]` (deterministico pra todos os users); agora usa
  // pickWithSeed pra distribuir entre lessons com mesmo tag-match. Mantem
  // determinismo por (userId, weekStartDate) — mesmo user na mesma semana
  // ve a mesma sugestao.
  const seedDate = input.weekStartDate ?? new Date().toISOString().slice(0, 10);
  const seed = `${input.userId}-${seedDate}`;
  const chosen = pickWithSeed(matches, seed);
  const reasonRaw = `Sugestao alinhada ao seu leak '${priorityLeak.description ?? priorityLeak.code}'.`;
  const reason = ensureReason(
    reasonRaw,
    "Sugestao alinhada ao leak prioritario detectado essa semana.",
  );
  return {
    lessonId: chosen.id,
    reason,
    source: "fallback_leak_tag",
  };
}

// =============================================================================
// Tier 3 — popular seed-randomizado
// =============================================================================

async function tryPopularFallback(
  input: RecommendInput,
): Promise<RecommendResult | null> {
  let popularIds: string[] = [];
  try {
    popularIds = await (storage as any).getMostPopularLessonIds({
      sinceDays: 30,
      limit: 10,
    });
  } catch (err) {
    console.error("coach.recommend.popular.error", {
      userId: input.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!Array.isArray(popularIds) || popularIds.length === 0) return null;

  // exclui lastConsumed
  const filtered = excludeIdStrings(
    popularIds,
    input.lastConsumedLessonIds ?? [],
  );
  // garante que id existe no catalog (defensivo)
  const catalogSet = new Set(input.catalogLessons.map((l) => l.id));
  const eligible = filtered.filter((id) => catalogSet.has(id));
  if (eligible.length === 0) return null;

  const seedDate = input.weekStartDate ?? new Date().toISOString().slice(0, 10);
  const seed = `${input.userId}-${seedDate}`;
  const chosenId = pickWithSeed(eligible, seed);

  const reason = ensureReason(
    "Conteudo mais consumido pelos jogadores nas ultimas semanas.",
    "Sugestao popular selecionada com base no consumo recente da comunidade.",
  );

  return {
    lessonId: chosenId,
    reason,
    source: "fallback_popular",
  };
}

// =============================================================================
// Tier 4 — recente
// =============================================================================

async function tryRecentFallback(
  input: RecommendInput,
): Promise<RecommendResult | null> {
  let recent: CatalogLessonInput[] = [];
  try {
    recent = await (storage as any).getCatalogLessonsForRecommendation({
      limit: 10,
      orderBy: "createdAt DESC",
    });
  } catch (err) {
    console.error("coach.recommend.recent.error", {
      userId: input.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!Array.isArray(recent) || recent.length === 0) return null;
  const eligible = excludeIds(recent, input.lastConsumedLessonIds ?? []);
  if (eligible.length === 0) return null;

  const seedDate = input.weekStartDate ?? new Date().toISOString().slice(0, 10);
  const seed = `${input.userId}-${seedDate}`;
  const chosen = pickWithSeed(eligible, seed);

  const reason = ensureReason(
    "Adicao recente ao catalogo da Biblioteca — vale conferir.",
    "Adicao recente ao catalogo da Biblioteca essa semana.",
  );

  return {
    lessonId: chosen.id,
    reason,
    source: "fallback_recent",
  };
}

// =============================================================================
// Entry point
// =============================================================================

export async function recommendLessonForUser(
  input: RecommendInput,
): Promise<RecommendResult | null> {
  const userHasNoData =
    (input.analytics?.last7DaysVolume ?? 0) === 0 &&
    (input.leaks?.length ?? 0) === 0;

  // Tier 0 — short-circuit
  if (userHasNoData) {
    const popular = await tryPopularFallback(input);
    if (popular) return popular;
    const recent = await tryRecentFallback(input);
    if (recent) return recent;
    return null;
  }

  // Tier 1 — Coach IA
  const coachResult = await tryCoachIA(input);
  if (coachResult) return coachResult;

  // Tier 2 — leak->tag (apenas se leak high/medium)
  const leakTag = tryLeakTagFallback(input);
  if (leakTag) return leakTag;

  // Tier 3 — popular
  const popular = await tryPopularFallback(input);
  if (popular) return popular;

  // Tier 4 — recente
  const recent = await tryRecentFallback(input);
  if (recent) return recent;

  // Tier 5 — null
  return null;
}
