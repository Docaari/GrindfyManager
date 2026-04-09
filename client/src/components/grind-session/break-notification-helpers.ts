// Break notification helpers — pure functions for break system logic (FP-07)

const VALID_FREQUENCIES = [30, 45, 60, 90];
const DEFAULT_FREQUENCY = 60;
const DEFAULT_MAX_SNOOZES = 3;

type SnoozeOption = 'respond-now' | 'snooze-15min' | 'skip';

interface UserSettings {
  breakFrequencyMinutes?: number;
  [key: string]: any;
}

/**
 * Returns break frequency in minutes from user settings, or default 60.
 * Only accepts valid values: 30, 45, 60, 90.
 */
export function getBreakFrequency(settings: UserSettings | null): number {
  if (!settings || !settings.breakFrequencyMinutes || !VALID_FREQUENCIES.includes(settings.breakFrequencyMinutes)) {
    return DEFAULT_FREQUENCY;
  }
  return settings.breakFrequencyMinutes;
}

/**
 * Determines if it's time to trigger a break.
 * Returns true when elapsed minutes since session start (or since last break) >= frequency.
 */
export function shouldTriggerBreak(
  elapsedMinutes: number,
  frequency: number,
  lastBreakTime: number | null,
): boolean {
  const minutesSinceLastBreak = lastBreakTime !== null
    ? elapsedMinutes - lastBreakTime
    : elapsedMinutes;
  return minutesSinceLastBreak >= frequency;
}

/**
 * Returns minutes remaining until next break. Minimum 0.
 */
export function getBreakCountdownMinutes(nextBreakTime: number, currentTime: number): number {
  const diff = nextBreakTime - currentTime;
  return diff > 0 ? diff : 0;
}

/**
 * Returns whether snooze is still allowed.
 */
export function canSnoozeBreak(snoozeCount: number, maxSnoozes: number = DEFAULT_MAX_SNOOZES): boolean {
  return snoozeCount < maxSnoozes;
}

/**
 * Returns available action options for the break banner.
 */
export function getSnoozeOptions(snoozeCount: number, maxSnoozes: number = DEFAULT_MAX_SNOOZES): SnoozeOption[] {
  const options: SnoozeOption[] = ['respond-now'];
  if (canSnoozeBreak(snoozeCount, maxSnoozes)) {
    options.push('snooze-15min');
  }
  options.push('skip');
  return options;
}

/**
 * Calculates next break time after snooze.
 */
export function calculateNextBreakTime(currentTime: number, snoozeDurationMinutes: number): number {
  return currentTime + snoozeDurationMinutes;
}
