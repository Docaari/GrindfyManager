/**
 * Sprint TS-3 RF-04 — Filtro Bankroll tristate (all | hide | warn)
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-04)
 * ADR  : 178 — bankroll-tristate-mode
 *
 * Server-side: testa o helper puro `resolveBankrollFilter` que recebe
 * { tournaments, bankroll, mode } e retorna { tournaments, warnings }.
 * Implementer deve extrair essa funcao do route handler para um modulo
 * puro (server/scoring/bankrollModeFilter.ts) para testabilidade.
 *
 * Cenarios (9):
 *  1) mode='all' sem filtro nem warning
 *  2) mode='hide' omite torneios acima hard
 *  3) mode='warn' acima hard -> bankrollWarning.reason='above_hard_limit'
 *  4) mode='warn' entre soft e hard -> 'above_soft_limit'
 *  5) Bankroll nao cadastrado: param ignorado, payload sem bankrollWarning
 *  6) Param antigo bankrollFilter=true -> mode='hide'
 *  7) Param antigo bankrollFilter=false -> mode='all'
 *  8) Sem param mode + user_settings sem coluna -> fallback 'warn'
 *  9) Telemetria: tournament_selector_logs.metadata.bankrollMode populado
 */

import { describe, it, expect, vi } from "vitest";

// ---- Fixtures shape-validated (espelha SelectorTournament + bankrollRules) --

function tournament(overrides: any = {}) {
  return {
    id: "lib-1",
    source: "library",
    name: "Test Tournament",
    site: "PokerStars",
    buyIn: 22,
    buyInUSD: 22,
    category: "Vanilla",
    speed: "Normal",
    score: 75,
    grade: "A",
    confidence: "high",
    rationale: "test",
    signals: {},
    ...overrides,
  };
}

function bankrollOk() {
  // amount $5000, rule "2pct" -> softLimit=$100, hardLimit=$150
  return {
    bankrollConfigured: true,
    bankrollAmountUSD: 5000,
    rule: "2pct",
    softLimitUSD: 100,
    hardLimitUSD: 150,
    rulePct: 2,
  };
}

function bankrollAbsent() {
  return {
    bankrollConfigured: false,
    bankrollAmountUSD: null,
    rule: "1pct",
    softLimitUSD: null,
    hardLimitUSD: null,
    rulePct: 1,
  };
}

describe("RF-04 — bankroll mode filter (server)", () => {
  describe("modes basicos (com bankroll configurado)", () => {
    it("mode='all' nao filtra nem anota warning", async () => {
      const { applyBankrollMode } = await import("../../../server/scoring/bankrollModeFilter");
      const ts = [tournament({ buyInUSD: 22 }), tournament({ id: "x", buyInUSD: 200 })];
      const result = applyBankrollMode(ts, bankrollOk(), "all");
      expect(result.tournaments).toHaveLength(2);
      result.tournaments.forEach((t: any) => expect(t.bankrollWarning).toBeNull());
    });

    it("mode='hide' omite torneios buyIn > hardLimit", async () => {
      const { applyBankrollMode } = await import("../../../server/scoring/bankrollModeFilter");
      const ts = [
        tournament({ id: "within", buyInUSD: 50 }),
        tournament({ id: "soft", buyInUSD: 120 }),
        tournament({ id: "hard", buyInUSD: 200 }),
      ];
      const result = applyBankrollMode(ts, bankrollOk(), "hide");
      // soft+within ficam; hard sai
      const ids = result.tournaments.map((t: any) => t.id);
      expect(ids).toContain("within");
      expect(ids).toContain("soft");
      expect(ids).not.toContain("hard");
    });

    it("mode='warn' acima hard inclui torneio com bankrollWarning.reason='above_hard_limit'", async () => {
      const { applyBankrollMode } = await import("../../../server/scoring/bankrollModeFilter");
      const ts = [tournament({ id: "hard", buyInUSD: 200 })];
      const result = applyBankrollMode(ts, bankrollOk(), "warn");
      expect(result.tournaments).toHaveLength(1);
      const w = result.tournaments[0].bankrollWarning;
      expect(w).toBeTruthy();
      expect(w.reason).toBe("above_hard_limit");
      expect(w.limitUSD).toBe(150);
      expect(w.buyInUSD).toBe(200);
      expect(w.rulePct).toBe(2);
    });

    it("mode='warn' entre soft e hard recebe 'above_soft_limit'", async () => {
      const { applyBankrollMode } = await import("../../../server/scoring/bankrollModeFilter");
      const ts = [tournament({ id: "soft", buyInUSD: 120 })];
      const result = applyBankrollMode(ts, bankrollOk(), "warn");
      const w = result.tournaments[0].bankrollWarning;
      expect(w.reason).toBe("above_soft_limit");
      expect(w.limitUSD).toBe(100);
      expect(w.buyInUSD).toBe(120);
    });

    it("mode='warn' within soft -> bankrollWarning=null", async () => {
      const { applyBankrollMode } = await import("../../../server/scoring/bankrollModeFilter");
      const ts = [tournament({ id: "within", buyInUSD: 50 })];
      const result = applyBankrollMode(ts, bankrollOk(), "warn");
      expect(result.tournaments[0].bankrollWarning).toBeNull();
    });
  });

  describe("bankroll nao cadastrado", () => {
    it("qualquer modo se comporta como 'all' (sem warning)", async () => {
      const { applyBankrollMode } = await import("../../../server/scoring/bankrollModeFilter");
      const ts = [tournament({ buyInUSD: 999 })];
      for (const mode of ["all", "hide", "warn"] as const) {
        const r = applyBankrollMode(ts, bankrollAbsent(), mode);
        expect(r.tournaments).toHaveLength(1);
        expect(r.tournaments[0].bankrollWarning).toBeNull();
      }
    });
  });

  describe("back-compat alias bankrollFilter", () => {
    it("bankrollFilter=true -> traduz para mode='hide'", async () => {
      const { resolveBankrollModeParam } = await import("../../../server/scoring/bankrollModeFilter");
      expect(resolveBankrollModeParam({ bankrollFilter: true })).toBe("hide");
    });
    it("bankrollFilter=false -> mode='all'", async () => {
      const { resolveBankrollModeParam } = await import("../../../server/scoring/bankrollModeFilter");
      expect(resolveBankrollModeParam({ bankrollFilter: false })).toBe("all");
    });
    it("bankrollMode tem precedence sobre bankrollFilter quando ambos presentes", async () => {
      const { resolveBankrollModeParam } = await import("../../../server/scoring/bankrollModeFilter");
      expect(resolveBankrollModeParam({ bankrollMode: "warn", bankrollFilter: true })).toBe("warn");
    });
    it("nenhum dos dois presentes -> retorna undefined (caller resolve via user_settings)", async () => {
      const { resolveBankrollModeParam } = await import("../../../server/scoring/bankrollModeFilter");
      expect(resolveBankrollModeParam({})).toBeUndefined();
    });
  });

  describe("fallback chain (ADR-178 §2.2)", () => {
    it("sem param + user_settings sem coluna -> 'warn'", async () => {
      const { resolveBankrollModeWithDefault } = await import(
        "../../../server/scoring/bankrollModeFilter"
      );
      const result = await resolveBankrollModeWithDefault({
        query: {},
        userSettings: null, // coluna ausente / row inexistente
      } as any);
      expect(result).toBe("warn");
    });
    it("sem param + user_settings.tournament_selector_bankroll_mode='hide' -> 'hide'", async () => {
      const { resolveBankrollModeWithDefault } = await import(
        "../../../server/scoring/bankrollModeFilter"
      );
      const result = await resolveBankrollModeWithDefault({
        query: {},
        userSettings: { tournament_selector_bankroll_mode: "hide" },
      } as any);
      expect(result).toBe("hide");
    });
  });

  describe("telemetria — metadata.bankrollMode", () => {
    it("evento 'view' carrega bankrollMode escolhido", async () => {
      const { buildSelectorTelemetryMetadata } = await import(
        "../../../server/scoring/bankrollModeFilter"
      );
      const meta = buildSelectorTelemetryMetadata({
        bankrollMode: "warn",
        invokedBy: "widget",
        source: "both",
        cacheHit: false,
      });
      expect(meta.bankrollMode).toBe("warn");
      expect(meta.invokedBy).toBe("widget");
    });
  });
});
