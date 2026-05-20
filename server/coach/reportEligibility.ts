// =============================================================================
// reportEligibility — Sprint AI-1C / RF-02 (ADR-159) — fonte canonica de
// elegibilidade de relatorios (weekly / daily / monthly).
//
// Distincao Important:
//   - `resolveUserTier` (server/coachAccess.ts) gateia rate limit + tools.
//     Para rate-limit, Trial conta como `'free'` (intencional — Trial usa o
//     mesmo cap do Free pra coach chat).
//   - `getReportTier` (este modulo) eh a fonte para RELATORIOS. Trial conta
//     como `'eligible'` (Q2 do founder — Trial recebe relatorios opt-in).
//
// Tabela RF-02 (resumo):
//   subscription_plan='trial'                    -> 'eligible'
//   subscription_plan='active' + sub pro/premium -> 'eligible'
//   role='admin' OR subscription_plan='admin'    -> 'eligible'
//   anything else (free/expired/'')              -> 'free'
//
// `isReportEligible(userId, reportType)` combina o tier elegivel + o opt-in
// da preferencia correspondente (`report{Weekly|Daily|Monthly}Enabled`).
// Safe-deny em erro de leitura (lesson #9).
//
// Tambem expõe `LIST_USERS_FOR_REPORTS_FILTER` — string SQL para o filtro
// do `storage.listUsersForCron` (mesmo set do `planEligibility.ts` —
// 'trial' + 'active' + 'admin'; o 'active' é re-validado via resolveUserTier).
// =============================================================================

import { resolveUserTier, type CoachTier } from "../coachAccess";

export type ReportTier = "free" | "eligible";
export type ReportKind = "weekly" | "daily" | "monthly" | "quarterly";

export const LIST_USERS_FOR_REPORTS_FILTER =
  "subscription_plan IN ('trial','active','admin')";

export interface ReportEligibilityUserInput {
  userPlatformId?: string;
  id?: string;
  role?: string | null;
  subscriptionPlan?: string | null;
}

/**
 * Resolve o "tier de relatorio" do user — alinhado a tabela RF-02.
 *  - 'trial' raw -> 'eligible' (Q2 do founder)
 *  - 'admin' raw OR role='admin' -> 'eligible'
 *  - 'active' raw -> consulta resolveUserTier; pro/premium/admin -> 'eligible'
 *  - 'free'/'expired'/'' raw -> 'free'
 *  - 'pro'/'premium' raw (defensivo, nao deveria existir em prod) -> 'eligible'
 *  - desconhecido / erro de resolveUserTier -> 'free' (safe-deny)
 *
 * NAO altera o comportamento de `resolveUserTier` em si — esse continua
 * usado para rate limit / tool gating (onde Trial vira free).
 */
export async function getReportTier(user: ReportEligibilityUserInput | null | undefined): Promise<ReportTier> {
  if (!user) return "free";
  if (user.role === "admin" || user.subscriptionPlan === "admin") return "eligible";
  const plan = String(user.subscriptionPlan ?? "").toLowerCase();
  if (plan === "trial") return "eligible";
  if (plan === "pro" || plan === "premium") return "eligible"; // defensivo
  if (plan === "active") {
    try {
      const tier = await resolveUserTier(user as any);
      if (tier === "pro" || tier === "premium" || tier === "admin") return "eligible";
      return "free"; // active mas sem subscription pro/premium ativa
    } catch (err) {
      console.error("report_eligibility.tier.error", {
        userId: user.userPlatformId ?? user.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return "free"; // safe-deny (lesson #9)
    }
  }
  return "free";
}

export const PREF_FIELD_BY_KIND: Record<
  ReportKind,
  "reportWeeklyEnabled" | "reportDailyEnabled" | "reportMonthlyEnabled" | "reportQuarterlyEnabled"
> = {
  weekly: "reportWeeklyEnabled",
  daily: "reportDailyEnabled",
  monthly: "reportMonthlyEnabled",
  quarterly: "reportQuarterlyEnabled",
};

/**
 * Combina tier elegivel + opt-in da preferencia do tipo. Safe-deny em erro.
 * Lookup do user + prefs eh feito por funcao injetada para permitir mocks.
 */
export async function isReportEligible(
  userId: string,
  reportType: ReportKind,
  deps?: {
    getUser?: (userId: string) => Promise<ReportEligibilityUserInput | null>;
    getPrefs?: (userId: string) => Promise<Record<string, any> | null>;
  },
): Promise<boolean> {
  try {
    const getUser = deps?.getUser ?? (async (uid: string) => {
      const mod: any = await import("../storage");
      const storage = mod.storage;
      const u = await storage.getUserByPlatformId?.(uid);
      if (!u) return null;
      return {
        userPlatformId: u.userPlatformId ?? u.id ?? uid,
        id: u.id,
        role: u.role ?? null,
        subscriptionPlan: u.subscriptionPlan ?? null,
      };
    });
    const getPrefs = deps?.getPrefs ?? (async (uid: string) => {
      const mod = await import("../storage/coachPreferences");
      return (await mod.getCoachPreferences(uid)) as any;
    });

    const [user, prefs] = await Promise.all([getUser(userId), getPrefs(userId)]);
    const tier = await getReportTier(user);
    if (tier === "free") return false;
    const field = PREF_FIELD_BY_KIND[reportType];
    return prefs?.[field] === true;
  } catch (err) {
    console.error("report_eligibility.is_eligible.error", {
      userId,
      reportType,
      err: err instanceof Error ? err.message : String(err),
    });
    return false; // safe-deny
  }
}

/**
 * Variante stateless para o cron — recebe o `subscriptionPlan` raw + o
 * `prefs` ja em mao (que o enqueuer ja le em batch). Evita N round-trips.
 */
export async function isReportEligibleWithSnapshot(
  user: ReportEligibilityUserInput,
  reportType: ReportKind,
  prefs?: Record<string, any> | null,
): Promise<boolean> {
  const tier = await getReportTier(user);
  if (tier === "free") return false;
  const field = PREF_FIELD_BY_KIND[reportType];
  return prefs?.[field] === true;
}
