// =============================================================================
// bFollowup — Coach AI UX Overhaul (#8) — categoria B-FOLLOWUP (accountability).
//
// bFollowupTick({ now, injectedStorage? }) — roda hora-em-hora (cron 0 * * * *).
// Lista compromissos vencidos (due_date <= hoje, status active, ainda nao
// cobrados) e cobra 1 nudge por compromisso ("fechou X?"). Dedup real via
// followedUpAt (so cobra 1x); quiet hours + caps via shouldSendNudge. Toggle
// nudgeBFollowup (default true — o jogador se comprometeu, cobrar e esperado).
//
// Sem gate de tier: o compromisso so existe porque o jogador (Pro+) o criou via
// log_commitment; cobrar o proprio compromisso e correto mesmo apos downgrade.
//
// Lessons: #3, #9 (try/catch por compromisso), `now: Date` injetavel.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  return storage;
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function bFollowupTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("b_followup.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = await resolveStorage(opts.injectedStorage);
  const asOf = ymdUtc(now);

  let due: any[] = [];
  try {
    due = (await store.listDueCoachCommitments?.(asOf)) ?? [];
  } catch (err) {
    console.error("b_followup.list_due_error", { err });
    return;
  }

  for (const c of Array.isArray(due) ? due : []) {
    const userId = c?.userId;
    const commitmentId = c?.id;
    if (!userId || !commitmentId) continue;
    try {
      const decision = await shouldSendNudge(userId, {
        category: "B-FOLLOWUP",
        now,
        triggeredByEvent: "b_followup_check",
      } as any);
      // quiet hours / cap -> NAO marca followedUpAt (re-tenta no proximo tick).
      if (!decision.allow) continue;

      const text = String(c?.text ?? "seu compromisso");
      const body =
        `Combinamos: voce ia "${text}" (ate ${c?.dueDate}). Fechou? ` +
        `Se sim, partiu o proximo; se nao, bora ajustar o plano juntos.`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "technical", title: "Combinamos isso" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
      } catch { /* card-only */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-FOLLOWUP",
        status: "sent",
        titleI18n: "Combinamos isso",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "b_followup_check",
        link: "/coach-ai",
      });
      await store.markCoachCommitmentFollowedUp?.(commitmentId);
      console.info("coach.nudge.b_followup.sent", { userId, commitmentId });
    } catch (err) {
      console.error("b_followup.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
