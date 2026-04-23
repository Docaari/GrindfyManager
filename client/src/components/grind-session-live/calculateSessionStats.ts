import { getScreenCapColor } from './helpers';
import type { GrindSession, SessionStats, RegistrationData } from './types';

// Calculate tournament type and speed percentages
export const calculateTournamentPercentages = (tournaments: any[]) => {
  if (!tournaments || tournaments.length === 0) {
    return {
      types: { vanilla: 0, pko: 0, mystery: 0 },
      speeds: { normal: 0, turbo: 0, hyper: 0 }
    };
  }

  const total = tournaments.length;

  // Count tournament types
  const vanillaCount = tournaments.filter(t => (t.type || t.category) === "Vanilla").length;
  const pkoCount = tournaments.filter(t => (t.type || t.category) === "PKO").length;
  const mysteryCount = tournaments.filter(t => (t.type || t.category) === "Mystery").length;

  // Count tournament speeds
  const normalCount = tournaments.filter(t => t.speed === "Normal").length;
  const turboCount = tournaments.filter(t => t.speed === "Turbo").length;
  const hyperCount = tournaments.filter(t => t.speed === "Hyper").length;

  return {
    types: {
      vanilla: total > 0 ? Math.round((vanillaCount / total) * 100 * 10) / 10 : 0,
      pko: total > 0 ? Math.round((pkoCount / total) * 100 * 10) / 10 : 0,
      mystery: total > 0 ? Math.round((mysteryCount / total) * 100 * 10) / 10 : 0
    },
    speeds: {
      normal: total > 0 ? Math.round((normalCount / total) * 100 * 10) / 10 : 0,
      turbo: total > 0 ? Math.round((turboCount / total) * 100 * 10) / 10 : 0,
      hyper: total > 0 ? Math.round((hyperCount / total) * 100 * 10) / 10 : 0
    }
  };
};

export const calculateSessionStats = (
  sessionTournaments: any[],
  plannedTournaments: any[],
  registrationData: RegistrationData,
  activeSession: GrindSession | null
): SessionStats => {
  // Use the same deduplication logic as the tournament display
  const combinedTournaments = new Map();

  // First, add all session tournaments
  (sessionTournaments || []).forEach(tournament => {
    combinedTournaments.set(tournament.id, tournament);
  });

  // Then, add planned tournaments only if they don't have a corresponding session tournament
  (plannedTournaments || []).forEach(tournament => {
    const plannedKey = `planned-${tournament.id}`;

    // Check if there's already a session tournament that was created from this planned tournament
    const hasSessionTournament = Array.from(combinedTournaments.values()).some(sessionTournament =>
      // Prioridade 1: match por plannedTournamentId (confiavel)
      sessionTournament.plannedTournamentId === tournament.id ||
      // Prioridade 2: fallback por campos normalizados (torneios legados)
      (sessionTournament.fromPlannedTournament &&
       String(sessionTournament.name || '').trim().toLowerCase() === String(tournament.name || '').trim().toLowerCase() &&
       String(sessionTournament.site || '').trim().toLowerCase() === String(tournament.site || '').trim().toLowerCase() &&
       String(sessionTournament.buyIn || '0') === String(tournament.buyIn || '0') &&
       String(sessionTournament.time || '') === String(tournament.time || ''))
    );

    // Only add if no corresponding session tournament exists
    if (!hasSessionTournament && !combinedTournaments.has(plannedKey)) {
      combinedTournaments.set(plannedKey, {
        ...tournament,
        id: plannedKey,
        status: tournament.status || 'upcoming'
      });
    }
  });

  const allTournaments = Array.from(combinedTournaments.values());

  if (!allTournaments || allTournaments.length === 0) return {
    emAndamento: 0,
    registros: 0,
    reentradas: 0,
    proximos: 0,
    concluidos: 0,
    totalInvestido: 0,
    profit: 0,
    itm: 0,
    itmPercent: 0,
    roi: 0,
    fts: 0,
    cravadas: 0,
    progressao: 0,
    vanillaPercentage: 0,
    pkoPercentage: 0,
    mysteryPercentage: 0,
    normalSpeedPercentage: 0,
    turboSpeedPercentage: 0,
    hyperSpeedPercentage: 0,
    totalEntries: 0,
    screenCap: 10,
    screenCapColors: { bgColor: 'bg-gray-600/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/50' }
  };

  const finishedTournaments = allTournaments.filter((t: any) => t.status === "finished");
  const registeredTournaments = allTournaments.filter((t: any) => t.status === "registered");
  const upcomingTournaments = allTournaments.filter((t: any) => t.status === "upcoming");

  const emAndamento = registeredTournaments.length;
  const registros = registeredTournaments.length + finishedTournaments.length;
  const reentradas = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
    const rebuys = parseInt(t.rebuys) || 0;
    return sum + rebuys;
  }, 0);
  const proximos = upcomingTournaments.length;
  const concluidos = finishedTournaments.length;

  // Todos os torneios da sessao (registrados + finalizados)
  const allSessionTournaments = [...registeredTournaments, ...finishedTournaments];

  // Calcular total investido: Buy-in + Rebuys + Reentries + Add-on (ADR-014)
  // Formula: totalInvestido = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)
  const totalInvestido = allSessionTournaments.reduce((sum: number, t: any) => {
    const buyIn = parseFloat(t.buyIn || '0');
    const rebuys = parseInt(t.rebuys) || 0;
    const reentriesRaw = t.reentries;
    const reentries = reentriesRaw == null ? 0 : (parseInt(String(reentriesRaw)) || 0);
    const addOnTaken = Boolean(t.addOnTaken);
    const addOnCost = parseFloat(t.addOnCost || '0') || 0;
    const invested = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
    return sum + invested;
  }, 0);

  // totalEntries (Spec 3): volume + sum(reentries) para torneios registrados/finalizados
  const totalEntries = allSessionTournaments.reduce((sum: number, t: any) => {
    const reentriesRaw = t.reentries;
    const reentries = reentriesRaw == null ? 0 : (parseInt(String(reentriesRaw)) || 0);
    return sum + 1 + reentries;
  }, 0);

  // Calcular total de bounties incluindo registrationData
  const totalBounties = allSessionTournaments.reduce((sum: number, t: any) => {
    const tournamentId = t.id;
    const sessionBounty = registrationData[tournamentId]?.bounty;

    let bounty = 0;
    if (sessionBounty !== undefined && sessionBounty !== null && sessionBounty !== '') {
      const parsedSessionBounty = parseFloat(sessionBounty);
      if (!isNaN(parsedSessionBounty)) {
        bounty = parsedSessionBounty;
      }
    } else {
      const storedBounty = parseFloat(t.bounty || '0');
      if (!isNaN(storedBounty)) {
        bounty = storedBounty;
      }
    }

    return sum + bounty;
  }, 0);

  // Calcular total de prizes incluindo registrationData
  const totalPrizes = allSessionTournaments.reduce((sum: number, t: any) => {
    const tournamentId = t.id;
    const sessionPrize = registrationData[tournamentId]?.prize;

    let result = 0;
    if (sessionPrize !== undefined && sessionPrize !== null && sessionPrize !== '') {
      const parsedSessionPrize = parseFloat(sessionPrize);
      if (!isNaN(parsedSessionPrize)) {
        result = parsedSessionPrize;
      }
    } else {
      const storedResult = parseFloat(t.result || '0');
      if (!isNaN(storedResult)) {
        result = storedResult;
      }
    }

    return sum + result;
  }, 0);

  // Formula correta: (Bounties + Prizes) - (Total Buy-in + Total Rebuys)
  const profit = (totalPrizes + totalBounties) - totalInvestido;

  // ITM deve considerar torneios com campo "Prize" (result) registrado > 0
  const itm = allSessionTournaments.filter((t: any) => {
    const tournamentId = t.id;
    const sessionPrize = registrationData[tournamentId]?.prize;

    let result = 0;
    if (sessionPrize !== undefined && sessionPrize !== null && sessionPrize !== '') {
      const parsedSessionPrize = parseFloat(sessionPrize);
      if (!isNaN(parsedSessionPrize)) {
        result = parsedSessionPrize;
      }
    } else {
      const storedResult = parseFloat(t.result || '0');
      if (!isNaN(storedResult)) {
        result = storedResult;
      }
    }

    return result > 0;
  }).length;

  // ITM% deve usar apenas torneios finalizados (não contar registered sem resultado)
  const finishedCount = finishedTournaments.length;
  const itmPercent = finishedCount > 0 ? (itm / finishedCount) * 100 : 0;
  const roi = totalInvestido > 0 ? (profit / totalInvestido) * 100 : 0;
  const fts = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
    const pos = parseInt(String(t.position)) || 0;
    return pos <= 9 && pos > 0;
  }).length;
  const cravadas = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
    const pos = parseInt(String(t.position)) || 0;
    return pos === 1;
  }).length;
  const progressao = allTournaments.length > 0 ? ((registros / allTournaments.length) * 100) : 0;

  // Calculate tournament type and speed percentages
  const tournamentsForPercentages = [...registeredTournaments, ...finishedTournaments, ...upcomingTournaments];
  const totalTournaments = tournamentsForPercentages.length;

  const vanillaCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "Vanilla").length;
  const pkoCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "PKO").length;
  const mysteryCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "Mystery").length;

  const vanillaPercentage = totalTournaments > 0 ? Math.round((vanillaCount / totalTournaments) * 100) : 0;
  const pkoPercentage = totalTournaments > 0 ? Math.round((pkoCount / totalTournaments) * 100) : 0;
  const mysteryPercentage = totalTournaments > 0 ? Math.round((mysteryCount / totalTournaments) * 100) : 0;

  // Não usar fallback 'Normal' para torneios sem speed — contar apenas os que têm speed definido
  const tournsWithSpeed = tournamentsForPercentages.filter(t => t.speed);
  const speedTotal = tournsWithSpeed.length || totalTournaments; // fallback para evitar divisão por 0
  const normalCount = tournsWithSpeed.filter(t => t.speed === "Normal").length;
  const turboCount = tournsWithSpeed.filter(t => t.speed === "Turbo").length;
  const hyperCount = tournsWithSpeed.filter(t => t.speed === "Hyper").length;

  const normalSpeedPercentage = speedTotal > 0 ? Math.round((normalCount / speedTotal) * 100) : 0;
  const turboSpeedPercentage = speedTotal > 0 ? Math.round((turboCount / speedTotal) * 100) : 0;
  const hyperSpeedPercentage = speedTotal > 0 ? Math.round((hyperCount / speedTotal) * 100) : 0;

  return {
    emAndamento,
    registros,
    reentradas,
    proximos,
    concluidos,
    totalInvestido,
    profit,
    itm,
    itmPercent,
    roi,
    fts,
    cravadas,
    progressao,
    vanillaPercentage,
    pkoPercentage,
    mysteryPercentage,
    normalSpeedPercentage,
    turboSpeedPercentage,
    hyperSpeedPercentage,
    totalEntries,
    screenCap: activeSession?.screenCap || 10,
    screenCapColors: activeSession ? getScreenCapColor(emAndamento, activeSession.screenCap || 10) : { bgColor: 'bg-gray-600/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/50' }
  };
};

// Calculate final session statistics for session summary
export const calculateFinalSessionStats = (
  plannedTournaments: any[],
  sessionTournaments: any[]
) => {
  const allTournaments = [
    ...(plannedTournaments || []),
    ...(sessionTournaments || [])
  ];
  const completedTournaments = allTournaments.filter(t => t.status === "finished" || t.status === "completed");

  const volume = completedTournaments.length;
  // Nova formula Spec 1 (ADR-014): inclui reentries e add-on
  const totalInvested = completedTournaments.reduce((sum, t) => {
    const buyIn = parseFloat(t.buyIn) || 0;
    const rebuys = parseInt(String(t.rebuys ?? 0)) || 0;
    const reentriesRaw = t.reentries;
    const reentries = reentriesRaw == null ? 0 : (parseInt(String(reentriesRaw)) || 0);
    const addOnTaken = Boolean(t.addOnTaken);
    const addOnCost = parseFloat(t.addOnCost || '0') || 0;
    const invested = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
    return sum + invested;
  }, 0);

  const totalResult = completedTournaments.reduce((sum, t) => {
    const result = parseFloat(t.result) || 0;
    return sum + result;
  }, 0);

  const totalBounties = completedTournaments.reduce((sum, t) => {
    const bounty = parseFloat(t.bounty) || 0;
    return sum + bounty;
  }, 0);

  // CONSISTENT FORMULA: Profit = Prize + Bounties - Buy-in - Rebuys (same as active session dashboard)
  const profit = (totalResult + totalBounties) - totalInvested;

  const abiMed = volume > 0 ? totalInvested / volume : 0;
  const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

  const fts = completedTournaments.filter(t => {
    const position = parseInt(t.position) || 999;
    const fieldSize = parseInt(t.fieldSize) || 0;
    return position <= 9 || (fieldSize > 0 && position <= fieldSize * 0.1);
  }).length;

  const cravadas = completedTournaments.filter(t => {
    const result = parseFloat(t.result) || 0;
    const buyIn = parseFloat(t.buyIn) || 0;
    return result > buyIn * 10;
  }).length;

  // Find best tournament (include bounties, rebuys, reentries e add-on — ADR-014)
  const investedOf = (t: any): number => {
    const buyIn = parseFloat(t.buyIn) || 0;
    const rebuys = parseInt(String(t.rebuys ?? 0)) || 0;
    const reentries = parseInt(String(t.reentries ?? 0)) || 0;
    const addOnTaken = Boolean(t.addOnTaken);
    const addOnCost = parseFloat(t.addOnCost || '0') || 0;
    return buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
  };
  const bestTournament = completedTournaments.reduce((best, current) => {
    const currentResult = parseFloat(current.result) || 0;
    const currentBounty = parseFloat(current.bounty) || 0;
    const currentProfit = (currentResult + currentBounty) - investedOf(current);

    if (!best) return current;

    const bestResult = parseFloat(best.result) || 0;
    const bestBounty = parseFloat(best.bounty) || 0;
    const bestProfit = (bestResult + bestBounty) - investedOf(best);

    return currentProfit > bestProfit ? current : best;
  }, null);

  // Calculate percentages for types and speeds
  const percentages = calculateTournamentPercentages(completedTournaments);

  // totalEntries (Spec 3)
  const totalEntries = completedTournaments.reduce((sum, t) => {
    const reentriesRaw = t.reentries;
    const reentries = reentriesRaw == null ? 0 : (parseInt(String(reentriesRaw)) || 0);
    return sum + 1 + reentries;
  }, 0);

  return {
    volume,
    profit,
    abiMed,
    roi,
    fts,
    cravadas,
    bestTournament,
    percentages,
    totalInvested,
    totalEntries
  };
};

// Calculate break feedback averages
export const calculateBreakAverages = (breakFeedbacks: any[]) => {
  if (!breakFeedbacks || breakFeedbacks.length === 0) {
    return { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 };
  }

  const totals = breakFeedbacks.reduce((acc: { energia: number; foco: number; confianca: number; inteligenciaEmocional: number; interferencias: number }, feedback: any) => {
    return {
      energia: acc.energia + feedback.energia,
      foco: acc.foco + feedback.foco,
      confianca: acc.confianca + feedback.confianca,
      inteligenciaEmocional: acc.inteligenciaEmocional + feedback.inteligenciaEmocional,
      interferencias: acc.interferencias + feedback.interferencias
    };
  }, { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 });

  const count = breakFeedbacks.length;
  return {
    energia: totals.energia / count,
    foco: totals.foco / count,
    confianca: totals.confianca / count,
    inteligenciaEmocional: totals.inteligenciaEmocional / count,
    interferencias: totals.interferencias / count
  };
};
