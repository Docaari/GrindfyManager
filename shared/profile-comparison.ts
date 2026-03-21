import { calculateDistribution } from './distribution-utils';

interface PlannedTournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string | null;
  dayOfWeek: number;
  type: string | null;
  speed: string | null;
  fieldSize?: number | null;
  [key: string]: any;
}

interface ProfileState {
  dayOfWeek: number;
  activeProfile: string;
}

interface TimeRange {
  start: string;
  end: string;
}

interface ProfileMetrics {
  totalBuyIn: number;
  tournamentCount: number;
  avgFieldSize: number | null;
  speedDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  siteDistribution: Record<string, number>;
  timeRange: TimeRange | null;
  hasData: boolean;
}

type ProfileComparisonResult = Record<'A' | 'B' | 'C', ProfileMetrics>;

function emptyMetrics(): ProfileMetrics {
  return {
    totalBuyIn: 0,
    tournamentCount: 0,
    avgFieldSize: null,
    speedDistribution: {},
    typeDistribution: {},
    siteDistribution: {},
    timeRange: null,
    hasData: false,
  };
}

export function calculateProfileComparison(
  tournaments: PlannedTournament[],
  profileStates: ProfileState[],
): ProfileComparisonResult {
  // Map dayOfWeek -> profile
  const profileMap = new Map<number, string>();
  for (const ps of profileStates) {
    profileMap.set(ps.dayOfWeek, ps.activeProfile);
  }

  // Group tournaments by profile (skip OFF and undefined)
  const grouped: Record<string, PlannedTournament[]> = { A: [], B: [], C: [] };
  for (const t of tournaments) {
    const profile = profileMap.get(t.dayOfWeek);
    if (profile == null || profile === 'OFF') continue;
    if (profile in grouped) {
      grouped[profile].push(t);
    }
  }

  const result: ProfileComparisonResult = {
    A: buildMetrics(grouped.A),
    B: buildMetrics(grouped.B),
    C: buildMetrics(grouped.C),
  };

  return result;
}

function buildMetrics(tournaments: PlannedTournament[]): ProfileMetrics {
  if (tournaments.length === 0) return emptyMetrics();

  const totalBuyIn = tournaments.reduce(
    (sum, t) => sum + parseFloat(t.buyIn),
    0,
  );
  const tournamentCount = tournaments.length;

  // avgFieldSize: average of non-null fieldSize values
  const fieldSizes = tournaments
    .map((t) => t.fieldSize)
    .filter((fs): fs is number => fs != null);
  const avgFieldSize =
    fieldSizes.length > 0
      ? fieldSizes.reduce((a, b) => a + b, 0) / fieldSizes.length
      : null;

  // Distributions
  const speeds = tournaments.map((t) => t.speed ?? 'Normal');
  const types = tournaments.map((t) => t.type ?? 'Vanilla');
  const sites = tournaments.map((t) => t.site);

  // timeRange: earliest and latest time across all tournaments with time
  const times = tournaments
    .map((t) => t.time)
    .filter((t): t is string => t != null)
    .sort();
  const timeRange =
    times.length > 0 ? { start: times[0], end: times[times.length - 1] } : null;

  return {
    totalBuyIn,
    tournamentCount,
    avgFieldSize,
    speedDistribution: calculateDistribution(speeds),
    typeDistribution: calculateDistribution(types),
    siteDistribution: calculateDistribution(sites),
    timeRange,
    hasData: true,
  };
}
