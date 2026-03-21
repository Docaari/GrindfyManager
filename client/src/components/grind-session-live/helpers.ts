// Helper functions for tournament categorization and colors
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

export const getCategoryColor = (category: string): string => {
  const colors: { [key: string]: string } = {
    'Vanilla': 'bg-blue-600',
    'PKO': 'bg-red-600',
    'Mystery': 'bg-purple-600'
  };
  return colors[category] || 'bg-gray-600';
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
        status: 'upcoming'
      });
    }
  });

  return Array.from(combinedTournaments.values());
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
