// =============================================================================
// Coach Preferences Storage — Sprint Coach Sprint 0 / RF-01
//
// Fontes:
//   - Docs/specs/coach-sprint-0.md (RF-01)
//   - Docs/architecture/decisions/084-user-coach-preferences.md
//
// Lessons aplicadas:
//   - #7 (deprecation gradual): normalizeCoachPreferences aplica defaults via ??.
//   - #9 (try/catch): DB error -> log + retorna defaults safe (NAO crasha caller).
//   - #19 (cache stale entre abas): TTL 30s + invalidate em upsert.
// =============================================================================

import { db } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { userCoachPreferences } from "@shared/schema";

export interface FrozenCategoryEntry {
  frozenAt: string;
  reason: "auto_dismiss_rate" | "admin" | "manual" | string;
  dismissRate?: number;
  windowDays?: number;
}

export interface CoachPreferences {
  nudgeBSnapshot: boolean;
  nudgeBLeak: boolean;
  nudgeBStudy: boolean;
  nudgeBVolume: boolean;
  nudgeBGrade: boolean;
  nudgeBDownswing: boolean;
  nudgeBLife: boolean;
  nudgeBMental: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  maxNudgesPerDay: number;
  maxNudgesPerHour: number;
  channelInApp: boolean;
  channelEmail: boolean;
  channelPush: boolean;
  coachTone: "gentle" | "balanced" | "direct";
  // Sprint AI-1A / RF-02 — estado de auto-congelamento por categoria.
  frozenCategories: Record<string, FrozenCategoryEntry>;
  // Sprint AI-1B (ADR-155/157) — opt-in do Weekly Report + toggles novos.
  reportWeeklyEnabled: boolean;
  nudgeBGapcheck: boolean;
  nudgeBImport: boolean;
  // Sprint AI-1C (ADR-159) — opt-in Daily Debrief + Monthly Report.
  reportDailyEnabled: boolean;
  reportMonthlyEnabled: boolean;
  // Sprint AI-2B (ADR-169/172) — opt-in Quarterly + email channels.
  reportQuarterlyEnabled: boolean;
  emailWeeklyEnabled: boolean;
  emailMonthlyEnabled: boolean;
  emailQuarterlyEnabled: boolean;
  disclaimerAcceptedAt: Date | null;
  // Sprint Mini Player 2 (RF-NEW.2) — sleep timer preset. NULL = nao auto-ativa.
  audioSleepTimerMinutes: number | null;
  updatedAt?: Date;
}

export const COACH_PREFS_DEFAULTS: CoachPreferences = {
  nudgeBSnapshot: true,
  nudgeBLeak: true,
  nudgeBStudy: true,
  nudgeBVolume: true,
  nudgeBGrade: true,
  nudgeBDownswing: true,
  nudgeBLife: false,
  nudgeBMental: false,
  quietHoursStart: 21,
  quietHoursEnd: 9,
  maxNudgesPerDay: 3,
  maxNudgesPerHour: 1,
  channelInApp: true,
  channelEmail: true,
  channelPush: false,
  coachTone: "balanced",
  frozenCategories: {},
  // EST-1.1 (ADR-223 §INFO-2): delivery defaults flipados para `true` para que
  // NOVOS usuarios elegiveis nascam opt-in (honra D2/D6 para signups via app —
  // a migration 0086 so cobriu o DEFAULT do DB + back-fill de rows existentes;
  // upsertCoachPreferences insere as colunas explicitamente a partir daqui).
  // Risco semantico zero: getReportTier gateia free/expired na geracao.
  // Quarterly intocado (segue opt-out — D6).
  reportWeeklyEnabled: true,
  nudgeBGapcheck: true,
  nudgeBImport: true,
  reportDailyEnabled: true,
  reportMonthlyEnabled: true,
  reportQuarterlyEnabled: false,
  emailWeeklyEnabled: true,
  emailMonthlyEnabled: true,
  emailQuarterlyEnabled: false,
  disclaimerAcceptedAt: null,
  audioSleepTimerMinutes: null,
};

const CACHE_TTL_MS = 30_000;
const prefsCache = new Map<string, { value: CoachPreferences; expiresAt: number }>();

/** Lesson #7 — back-fill defaults para qualquer coluna null. */
export function normalizeCoachPreferences(row: any): CoachPreferences {
  return {
    nudgeBSnapshot: row?.nudgeBSnapshot ?? COACH_PREFS_DEFAULTS.nudgeBSnapshot,
    nudgeBLeak: row?.nudgeBLeak ?? COACH_PREFS_DEFAULTS.nudgeBLeak,
    nudgeBStudy: row?.nudgeBStudy ?? COACH_PREFS_DEFAULTS.nudgeBStudy,
    nudgeBVolume: row?.nudgeBVolume ?? COACH_PREFS_DEFAULTS.nudgeBVolume,
    nudgeBGrade: row?.nudgeBGrade ?? COACH_PREFS_DEFAULTS.nudgeBGrade,
    nudgeBDownswing: row?.nudgeBDownswing ?? COACH_PREFS_DEFAULTS.nudgeBDownswing,
    nudgeBLife: row?.nudgeBLife ?? COACH_PREFS_DEFAULTS.nudgeBLife,
    nudgeBMental: row?.nudgeBMental ?? COACH_PREFS_DEFAULTS.nudgeBMental,
    quietHoursStart:
      row?.quietHoursStart ?? COACH_PREFS_DEFAULTS.quietHoursStart,
    quietHoursEnd: row?.quietHoursEnd ?? COACH_PREFS_DEFAULTS.quietHoursEnd,
    maxNudgesPerDay:
      row?.maxNudgesPerDay ?? COACH_PREFS_DEFAULTS.maxNudgesPerDay,
    maxNudgesPerHour:
      row?.maxNudgesPerHour ?? COACH_PREFS_DEFAULTS.maxNudgesPerHour,
    channelInApp: row?.channelInApp ?? COACH_PREFS_DEFAULTS.channelInApp,
    channelEmail: row?.channelEmail ?? COACH_PREFS_DEFAULTS.channelEmail,
    channelPush: row?.channelPush ?? COACH_PREFS_DEFAULTS.channelPush,
    coachTone:
      (row?.coachTone as CoachPreferences["coachTone"]) ??
      COACH_PREFS_DEFAULTS.coachTone,
    frozenCategories:
      (row?.frozenCategories && typeof row.frozenCategories === "object"
        ? row.frozenCategories
        : {}) as Record<string, FrozenCategoryEntry>,
    reportWeeklyEnabled:
      row?.reportWeeklyEnabled ?? COACH_PREFS_DEFAULTS.reportWeeklyEnabled,
    nudgeBGapcheck: row?.nudgeBGapcheck ?? COACH_PREFS_DEFAULTS.nudgeBGapcheck,
    nudgeBImport: row?.nudgeBImport ?? COACH_PREFS_DEFAULTS.nudgeBImport,
    reportDailyEnabled:
      row?.reportDailyEnabled ?? COACH_PREFS_DEFAULTS.reportDailyEnabled,
    reportMonthlyEnabled:
      row?.reportMonthlyEnabled ?? COACH_PREFS_DEFAULTS.reportMonthlyEnabled,
    reportQuarterlyEnabled:
      row?.reportQuarterlyEnabled ?? COACH_PREFS_DEFAULTS.reportQuarterlyEnabled,
    emailWeeklyEnabled:
      row?.emailWeeklyEnabled ?? COACH_PREFS_DEFAULTS.emailWeeklyEnabled,
    emailMonthlyEnabled:
      row?.emailMonthlyEnabled ?? COACH_PREFS_DEFAULTS.emailMonthlyEnabled,
    emailQuarterlyEnabled:
      row?.emailQuarterlyEnabled ?? COACH_PREFS_DEFAULTS.emailQuarterlyEnabled,
    disclaimerAcceptedAt:
      row?.disclaimerAcceptedAt ?? COACH_PREFS_DEFAULTS.disclaimerAcceptedAt,
    audioSleepTimerMinutes:
      row?.audioSleepTimerMinutes ?? COACH_PREFS_DEFAULTS.audioSleepTimerMinutes,
    updatedAt: row?.updatedAt,
  };
}

export async function getCoachPreferences(
  userId: string,
): Promise<CoachPreferences> {
  const cached = prefsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const rows = await db
      .select()
      .from(userCoachPreferences)
      .where(eq(userCoachPreferences.userId, userId))
      .limit(1);

    const row = Array.isArray(rows) ? rows[0] : undefined;
    const value = row
      ? normalizeCoachPreferences(row)
      : { ...COACH_PREFS_DEFAULTS };

    // So cacheia sucesso (lesson #9)
    prefsCache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    // Lesson #9 — log estruturado + safe fallback
    console.error("coach.prefs.read.error", { userId, err });
    return { ...COACH_PREFS_DEFAULTS };
  }
}

export async function upsertCoachPreferences(
  userId: string,
  delta: Partial<CoachPreferences>,
): Promise<CoachPreferences> {
  const current = await getCoachPreferences(userId);
  const merged: CoachPreferences = {
    ...current,
    ...delta,
    updatedAt: new Date(),
  };

  try {
    await db
      .insert(userCoachPreferences)
      .values({
        id: nanoid(),
        userId,
        ...merged,
      } as any)
      .onConflictDoUpdate({
        target: userCoachPreferences.userId,
        set: { ...merged, updatedAt: new Date() } as any,
      });
  } catch (err) {
    console.error("coach.prefs.upsert.error", { userId, err });
    throw err;
  }

  // Invalida cache local (lesson #19)
  prefsCache.delete(userId);
  return merged;
}

/** Helper de teste — limpa cache entre testes. */
export function _resetPrefsCacheForTests(): void {
  prefsCache.clear();
}
