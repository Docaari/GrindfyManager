// =============================================================================
// simulate_bankroll_scenario — Sprint AI-0A / RF-05 (read tool — substitui o stub)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-05)
// ADR  : 147 §2 — fonte canonica de banca = walletService.getConsolidatedBalance().totalUSD
//                 (USD, FX-aware). NAO ha fallback interno para user_settings.bankroll_amount
//                 — usuario v1 sem wallet vê totalUSD "0.00" => bankroll_nao_configurado.
//                 Lesson #6 — tudo em USD.
//
// Simula um cenario hipotetico (perder N buy-ins, lucro X, win/lose streak) e
// avalia se a regra de banca seria violada. Tom condicional + disclaimer.
// Banca nao configurada (totalUSD <= 0) => note 'bankroll_nao_configurado'.
// Banca > 0 mas sem limites (modo per_wallet — getConsolidatedBalance so calcula
// soft/hard limit no modo 'global') => simula mostrando valores reais + note
// 'regra_de_banca_nao_global'. walletService que explode => loga + handler_error.
// =============================================================================

import { z } from "zod";
import { walletService } from "../../services/walletService";
import type { CoachTool } from "../registry";

export const simulateBankrollScenarioInputSchema = z
  .object({
    scenario: z.enum(["lose_n_buyins", "profit_amount", "win_streak", "lose_streak"]),
    value: z.number(),
    buyInUSD: z.number().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (
      ["lose_n_buyins", "win_streak", "lose_streak"].includes(val.scenario) &&
      !val.buyInUSD
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "buyInUSD obrigatorio para esse cenario",
      });
    }
  });

export type SimulateBankrollScenarioInput = z.infer<typeof simulateBankrollScenarioInputSchema>;

function num(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : fallback;
}

// Limites de banca opcionais: ausentes/vazios viram null (sem limite configurado).
function optionalNum(v: any): number | null {
  return v != null && v !== "" ? num(v) : null;
}

function deltaFor(input: SimulateBankrollScenarioInput): number {
  const buyIn = num(input.buyInUSD);
  switch (input.scenario) {
    case "lose_n_buyins":
      return -Math.abs(input.value) * buyIn;
    case "profit_amount":
      return input.value;
    case "win_streak":
      // streak vencedora: aproxima ganho como N * buyIn (placement medio simples).
      return Math.abs(input.value) * buyIn;
    case "lose_streak":
      return -Math.abs(input.value) * buyIn;
    default:
      return 0;
  }
}

async function handler(rawInput: unknown, ctx: { userId: string }): Promise<any> {
  // MEDIUM-2 reviewer: validar via Zod em runtime (aplica o superRefine).
  const parsed = simulateBankrollScenarioInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.issues };
  }
  const input = parsed.data;
  try {
    const balance: any = await (walletService as any).getConsolidatedBalance(ctx.userId);
    const currentAmount = num(balance?.totalUSD);
    const rule: string | null = balance?.rule ?? null;
    const softLimitUSD = optionalNum(balance?.softLimitUSD);
    const hardLimitUSD = optionalNum(balance?.hardLimitUSD);

    // Banca nao configurada (totalUSD <= 0): retorno controlado, sem throw.
    // (Usuario v1 sem wallet — getConsolidatedBalance().totalUSD === "0.00".)
    if (currentAmount <= 0) {
      return {
        scenario: input.scenario,
        currency: "USD",
        currentAmount: 0,
        newAmount: 0,
        percentChange: 0,
        rule: rule ?? null,
        softLimitUSD: null,
        hardLimitUSD: null,
        ruleViolated: false,
        alertLevel: "safe",
        recommendation:
          "Voce ainda nao configurou sua banca/regra no Grindfy — voce poderia definir isso em /bankroll " +
          "para que eu consiga simular cenarios. Lembrando que isto e uma estimativa, nao conselho financeiro.",
        note: "bankroll_nao_configurado",
      };
    }

    const delta = deltaFor(input);
    const newAmount = Math.round((currentAmount + delta) * 100) / 100;
    const percentChange =
      Math.round(((newAmount - currentAmount) / currentAmount) * 10000) / 100;

    // MEDIUM-3: getConsolidatedBalance so calcula soft/hard limit no modo 'global'.
    // No modo per_wallet ambos vêm null mesmo com banca configurada — NAO eh
    // "bankroll_nao_configurado": simulamos mostrando os valores reais e
    // sinalizamos que nao ha regra global pra avaliar violacao.
    if (softLimitUSD == null && hardLimitUSD == null) {
      return {
        scenario: input.scenario,
        currency: "USD",
        currentAmount,
        newAmount,
        percentChange,
        rule: rule ?? null,
        softLimitUSD: null,
        hardLimitUSD: null,
        ruleViolated: false,
        alertLevel: "safe",
        recommendation:
          `Sua banca consolidada hoje e ~$${currentAmount.toFixed(2)} e nesse cenario iria para ~$${newAmount.toFixed(2)} ` +
          `(${percentChange.toFixed(1)}%). Voce nao tem uma regra de banca global configurada (suas wallets estao em modo separado), ` +
          "entao nao da pra dizer se algum limite seria violado — voce poderia definir uma regra global em /bankroll. " +
          "Lembrando que isto e uma estimativa, nao conselho financeiro.",
        note: "regra_de_banca_nao_global",
      };
    }

    let alertLevel: "safe" | "warning" | "danger" = "safe";
    let ruleViolated = false;
    if (hardLimitUSD != null && newAmount < hardLimitUSD) {
      alertLevel = "danger";
      ruleViolated = true;
    } else if (softLimitUSD != null && newAmount < softLimitUSD) {
      alertLevel = "warning";
    }

    let recommendation: string;
    if (alertLevel === "danger") {
      recommendation =
        `Nesse cenario sua banca cairia abaixo do limite minimo da sua regra (${rule ?? "—"}). ` +
        "Voce poderia considerar reduzir o buy-in medio ou pausar antes de chegar la — isto e uma estimativa, " +
        "nao conselho financeiro.";
    } else if (alertLevel === "warning") {
      recommendation =
        "Esse cenario te aproximaria do limite de alerta da sua regra. Talvez fosse o caso de ajustar a grade " +
        "para buy-ins menores por um tempo. Lembrando: estimativa, nao conselho financeiro.";
    } else {
      recommendation =
        "Mesmo nesse cenario sua banca seguiria dentro da regra. Voce poderia manter a grade atual; " +
        "ainda assim, isto e uma estimativa, nao conselho financeiro.";
    }

    return {
      scenario: input.scenario,
      currency: "USD",
      currentAmount,
      newAmount,
      percentChange,
      rule: rule ?? null,
      softLimitUSD,
      hardLimitUSD,
      ruleViolated,
      alertLevel,
      recommendation,
    };
  } catch (err: any) {
    console.error("coach.tool.simulate_bankroll_scenario.error", {
      userId: ctx.userId,
      err,
    });
    return {
      ok: false,
      error: "handler_error",
      message: err?.message ?? "simulate_bankroll_scenario failed",
    };
  }
}

export const simulateBankrollScenarioTool: CoachTool = {
  name: "simulate_bankroll_scenario",
  description:
    "Simula um cenario hipotetico de banca (perder N buy-ins, lucro X, win/lose streak) e avalia " +
    "se a regra de banca do jogador seria violada. Output em USD. SEMPRE em tom condicional + " +
    "disclaimer (estimativa, nao conselho financeiro).",
  inputSchema: simulateBankrollScenarioInputSchema,
  handler,
  requiresConfirmation: false,
  auditLevel: "log",
  gateByTier: ["pro", "premium", "admin"],
};
