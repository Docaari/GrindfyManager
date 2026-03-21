export function isProfileActive(profile: string | null | undefined): boolean {
  if (!profile) return false;
  return profile === 'A' || profile === 'B' || profile === 'C';
}

export function canAcceptTournament(profile: string | null | undefined): boolean {
  return isProfileActive(profile);
}

const profileColors: Record<string, string> = {
  A: 'emerald',
  B: 'blue',
  C: 'amber',
};

export function getProfileColor(profile: string | null | undefined): string {
  if (!profile) return 'gray';
  return profileColors[profile] || 'gray';
}

const profileLabels: Record<string, string> = {
  A: 'Perfil A',
  B: 'Perfil B',
  C: 'Perfil C',
};

export function getProfileLabel(profile: string | null | undefined): string {
  if (!profile) return 'Dia OFF';
  return profileLabels[profile] || 'Dia OFF';
}
