/**
 * coachContext — Sprint home-reform-5 item 3.
 *
 * Spec: Docs/specs/home-reform-5.md item 3 (Pergunte ao Coach).
 *
 * Builder PURO do bloco `coachContext` exposto em /api/home/overview:
 *   - activeProfiles       — perfis ativos do dia atual (max 3, single-profile
 *                            no schema atual, mas o tipo aceita array para
 *                            multi-profile futuro).
 *   - todayTournamentsTotal — soma dos torneios planejados nos perfis ativos.
 *   - isDayOff              — nenhum perfil ativo (profile_states=null/OFF).
 *
 * Service NAO toca DB. Recebe inputs prontos do route handler. CLAUDE.md §6.1
 * nao se aplica (planned_tournaments NAO usa filtro grindSessionId).
 */

export type CoachProfile = 'A' | 'B' | 'C';

export interface CoachContextData {
  activeProfiles: CoachProfile[];
  todayTournamentsTotal: number;
  isDayOff: boolean;
}

export interface BuildCoachContextInput {
  /**
   * Profile state do dia. Aceita string singular (schema atual) OU array
   * (multi-profile futuro). 'OFF' / null / [] -> DAY OFF.
   */
  activeProfile: CoachProfile | 'OFF' | null | (CoachProfile | string | null)[];
  /** Planned tournaments do dia atual (full list, todos os perfis). */
  plannedTournaments: Array<{ profile?: string | null }>;
}

const VALID_PROFILES: ReadonlyArray<CoachProfile> = ['A', 'B', 'C'];

function isValidProfile(p: unknown): p is CoachProfile {
  return p === 'A' || p === 'B' || p === 'C';
}

function normalizeActive(
  raw: BuildCoachContextInput['activeProfile'],
): CoachProfile[] {
  if (raw == null) return [];
  if (raw === 'OFF') return [];
  if (Array.isArray(raw)) {
    const out: CoachProfile[] = [];
    for (const item of raw) {
      if (isValidProfile(item) && !out.includes(item)) out.push(item);
    }
    return out;
  }
  return isValidProfile(raw) ? [raw] : [];
}

export function buildCoachContext(input: BuildCoachContextInput): CoachContextData {
  const activeProfiles = normalizeActive(input.activeProfile);
  const planned = Array.isArray(input.plannedTournaments)
    ? input.plannedTournaments
    : [];
  const activeSet = new Set<string>(activeProfiles);
  let total = 0;
  if (activeSet.size > 0) {
    for (const t of planned) {
      const p = t?.profile;
      if (typeof p === 'string' && activeSet.has(p)) total++;
    }
  }
  return {
    activeProfiles,
    todayTournamentsTotal: total,
    isDayOff: activeProfiles.length === 0,
  };
}

// Re-export para consumidores externos (tests + route handler).
export { VALID_PROFILES };
