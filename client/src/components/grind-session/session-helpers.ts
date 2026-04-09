type SessionAction = 'auto-continue' | 'show-conflict' | 'create-new';

interface SessionData {
  id: string;
  date: string;
  status: string;
  [key: string]: any;
}

export function isSessionActive(session: SessionData): boolean {
  return session.status !== 'completed';
}

export function findTodaySession(
  sessions: SessionData[],
  today: string,
): SessionData | null {
  const todaySessions = sessions.filter((s) => s.date.startsWith(today));
  if (todaySessions.length === 0) return null;

  todaySessions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return todaySessions[0];
}

export function determineSessionAction(
  sessions: SessionData[],
  today: string,
): SessionAction {
  const todaySession = findTodaySession(sessions, today);
  if (!todaySession) return 'create-new';
  if (isSessionActive(todaySession)) return 'auto-continue';
  return 'show-conflict';
}
