// =============================================================================
// FP-17: Metricas de progresso nos estudos
// =============================================================================

interface StudyCard {
  id: string;
  knowledgeScore: number; // 0-100
  status: string;
  category: string;
}

interface StudySession {
  id: string;
  date: string; // ISO date
  duration: number; // minutos
}

interface StudyDashboardStats {
  hoursThisMonth: number;
  themesInProgress: number;
  streakDays: number;
}

interface ThemeWithProgress {
  name: string;
  progress: number; // 0-100
  cards: StudyCard[];
}

/**
 * Calcula progresso de um tema como media dos knowledgeScore dos cards.
 * Retorna 0 se nao ha cards. Arredonda para inteiro.
 */
export function calculateThemeProgress(cards: StudyCard[]): number {
  if (cards.length === 0) return 0;
  const sum = cards.reduce((acc, card) => acc + card.knowledgeScore, 0);
  return Math.round(sum / cards.length);
}

/**
 * Retorna nivel de dominio baseado no progresso (0-100).
 */
export function getMasteryLevel(progress: number): string {
  if (progress >= 90) return 'Dominado';
  if (progress >= 60) return 'Avancado';
  if (progress >= 30) return 'Intermediario';
  return 'Iniciante';
}

/**
 * Calcula dias consecutivos de estudo ate hoje.
 * Se hoje nao tem sessao, streak = 0.
 */
export function calculateStudyStreak(sessions: StudySession[], referenceDate?: Date): number {
  if (sessions.length === 0) return 0;

  const ref = referenceDate || new Date();

  // Get unique dates (YYYY-MM-DD) from sessions
  const datesSet = new Set<string>();
  for (const s of sessions) {
    const d = new Date(s.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    datesSet.add(key);
  }

  // Check if today has a session
  const todayKey = `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}-${String(ref.getUTCDate()).padStart(2, '0')}`;
  if (!datesSet.has(todayKey)) return 0;

  // Count consecutive days backwards from today
  let streak = 0;
  const current = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  while (true) {
    const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
    if (!datesSet.has(key)) break;
    streak++;
    current.setUTCDate(current.getUTCDate() - 1);
  }

  return streak;
}

/**
 * Calcula stats do mini-dashboard de estudos.
 */
export function getStudyDashboardStats(
  sessions: StudySession[],
  themes: ThemeWithProgress[],
  referenceDate?: Date,
): StudyDashboardStats {
  const ref = referenceDate || new Date();
  const currentMonth = ref.getUTCMonth();
  const currentYear = ref.getUTCFullYear();

  // Hours this month
  const monthSessions = sessions.filter((s) => {
    const d = new Date(s.date);
    return d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear;
  });
  const totalMinutes = monthSessions.reduce((acc, s) => acc + s.duration, 0);
  const hoursThisMonth = Math.round((totalMinutes / 60) * 10) / 10;

  // Themes in progress (1-99)
  const themesInProgress = themes.filter((t) => t.progress >= 1 && t.progress <= 99).length;

  // Streak
  const streakDays = calculateStudyStreak(sessions, ref);

  return { hoursThisMonth, themesInProgress, streakDays };
}
