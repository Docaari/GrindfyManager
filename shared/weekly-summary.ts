interface PlannedTournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string | null;
  dayOfWeek: number;
  type: string | null;
  speed: string | null;
  [key: string]: any;
}

interface ProfileState {
  dayOfWeek: number;
  activeProfile: string;
}

interface WeeklySummary {
  totalBuyIn: number;
  tournamentCount: number;
  averageBuyIn: number;
  activeDays: number;
  estimatedHours: number;
}

export function calculateWeeklySummary(
  tournaments: PlannedTournament[],
  profileStates: ProfileState[],
): WeeklySummary {
  // Build map of dayOfWeek -> activeProfile
  const profileMap = new Map<number, string>();
  for (const ps of profileStates) {
    profileMap.set(ps.dayOfWeek, ps.activeProfile);
  }

  // Filter tournaments: only those in active days (profile exists and != OFF)
  const activeTournaments = tournaments.filter((t) => {
    const profile = profileMap.get(t.dayOfWeek);
    return profile != null && profile !== 'OFF';
  });

  const totalBuyIn = activeTournaments.reduce(
    (sum, t) => sum + parseFloat(t.buyIn),
    0,
  );
  const tournamentCount = activeTournaments.length;
  const averageBuyIn = tournamentCount > 0 ? totalBuyIn / tournamentCount : 0;

  // Active days: profiles that are not OFF
  const activeDays = profileStates.filter(
    (ps) => ps.activeProfile !== 'OFF',
  ).length;

  // Estimated hours: sum of (max time - min time) per active day
  const dayTournaments = new Map<number, string[]>();
  for (const t of activeTournaments) {
    if (t.time == null) continue;
    const times = dayTournaments.get(t.dayOfWeek) || [];
    times.push(t.time);
    dayTournaments.set(t.dayOfWeek, times);
  }

  let estimatedHours = 0;
  for (const [, times] of dayTournaments) {
    if (times.length < 2) continue;
    const minutes = times.map(timeToMinutes);
    const min = Math.min(...minutes);
    const max = Math.max(...minutes);
    const rawMinutes = max - min;
    const dayHours = rawMinutes > 720 ? (1440 - rawMinutes) / 60 : rawMinutes / 60;
    estimatedHours += dayHours;
  }

  return {
    totalBuyIn,
    tournamentCount,
    averageBuyIn,
    activeDays,
    estimatedHours,
  };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
