// =============================================================================
// get_tournament_suggestions — Sprint AI-0A / RF-03 (read tool — registrar do zero)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-03)
// ADR  : 147 §1 — reusa tournamentScoringService.rankTournamentsForContext
//        (que por sua vez reusa computeTournamentScore — NAO duplica a formula).
//
// Ordena por score desc, trunca por limit, filtra maxBuyIn (USD).
// Sem torneios => note. Service que explode => loga + handler_error (lesson #9).
// =============================================================================

import { z } from "zod";
import { rankTournamentsForContext } from "../../services/tournamentScoringService";
import type { CoachTool } from "../registry";

export const getTournamentSuggestionsInputSchema = z.object({
  date: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  profile: z.enum(["A", "B", "C"]).optional(),
  maxBuyIn: z.number().positive().optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export type GetTournamentSuggestionsInput = z.infer<typeof getTournamentSuggestionsInputSchema>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function handler(rawInput: unknown, ctx: { userId: string }): Promise<any> {
  // MEDIUM-2 reviewer: validar via Zod em runtime (aplica defaults).
  const parsed = getTournamentSuggestionsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.issues };
  }
  const input = parsed.data;
  const limit = input.limit;
  const date = input.date ?? todayISO();
  try {
    const ranked = (await rankTournamentsForContext(ctx.userId, {
      date: input.date,
      dayOfWeek: input.dayOfWeek,
      profile: input.profile,
      maxBuyIn: input.maxBuyIn,
      limit,
    })) ?? [];
    const list = Array.isArray(ranked) ? ranked : [];
    const sorted = [...list].sort((a, b) => b.score - a.score);
    const suggestions = sorted.slice(0, limit).map((s) => ({
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
    }));
    const out: any = { suggestions, total: list.length, date };
    if (suggestions.length === 0) {
      out.note = "sem torneios disponiveis";
    } else if (suggestions.every((s) => s.confidence === "low")) {
      // RF-03: sem historico suficiente => scores baseados na estrutura (cold-start).
      // Heuristica: todas as sugestoes saem com confidence 'low' (o scorer marca
      // 'low' quando o sample de buyIn/category eh pequeno ou cold-start <50).
      out.note = "sem historico suficiente — scores baseados na estrutura do torneio";
    }
    return out;
  } catch (err: any) {
    console.error("coach.tool.get_tournament_suggestions.error", { userId: ctx.userId, date, err });
    return {
      ok: false,
      error: "handler_error",
      message: err?.message ?? "get_tournament_suggestions failed",
    };
  }
}

export const getTournamentSuggestionsTool: CoachTool = {
  name: "get_tournament_suggestions",
  description:
    "Ranqueia torneios da biblioteca/Suprema para uma data/contexto. Retorna sugestoes " +
    "com score (0-100), grade S/A/B/C/D, confidence e rationale. Use APOS sugerir + ouvir interesse " +
    "se for adicionar ao grade (via register_tournament_in_grade, que pede confirmacao).",
  inputSchema: getTournamentSuggestionsInputSchema,
  handler,
  requiresConfirmation: false,
  auditLevel: "log",
  gateByTier: ["pro", "premium", "admin"],
};
