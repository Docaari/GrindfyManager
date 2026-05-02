// =============================================================================
// Fixtures compartilhadas — Sprint Coach-0 + Coach-2B
//
// Defaults documentados em ADR-084 (RF-01 spec coach-sprint-0).
// Fontes:
//   - Docs/specs/coach-sprint-0.md (RF-01 defaults)
//   - Docs/architecture/decisions/084-user-coach-preferences.md
// =============================================================================

export const COACH_PREFS_DEFAULTS = {
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
  coachTone: 'balanced' as const,
} as const;

export const COACH_PREFS_RESPONSE_DEFAULT = {
  nudges: {
    bSnapshot: true,
    bLeak: true,
    bStudy: true,
    bVolume: true,
    bGrade: true,
    bDownswing: true,
    bLife: false,
    bMental: false,
  },
  quietHours: { startHour: 21, endHour: 9, timezone: 'America/Sao_Paulo' },
  frequencyCap: { perDay: 3, perHour: 1 },
  channels: { inApp: true, email: true, push: false },
  coachTone: 'balanced' as const,
};

export const NUDGE_CATEGORIES = [
  'B-SNAPSHOT',
  'B-LEAK',
  'B-STUDY',
  'B-VOLUME',
  'B-GRADE',
  'B-DOWNSWING',
  'B-LIFE',
  'B-MENTAL',
] as const;

export const NUDGE_LOG_STATUSES = [
  'sent',
  'engaged',
  'dismissed',
  'snoozed',
  'unsubscribed',
] as const;

export const COACH_ACTION_STATUSES = [
  'pending',
  'executing',
  'completed',
  'failed',
  'undone',
  'expired',
] as const;

export const TIMEZONES_TO_TEST = [
  'America/Sao_Paulo', // UTC-3
  'Asia/Tokyo',        // UTC+9
] as const;

// Helper: retorna ISO string em UTC dado uma hora local + timezone.
// Usado em vi.setSystemTime / DI now: Date para tests deterministicos.
export function makeUtcDateAt(localHour: number, localMinute = 0, dayOffset = 0): Date {
  const d = new Date(Date.UTC(2026, 4, 28, localHour, localMinute, 0));
  if (dayOffset) d.setUTCDate(d.getUTCDate() + dayOffset);
  return d;
}

// Para testes de timezone: dado um Date UTC, retorna a hora local em determinado tz
export function expectedLocalHour(utc: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', hour12: false,
  });
  return Number(fmt.format(utc));
}
