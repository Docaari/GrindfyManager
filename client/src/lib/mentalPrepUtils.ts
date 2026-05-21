import { calendarDaysSince } from '@shared/calendarDaysSince';

interface PreparationLog {
  id: string;
  userId: string;
  sessionId: string | null;
  mentalState: number;
  focusLevel: number;
  confidenceLevel: number;
  exercisesCompleted: string[] | null;
  warmupCompleted: boolean;
  notes: string | null;
  createdAt: string;
}

interface MentalPrepStats {
  totalSessions: number;
  averageScore: number;
  currentStreak: number;
  scoreHistory: Array<{ date: string; score: number }>;
}

export function mapLogsToStats(logs: PreparationLog[]): MentalPrepStats {
  if (logs.length === 0) {
    return {
      totalSessions: 0,
      averageScore: 0,
      currentStreak: 0,
      scoreHistory: [],
    };
  }

  const totalSessions = logs.length;

  const sumMentalState = logs.reduce((sum, log) => sum + log.mentalState, 0);
  const averageScore = Math.round(sumMentalState / logs.length);

  // Sort logs by date descending for streak and scoreHistory
  const sorted = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Get unique dates (YYYY-MM-DD) in descending order
  const uniqueDates: string[] = [];
  for (const log of sorted) {
    const dateStr = new Date(log.createdAt).toISOString().split('T')[0];
    if (!uniqueDates.includes(dateStr)) {
      uniqueDates.push(dateStr);
    }
  }

  // Calculate streak: count consecutive days from the most recent
  let currentStreak = 0;
  for (let i = 0; i < uniqueDates.length; i++) {
    const currentDate = new Date(uniqueDates[i]);
    if (i === 0) {
      currentStreak = 1;
    } else {
      const prevDate = new Date(uniqueDates[i - 1]);
      // uniqueDates ja sao strings YYYY-MM-DD geradas via toISOString() (UTC).
      // Passar timeZone='UTC' garante que o diff fique em UTC e nao bata
      // off-by-one em fusos negativos (LA/NY) onde 2026-05-20T00:00Z = dia 19 local.
      const diffDays = calendarDaysSince(currentDate, prevDate, 'UTC');
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Build scoreHistory sorted by date descending
  const scoreHistory = sorted.map((log) => ({
    date: new Date(log.createdAt).toISOString().split('T')[0],
    score: log.mentalState,
  }));

  return {
    totalSessions,
    averageScore,
    currentStreak,
    scoreHistory,
  };
}
