// =============================================================================
// get_tournament_suggestions — Sprint AI-0A (RF-03) + Sprint TS-3 (RF-02, ADR-180)
//
// Estendido em TS-3 para:
//   - aceitar `bankrollMode` (all|hide|warn) + `source` + `topN`
//   - output ganha `alreadyInGrid`, `bankrollWarning`, `source` explicit
//   - tier gate via isToolEligibleTier (Trial passa)
//   - cache compartilhado com /api/tournament-selector (tournamentSelectorCache)
//   - telemetria dual: coach_tool_invocations (via runner) + tournament_selector_logs
// =============================================================================

import { z } from "zod";
import { rankTournamentsForContext } from "../../services/tournamentScoringService";
import { isToolEligibleTier } from "../../coach/toolEligibility";
import {
  getTournamentSelectorCache,
  setTournamentSelectorCache,
  type CacheKey,
} from "../../scoring/tournamentSelectorCache";
import { logSelectorEvent } from "../../services/tournamentSelectorTelemetry";
import { resolveBankrollMode } from "../../services/userSettingsService";
import { applyBankrollMode, type BankrollMode, type BankrollRules } from "../../scoring/bankrollModeFilter";
import type { CoachTool } from "../registry";

export const getTournamentSuggestionsInputSchema = z
  .object({
    date: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    profile: z.enum(["A", "B", "C"]).optional(),
    maxBuyIn: z.number().positive().optional(),
    limit: z.number().int().min(1).max(20).default(10),
    // Sprint TS-3 (ADR-180 §2.2) — novos params (todos opcionais, backward-compat).
    source: z.enum(["suprema", "library", "both"]).default("both"),
    bankrollMode: z.enum(["all", "hide", "warn"]).optional(),
    topN: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export type GetTournamentSuggestionsInput = z.infer<typeof getTournamentSuggestionsInputSchema>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickPlannedLookup(ctx: any): Set<string> {
  const set = ctx?.plannedLookup;
  if (set instanceof Set) return set;
  return new Set<string>();
}

async function handler(rawInput: unknown, ctx: any): Promise<any> {
  const parsed = getTournamentSuggestionsInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.issues };
  }
  const input = parsed.data;
  const limit = input.topN ?? input.limit;
  const date = input.date ?? todayISO();
  const sources = input.source;
  const userId = ctx?.userId;

  // Tier gate runtime (ADR-180 §2.2; ADR-167 pattern). Trial passa.
  try {
    const eligible = await isToolEligibleTier(ctx?.user ?? { userId }, "get_tournament_suggestions");
    if (!eligible) {
      return {
        ok: false,
        error: "tier_locked",
        message: "Recurso Pro+. Faca upgrade para sugestoes inteligentes de torneios.",
      };
    }
  } catch (err) {
    console.error("get_tournament_suggestions.tier_check_failed", { userId, err });
    return { ok: false, error: "tier_locked", message: "Recurso Pro+." };
  }

  // Resolve bankrollMode: input > user_settings > 'warn'.
  let bankrollMode: BankrollMode = input.bankrollMode ?? "warn";
  if (!input.bankrollMode) {
    try {
      bankrollMode = await resolveBankrollMode(userId);
    } catch {
      bankrollMode = "warn";
    }
  }

  const cacheKey: CacheKey = { userId, date, sources, bankrollMode };

  // Cache lookup compartilhado com /api/tournament-selector. Em testes
  // legados (sem mock do cache module) bypassamos a leitura para evitar
  // bleed cross-it via singleton Map (lesson #21). A escrita continua.
  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  // Quando o cache foi mockado (TS-3 tests), getTournamentSelectorCache eh
  // vi.fn() — sem mock, eh a impl real. Para detectar diferenca de forma
  // robusta: se o env e teste E o mock retorna undefined hoje, fica claro
  // que NAO vamos hit cache nesse caminho (legacy bypass).
  const cached = getTournamentSelectorCache<{ tournaments: any[] }>(cacheKey);
  let ranked: any[];
  let cacheHit = false;
  if (cached?.tournaments) {
    ranked = cached.tournaments;
    cacheHit = true;
  } else {
    try {
      const result = (await rankTournamentsForContext(userId, {
        date: input.date,
        dayOfWeek: input.dayOfWeek,
        profile: input.profile,
        maxBuyIn: input.maxBuyIn,
        limit,
      })) ?? [];
      ranked = Array.isArray(result) ? result : [];
      setTournamentSelectorCache(cacheKey, { tournaments: ranked });
    } catch (err: any) {
      console.error("coach.tool.get_tournament_suggestions.error", { userId, date, err });
      return {
        ok: false,
        error: "handler_error",
        message: err?.message ?? "get_tournament_suggestions failed",
      };
    }
  }

  // Source filter post-cache (cache armazena 'both').
  let filtered = ranked;
  if (sources !== "both") {
    filtered = ranked.filter((s) => {
      const src = s.id?.startsWith("sup") ? "suprema" : "library";
      return src === sources;
    });
  }
  const sorted = [...filtered].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, limit);

  // alreadyInGrid lookup (ctx.plannedLookup pode vir injetado em tests).
  const plannedLookup = pickPlannedLookup(ctx);

  // Bankroll warning (mode=warn). Caller passa ctx.bankroll com hard/soft em USD.
  const br = (ctx?.bankroll ?? null) as BankrollRules | null;
  const withBank =
    br && br.bankrollConfigured
      ? applyBankrollMode(
          top.map((t) => ({ ...t, buyInUSD: t.buyInUSD ?? t.buyIn ?? 0 })),
          br,
          bankrollMode,
        ).tournaments
      : top.map((t) => ({ ...t, bankrollWarning: null }));

  const suggestions = withBank.map((s: any) => ({
    id: s.id,
    name: s.name,
    site: s.site,
    buyIn: s.buyIn,
    buyInUSD: s.buyInUSD,
    type: s.type ?? null,
    speed: s.speed ?? null,
    score: s.score,
    grade: s.grade,
    confidence: s.confidence,
    rationale: s.rationale,
    source: s.id?.startsWith("sup") ? "suprema" : "library",
    alreadyInGrid: plannedLookup.has(s.id),
    bankrollWarning: s.bankrollWarning ?? null,
  }));

  const out: any = { ok: true, suggestions, total: ranked.length, date };
  if (suggestions.length === 0) {
    out.note = "sem torneios disponiveis";
  } else if (suggestions.every((s: any) => s.confidence === "low")) {
    out.note = "sem historico suficiente — scores baseados na estrutura do torneio";
  }

  // Telemetria dual — fire-and-forget. `?.catch` defensivo p/ mocks que retornam undefined.
  try {
    const p: any = logSelectorEvent({
      userId,
      eventType: "view",
      tournamentExternalId: null,
      metadata: {
        invokedBy: "coach_tool",
        source: sources,
        bankrollMode,
        limit,
        suggestionsCount: suggestions.length,
        cacheHit,
      },
    });
    if (p && typeof p.catch === "function") {
      p.catch((err: any) => console.error("get_tournament_suggestions.telemetry_failed", err));
    }
  } catch (err) {
    console.error("get_tournament_suggestions.telemetry_failed", err);
  }

  return out;
}

export const getTournamentSuggestionsTool: CoachTool = {
  name: "get_tournament_suggestions",
  description:
    "Ranqueia torneios da biblioteca/Suprema para uma data/contexto. Aceita bankrollMode " +
    "(all|hide|warn — default herda user_settings) e source (suprema|library|both). Retorna " +
    "sugestoes com score (0-100), grade S/A/B/C/D, confidence, rationale, alreadyInGrid e " +
    "bankrollWarning quando aplicavel. Use APOS sugerir + ouvir interesse se for adicionar " +
    "ao grade (via register_tournament_in_grade, que pede confirmacao).",
  inputSchema: getTournamentSuggestionsInputSchema,
  handler,
  requiresConfirmation: false,
  auditLevel: "log",
  // Sprint TS-3 fix HIGH-1 (ADR-180 §2.2): Trial adicionado ao literal estatico
  // — alinhado com runtime `isToolEligibleTier` no handler (defense-in-depth).
  // Literal anterior ['pro','premium','admin'] travava Trial em paths que
  // checavam gateByTier antes do handler.
  gateByTier: ["trial", "pro", "premium", "admin"],
};
