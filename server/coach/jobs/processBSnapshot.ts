// =============================================================================
// processBSnapshot — Sprint Coach-2B / RF-07 (cron mensal dia 28, 9h local)
//
// Itera users pro/premium, dispara nudge B-SNAPSHOT quando hora local == 9.
// Engine bloqueia idempotencia via cycleKey YYYY-MM.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getLocalHour } from "../timezone";

interface BSnapshotTickOptions {
  now?: Date;
  targetLocalHour?: number;
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function processBSnapshotTick(opts: BSnapshotTickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const targetLocalHour = opts.targetLocalHour ?? 9;

  let users: any[] = [];
  try {
    users = await (storage as any).listUsersForCron(
      "subscription_plan IN ('pro','premium')",
    );
  } catch (err) {
    console.error("coach.cron.b_snapshot.list_users_error", { err });
    return;
  }

  for (const user of users) {
    try {
      const tz = user.timezone || "America/Sao_Paulo";
      const localHour = getLocalHour(now, tz);
      if (localHour !== targetLocalHour) continue;

      const cycleKey = monthKey(now);
      const decision = await shouldSendNudge(user.userPlatformId, {
        category: "B-SNAPSHOT",
        cycleKey,
        now,
      });
      if (!decision.allow) continue;

      const hasSnap = await (storage as any).hasSnapshotThisMonth(
        user.userPlatformId,
        cycleKey,
      );
      if (hasSnap) {
        console.info("coach.cron.b_snapshot.skip_already_snapshotted", {
          userId: user.userPlatformId,
          cycleKey,
        });
        continue;
      }

      const session = await (storage as any).createChatSession({
        userId: user.userPlatformId,
        coachType: "tournament",
        title: "Snapshot mensal de bankroll",
      });

      const message =
        `Mes acaba em poucos dias. Bora fechar o snapshot da banca?\n\n` +
        `Posso registrar o snapshot do mes ou voce prefere atualizar saldos primeiro?\n\n` +
        `[Botoes inline: "Registrar snapshot agora" | "Atualizar saldos" | "Lembrar amanha"]`;

      await (storage as any).insertChatMessage({
        chatSessionId: session.id,
        role: "assistant",
        content: message,
      });

      await (storage as any).createNudgeLog({
        userId: user.userPlatformId,
        category: "B-SNAPSHOT",
        cycleKey,
        status: "sent",
        titleI18n: "Snapshot mensal de bankroll",
        bodyPreview: message.slice(0, 500),
        chatSessionId: session.id,
        triggeredByEvent: "cron_28th",
      });
      console.info("coach.nudge.b_snapshot.sent", {
        userId: user.userPlatformId,
        cycleKey,
      });
    } catch (err) {
      console.error("coach.cron.b_snapshot.user.error", {
        userId: user?.userPlatformId,
        err,
      });
    }
  }
}
