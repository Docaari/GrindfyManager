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

// =============================================================================
// Sprint AI-2B (RF-08) — assembleContext: bloco DINÂMICO do chat enriquecido
// com Metas ativas + C-game recente + Mental Hand History.
//
// Saída: string PT-BR pronta para concatenar no system prompt dinâmico.
// Storage injetável (lesson #34). Erros são logados + bloco omitido (lesson #9).
// =============================================================================
export interface AssembleContextArgs {
  userId: string;
  route?: string;
  injectedStorage?: any;
}

async function buildGoalsBlock(userId: string, injectedStorage: any): Promise<string | null> {
  try {
    if (typeof injectedStorage?.listActiveCareerGoals !== "function") return null;
    const goals = (await injectedStorage.listActiveCareerGoals(userId)) ?? [];
    if (!Array.isArray(goals) || goals.length === 0) return null;
    const lines = goals.slice(0, 3).map((g: any) => {
      const horizon = g?.horizon ? ` (${g.horizon})` : "";
      return `- ${g?.title ?? "(sem titulo)"}${horizon}`;
    });
    return `## Metas ativas\n${lines.join("\n")}`;
  } catch (err) {
    console.error("assembleContext.goals.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function buildCgameBlock(userId: string, injectedStorage: any): Promise<string | null> {
  try {
    if (typeof injectedStorage?.listWarmupRitualsForRange !== "function") return null;
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const rituals = (await injectedStorage.listWarmupRitualsForRange(userId, start, now)) ?? [];
    if (!Array.isArray(rituals) || rituals.length === 0) return null;
    const { aggregateCgameForPeriod } = await import("./cgameAggregator");
    const snap = await aggregateCgameForPeriod(userId, { start, end: now }, injectedStorage);
    return `## C-game recente\nA-game ${snap.aPct}%, B-game ${snap.bPct}%, C-game ${snap.cPct}% (n=${snap.sampleSize}, confidence=${snap.confidence}).`;
  } catch (err) {
    console.error("assembleContext.cgame.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function buildMentalBlock(userId: string, injectedStorage: any): Promise<string | null> {
  try {
    if (typeof injectedStorage?.listMentalHandsForRange !== "function") return null;
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const hands = (await injectedStorage.listMentalHandsForRange(userId, start, now)) ?? [];
    if (!Array.isArray(hands) || hands.length === 0) return null;
    const { selectTopHighlights } = await import("./mentalHandsSelector");
    const lines = selectTopHighlights(hands, 3).map((h: any) => {
      const emotion = h?.emotion ?? "n/a";
      const situation = String(h?.situation ?? "").slice(0, 80);
      return `- [${emotion}] ${situation}`;
    });
    return `## Mental Hand History recente\n${lines.join("\n")}`;
  } catch (err) {
    console.error("assembleContext.mental.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function assembleContext(args: AssembleContextArgs): Promise<string> {
  const { userId, injectedStorage } = args;
  const [goals, cgame, mental] = await Promise.all([
    buildGoalsBlock(userId, injectedStorage),
    buildCgameBlock(userId, injectedStorage),
    buildMentalBlock(userId, injectedStorage),
  ]);
  return [goals, cgame, mental].filter((s): s is string => !!s).join("\n\n");
}
