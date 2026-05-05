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
  defaultScreenCap?: number | null;
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
 * Resolve screenCap com prioridade:
 *   1. userSettings.defaultScreenCap (memoria persistente — set pelo updateScreenCapMutation
 *      em /grind-live ao alterar o limite via card "Em Andamento")
 *   2. previousSession.screenCap (fallback se settings ainda nao foram persistidos)
 *   3. DEFAULT_SCREEN_CAP (4)
 */
function resolveScreenCap(
  previousSession: SessionData | null,
  userSettings: UserSettings | null,
): number {
  const fromSettings = userSettings?.defaultScreenCap;
  if (typeof fromSettings === 'number' && fromSettings >= 1 && fromSettings <= 24) {
    return fromSettings;
  }
  if (previousSession?.screenCap != null) {
    return previousSession.screenCap;
  }
  return DEFAULT_SCREEN_CAP;
}

/**
 * Extracts defaults from the most recent session.
 * Prioriza userSettings.defaultScreenCap (memoria persistente), depois sessao mais recente.
 */
export function getLastSessionDefaults(
  sessions: SessionData[],
  userSettings: UserSettings | null = null,
): { screenCap: number } {
  // Memoria persistente vence sobre qualquer sessao historica.
  const fromSettings = userSettings?.defaultScreenCap;
  if (typeof fromSettings === 'number' && fromSettings >= 1 && fromSettings <= 24) {
    return { screenCap: fromSettings };
  }

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
  userSettings: UserSettings | null,
): QuickStartSession {
  const hasWarmUp = hasWarmUpData(warmUpData);

  const preparationPercentage = hasWarmUp && warmUpData ? warmUpData.mentalState : 0;
  const preparationNotes = hasWarmUp && warmUpData && warmUpData.notes ? warmUpData.notes : '';
  const screenCap = resolveScreenCap(previousSession, userSettings);

  return {
    preparationPercentage,
    preparationNotes,
    dailyGoals: '',
    screenCap,
    skipBreaksToday: false,
  };
}
