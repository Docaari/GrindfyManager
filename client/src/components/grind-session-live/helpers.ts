// Helper functions for tournament categorization and colors
import { getTypeColor, TOURNAMENT_PRIMARY_TYPES, type TournamentPrimaryType } from "@shared/tournamentTypes";

export const getSiteColor = (site: string): string => {
  switch (site.toLowerCase()) {
    case 'pokerstars':
      return 'bg-red-600';
    case 'partypoker':
      return 'bg-orange-500';
    case '888poker':
      return 'bg-blue-600';
    case 'ggnetwork':
    case 'ggpoker':
      return 'bg-red-800';
    case 'wpn':
      return 'bg-green-800';
    case 'ipoker':
      return 'bg-orange-600';
    case 'coinpoker':
      return 'bg-pink-500';
    case 'chico':
      return 'bg-white text-black';
    case 'revolution':
      return 'bg-pink-800';
    case 'bodog':
      return 'bg-red-400';
    default:
      return 'bg-gray-600';
  }
};

// Helper function to get screen cap colors based on percentage
export const getScreenCapColor = (current: number, cap: number): { bgColor: string; textColor: string; borderColor: string } => {
  // Validacao para evitar divisao por zero ou valores invalidos
  if (!cap || cap <= 0 || current < 0) {
    return {
      bgColor: 'bg-gray-600/20',
      textColor: 'text-gray-400',
      borderColor: 'border-gray-500/50'
    };
  }

  const percentage = (current / cap) * 100;

  if (percentage <= 70) {
    return {
      bgColor: 'bg-green-600/20',
      textColor: 'text-green-400',
      borderColor: 'border-green-500/50'
    };
  } else if (percentage <= 90) {
    return {
      bgColor: 'bg-yellow-600/20',
      textColor: 'text-yellow-400',
      borderColor: 'border-yellow-500/50'
    };
  } else {
    return {
      bgColor: 'bg-red-600/20',
      textColor: 'text-red-400',
      borderColor: 'border-red-500/50'
    };
  }
};

// SSoT-delegated: assina string para back-compat com callers legacy.
// Concatena bg+text+ring do TYPE_COLORS para preservar contraste.
export const getCategoryColor = (category: string): string => {
  if (TOURNAMENT_PRIMARY_TYPES.includes(category as TournamentPrimaryType)) {
    const c = getTypeColor(category as TournamentPrimaryType);
    return `${c.bg} ${c.text} ${c.ring}`.trim();
  }
  return 'bg-gray-600 text-white';
};

export const getSpeedColor = (speed: string): string => {
  const colors: { [key: string]: string } = {
    'Normal': 'bg-green-600',
    'Turbo': 'bg-yellow-600',
    'Hyper': 'bg-red-600'
  };
  return colors[speed] || 'bg-gray-600';
};

// Priority helper functions with new CSS classes
export const getPrioridadeColor = (prioridade: number): string => {
  const colors: { [key: number]: string } = {
    1: 'priority-high', // Alta
    2: 'priority-medium', // Media
    3: 'priority-low' // Baixa
  };
  return colors[prioridade] || 'priority-medium';
};

export const getPrioridadeLabel = (prioridade: number): string => {
  const labels: { [key: number]: string } = {
    1: 'Alta',
    2: 'Media',
    3: 'Baixa'
  };
  return labels[prioridade] || 'Media';
};

export const getRebuyCounterClass = (rebuys: number): string => {
  if (rebuys >= 4) return 'bg-red-600 border-red-400 shadow-red-500/50';
  if (rebuys >= 2) return 'bg-yellow-600 border-yellow-400 shadow-yellow-500/50';
  return 'bg-green-600 border-green-400 shadow-green-500/50';
};

export const getRebuyText = (rebuys: number): string => {
  if (rebuys === 0) return '';
  if (rebuys === 1) return '1 Rebuy';
  return `${rebuys} Rebuys`;
};

export const formatNumberWithDots = (num: string | number): string => {
  const numStr = String(num);
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// AJUSTE 3: Funcao para normalizar entradas decimais (aceita virgula e ponto)
export const normalizeDecimalInput = (value: string): string => {
  if (!value || value.trim() === '') return '';

  // Remove espacos
  let normalized = value.trim();

  // Detecta se e formato brasileiro (virgula como decimal) ou internacional (ponto como decimal)
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    // Formato: 1.250,75 (brasileiro) ou 1,250.75 (internacional)
    const lastCommaIndex = normalized.lastIndexOf(',');
    const lastDotIndex = normalized.lastIndexOf('.');

    if (lastCommaIndex > lastDotIndex) {
      // Formato brasileiro: 1.250,75
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato internacional: 1,250.75
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // So virgula: pode ser decimal (10,50) ou separador de milhares (1,250)
    const commaIndex = normalized.indexOf(',');
    const afterComma = normalized.substring(commaIndex + 1);

    // Se apos a virgula tem 1 ou 2 digitos, e decimal
    if (afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
      normalized = normalized.replace(',', '.');
    } else {
      // Separador de milhares, remove virgulas
      normalized = normalized.replace(/,/g, '');
    }
  }

  // Validacao final: deve ser um numero valido
  const finalNumber = parseFloat(normalized);
  if (isNaN(finalNumber)) {
    return '';
  }

  return normalized;
};

export const generateTournamentName = (tournament: any): string => {
  if (tournament.name && tournament.name.trim()) {
    // Format guaranteed values in existing titles
    return tournament.name.replace(/\b(\d{4,})\b/g, (match: string) => formatNumberWithDots(match));
  }

  const guaranteed = tournament.guaranteed ? ` $${formatNumberWithDots(tournament.guaranteed)}` : '';
  return `${tournament.type || tournament.category || 'Vanilla'} $${formatNumberWithDots(tournament.buyIn)}${guaranteed} ${tournament.site}`;
};

export const parseTime = (timeStr: string): number => {
  if (!timeStr || typeof timeStr !== 'string') {
    return 0; // Default to 00:00 if no time provided
  }
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

export const formatTime = (timeStr: string): string => {
  return timeStr;
};

export const getScreenCapColors = (emAndamento: number, screenCap: number) => {
  const percentage = (emAndamento / screenCap) * 100;

  if (percentage >= 100) {
    return {
      borderColor: 'border-red-500/50',
      bgColor: 'bg-red-600/20',
      textColor: 'text-red-400',
      alertClass: 'danger'
    };
  } else if (percentage >= 80) {
    return {
      borderColor: 'border-red-500/50',
      bgColor: 'bg-red-600/20',
      textColor: 'text-red-400',
      alertClass: 'danger'
    };
  } else if (percentage >= 60) {
    return {
      borderColor: 'border-yellow-500/50',
      bgColor: 'bg-yellow-600/20',
      textColor: 'text-yellow-400',
      alertClass: 'warning'
    };
  }

  return {
    borderColor: 'border-green-500/50',
    bgColor: 'bg-green-600/20',
    textColor: 'text-green-400',
    alertClass: 'normal'
  };
};

// Function to get guaranteed value for display
export const getGuaranteedValue = (tournament: any): number | null => {
  let guaranteedValue = null;

  // First priority: direct guaranteed field
  if (tournament.guaranteed && tournament.guaranteed !== '0' && tournament.guaranteed !== '' && tournament.guaranteed !== null) {
    const parsedGuaranteed = parseFloat(String(tournament.guaranteed));
    if (!isNaN(parsedGuaranteed) && parsedGuaranteed > 0) {
      guaranteedValue = parsedGuaranteed;
    }
  }
  // Second priority: fieldSize field (for legacy compatibility)
  else if (tournament.fieldSize && tournament.fieldSize !== '0' && tournament.fieldSize !== '' && tournament.fieldSize !== null) {
    const fieldSizeValue = parseFloat(String(tournament.fieldSize));
    if (!isNaN(fieldSizeValue) && fieldSizeValue > 1000) {
      guaranteedValue = fieldSizeValue;
    }
  }

  // Auto-calculation fallback for manual tournaments
  if (!guaranteedValue && tournament.buyIn) {
    const buyInValue = parseFloat(String(tournament.buyIn));
    if (!isNaN(buyInValue) && buyInValue > 0) {
      if (buyInValue >= 100) {
        guaranteedValue = buyInValue * 100;
      } else if (buyInValue >= 50) {
        guaranteedValue = buyInValue * 200;
      } else if (buyInValue >= 20) {
        guaranteedValue = buyInValue * 500;
      } else {
        guaranteedValue = buyInValue * 1000;
      }
    }
  }

  return guaranteedValue;
};

// Functions to organize tournaments by status
export const organizeTournaments = (tournaments: any[], plannedTournaments: any[]) => {
  // Filter out deleted tournaments and prevent duplicates by ID
  const uniqueTournaments = new Map();

  tournaments.forEach(tournament => {
    if (tournament.status !== 'deleted') {
      const key = tournament.id;
      if (!uniqueTournaments.has(key)) {
        uniqueTournaments.set(key, tournament);
      }
    }
  });

  // CORRECAO CRITICA: Mesclar torneios planned com dados do Grade Planner
  let activeTournaments = Array.from(uniqueTournaments.values());

  // Enhanced tournaments with proper data from planned tournaments
  activeTournaments = activeTournaments.map(tournament => {
    if (tournament.id && tournament.id.toString().startsWith('planned-')) {
      const actualId = tournament.id.toString().substring(8);
      const plannedData = plannedTournaments?.find(p => p.id === actualId);

      if (plannedData) {
        return {
          ...tournament,
          site: plannedData.site || tournament.site || 'PokerStars',
          name: plannedData.name || tournament.name || generateTournamentName(plannedData),
          buyIn: plannedData.buyIn || tournament.buyIn || '0',
          guaranteed: plannedData.guaranteed || tournament.guaranteed || null,
          type: plannedData.type || tournament.type || 'Vanilla',
          speed: plannedData.speed || tournament.speed || 'Normal',
          time: plannedData.time || tournament.time || '20:00'
        };
      }
    }

    return tournament;
  });

  const upcoming = activeTournaments.filter(t =>
    t.status === 'upcoming' || (!t.status && t.time)
  ).sort((a, b) => {
    const priorityA = a.prioridade || 2;
    const priorityB = b.prioridade || 2;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return parseTime(a.time) - parseTime(b.time);
  });

  const registered = activeTournaments.filter(t => {
    return t.status === 'registered';
  }).sort((a, b) => {
    const priorityA = a.prioridade || 2;
    const priorityB = b.prioridade || 2;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return parseTime(a.time) - parseTime(b.time);
  });

  const completed = activeTournaments.filter(t =>
    t.status === 'completed' || t.status === 'finished'
  );

  return { registered, upcoming, completed };
};

// Function to organize tournaments by break times
export const organizeTournamentsByBreaks = (tournaments: any[]) => {
  if (!tournaments || tournaments.length === 0) return [];

  const breakMap = new Map<string, any[]>();

  tournaments.forEach(tournament => {
    if (!tournament.time) return;

    const [hour] = tournament.time.split(':').map(Number);
    const breakHour = hour;
    const breakTime = `${breakHour.toString().padStart(2, '0')}:55`;

    if (!breakMap.has(breakTime)) {
      breakMap.set(breakTime, []);
    }
    breakMap.get(breakTime)?.push(tournament);
  });

  // Convert to array and sort by break time
  const breakBlocks = Array.from(breakMap.entries())
    .map(([breakTime, tournaments]) => ({
      breakTime,
      tournaments: tournaments.sort((a, b) => {
        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        return timeA.localeCompare(timeB);
      })
    }))
    .sort((a, b) => a.breakTime.localeCompare(b.breakTime));

  return breakBlocks;
};

// Combine tournaments avoiding duplicates
export const combineTournaments = (sessionTournaments: any[], plannedTournaments: any[]) => {
  const combinedTournaments = new Map();

  // First, add all session tournaments
  (sessionTournaments || []).forEach(tournament => {
    combinedTournaments.set(tournament.id, tournament);
  });

  // Then, add planned tournaments only if they don't have a corresponding session tournament
  // Exception: Suprema tournaments always stay visible (multiple entries allowed)
  (plannedTournaments || []).forEach(tournament => {
    // Skip planned tournaments soft-deleted via /grind-live
    if (tournament.status === 'deleted') return;

    const plannedKey = `planned-${tournament.id}`;
    const isSuprema = tournament.site === 'Suprema';

    const hasSessionTournament = Array.from(combinedTournaments.values()).some(sessionTournament =>
      sessionTournament.plannedTournamentId === tournament.id ||
      (sessionTournament.fromPlannedTournament &&
       sessionTournament.name === tournament.name &&
       sessionTournament.site === tournament.site &&
       sessionTournament.buyIn === tournament.buyIn &&
       sessionTournament.time === tournament.time)
    );

    if ((isSuprema || !hasSessionTournament) && !combinedTournaments.has(plannedKey)) {
      combinedTournaments.set(plannedKey, {
        ...tournament,
        id: plannedKey,
        status: tournament.status || 'upcoming',
      });
    }
  });

  return Array.from(combinedTournaments.values());
};

// =============================================================================
// Add-on + Re-entry (ADR-014) helpers
// =============================================================================

/**
 * Format add-on cost for display. Falls back to buyIn when addOnCost is null.
 * Returns "22" when value is 22.00, "22.50" when 22.50, "0" when nothing.
 */
export const formatAddOnCost = (tournament: any): string => {
  const raw = tournament?.addOnCost ?? tournament?.buyIn;
  if (raw == null || raw === '') return '0';
  const num = parseFloat(String(raw));
  if (isNaN(num)) return '0';
  // Remove trailing .00; keep other decimals
  const fixed = num.toFixed(2);
  return fixed.replace(/\.00$/, '');
};

/**
 * Build the mutation payload for toggling add-on on a session tournament.
 * Used by updateTournamentMutation in GrindSessionLive.tsx.
 */
export const buildAddOnMutationPayload = (
  tournamentId: string,
  value: boolean,
  currentAddOnCost?: string | null
): { id: string; data: Record<string, any> } => {
  const data: Record<string, any> = { addOnTaken: value };
  if (currentAddOnCost !== undefined) {
    data.addOnCost = currentAddOnCost;
  }
  return { id: tournamentId, data };
};

/**
 * Derive render state for the Add-on button in RegisteredCard.
 * Returns visibility, disabled, variant (default=green, paid=gold), and label.
 */
export const getAddOnButtonState = (
  tournament: any,
  isPending: boolean
): {
  visible: boolean;
  disabled: boolean;
  variant: 'default' | 'paid';
  label: string;
} => {
  const visible = Boolean(tournament?.allowsAddOn) && tournament?.status === 'registered';
  if (!visible) {
    return { visible: false, disabled: false, variant: 'default', label: '' };
  }
  const paid = Boolean(tournament?.addOnTaken);
  const costDisplay = formatAddOnCost(tournament);
  return {
    visible: true,
    disabled: Boolean(isPending),
    variant: paid ? 'paid' : 'default',
    label: paid ? `Add-on $${costDisplay} pago` : `+ Add-on`,
  };
};

/**
 * Count add-ons paid in the session + sum of addOnCost.
 * Used by the SessionDashboard KPI "Add-ons Pagos".
 */
export const countAddOnsPaid = (
  tournaments: any[]
): { count: number; total: number } => {
  if (!Array.isArray(tournaments) || tournaments.length === 0) {
    return { count: 0, total: 0 };
  }
  let count = 0;
  let total = 0;
  for (const t of tournaments) {
    if (t?.addOnTaken) {
      count += 1;
      const cost = parseFloat(String(t?.addOnCost ?? '0'));
      if (!isNaN(cost)) total += cost;
    }
  }
  return { count, total };
};

/**
 * Build the mutation payload for re-entering a finished tournament.
 * Increments reentries by 1, resets status to 'registered', clears endTime.
 * V1: does NOT send prize/bounty/position (backend accumulates if sent).
 */
export const buildReentryPayload = (
  tournament: any
): { id: string; data: Record<string, any> } => {
  const currentReentries = parseInt(String(tournament?.reentries ?? 0)) || 0;
  return {
    id: tournament.id,
    data: {
      reentries: currentReentries + 1,
      status: 'registered',
      endTime: null,
    },
  };
};

/**
 * Build the mutation payload for "GG definitivo" (finish tournament).
 * Applies prize/bounty/position from registrationData if present.
 */
export const buildBustPayload = (
  tournament: any,
  registrationData?: { prize?: string; bounty?: string; position?: string }
): { id: string; data: Record<string, any> } => {
  const hasPrize = registrationData?.prize && registrationData.prize.toString().trim() !== '';
  const hasBounty = registrationData?.bounty && registrationData.bounty.toString().trim() !== '';
  const hasPosition = registrationData?.position && registrationData.position.toString().trim() !== '';

  const data: Record<string, any> = {
    status: 'finished',
    endTime: new Date().toISOString(),
  };

  if (hasPrize) {
    data.result = normalizeDecimalInput(String(registrationData!.prize));
  } else {
    data.result = '0';
  }
  if (hasBounty) {
    data.bounty = normalizeDecimalInput(String(registrationData!.bounty));
  } else {
    data.bounty = '0';
  }
  data.position = hasPosition ? parseInt(String(registrationData!.position), 10) : null;

  return { id: tournament.id, data };
};

/**
 * Decide whether to show the re-entry modal after a GG click.
 * True iff tournament allows re-entry and hasn't hit maxReentries.
 */
export const shouldShowReentryModal = (tournament: any): boolean => {
  if (!tournament?.allowsReentry) return false;
  const current = parseInt(String(tournament?.reentries ?? 0)) || 0;
  const max = tournament?.maxReentries;
  if (max == null) return true; // unlimited
  return current < max;
};

/**
 * True if the re-entry button in the modal should be disabled.
 */
export const isReentryAtMax = (tournament: any): boolean => {
  const max = tournament?.maxReentries;
  if (max == null) return false;
  const current = parseInt(String(tournament?.reentries ?? 0)) || 0;
  return current >= max;
};

/**
 * Accumulate prize/bounty/position across re-entries (ADR-014 RD-1).
 * - prize/bounty: sum when new value provided; else preserve existing.
 * - position: min (best) when both present; else preserve the non-null one.
 */
export const accumulateReentryFields = (
  existing: { prize?: string | number | null; bounty?: string | number | null; position?: number | null },
  newData: { prize?: string | number | null; bounty?: string | number | null; position?: number | null }
): { prize: string; bounty: string; position: number | null } => {
  const parseNum = (v: any): number => {
    if (v == null) return 0;
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  };
  const existingPrize = parseNum(existing?.prize);
  const existingBounty = parseNum(existing?.bounty);
  const existingPos = existing?.position ?? null;

  let prize = String(existingPrize);
  let bounty = String(existingBounty);
  let position: number | null = existingPos;

  if (newData?.prize !== undefined && newData.prize !== null) {
    prize = String(existingPrize + parseNum(newData.prize));
  }
  if (newData?.bounty !== undefined && newData.bounty !== null) {
    bounty = String(existingBounty + parseNum(newData.bounty));
  }
  if (newData?.position !== undefined) {
    const newPos = newData.position;
    if (newPos == null) {
      // preserve existing
      position = existingPos;
    } else if (existingPos == null) {
      position = newPos;
    } else {
      position = Math.min(existingPos, newPos);
    }
  }

  return { prize, bounty, position };
};

/**
 * FIFO queue helpers for the re-entry multi-tabling modal (ADR-014 RD-2).
 * State shape: { items: Tournament[] }.
 */
export interface ReentryQueueState {
  items: any[];
}

export const pushToQueue = (
  state: ReentryQueueState,
  tournament: any
): ReentryQueueState => {
  // Preserve snapshot (shallow clone) so external mutations to the source
  // tournament don't leak into the queue.
  return {
    items: [...state.items, { ...tournament }],
  };
};

export const shiftQueue = (state: ReentryQueueState): ReentryQueueState => {
  if (!state.items.length) return { items: [] };
  return { items: state.items.slice(1) };
};

export const currentQueueItem = (state: ReentryQueueState): any => {
  return state.items.length > 0 ? state.items[0] : null;
};

// Get time difference description
export const getTimeDifference = (targetTime: string) => {
  const now = new Date();
  const [hours, minutes] = targetTime.split(':').map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  const diffMs = target.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 0) {
    return `${Math.abs(diffMinutes)} minutos atras`;
  } else if (diffMinutes === 0) {
    return 'Agora';
  } else {
    return `Em ${diffMinutes} minutos`;
  }
};
