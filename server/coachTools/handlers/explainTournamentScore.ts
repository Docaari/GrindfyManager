// =============================================================================
// explain_tournament_score — Sprint AI-0A / RF-04 (read tool — registrar do zero)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-04)
// ADR  : 147 §1 — reusa tournamentScoringService.explainScoreForTournament
//
// Input XOR via superRefine (exatamente 1 dos 3 IDs). 0/2/3 IDs => validation_failed
// ANTES de chamar o service. tournamentId alheio / inexistente => tournament_not_found.
// =============================================================================

import { z } from "zod";
import { explainScoreForTournament } from "../../services/tournamentScoringService";
import type { CoachTool } from "../registry";

export const explainTournamentScoreInputSchema = z
  .object({
    tournamentId: z.string().optional(),
    libraryTemplateId: z.string().optional(),
    plannedTournamentId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const filled = [val.tournamentId, val.libraryTemplateId, val.plannedTournamentId].filter(
      Boolean,
    ).length;
    if (filled !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exatamente um dos tres IDs deve ser fornecido (tournamentId XOR libraryTemplateId XOR plannedTournamentId)",
      });
    }
  });

export type ExplainTournamentScoreInput = z.infer<typeof explainTournamentScoreInputSchema>;

async function handler(input: ExplainTournamentScoreInput, ctx: { userId: string }): Promise<any> {
  const parsed = explainTournamentScoreInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_failed",
      details: parsed.error.issues,
    };
  }
  const ref = parsed.data;
  try {
    const result = await explainScoreForTournament(ctx.userId, {
      tournamentId: ref.tournamentId,
      libraryTemplateId: ref.libraryTemplateId,
      plannedTournamentId: ref.plannedTournamentId,
    });
    return {
      tournamentRef: result.tournamentRef,
      score: result.score,
      grade: result.grade,
      confidence: result.confidence,
      breakdown: result.breakdown,
      rationale: result.rationale,
    };
  } catch (err: any) {
    const msg = err?.message ?? "explain_tournament_score failed";
    const notFound = /not_found|not_accessible/i.test(String(msg));
    console.error("coach.tool.explain_tournament_score.error", { userId: ctx.userId, err });
    return {
      ok: false,
      error: "handler_error",
      message: notFound ? "tournament_not_found" : msg,
    };
  }
}

export const explainTournamentScoreTool: CoachTool = {
  name: "explain_tournament_score",
  description:
    "Explica por que um torneio recebeu o score que recebeu — breakdown por sinal " +
    "(playerEdge/fieldFit/scheduleFit/bankrollFit/structureFit ou equivalente) com weight, value, " +
    "contribution, sampleSize e confidence. Identifique o torneio por exatamente um de: " +
    "tournamentId | libraryTemplateId | plannedTournamentId.",
  inputSchema: explainTournamentScoreInputSchema,
  handler,
  requiresConfirmation: false,
  auditLevel: "log",
  gateByTier: ["pro", "premium", "admin"],
};
