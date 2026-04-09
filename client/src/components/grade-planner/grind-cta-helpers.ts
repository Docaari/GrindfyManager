interface ProfileState {
  dayOfWeek: number;
  activeProfile: 'A' | 'B' | 'C' | 'OFF';
}

interface GrindCTAData {
  show: boolean;
  tournamentCount: number;
}

export function getTodayDayOfWeek(): number {
  return new Date().getDay();
}

export function shouldShowGrindCTA(
  todayDayOfWeek: number,
  profileStates: ProfileState[],
  plannedTournaments: any[],
  dismissed: boolean,
): boolean {
  if (dismissed) return false;

  const todayProfile = profileStates.find((p) => p.dayOfWeek === todayDayOfWeek);
  if (!todayProfile) return false;
  if (todayProfile.activeProfile === 'OFF') return false;

  const todayTournaments = plannedTournaments.filter(
    (t) => t.dayOfWeek === todayDayOfWeek && t.isActive !== false,
  );
  return todayTournaments.length > 0;
}

export function getGrindCTAData(
  todayDayOfWeek: number,
  profileStates: ProfileState[],
  plannedTournaments: any[],
): GrindCTAData {
  const todayProfile = profileStates.find((p) => p.dayOfWeek === todayDayOfWeek);
  if (!todayProfile || todayProfile.activeProfile === 'OFF') {
    return { show: false, tournamentCount: 0 };
  }

  const todayTournaments = plannedTournaments.filter(
    (t) => t.dayOfWeek === todayDayOfWeek && t.isActive !== false,
  );

  if (todayTournaments.length === 0) {
    return { show: false, tournamentCount: 0 };
  }

  return { show: true, tournamentCount: todayTournaments.length };
}
