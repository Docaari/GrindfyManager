// =============================================================================
// toolEligibility — Sprint AI-2A / Q-E locked (ADR-167)
//
// `isToolEligibleTier(user, toolName)` resolve "esse user pode chamar essa tool
// AI-2A?". Diferente de `resolveUserTier`, que continua tratando Trial como
// 'free' para fins de rate limit + tools antigas. Trial recebe acesso a tools
// AI-2A (ADR-167) — gate por nome.
//
// Decisao Q-E (founder locked 2026-05-20):
//   - Trial -> elegible nas AI-2A tools (pro-like)
//   - Pro/Premium/Admin -> elegible
//   - Free/Expired -> negado
//   - 'active' -> resolveUserTier => pro/premium/admin elegivel; free negado
//   - erro em resolveUserTier -> safe-deny `false` (lesson #9)
//
// AI-2A tool names (9):
//   bulk_propose_grade, schedule_study_block, create_study_theme, mark_off_day,
//   analyze_variance, diagnose_plateau, compute_grind_study_ratio,
//   calculate_effective_rake, query_pool_intelligence
// =============================================================================

export const AI_2A_TOOL_NAMES: ReadonlySet<string> = new Set([
  "bulk_propose_grade",
  "schedule_study_block",
  "create_study_theme",
  "mark_off_day",
  "analyze_variance",
  "diagnose_plateau",
  "compute_grind_study_ratio",
  "calculate_effective_rake",
  "query_pool_intelligence",
]);

type UserShape = {
  id?: string;
  userPlatformId?: string;
  subscriptionPlan?: string | null;
};

function isAi2aTool(toolName: string): boolean {
  return AI_2A_TOOL_NAMES.has(toolName);
}

/**
 * Resolve elegibilidade de um user para uma tool AI-2A. Para tools que NAO
 * sao AI-2A, retorna `true` (gating responsabilidade do `gateByTier` no
 * descritor + `exportToolsForAnthropic`).
 */
export async function isToolEligibleTier(
  user: UserShape | null | undefined,
  toolName: string,
): Promise<boolean> {
  // Tools fora do conjunto AI-2A nao sao filtradas aqui.
  if (!isAi2aTool(toolName)) return true;
  if (!user) return false;

  const plan = String(user.subscriptionPlan ?? "").toLowerCase();

  // Trial: bypass; Admin: sempre passa; pro/premium nominal: passa.
  if (plan === "admin" || plan === "trial") return true;
  if (plan === "pro" || plan === "premium") return true;

  if (plan === "free" || plan === "expired" || plan === "") return false;

  // 'active' -> resolveUserTier (safe-deny em erro).
  if (plan === "active") {
    try {
      const mod = await import("../coachAccess");
      const tier = await (mod as any).resolveUserTier({
        userPlatformId: user.userPlatformId ?? user.id,
        id: user.id,
        subscriptionPlan: "active",
      });
      if (tier === "pro" || tier === "premium" || tier === "admin") return true;
      return false;
    } catch (err) {
      console.error("tool_eligibility.resolve.error", {
        userId: user.id ?? user.userPlatformId,
        toolName,
        err: err instanceof Error ? err.message : String(err),
      });
      return false; // lesson #9 safe-deny
    }
  }

  return false;
}

/**
 * Filtra a lista de tools para um user: tools AI-2A precisam passar em
 * `isToolEligibleTier`. Tools nao-AI-2A passam direto (gate por descritor).
 */
export async function listEligibleToolsForUser<T extends { name: string }>(
  user: UserShape | null | undefined,
  allTools: T[],
): Promise<T[]> {
  const out: T[] = [];
  for (const t of allTools) {
    if (!isAi2aTool(t.name)) {
      out.push(t);
      continue;
    }
    if (await isToolEligibleTier(user, t.name)) {
      out.push(t);
    }
  }
  return out;
}
