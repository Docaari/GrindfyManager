// =============================================================================
// planEligibility — Helper compartilhado de elegibilidade por plano para crons
// e nudges do Coach.
//
// AI-1B bug fix consolidado (era duplicado em reportJobRunner.ts inline e tinha
// versao quebrada em gapCheck.ts + bImport.ts):
//   `users.subscription_plan` so assume 'trial' | 'active' | 'expired' | 'admin';
//   NUNCA 'pro' / 'premium'. A distincao pro/premium vem de
//   user_subscriptions JOIN subscription_plans, resolvida por resolveUserTier
//   (server/coachAccess.ts) -> 'free' | 'pro' | 'premium' | 'admin'.
//
// Resultado do bug latente: `PRO_PLANS = new Set(['pro','premium','admin'])` +
//   `listUsersForCron("subscription_plan IN ('pro','premium')")` retornavam
//   ZERO users pros nudges B-GAPCHECK e B-IMPORT (admin tambem nao, porque o
//   filtro IN tinha so 'pro','premium'). 100% dos nudges nunca disparavam.
//
// AI-1C (RF-02) formalizara isto em server/coach/reportEligibility.ts com a
// nocao de tier (`getReportTier`). Ate la, este helper é a fonte unica para
// elegibilidade de plano em jobs background.
//
// Lessons: #3 (mock shape real — listUsersForCron mock ignora WHERE),
//   #9 (logar antes de fallback / safe-deny).
// =============================================================================

export type EligibleTier = "trial" | "admin" | "pro" | "premium";

/** Filtro SQL canonico p/ `storage.listUsersForCron(...)` em jobs Pro+. */
export const LIST_USERS_FOR_CRON_PRO_PLUS = "subscription_plan IN ('trial','active','admin')";

/**
 * Resolve o tier elegivel ('trial' | 'admin' | 'pro' | 'premium') a partir do
 * `users.subscription_plan` cru. Retorna `null` se NAO elegivel ('free' /
 * 'expired' / vazio / desconhecido / erro de DB no resolveUserTier).
 *
 * Aceita defensivamente 'pro' / 'premium' diretamente — util pra tests que
 * passam o tier resolvido como fixture.
 */
export async function resolveEligiblePlanTier(
  userId: string,
  rawPlan?: string | null,
): Promise<EligibleTier | null> {
  const plan = String(rawPlan ?? "").toLowerCase();
  if (plan === "admin") return "admin";
  if (plan === "trial") return "trial";
  if (plan === "pro" || plan === "premium") return plan;
  if (plan === "active") {
    try {
      const { resolveUserTier } = await import("../coachAccess");
      const tier = await resolveUserTier({ userPlatformId: userId, subscriptionPlan: "active" });
      if (tier === "pro" || tier === "premium" || tier === "admin") return tier;
      return null; // 'free' — active mas sem subscription pro/premium ativa
    } catch (err) {
      console.error("plan_eligibility.resolve.error", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
      return null; // safe-deny (lesson #9)
    }
  }
  return null;
}

/** Boolean conveniente quando o caller so quer saber se é Pro+ (sem precisar do tier). */
export async function isProPlusEligible(userId: string, rawPlan?: string | null): Promise<boolean> {
  return (await resolveEligiblePlanTier(userId, rawPlan)) != null;
}
