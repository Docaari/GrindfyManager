// =============================================================================
// processCoachLeakDetection — Sprint Coach-2B / RF-08 (B-LEAK pos-upload)
//
// Hook async pos-commit do upload. detectLeaks(userId, opts) — Coach-2B ABI.
// cycleKey YYYY-WW (max 1 nudge B-LEAK por semana).
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { detectLeaks, type CoachLeakSummary } from "../../coachLeakDetection";

interface ProcessLeakInput {
  userId: string;
  uploadId?: string;
}

function getISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}`;
}

export async function processCoachLeakDetection(input: ProcessLeakInput): Promise<void> {
  const { userId } = input;
  const now = new Date();
  const cycleKey = getISOWeek(now);

  try {
    // Engine first — early-DENY economiza detectLeaks query
    const decision = await shouldSendNudge(userId, {
      category: "B-LEAK",
      cycleKey,
      now,
    });
    if (!decision.allow) return;

    let leaks: CoachLeakSummary[] = [];
    try {
      leaks = await detectLeaks(userId, { minSeverity: "medium" });
    } catch (err) {
      console.error("coach.cron.b_leak.detect_error", { userId, err });
      return;
    }
    if (!Array.isArray(leaks) || leaks.length === 0) return;

    // Gap-check: filtra leaks ja mencionados em 30d
    const recent = await storage.queryRecentChatMessages(userId, {
      sinceDays: 30,
    });
    const recentText = (recent || [])
      .map((m) => String(m?.content ?? ""))
      .join("\n")
      .toLowerCase();

    const newLeaks = leaks.filter((l) => {
      const code = String(l.code ?? "").toLowerCase();
      if (!code) return false;
      return !recentText.includes(code);
    });
    if (newLeaks.length === 0) return;

    const list = newLeaks
      .slice(0, 5)
      .map(
        (l) =>
          `- [${l.severity}] ${l.code}: ${l.evidence ? `n=${l.evidence.n}` : ""}`,
      )
      .join("\n");

    const session = await storage.createChatSession({
      userId,
      coachType: "technical",
      title: "Leaks novos detectados",
    });

    const message =
      `Acabei de processar seus torneios novos.\n\n` +
      `Detectei ${newLeaks.length} leak(s) novo(s):\n${list}\n\n` +
      `Quer revisar agora ou prefere mais tarde?`;

    await storage.insertChatMessage({
      chatSessionId: session.id,
      role: "assistant",
      content: message,
    });

    await storage.createNudgeLog({
      userId,
      category: "B-LEAK",
      cycleKey,
      status: "sent",
      titleI18n: "Leaks novos detectados",
      bodyPreview: message.slice(0, 500),
      chatSessionId: session.id,
      triggeredByEvent: "csv_upload",
    });
    console.info("coach.nudge.b_leak.sent", { userId, cycleKey, count: newLeaks.length });
  } catch (err) {
    console.error("coach.cron.b_leak.error", { userId, err });
  }
}
