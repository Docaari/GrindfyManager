// Quick start helpers — pure functions for quick session start (FP-09)

interface WarmUpData {
  mentalState: number;
  focusLevel: number;
  confidenceLevel: number;
  warmupCompleted: boolean;
  notes?: string | null;
  exercisesCompleted?: string[];
  createdAt: string;
}

interface SessionData {
  id: string;
  date: string;
  status: string;
  screenCap?: number | null;
  notes?: string | null;
  preparationPercentage?: number | null;
  [key: string]: any;
}

interface UserSettings {
  breakFrequencyMinutes?: number;
  [key: string]: any;
}

interface QuickStartSession {
  preparationPercentage: number;
  preparationNotes: string;
  dailyGoals: string;
  screenCap: number;
  skipBreaksToday: boolean;
}

const DEFAULT_SCREEN_CAP = 4;

/**
 * Returns true if warm-up data exists and was completed.
 */
export function hasWarmUpData(warmUpData: WarmUpData | null): boolean {
  if (!warmUpData) return false;
  return warmUpData.warmupCompleted === true;
}

/**
 * Returns contextual label for the quick start button.
 */
export function getQuickStartLabel(warmUpData: WarmUpData | null): string {
  if (warmUpData && warmUpData.warmupCompleted) {
    return `Inicio Rapido (Warm-up ${warmUpData.mentalState}%)`;
  }
  return 'Inicio Rapido';
}

/**
 * Extracts defaults from the most recent session.
 * Sorts by date descending and finds the first session with a valid screenCap.
 */
export function getLastSessionDefaults(sessions: SessionData[]): { screenCap: number } {
  if (sessions.length === 0) {
    return { screenCap: DEFAULT_SCREEN_CAP };
  }

  // Sort by date descending
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // Find first session with a valid screenCap
  for (const session of sorted) {
    if (session.screenCap != null) {
      return { screenCap: session.screenCap };
    }
  }

  return { screenCap: DEFAULT_SCREEN_CAP };
}

/**
 * Builds a quick start session object with intelligent defaults.
 */
export function buildQuickStartSession(
  warmUpData: WarmUpData | null,
  previousSession: SessionData | null,
  _userSettings: UserSettings | null,
): QuickStartSession {
  const hasWarmUp = hasWarmUpData(warmUpData);

  const preparationPercentage = hasWarmUp && warmUpData ? warmUpData.mentalState : 0;
  const preparationNotes = hasWarmUp && warmUpData && warmUpData.notes ? warmUpData.notes : '';
  const screenCap =
    previousSession && previousSession.screenCap != null
      ? previousSession.screenCap
      : DEFAULT_SCREEN_CAP;

  return {
    preparationPercentage,
    preparationNotes,
    dailyGoals: '',
    screenCap,
    skipBreaksToday: false,
  };
}
