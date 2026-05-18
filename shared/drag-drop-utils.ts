// =============================================================================
// Drag & Drop Utilities — shared entre client e server
// Validacao, mapeamento e serializacao de dados de drag & drop na grade
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DropValidationResult {
  allowed: boolean;
  reason?: string;
}

interface Destination {
  dayOfWeek: number;
  time: string | null;
  profile: string | null | undefined;
}

interface MoveResult {
  updates: Record<string, any>;
}

// ---------------------------------------------------------------------------
// validateDrop
// ---------------------------------------------------------------------------

function isValidTime(time: string): boolean {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function validateDrop(
  source: Record<string, any>,
  destination: Destination | null | undefined,
): DropValidationResult {
  if (!destination) {
    return { allowed: false, reason: 'Drop cancelado' };
  }

  const profile = destination.profile;
  if (!profile || profile === 'OFF') {
    return { allowed: false, reason: 'Dia OFF não aceita torneios' };
  }

  const time = destination.time;
  if (!time || !isValidTime(time)) {
    return { allowed: false, reason: 'Horário inválido' };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// mapLibraryToPlanned
// ---------------------------------------------------------------------------

export function mapLibraryToPlanned(
  libraryTournament: Record<string, any>,
  destination: { dayOfWeek: number; time: string; profile: string },
): Record<string, any> {
  return {
    name: libraryTournament.name,
    site: libraryTournament.site,
    buyIn: libraryTournament.buyIn,
    guaranteed: libraryTournament.guaranteed,
    type: libraryTournament.type,
    speed: libraryTournament.speed,
    dayOfWeek: destination.dayOfWeek,
    // O torneio mantem o horario original da biblioteca — o bloco onde foi
    // solto define so o dia. Para mudar o horario o user edita o card.
    // Fallback pro horario do destino so quando a biblioteca nao tem time.
    time: libraryTournament.time ?? destination.time,
    profile: destination.profile,
    status: 'upcoming',
    priority: 2,
    lateRegMinutes: libraryTournament.lateRegMinutes,
    gameType: libraryTournament.gameType,
    startingStack: libraryTournament.startingStack,
    maxPlayers: libraryTournament.maxPlayers,
    blindLevelMinutes: libraryTournament.blindLevelMinutes,
  };
}

// ---------------------------------------------------------------------------
// calculateMove
// ---------------------------------------------------------------------------

export function calculateMove(
  tournament: Record<string, any>,
  newDay: number,
  newTime: string,
): MoveResult {
  const updates: Record<string, any> = {};

  if (tournament.dayOfWeek !== newDay) {
    updates.dayOfWeek = newDay;
  }
  if (tournament.time !== newTime) {
    updates.time = newTime;
  }

  return { updates };
}

// ---------------------------------------------------------------------------
// serializeDragData / deserializeDragData
// ---------------------------------------------------------------------------

export function serializeDragData(
  type: string,
  data: Record<string, any>,
): string {
  return JSON.stringify({ type, ...data });
}

export function deserializeDragData(
  jsonString: string,
): Record<string, any> | null {
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    if (parsed.type !== 'library' && parsed.type !== 'cell') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
