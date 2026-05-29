// Helper functions for tournament categorization and colors
import { getTypeColor, TOURNAMENT_PRIMARY_TYPES, type TournamentPrimaryType } from "@shared/tournamentTypes";
import { detectAddonReaFromName } from "@shared/addon-rea-detector";
import { buildTournamentNarration } from "@/lib/tournamentNarration";
import type { SessionAlertManager } from "@shared/generic-alerts";

/**
 * Resolve add-on / re-entry fields for an "Add Tournament" payload.
 *
 * Rules (ADR-014, fix B1+B2 2026-04-27):
 * - User explicit values (true/false) win.
 * - Undefined/null -> auto-detect via name regex (Plus / ReA).
 * - allowsAddOn=true && no addOnCost -> default to buyIn.
 * - allowsAddOn=false -> addOnCost forced null.
 *
 * Used by addTournamentMutation in GrindSessionLive to ensure the live
 * "Adicionar Torneio" modal never drops these flags before POST.
 */
export function resolveAddonReaPayload(input: {
  name?: string | null;
  site?: string | null;
  type?: string | null;
  buyIn?: string | number | null;
  allowsAddOn?: boolean | null;
  addOnCost?: string | number | null;
  allowsReentry?: boolean | null;
  maxReentries?: number | null;
}): {
  allowsAddOn: boolean;
  addOnCost: string | null;
  allowsReentry: boolean;
  maxReentries: number | null;
} {
  const resolvedName = input.name && String(input.name).trim() !== ''
    ? String(input.name)
    : `${input.site ?? ''} ${input.type ?? ''}`.trim();
  const detected = detectAddonReaFromName(resolvedName);

  const allowsAddOn = input.allowsAddOn === true
    || (input.allowsAddOn == null && detected.allowsAddOn);

  const addOnCost = allowsAddOn
    ? (input.addOnCost != null && String(input.addOnCost).trim() !== ''
        ? String(input.addOnCost)
        : (input.buyIn != null && String(input.buyIn).trim() !== '' ? String(input.buyIn) : null))
    : null;

  const allowsReentry = input.allowsReentry === true
    || (input.allowsReentry == null && detected.allowsReentry);

  const maxReentries = input.maxReentries ?? null;

  return { allowsAddOn, addOnCost, allowsReentry, maxReentries };
}

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

/**
 * Parse de buy-in tolerante a formato BR ("1.250,00"), internacional ("1,250.00"),
 * decimal simples ("20", "20.00", "20,00") e Number cru. Reusa normalizeDecimalInput
 * (que ja trata milhares + virgula/ponto) e devolve um Number (0 quando invalido).
 *
 * Substitui o antigo `.replace(',', '.')` ingenuo de bucketUpcomingByHour/combineTournaments
 * que quebrava "1.250,00" (virava 1.250 ao trocar so a 1a virgula / mantendo o ponto de milhar).
 */
export const parseBuyInValue = (v: any): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const normalized = normalizeDecimalInput(String(v));
  if (normalized === '') return 0;
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? 0 : n;
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

/**
 * Sort key (em minutos do dia) usado pra ordenar torneios upcoming/registered
 * e agrupar blocos de break.
 *
 * Prioridade:
 * 1. `registrationTime` explicito (HH:MM) — horario que jogador escolhe registrar.
 * 2. `time` + `lateRegMinutes` (deadline de late reg).
 * 3. `time` cru.
 *
 * Founder convention 2026-05-03: registrationTime e a fonte de verdade pra
 * ordenacao no /grind-live; usuario pode alterar quando quiser.
 */
export const getRegSortKey = (t: any): number => {
  if (t?.registrationTime && typeof t.registrationTime === 'string' && t.registrationTime.trim() !== '') {
    return parseTime(t.registrationTime);
  }
  const baseTime = parseTime(t?.time);
  const lateReg = typeof t?.lateRegMinutes === 'number' ? t.lateRegMinutes : 0;
  return baseTime + lateReg;
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
          time: plannedData.time || tournament.time || '20:00',
          lateRegMinutes:
            tournament.lateRegMinutes ?? plannedData.lateRegMinutes ?? null,
        };
      }
    }

    // Session row from planned: keep addon/reentry config in sync with
    // the current planned tournament. Covers the case where planned was
    // edited (e.g., user enabled allowsAddOn) after the session was
    // created — without this, the live row keeps the stale snapshot
    // copied at session-creation time and the Add-on button stays hidden.
    if (
      tournament.fromPlannedTournament &&
      tournament.plannedTournamentId &&
      Array.isArray(plannedTournaments) &&
      plannedTournaments.length > 0
    ) {
      const plannedSource = plannedTournaments.find(p => p.id === tournament.plannedTournamentId);
      if (plannedSource) {
        const merged: any = { ...tournament };
        if (plannedSource.allowsAddOn === true && tournament.allowsAddOn !== true) {
          merged.allowsAddOn = true;
          if (tournament.addOnCost == null || tournament.addOnCost === '') {
            merged.addOnCost = plannedSource.addOnCost ?? tournament.buyIn ?? null;
          }
        }
        if (plannedSource.allowsReentry === true && tournament.allowsReentry !== true) {
          merged.allowsReentry = true;
          if (tournament.maxReentries == null && plannedSource.maxReentries != null) {
            merged.maxReentries = plannedSource.maxReentries;
          }
        }
        return merged;
      }
    }

    return tournament;
  });

  const upcoming = activeTournaments.filter(t =>
    t.status === 'upcoming' || (!t.status && t.time)
  ).sort((a, b) => {
    const da = getRegSortKey(a);
    const db = getRegSortKey(b);
    if (da !== db) return da - db;
    const priorityA = a.prioridade || 2;
    const priorityB = b.prioridade || 2;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return parseTime(a.time) - parseTime(b.time);
  });

  const registered = activeTournaments.filter(t => {
    return t.status === 'registered';
  }).sort((a, b) => {
    const da = getRegSortKey(a);
    const db = getRegSortKey(b);
    if (da !== db) return da - db;
    const priorityA = a.prioridade || 2;
    const priorityB = b.prioridade || 2;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return parseTime(a.time) - parseTime(b.time);
  });

  const completed = activeTournaments.filter(t =>
    t.status === 'completed' || t.status === 'finished'
  );

  return { registered, upcoming, completed };
};

// Function to organize tournaments by break times.
// Agrupa por hora do registrationTime (fallback time+lateReg / time).
// Ordena torneios dentro do bloco pela mesma chave de registro.
export const organizeTournamentsByBreaks = (tournaments: any[]) => {
  if (!tournaments || tournaments.length === 0) return [];

  const breakMap = new Map<string, any[]>();

  tournaments.forEach(tournament => {
    const sortKey = getRegSortKey(tournament);
    if (!sortKey && !tournament.time && !tournament.registrationTime) return;

    const breakHour = Math.floor(sortKey / 60);
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
        const da = getRegSortKey(a);
        const db = getRegSortKey(b);
        if (da !== db) return da - db;
        return parseTime(a.time) - parseTime(b.time);
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

  // Normaliza buyIn pra tolerar '20' vs '20.00' vs 20 vs '20,00' vs '1.250,00'.
  const normBuyIn = (v: any) => parseBuyInValue(v);
  // Normaliza name/site/time pra tolerar whitespace/casing inconsistente.
  const normStr = (v: any) => String(v ?? '').trim().toLowerCase();

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
       normStr(sessionTournament.name) === normStr(tournament.name) &&
       normStr(sessionTournament.site) === normStr(tournament.site) &&
       normBuyIn(sessionTournament.buyIn) === normBuyIn(tournament.buyIn) &&
       normStr(sessionTournament.time) === normStr(tournament.time))
    );

    // Suprema bypass mantem planned-X visivel mesmo com shadow registrado
    // (multiplas entradas). Mas se existe shadow soft-deletado pra esse
    // planned, usuario sinalizou "remover desta sessao" — respeitar.
    // Match por plannedTournamentId (preferido) OU fallback por
    // name+site+buyIn+time (cobre shadows legados sem campo).
    const hasDeletedShadow = (sessionTournaments || []).some((st: any) => {
      if (st.status !== 'deleted') return false;
      if (st.plannedTournamentId === tournament.id) return true;
      return (
        st.fromPlannedTournament &&
        normStr(st.name) === normStr(tournament.name) &&
        normStr(st.site) === normStr(tournament.site) &&
        normBuyIn(st.buyIn) === normBuyIn(tournament.buyIn) &&
        normStr(st.time) === normStr(tournament.time)
      );
    });
    if (hasDeletedShadow) return;

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
 *
 * Invariant I1 (ADR-014): visivel SE E SOMENTE SE status=registered AND
 * allowsAddOn AND addOnCost != null AND addOnCost > 0. Paga (state final)
 * mantem o botao visivel com label "pago" para permitir desfazer.
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
  if (!tournament || tournament.status !== 'registered' || !tournament.allowsAddOn) {
    return { visible: false, disabled: false, variant: 'default', label: '' };
  }
  const cost = tournament.addOnCost == null ? 0 : parseFloat(String(tournament.addOnCost));
  if (!isFinite(cost) || cost <= 0) {
    return { visible: false, disabled: false, variant: 'default', label: '' };
  }
  const paid = Boolean(tournament.addOnTaken);
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
  if (hasPosition) {
    const posParsed = parseInt(String(registrationData!.position), 10);
    data.position = Number.isFinite(posParsed) && posParsed >= 1 ? posParsed : null;
  } else {
    data.position = null;
  }

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

// =============================================================================
// Sprint grind-live-detail-parity (ADR-214) — helpers puros
// =============================================================================

/**
 * Resolve o endpoint PUT correto para um card de torneio, por prefixo do id (D2).
 *
 * - id com prefixo `planned-` -> `/api/planned-tournaments/{id.slice(8)}`
 *   ('planned-'.length === 8 — mesma convencao de organizeTournaments).
 * - caso contrario -> `/api/session-tournaments/{id}`.
 */
export const resolveTournamentEndpoint = (id: string): string => {
  if (id.startsWith('planned-')) {
    return `/api/planned-tournaments/${id.slice(8)}`;
  }
  return `/api/session-tournaments/${id}`;
};

/**
 * Agrupa torneios upcoming por hora cheia (HH:00) usando registrationTime || time (D1 / RF-05).
 *
 * Paridade DayDetailZoom plannedSlots (bucketRef = maxLate ?? time, aqui
 * registrationTime ?? time). NAO reusa organizeTournamentsByBreaks (HH:55).
 *
 * - bucketRef = registrationTime || time.
 * - slotKey = "${HH.padStart(2,'0')}:00".
 * - Torneio sem hora valida cai no PRIMEIRO bucket / fallback (nunca some).
 * - Sort intra-bucket: prioridade ASC (1=Alta no topo) -> time ASC -> buyIn DESC.
 * - Buckets ordenados por hora ASC.
 */
export const bucketUpcomingByHour = (
  tournaments: any[],
): Array<{ hour: string; tournaments: any[] }> => {
  if (!tournaments || tournaments.length === 0) return [];

  const FALLBACK = '__fallback__';
  const buckets = new Map<string, any[]>();

  const slotKeyFor = (t: any): string => {
    const bucketRef = t?.registrationTime || t?.time;
    if (!bucketRef || typeof bucketRef !== 'string') return FALLBACK;
    const [hh] = String(bucketRef).split(':');
    if (hh == null || hh === '' || Number.isNaN(Number(hh))) return FALLBACK;
    return `${hh.padStart(2, '0')}:00`;
  };

  tournaments.forEach((t) => {
    const key = slotKeyFor(t);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  });

  const buyInOf = (t: any): number => parseBuyInValue(t?.buyIn);
  const sortIntraBucket = (a: any, b: any): number => {
    const pa = Number(a?.prioridade) || 2;
    const pb = Number(b?.prioridade) || 2;
    if (pa !== pb) return pa - pb;
    const ta = parseTime(a?.registrationTime || a?.time);
    const tb = parseTime(b?.registrationTime || b?.time);
    if (ta !== tb) return ta - tb;
    return buyInOf(b) - buyInOf(a);
  };

  const realBuckets = Array.from(buckets.entries())
    .filter(([hour]) => hour !== FALLBACK)
    .map(([hour, list]) => ({ hour, tournaments: [...list].sort(sortIntraBucket) }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  const fallback = buckets.get(FALLBACK);
  if (fallback && fallback.length > 0) {
    const fallbackSorted = [...fallback].sort(sortIntraBucket);
    if (realBuckets.length === 0) {
      // Sem hora valida em nenhum torneio: bucket fallback unico.
      return [{ hour: '00:00', tournaments: fallbackSorted }];
    }
    // Mescla os sem-hora no primeiro bucket (fallback = primeiro bucket).
    realBuckets[0].tournaments = [...fallbackSorted, ...realBuckets[0].tournaments];
  }

  return realBuckets;
};

export interface ReplaceMaxLateAlertOptions {
  /** Relogio base injetavel para teste deterministico (default new Date()). */
  now?: Date;
  /** Quando true, narrationText nao narra o buy-in. */
  redactBuyIn?: boolean;
}

/**
 * Substitui (dedup por tournamentId) o alerta de Max Late de um torneio (D3/D4/D5).
 *
 * 1. Remove TODOS os alertas type==='tournament' do tournament.id (cleanup garantido).
 * 2. registrationTime null/empty -> so remove (toggle OFF / sem reg).
 * 3. triggerAt = registrationTime - 2min, base now; cross-midnight: se target<=now -> +1d.
 * 4. triggerAt <= now (janela perdida <2min) -> NAO agenda (so removeu).
 * 5. Caso futuro -> manager.addTournamentAlert com label "Max Late: {name} ({site})"
 *    + narrationText via buildTournamentNarration (respeita redactBuyIn).
 */
export const replaceMaxLateAlert = (
  manager: SessionAlertManager,
  tournament: any,
  opts?: ReplaceMaxLateAlertOptions,
): void => {
  const now = opts?.now ?? new Date();

  // 1. Remove todos os alertas tournament do mesmo tournamentId (cleanup garantido).
  const existing = manager
    .getAllAlerts()
    .filter((a) => a.type === 'tournament' && a.tournamentId === tournament.id);
  existing.forEach((a) => manager.removeAlert(a.id));

  // 2. Sem registrationTime -> so remove.
  const registrationTime = tournament?.registrationTime;
  if (
    typeof registrationTime !== 'string' ||
    registrationTime.trim() === ''
  ) {
    return;
  }

  const [hh, mm] = registrationTime.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return;

  // 3. triggerAt = registrationTime - 2min, com rollover cross-midnight.
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  const triggerAt = new Date(target.getTime() - 2 * 60_000);

  // 4. Janela perdida.
  if (triggerAt.getTime() <= now.getTime()) return;

  // 5. Agenda. addTournamentAlert pode lancar quando MAX_ALERTS (50) e atingido
  // (generic-alerts.ts). Log antes (lesson #9) e segue sem agendar — nao propaga
  // pro useEffect/onSuccess que chamam este helper.
  try {
    manager.addTournamentAlert({
      tournamentId: tournament.id,
      triggerAt,
      label: `Max Late: ${tournament.name} (${tournament.site})`,
      narrationText: buildTournamentNarration(
        {
          site: tournament.site ?? '',
          name: tournament.name ?? '',
          buyIn: String(tournament.buyIn ?? ''),
        },
        { redactBuyIn: !!opts?.redactBuyIn },
      ),
    });
  } catch (err) {
    console.warn(
      `[replaceMaxLateAlert] falha ao agendar alerta Max Late (${tournament?.id}):`,
      err,
    );
  }
};
