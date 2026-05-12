// =============================================================================
// nudgeAutoFreeze — Sprint AI-1A / RF-05 (ADR-152 §6)
//
// checkAndFreezeCategory(userId, category): chamado apos cada dismiss/unsubscribe
// de um nudge dessa categoria. Se a taxa de dismiss na janela estoura o threshold
// (com amostra minima), congela a categoria em userCoachPreferences.frozenCategories
// e cria um coach_nudge_log row de aviso (triggeredByEvent='auto_freeze_notice',
// status='sent' — NAO passa por shouldSendNudge).
//
// Idempotente: categoria ja congelada -> nao recria o aviso. NAO auto-descongela.
//
// Lesson #9: erro de DB -> log + retorna { frozen: false } sem throw.
// =============================================================================

import { storage } from "../storage";
import { getCoachPreferences, upsertCoachPreferences } from "../storage/coachPreferences";
import type { NudgeCategory } from "./nudgeEngine";

export const WINDOW_DAYS = 7;
export const MIN_SAMPLE = 3;
export const DISMISS_RATE_THRESHOLD = 0.5;

function categoryLabelPt(category: string): string {
  const map: Record<string, string> = {
    "B-SNAPSHOT": "snapshot mensal",
    "B-LEAK": "leaks",
    "B-STUDY": "estudo",
    "B-VOLUME": "volume",
    "B-GRADE": "grade",
    "B-DOWNSWING": "downswing",
    "B-LIFE": "vida fora do poker",
    "B-MENTAL": "cuidado mental",
  };
  return map[category] ?? category;
}

export async function checkAndFreezeCategory(
  userId: string,
  category: NudgeCategory,
  injectedStorage?: any,
): Promise<{ frozen: boolean; rate?: number }> {
  const store: any = injectedStorage ?? storage;
  try {
    const prefs = await getCoachPreferences(userId);
    const frozenCategories: Record<string, any> = { ...(prefs.frozenCategories || {}) };

    // Idempotente: ja congelada -> nao faz nada novo.
    if (frozenCategories[category]) {
      return { frozen: true };
    }

    const { sent, dismissed, rate } = await store.getNudgeDismissRate(
      userId,
      category,
      WINDOW_DAYS,
    );

    if (sent >= MIN_SAMPLE && rate > DISMISS_RATE_THRESHOLD) {
      const now = new Date();
      frozenCategories[category] = {
        frozenAt: now.toISOString(),
        reason: "auto_dismiss_rate",
        dismissRate: rate,
        windowDays: WINDOW_DAYS,
      };
      await upsertCoachPreferences(userId, { frozenCategories } as any);

      const label = categoryLabelPt(category);
      try {
        await store.createNudgeLog({
          userId,
          category,
          status: "sent",
          triggeredByEvent: "auto_freeze_notice",
          titleI18n: `Avisos de ${label} pausados`,
          bodyPreview:
            `Notei que voce dispensou a maioria dos avisos sobre ${label} — pausei essa categoria. ` +
            `Voce pode reativa-la em Preferencias quando quiser.`,
          channel: "in_app",
          sentAt: now,
        });
      } catch (err) {
        console.error("coach.nudge.auto_freeze.notice.error", { userId, category, err });
      }
      return { frozen: true, rate };
    }

    return { frozen: false, rate };
  } catch (err) {
    console.error("coach.nudge.auto_freeze.error", { userId, category, err });
    return { frozen: false };
  }
}
