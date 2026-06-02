// =============================================================================
// bMental — Coach AI UX Overhaul (Wave 3 / #7) — categoria de nudge B-MENTAL
//
// bMentalTick({ now, injectedStorage? }) — roda hora-em-hora (cron 0 * * * *)
// filtrando hora local (20h). Opt-in (nudgeBMental default FALSE — so quem
// ativou recebe; shouldSendNudge checa o toggle). Elegibilidade: Pro+.
//
// Trigger: C-game recorrente na semana. Reusa getAbGameDistribution(userId,"7d")
// — se cGameEntryCount >= N (COACH_BMENTAL_CGAME_MIN, default 2), cobra revisao
// do mental antes de virar padrao. Tokens de tema sao PII-safe (cGameThemes —
// nunca o texto cru, R5). cycleKey YYYY-WW (1x/semana).
//
// Lessons: #3, #9 (safe-degrade por fonte), #6 nao-aplica (sem moeda).
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getLocalHour } from "../timezone";
import { isProPlusEligible, LIST_USERS_FOR_CRON_PRO_PLUS } from "../planEligibility";

const LOCAL_HOUR = 20; // fim de noite — pos-sessao; engine ainda filtra quiet hours.
const DEFAULT_CGAME_MIN = 2;

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

function cgameMin(): number {
  const raw = Number(process.env.COACH_BMENTAL_CGAME_MIN);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CGAME_MIN;
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  return storage;
}

function getISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}`;
}

async function isProPlus(store: any, userId: string, plan?: string): Promise<boolean> {
  try {
    const effectivePlan = plan ?? (await store.getUserSubscriptionPlan?.(userId)) ?? "free";
    return await isProPlusEligible(userId, effectivePlan);
  } catch (err) {
    console.error("b_mental.plan.error", { userId, err });
    return false;
  }
}

export async function bMentalTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("b_mental.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = await resolveStorage(opts.injectedStorage);
  const minC = cgameMin();

  let users: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }> = [];
  try {
    users = (await store.listUsersForCron?.(LIST_USERS_FOR_CRON_PRO_PLUS)) ?? [];
  } catch (err) {
    console.error("b_mental.list_users_error", { err });
    return;
  }

  for (const u of users) {
    const userId = u?.userPlatformId;
    if (!userId) continue;
    try {
      const tz = u?.timezone || "America/Sao_Paulo";
      if (getLocalHour(now, tz) !== LOCAL_HOUR) continue;
      if (!(await isProPlus(store, userId, u?.subscriptionPlan))) continue;

      // Sinal mental: C-game recorrente na semana (safe-degrade se metodo ausente).
      let cGameCount = 0;
      let themeTokens: string[] = [];
      try {
        const dist = await store.getAbGameDistribution?.(userId, "7d");
        cGameCount = Number(dist?.cGameEntryCount ?? 0);
        themeTokens = Array.isArray(dist?.cGameThemes)
          ? dist.cGameThemes.slice(0, 3).map((t: any) => String(t?.token ?? "")).filter(Boolean)
          : [];
      } catch (err) {
        console.error("b_mental.signal.error", { userId, err });
        continue;
      }
      if (cGameCount < minC) continue; // sem sinal suficiente — nao cobra.

      const cycleKey = getISOWeek(now);
      const decision = await shouldSendNudge(userId, {
        category: "B-MENTAL",
        cycleKey,
        now,
        triggeredByEvent: "b_mental_check",
      } as any);
      if (!decision.allow) continue;

      const themeHint = themeTokens.length ? ` (temas: ${themeTokens.join(", ")})` : "";
      const body =
        `Seu C-game apareceu ${cGameCount}x essa semana${themeHint}. ` +
        `Quando o leak mental se repete, vale tratar antes de virar padrao — ` +
        `quer revisar o mental comigo?`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "mental", title: "Revisar o mental" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
      } catch { /* card-only */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-MENTAL",
        cycleKey,
        status: "sent",
        titleI18n: "Revisar o mental",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "b_mental_check",
        link: "/coach-ai",
      });
      console.info("coach.nudge.b_mental.sent", { userId, cycleKey, cGameCount });
    } catch (err) {
      console.error("b_mental.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
