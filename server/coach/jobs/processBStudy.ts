// =============================================================================
// processBStudy — Sprint Coach-2B / RF-09 (cron diario 19h local)
//
// Cron diario verifica focos de leak ativos sem study_session em 7d.
// Boundary: nudge so apos 7d do createdAt do foco MAIS RECENTE.
// 2+ focos: pega o de baselineSampleSize maior.
// cycleKey YYYY-WW.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getLocalHour } from "../timezone";

interface BStudyTickOptions {
  now?: Date;
  targetLocalHour?: number;
}

function getISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}`;
}

export async function processBStudyTick(opts: BStudyTickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const targetLocalHour = opts.targetLocalHour ?? 19;

  let users: any[] = [];
  try {
    users = await (storage as any).listUsersForCron(
      "subscription_plan IN ('pro','premium')",
    );
  } catch (err) {
    console.error("coach.cron.b_study.list_users_error", { err });
    return;
  }

  for (const user of users) {
    try {
      const tz = user.timezone || "America/Sao_Paulo";
      if (getLocalHour(now, tz) !== targetLocalHour) continue;

      const focuses: any[] =
        (await (storage as any).findActiveLeakFocusList?.(user.userPlatformId)) ?? [];
      if (!focuses || focuses.length === 0) continue;

      // Boundary: foco precisa ter >= 7 dias desde createdAt
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const eligible = focuses.filter((f: any) => {
        const createdAt = f.createdAt instanceof Date ? f.createdAt : new Date(f.createdAt);
        return now.getTime() - createdAt.getTime() >= sevenDaysMs;
      });
      if (eligible.length === 0) continue;

      // Para cada foco eligible, conta study_sessions em 7d
      const focusStudyCounts: Array<{ focus: any; count: number }> = [];
      for (const focus of eligible) {
        const count = await (storage as any).countStudySessionsMatchingFocus(
          user.userPlatformId,
          focus,
          { sinceDays: 7 },
        );
        focusStudyCounts.push({ focus, count });
      }

      const candidates = focusStudyCounts.filter((fc) => fc.count === 0);
      if (candidates.length === 0) continue;

      // Multiplos focos: pega o de maior baselineSampleSize (tie-break: createdAt asc)
      candidates.sort((a, b) => {
        const sizeDiff =
          Number(b.focus.baselineSampleSize) - Number(a.focus.baselineSampleSize);
        if (sizeDiff !== 0) return sizeDiff;
        const aTs = new Date(a.focus.createdAt).getTime();
        const bTs = new Date(b.focus.createdAt).getTime();
        return aTs - bTs;
      });
      const chosen = candidates[0].focus;

      const cycleKey = getISOWeek(now);
      const decision = await shouldSendNudge(user.userPlatformId, {
        category: "B-STUDY",
        cycleKey,
        now,
      });
      if (!decision.allow) continue;

      const session = await (storage as any).createChatSession({
        userId: user.userPlatformId,
        coachType: "technical",
        title: `Estudo do foco: ${chosen.leakCode}`,
      });

      const message =
        `Voce escolheu focar em '${chosen.description ?? chosen.leakCode}' no inicio do mes.\n\n` +
        `Faz 7 dias que nao registro estudo nesse foco.\n\n` +
        `Quer agendar 30 min hoje?`;

      await (storage as any).insertChatMessage({
        chatSessionId: session.id,
        role: "assistant",
        content: message,
      });

      await (storage as any).createNudgeLog({
        userId: user.userPlatformId,
        category: "B-STUDY",
        cycleKey,
        status: "sent",
        titleI18n: `Estudo: ${chosen.leakCode}`,
        bodyPreview: message.slice(0, 500),
        chatSessionId: session.id,
        triggeredByEvent: "cron_daily",
      });
      console.info("coach.nudge.b_study.sent", {
        userId: user.userPlatformId,
        cycleKey,
        leakCode: chosen.leakCode,
      });
    } catch (err) {
      console.error("coach.cron.b_study.user.error", {
        userId: user?.userPlatformId,
        err,
      });
    }
  }
}
