// =============================================================================
// bImport — Sprint AI-1B / RF-11 (ADR-157) — categoria de nudge B-IMPORT
//
// bImportTick({ now, injectedStorage? }) — roda hora-em-hora (cron 0 * * * *)
// filtrando hora util local. Independente do gap-check: "voce esta jogando mas
// nao trackeando". Elegibilidade: Pro+ (consistente com B-STUDY).
//
// Logica: lastImportAt = getLastUploadAt(userId). Se `now - lastImportAt < N dias`
// (N = COACH_BIMPORT_DAYS, default 5) OU (nunca importou mas sem sessoes) -> skip.
// sessionsInPeriod = countGrindSessionsSince(userId, lastImportAt ?? now-Ndias).
// Se 0 -> skip (nao esta jogando). Caso contrario -> 1 nudge gentil 1x/semana
// (cycleKey YYYY-WW) com link /upload, via shouldSendNudge.
//
// Lessons: #3, #9, `now: Date` injetavel.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getLocalHour } from "../timezone";

const PRO_PLANS = new Set(["pro", "premium", "admin"]);
const LOCAL_HOUR = 15; // hora util — 15h local; engine filtra quiet hours de qualquer forma.
const DEFAULT_DAYS = 5;

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

function bimportDays(): number {
  const raw = Number(process.env.COACH_BIMPORT_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAYS;
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
    return PRO_PLANS.has(String(effectivePlan));
  } catch (err) {
    console.error("b_import.plan.error", { userId, err });
    return false;
  }
}

export async function bImportTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("b_import.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = await resolveStorage(opts.injectedStorage);
  const days = bimportDays();
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  let users: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }> = [];
  try {
    users = (await store.listUsersForCron?.("subscription_plan IN ('pro','premium')")) ?? [];
  } catch (err) {
    console.error("b_import.list_users_error", { err });
    return;
  }
  for (const u of users) {
    const userId = u?.userPlatformId;
    if (!userId) continue;
    try {
      const tz = u?.timezone || "America/Sao_Paulo";
      if (getLocalHour(now, tz) !== LOCAL_HOUR) continue;
      if (!(await isProPlus(store, userId, u?.subscriptionPlan))) continue;

      const lastImportAt: Date | null = (await store.getLastUploadAt?.(userId)) ?? null;
      const lastMs = lastImportAt ? new Date(lastImportAt).getTime() : null;
      // se importou recentemente (< N dias) -> skip.
      if (lastMs != null && now.getTime() - lastMs < thresholdMs) continue;

      const sinceTs = lastMs != null ? new Date(lastMs) : new Date(now.getTime() - thresholdMs);
      const sessionsInPeriod = Number((await store.countGrindSessionsSince?.(userId, sinceTs)) ?? 0);
      if (sessionsInPeriod === 0) continue; // nao esta jogando — nao cobra.

      const cycleKey = getISOWeek(now);
      const decision = await shouldSendNudge(userId, {
        category: "B-IMPORT",
        cycleKey,
        now,
        triggeredByEvent: "b_import_check",
      } as any);
      if (!decision.allow) continue;

      const body =
        `Você registrou ${sessionsInPeriod} sessões recentemente mas não importou nenhum CSV — ` +
        `estou meio cego sobre seus resultados reais. Bora importar? /upload`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "technical", title: "Importe seu histórico" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
      } catch { /* card-only */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-IMPORT",
        cycleKey,
        status: "sent",
        titleI18n: "Importe seu histórico",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "b_import_check",
        link: "/upload",
      });
      console.info("coach.nudge.b_import.sent", { userId, cycleKey, sessionsInPeriod });
    } catch (err) {
      console.error("b_import.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
