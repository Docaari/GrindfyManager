interface Tournament {
  buyIn: string;
  time: string | null;
  site?: string;
  type?: string;
  speed?: string;
  [key: string]: any;
}

interface DayMetrics {
  totalBuyIn: number;
  tournamentCount: number;
  averageBuyIn: number;
  timeRange: { start: string; end: string } | null;
  estimatedHours: number;
  sites: Record<string, number>;
  types: Record<string, number>;
  speeds: Record<string, number>;
}

export function calculateDayMetrics(tournaments: Tournament[]): DayMetrics {
  const count = tournaments.length;

  if (count === 0) {
    return {
      totalBuyIn: 0,
      tournamentCount: 0,
      averageBuyIn: 0,
      timeRange: null,
      estimatedHours: 0,
      sites: {},
      types: {},
      speeds: {},
    };
  }

  const totalBuyIn = tournaments.reduce((sum, t) => sum + parseFloat(t.buyIn), 0);
  const averageBuyIn = totalBuyIn / count;

  // Time range
  const withTime = tournaments.filter((t) => t.time != null).map((t) => t.time!);
  let timeRange: { start: string; end: string } | null = null;
  let estimatedHours = 0;

  if (withTime.length > 0) {
    withTime.sort();
    const start = withTime[0];
    const end = withTime[withTime.length - 1];
    timeRange = { start, end };
    const rawHours = timeToHours(end) - timeToHours(start);
    estimatedHours = rawHours > 12 ? 24 - rawHours : rawHours;
  }

  // Distributions
  const sites: Record<string, number> = {};
  const types: Record<string, number> = {};
  const speeds: Record<string, number> = {};

  for (const t of tournaments) {
    if (t.site) sites[t.site] = (sites[t.site] || 0) + 1;
    if (t.type) types[t.type] = (types[t.type] || 0) + 1;
    if (t.speed) speeds[t.speed] = (speeds[t.speed] || 0) + 1;
  }

  return {
    totalBuyIn,
    tournamentCount: count,
    averageBuyIn,
    timeRange,
    estimatedHours,
    sites,
    types,
    speeds,
  };
}

function timeToHours(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + m / 60;
}
