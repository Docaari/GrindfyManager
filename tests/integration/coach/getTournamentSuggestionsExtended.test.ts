/**
 * Sprint TS-3 RF-02 — Estender `get_tournament_suggestions` (NAO criar tool nova)
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-02)
 * ADR  : 180 — coach-tool-tournament-selector-consolidation
 *
 * Cenarios (cobre lessons #3 + #14 + #34 — usar await import, storage injetado,
 * mocks com shape real):
 *  1) Tool aceita novo param `bankrollMode` ∈ all|hide|warn (default herda user_settings)
 *  2) Cache hit shared com /api/tournament-selector (mesma chave shape)
 *  3) Tier gate via `isToolEligibleTier` — trial passa, free nega
 *  4) Telemetria dual: coach_tool_invocations + tournament_selector_logs (invokedBy='coach_tool')
 *  5) Output ganha `alreadyInGrid` + `bankrollWarning` + `source` explicit
 *  6) bankrollMode='warn' inclui torneio above-hard com bankrollWarning populado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- mocks de modulos externos ---------------------------------------------

const mockRankTournamentsForContext = vi.fn();
const mockResolveBankrollMode = vi.fn();
const mockIsToolEligibleTier = vi.fn();
const mockSelectorCacheGet = vi.fn();
const mockSelectorCacheSet = vi.fn();
const mockLogSelectorEvent = vi.fn();
const mockGetPlannedTournaments = vi.fn();

vi.mock("../../../server/services/tournamentScoringService", () => ({
  rankTournamentsForContext: (...args: any[]) => mockRankTournamentsForContext(...args),
}));

vi.mock("../../../server/coach/toolEligibility", () => ({
  isToolEligibleTier: (...args: any[]) => mockIsToolEligibleTier(...args),
}));

// Modulo NOVO esperado em implementer phase (ADR-180 §2.3).
// Caminho previsto pelo ADR: server/scoring/tournamentSelectorCache.ts
vi.mock("../../../server/scoring/tournamentSelectorCache", () => ({
  getTournamentSelectorCache: (...args: any[]) => mockSelectorCacheGet(...args),
  setTournamentSelectorCache: (...args: any[]) => mockSelectorCacheSet(...args),
  _resetTournamentSelectorCacheForTests: () => {},
}));

// Logger esperado para gravar tournament_selector_logs com invokedBy.
// Modulo novo previsto pelo ADR-178 §2.5 + ADR-180 §2.4. Implementer pode optar
// por reusar helper existente (selectorCache invalidator chama logSelectorEvent
// hoje), mas o teste assume um modulo dedicado para isolar dependencia.
vi.mock("../../../server/services/tournamentSelectorTelemetry", () => ({
  logSelectorEvent: (...args: any[]) => mockLogSelectorEvent(...args),
}));

vi.mock("../../../server/services/userSettingsService", () => ({
  resolveBankrollMode: (...args: any[]) => mockResolveBankrollMode(...args),
}));

beforeEach(() => {
  mockRankTournamentsForContext.mockReset();
  mockResolveBankrollMode.mockReset();
  mockIsToolEligibleTier.mockReset();
  mockSelectorCacheGet.mockReset();
  mockSelectorCacheSet.mockReset();
  mockLogSelectorEvent.mockReset();
  mockGetPlannedTournaments.mockReset();

  // defaults
  mockIsToolEligibleTier.mockResolvedValue(true);
  mockResolveBankrollMode.mockResolvedValue("warn");
  mockSelectorCacheGet.mockReturnValue(undefined);
  mockGetPlannedTournaments.mockResolvedValue([]);
});

// ---- fixtures shape-validated ----------------------------------------------

function rankedFixture() {
  // shape exato de RankedSuggestion (tournamentScoringService.ts L48-L60)
  return [
    {
      id: "lib-1",
      name: "Sunday Million",
      site: "PokerStars",
      buyIn: 22,
      buyInUSD: 22,
      type: "Vanilla",
      speed: "Normal",
      score: 88,
      grade: "S",
      confidence: "high",
      rationale: "Forte ROI em PokerStars + Vanilla",
    },
    {
      id: "sup-2",
      name: "PKO Suprema $200",
      site: "Suprema",
      buyIn: 200,
      buyInUSD: 200,
      type: "PKO",
      speed: "Normal",
      score: 72,
      grade: "A",
      confidence: "medium",
      rationale: "ROI consistente em PKO",
    },
  ];
}

function bankrollFixture() {
  // Bankroll de $5000 com 2pct rule -> softLimit=$100, hardLimit=$150.
  // Torneio $200 fica ABOVE_HARD; $22 fica WITHIN.
  return {
    bankrollConfigured: true,
    bankrollAmountUSD: 5000,
    rule: "2pct",
    softLimitUSD: 100,
    hardLimitUSD: 150,
    rulePct: 2,
  };
}

const TRIAL_USER = { userId: "USER-TRIAL", subscriptionPlan: "trial" };
const FREE_USER = { userId: "USER-FREE", subscriptionPlan: "free" };
const PRO_USER = { userId: "USER-PRO", subscriptionPlan: "active" };

describe("RF-02 — get_tournament_suggestions extended", () => {
  describe("input schema — novos params", () => {
    it("aceita bankrollMode ∈ all|hide|warn sem erro de validacao", async () => {
      const { getTournamentSuggestionsInputSchema } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      // Implementer estende inputSchema em ADR-180 §2.2
      const ok1 = getTournamentSuggestionsInputSchema.safeParse({ bankrollMode: "all" });
      const ok2 = getTournamentSuggestionsInputSchema.safeParse({ bankrollMode: "hide" });
      const ok3 = getTournamentSuggestionsInputSchema.safeParse({ bankrollMode: "warn" });
      const fail = getTournamentSuggestionsInputSchema.safeParse({ bankrollMode: "invalid" });
      expect(ok1.success).toBe(true);
      expect(ok2.success).toBe(true);
      expect(ok3.success).toBe(true);
      expect(fail.success).toBe(false);
    });

    it("aceita source ∈ suprema|library|both com default 'both'", async () => {
      const { getTournamentSuggestionsInputSchema } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const empty = getTournamentSuggestionsInputSchema.safeParse({});
      expect(empty.success).toBe(true);
      if (empty.success) expect(empty.data.source).toBe("both");
      const failInvalid = getTournamentSuggestionsInputSchema.safeParse({ source: "bogus" });
      expect(failInvalid.success).toBe(false);
    });

    it("aceita topN como alias de limit (1-10) — UX-friendly p/ LLM", async () => {
      const { getTournamentSuggestionsInputSchema } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const ok = getTournamentSuggestionsInputSchema.safeParse({ topN: 5 });
      expect(ok.success).toBe(true);
      const fail = getTournamentSuggestionsInputSchema.safeParse({ topN: 50 });
      expect(fail.success).toBe(false);
    });
  });

  describe("tier gate via isToolEligibleTier (ADR-167 pattern)", () => {
    it("Trial passa (recebe results)", async () => {
      mockIsToolEligibleTier.mockResolvedValue(true);
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const out: any = await getTournamentSuggestionsTool.handler({}, {
        userId: TRIAL_USER.userId,
        user: TRIAL_USER,
      } as any);

      expect(out.ok).not.toBe(false);
      expect(out.suggestions).toBeInstanceOf(Array);
      expect(mockIsToolEligibleTier).toHaveBeenCalled();
    });

    it("Free recebe 'tier_locked' (sem chamar scorer)", async () => {
      mockIsToolEligibleTier.mockResolvedValue(false);

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const out: any = await getTournamentSuggestionsTool.handler({}, {
        userId: FREE_USER.userId,
        user: FREE_USER,
      } as any);

      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/tier|pro/i);
      expect(mockRankTournamentsForContext).not.toHaveBeenCalled();
    });
  });

  describe("cache compartilhado (ADR-180 §2.3)", () => {
    it("cache HIT — usa entry do widget sem recomputar", async () => {
      mockSelectorCacheGet.mockReturnValue({ tournaments: rankedFixture() });

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const out: any = await getTournamentSuggestionsTool.handler(
        { date: "2026-05-22" },
        { userId: PRO_USER.userId, user: PRO_USER } as any
      );

      expect(out.suggestions.length).toBeGreaterThan(0);
      expect(mockRankTournamentsForContext).not.toHaveBeenCalled();
      // telemetria registra cacheHit=true
      const telemetryCalls = mockLogSelectorEvent.mock.calls;
      expect(telemetryCalls.length).toBeGreaterThan(0);
      const meta = telemetryCalls[0][0]?.metadata ?? {};
      expect(meta.cacheHit).toBe(true);
    });

    it("cache MISS — computa via rankTournamentsForContext + persiste no cache", async () => {
      mockSelectorCacheGet.mockReturnValue(undefined);
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      await getTournamentSuggestionsTool.handler(
        { date: "2026-05-22", source: "both", bankrollMode: "warn" },
        { userId: PRO_USER.userId, user: PRO_USER } as any
      );

      expect(mockRankTournamentsForContext).toHaveBeenCalled();
      expect(mockSelectorCacheSet).toHaveBeenCalled();
      // chave canonica: { userId, date, sources, bankrollMode }
      const [setKey] = mockSelectorCacheSet.mock.calls[0];
      expect(setKey).toMatchObject({
        userId: PRO_USER.userId,
        date: "2026-05-22",
        sources: "both",
        bankrollMode: "warn",
      });
    });
  });

  describe("output extension (ADR-180 §2.2)", () => {
    it("inclui alreadyInGrid em cada suggestion (resolvido contra planned_tournaments)", async () => {
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const out: any = await getTournamentSuggestionsTool.handler(
        { date: "2026-05-22" },
        {
          userId: PRO_USER.userId,
          user: PRO_USER,
          plannedLookup: new Set(["lib-1"]), // injetado: lib-1 ja na grade
        } as any
      );

      const lib = out.suggestions.find((s: any) => s.id === "lib-1");
      const sup = out.suggestions.find((s: any) => s.id === "sup-2");
      expect(lib?.alreadyInGrid).toBe(true);
      expect(sup?.alreadyInGrid).toBe(false);
    });

    it("source field explicit no payload (suprema|library)", async () => {
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const out: any = await getTournamentSuggestionsTool.handler(
        {},
        { userId: PRO_USER.userId, user: PRO_USER } as any
      );

      const lib = out.suggestions.find((s: any) => s.id === "lib-1");
      const sup = out.suggestions.find((s: any) => s.id === "sup-2");
      expect(lib?.source).toBe("library");
      expect(sup?.source).toBe("suprema");
    });
  });

  describe("bankrollMode='warn' — bankrollWarning populado", () => {
    it("torneio above-hard recebe bankrollWarning.reason='above_hard_limit'", async () => {
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const out: any = await getTournamentSuggestionsTool.handler(
        { bankrollMode: "warn" },
        {
          userId: PRO_USER.userId,
          user: PRO_USER,
          bankroll: bankrollFixture(),
        } as any
      );

      const sup = out.suggestions.find((s: any) => s.id === "sup-2");
      expect(sup.bankrollWarning).toBeTruthy();
      expect(sup.bankrollWarning.reason).toBe("above_hard_limit");
      expect(sup.bankrollWarning.limitUSD).toBe(150);
      expect(sup.bankrollWarning.buyInUSD).toBe(200);
    });

    it("torneio within (buyIn < softLimit) tem bankrollWarning=null", async () => {
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      const out: any = await getTournamentSuggestionsTool.handler(
        { bankrollMode: "warn" },
        { userId: PRO_USER.userId, user: PRO_USER, bankroll: bankrollFixture() } as any
      );

      const lib = out.suggestions.find((s: any) => s.id === "lib-1");
      expect(lib.bankrollWarning).toBeNull();
    });
  });

  describe("telemetria dual (ADR-180 §2.4)", () => {
    it("registra tournament_selector_logs com metadata.invokedBy='coach_tool'", async () => {
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      await getTournamentSuggestionsTool.handler(
        { date: "2026-05-22", source: "both", bankrollMode: "warn" },
        { userId: PRO_USER.userId, user: PRO_USER } as any
      );

      expect(mockLogSelectorEvent).toHaveBeenCalled();
      const callArg = mockLogSelectorEvent.mock.calls[0][0];
      expect(callArg.userId).toBe(PRO_USER.userId);
      expect(callArg.eventType).toBe("view");
      expect(callArg.metadata.invokedBy).toBe("coach_tool");
      expect(callArg.metadata.bankrollMode).toBe("warn");
      expect(callArg.metadata.source).toBe("both");
      expect(typeof callArg.metadata.cacheHit).toBe("boolean");
    });
  });

  describe("default herda user_settings (resolveBankrollMode)", () => {
    it("sem bankrollMode no input -> consulta user_settings", async () => {
      mockResolveBankrollMode.mockResolvedValue("hide");
      mockRankTournamentsForContext.mockResolvedValue(rankedFixture());

      const { getTournamentSuggestionsTool } = await import(
        "../../../server/coachTools/handlers/getTournamentSuggestions"
      );
      await getTournamentSuggestionsTool.handler({}, {
        userId: PRO_USER.userId,
        user: PRO_USER,
      } as any);

      expect(mockResolveBankrollMode).toHaveBeenCalledWith(PRO_USER.userId);
      // cache key recebe o valor resolvido
      const [setKey] = mockSelectorCacheSet.mock.calls[0] ?? [{}];
      expect(setKey?.bankrollMode).toBe("hide");
    });
  });
});
