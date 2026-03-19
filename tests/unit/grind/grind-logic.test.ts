import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes de Caracterizacao: Logica Pura do GrindSession e GrindSessionLive
//
// As funcoes abaixo sao internas aos componentes GrindSession.tsx e
// GrindSessionLive.tsx. Como nao sao exportadas, estes testes caracterizam
// o comportamento replicando as funcoes puras. Documentam o contrato ATUAL.
//
// Todos devem PASSAR — refletem o comportamento existente.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Dashboard Metrics Calculations (GrindSession.tsx ~520-630)
// ---------------------------------------------------------------------------

interface SessionHistoryData {
  id: string;
  userId: string;
  date: string;
  duration?: string;
  volume: number;
  profit: number;
  abiMed: number;
  roi: number;
  fts: number;
  cravadas: number;
  energiaMedia: number;
  focoMedio: number;
  confiancaMedia: number;
  inteligenciaEmocionalMedia: number;
  interferenciasMedia: number;
  breakCount: number;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  finalNotes?: string;
  objectiveCompleted?: boolean;
  status?: string;
  startTime?: string;
}

function calculateDashboardMetrics(sessions: SessionHistoryData[]) {
  const totalVolume = sessions.reduce((sum, session) => sum + session.volume, 0);
  const totalProfit = sessions.reduce((sum, session) => sum + session.profit, 0);

  return {
    totalSessions: sessions.length,
    totalVolume,
    totalProfit,
    avgABI: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.abiMed, 0) / sessions.length : 0,
    avgROI: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.roi, 0) / sessions.length : 0,
    totalFTs: sessions.reduce((sum, s) => sum + s.fts, 0),
    totalCravadas: sessions.reduce((sum, s) => sum + s.cravadas, 0),
    avgEnergia: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.energiaMedia, 0) / sessions.length : 0,
    avgFoco: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.focoMedio, 0) / sessions.length : 0,
    avgConfianca: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.confiancaMedia, 0) / sessions.length : 0,
    avgInteligenciaEmocional: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.inteligenciaEmocionalMedia, 0) / sessions.length : 0,
    avgInterferencias: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.interferenciasMedia, 0) / sessions.length : 0,
    avgPreparationPercentage: sessions.length > 0 ? sessions.reduce((sum, s) => sum + (s.preparationPercentage || 0), 0) / sessions.length : 0,
  };
}

function countSessionsByStatus(sessions: { status?: string }[]) {
  return {
    active: sessions.filter(s => s.status === 'active').length,
    completed: sessions.filter(s => s.status === 'completed').length,
    planned: sessions.filter(s => s.status === 'planned').length,
  };
}

function groupSessionsByMonth(sessions: { date: string }[]): Record<string, typeof sessions> {
  const groups: Record<string, typeof sessions> = {};
  for (const session of sessions) {
    const d = new Date(session.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(session);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 2. Session Stats Calculations (GrindSessionLive.tsx)
// ---------------------------------------------------------------------------

// getScreenCapColor (GrindSessionLive.tsx:78-109)
function getScreenCapColor(current: number, cap: number): { bgColor: string; textColor: string; borderColor: string } {
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
}

// Elapsed time formatting (GrindSessionLive.tsx:729-738)
function formatElapsedTime(diffMs: number): string {
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

// Break averages (GrindSessionLive.tsx:2750-2773)
interface BreakFeedback {
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
}

function calculateBreakAverages(breakFeedbacks: BreakFeedback[]) {
  if (!breakFeedbacks || breakFeedbacks.length === 0) {
    return { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 };
  }

  const totals = breakFeedbacks.reduce((acc, feedback) => {
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
}

// ---------------------------------------------------------------------------
// 3. Helper Functions (ambos componentes)
// ---------------------------------------------------------------------------

// getSiteColor — versao do GrindSessionLive.tsx:60-75 (top-level helper)
function getSiteColor(site: string): string {
  const colors: { [key: string]: string } = {
    'PokerStars': 'bg-red-600',
    'GGPoker': 'bg-orange-600',
    'GGNetwork': 'bg-orange-600',
    'PartyPoker': 'bg-pink-600',
    '888poker': 'bg-blue-600',
    'WPN': 'bg-purple-600',
    'Chico': 'bg-yellow-600',
    'iPoker': 'bg-green-600',
    'Bodog': 'bg-indigo-600',
    'CoinPoker': 'bg-amber-600',
    'Revolution': 'bg-teal-600'
  };
  return colors[site] || 'bg-gray-600';
}

// formatCurrency local do GrindSession.tsx:417-419
function formatCurrencyLocal(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}

// Tournament dedup logic (GrindSessionLive.tsx:2398-2431)
interface TournamentBase {
  id: string;
  name?: string;
  site?: string;
  buyIn?: string;
  time?: string;
  status?: string;
  fromPlannedTournament?: boolean;
  plannedTournamentId?: string;
  [key: string]: any;
}

function deduplicateTournaments(
  sessionTournaments: TournamentBase[],
  plannedTournaments: TournamentBase[]
): TournamentBase[] {
  const combinedTournaments = new Map<string, TournamentBase>();

  // First, add all session tournaments
  (sessionTournaments || []).forEach(tournament => {
    combinedTournaments.set(tournament.id, tournament);
  });

  // Then, add planned tournaments only if they don't have a corresponding session tournament
  (plannedTournaments || []).forEach(tournament => {
    const plannedKey = `planned-${tournament.id}`;

    const hasSessionTournament = Array.from(combinedTournaments.values()).some(sessionTournament =>
      sessionTournament.plannedTournamentId === tournament.id ||
      (sessionTournament.fromPlannedTournament &&
       sessionTournament.name === tournament.name &&
       sessionTournament.site === tournament.site &&
       sessionTournament.buyIn === tournament.buyIn &&
       sessionTournament.time === tournament.time)
    );

    if (!hasSessionTournament && !combinedTournaments.has(plannedKey)) {
      combinedTournaments.set(plannedKey, {
        ...tournament,
        id: plannedKey,
        status: tournament.status || 'upcoming'
      });
    }
  });

  return Array.from(combinedTournaments.values());
}

// =============================================================================
// TESTES
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Dashboard Metrics
// ---------------------------------------------------------------------------

describe('GrindSession — Dashboard Metrics Calculations', () => {
  const sampleSessions: SessionHistoryData[] = [
    {
      id: 's1', userId: 'u1', date: '2025-01-15T10:00:00Z',
      volume: 20, profit: 150, abiMed: 30, roi: 25,
      fts: 3, cravadas: 1, energiaMedia: 7, focoMedio: 8,
      confiancaMedia: 6, inteligenciaEmocionalMedia: 7, interferenciasMedia: 3,
      breakCount: 2, preparationPercentage: 70, status: 'completed'
    },
    {
      id: 's2', userId: 'u1', date: '2025-01-16T10:00:00Z',
      volume: 15, profit: -50, abiMed: 20, roi: -10,
      fts: 1, cravadas: 0, energiaMedia: 5, focoMedio: 6,
      confiancaMedia: 4, inteligenciaEmocionalMedia: 5, interferenciasMedia: 5,
      breakCount: 1, preparationPercentage: 50, status: 'completed'
    },
    {
      id: 's3', userId: 'u1', date: '2025-02-01T10:00:00Z',
      volume: 10, profit: 200, abiMed: 50, roi: 40,
      fts: 2, cravadas: 1, energiaMedia: 9, focoMedio: 9,
      confiancaMedia: 8, inteligenciaEmocionalMedia: 9, interferenciasMedia: 1,
      breakCount: 3, preparationPercentage: 90, status: 'active'
    },
  ];

  it('deve calcular totalVolume como soma dos volumes', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    expect(metrics.totalVolume).toBe(45); // 20 + 15 + 10
  });

  it('deve calcular totalProfit como soma dos profits', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    expect(metrics.totalProfit).toBe(300); // 150 + (-50) + 200
  });

  it('deve calcular avgROI como media dos ROIs', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    // (25 + (-10) + 40) / 3 = 55 / 3 ≈ 18.333
    expect(metrics.avgROI).toBeCloseTo(18.333, 2);
  });

  it('deve calcular totalSessions corretamente', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    expect(metrics.totalSessions).toBe(3);
  });

  it('deve calcular avgABI como media dos ABIs', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    // (30 + 20 + 50) / 3 = 100 / 3 ≈ 33.333
    expect(metrics.avgABI).toBeCloseTo(33.333, 2);
  });

  it('deve somar totalFTs e totalCravadas', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    expect(metrics.totalFTs).toBe(6); // 3 + 1 + 2
    expect(metrics.totalCravadas).toBe(2); // 1 + 0 + 1
  });

  it('deve calcular medias mentais corretamente', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    expect(metrics.avgEnergia).toBeCloseTo(7, 0); // (7 + 5 + 9) / 3 = 7
    expect(metrics.avgFoco).toBeCloseTo(7.667, 2); // (8 + 6 + 9) / 3
    expect(metrics.avgConfianca).toBeCloseTo(6, 0); // (6 + 4 + 8) / 3 = 6
    expect(metrics.avgInteligenciaEmocional).toBeCloseTo(7, 0); // (7 + 5 + 9) / 3 = 7
    expect(metrics.avgInterferencias).toBeCloseTo(3, 0); // (3 + 5 + 1) / 3 = 3
  });

  it('deve calcular avgPreparationPercentage corretamente', () => {
    const metrics = calculateDashboardMetrics(sampleSessions);
    // (70 + 50 + 90) / 3 = 210 / 3 = 70
    expect(metrics.avgPreparationPercentage).toBe(70);
  });

  it('deve retornar zeros para array vazio', () => {
    const metrics = calculateDashboardMetrics([]);
    expect(metrics.totalSessions).toBe(0);
    expect(metrics.totalVolume).toBe(0);
    expect(metrics.totalProfit).toBe(0);
    expect(metrics.avgROI).toBe(0);
    expect(metrics.avgABI).toBe(0);
    expect(metrics.avgEnergia).toBe(0);
    expect(metrics.avgPreparationPercentage).toBe(0);
  });
});

describe('GrindSession — Count Sessions by Status', () => {
  it('deve contar sessoes por status corretamente', () => {
    const sessions = [
      { status: 'active' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'planned' },
      { status: 'active' },
    ];
    const counts = countSessionsByStatus(sessions);
    expect(counts.active).toBe(2);
    expect(counts.completed).toBe(2);
    expect(counts.planned).toBe(1);
  });

  it('deve retornar zeros para array vazio', () => {
    const counts = countSessionsByStatus([]);
    expect(counts.active).toBe(0);
    expect(counts.completed).toBe(0);
    expect(counts.planned).toBe(0);
  });

  it('deve tratar status undefined como nenhum grupo', () => {
    const sessions = [{ status: undefined }, { status: 'completed' }];
    const counts = countSessionsByStatus(sessions);
    expect(counts.active).toBe(0);
    expect(counts.completed).toBe(1);
    expect(counts.planned).toBe(0);
  });
});

describe('GrindSession — Group Sessions by Month', () => {
  it('deve agrupar sessoes por mes (YYYY-MM)', () => {
    const sessions = [
      { date: '2025-01-15T10:00:00Z' },
      { date: '2025-01-20T10:00:00Z' },
      { date: '2025-02-05T10:00:00Z' },
    ];
    const groups = groupSessionsByMonth(sessions);
    expect(Object.keys(groups)).toEqual(['2025-01', '2025-02']);
    expect(groups['2025-01']).toHaveLength(2);
    expect(groups['2025-02']).toHaveLength(1);
  });

  it('deve retornar objeto vazio para array vazio', () => {
    const groups = groupSessionsByMonth([]);
    expect(Object.keys(groups)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Screen Cap Colors
// ---------------------------------------------------------------------------

describe('GrindSessionLive — getScreenCapColor', () => {
  it('deve retornar verde para percentage <= 70%', () => {
    const result = getScreenCapColor(7, 10);
    expect(result.bgColor).toBe('bg-green-600/20');
    expect(result.textColor).toBe('text-green-400');
    expect(result.borderColor).toBe('border-green-500/50');
  });

  it('deve retornar amarelo para percentage 71-90%', () => {
    const result = getScreenCapColor(8, 10);
    expect(result.bgColor).toBe('bg-yellow-600/20');
    expect(result.textColor).toBe('text-yellow-400');
    expect(result.borderColor).toBe('border-yellow-500/50');
  });

  it('deve retornar vermelho para percentage > 90%', () => {
    const result = getScreenCapColor(10, 10);
    expect(result.bgColor).toBe('bg-red-600/20');
    expect(result.textColor).toBe('text-red-400');
    expect(result.borderColor).toBe('border-red-500/50');
  });

  it('deve retornar cinza para cap = 0', () => {
    const result = getScreenCapColor(5, 0);
    expect(result.bgColor).toBe('bg-gray-600/20');
  });

  it('deve retornar cinza para cap negativo', () => {
    const result = getScreenCapColor(5, -1);
    expect(result.bgColor).toBe('bg-gray-600/20');
  });

  it('deve retornar cinza para current negativo', () => {
    const result = getScreenCapColor(-1, 10);
    expect(result.bgColor).toBe('bg-gray-600/20');
  });

  it('70% exato deve ser verde (boundary test)', () => {
    const result = getScreenCapColor(7, 10); // 70%
    expect(result.bgColor).toBe('bg-green-600/20');
  });

  it('90% exato deve ser amarelo (boundary test)', () => {
    const result = getScreenCapColor(9, 10); // 90%
    expect(result.bgColor).toBe('bg-yellow-600/20');
  });

  it('91% deve ser vermelho (boundary test)', () => {
    const result = getScreenCapColor(91, 100); // 91%
    expect(result.bgColor).toBe('bg-red-600/20');
  });
});

// ---------------------------------------------------------------------------
// 2b. Elapsed Time Formatting
// ---------------------------------------------------------------------------

describe('GrindSessionLive — formatElapsedTime', () => {
  it('deve formatar 0ms como "0h 0m"', () => {
    expect(formatElapsedTime(0)).toBe('0h 0m');
  });

  it('deve formatar 1 hora como "1h 0m"', () => {
    expect(formatElapsedTime(3600000)).toBe('1h 0m');
  });

  it('deve formatar 1h30m como "1h 30m"', () => {
    expect(formatElapsedTime(5400000)).toBe('1h 30m');
  });

  it('deve formatar 45 minutos como "0h 45m"', () => {
    expect(formatElapsedTime(2700000)).toBe('0h 45m');
  });

  it('deve formatar 5h15m corretamente', () => {
    const ms = (5 * 60 * 60 * 1000) + (15 * 60 * 1000);
    expect(formatElapsedTime(ms)).toBe('5h 15m');
  });

  it('deve ignorar segundos (floor)', () => {
    // 2h 30m 45s = 9045000ms -> deve ser "2h 30m"
    const ms = (2 * 60 * 60 * 1000) + (30 * 60 * 1000) + (45 * 1000);
    expect(formatElapsedTime(ms)).toBe('2h 30m');
  });
});

// ---------------------------------------------------------------------------
// 2c. Break Averages
// ---------------------------------------------------------------------------

describe('GrindSessionLive — calculateBreakAverages', () => {
  it('deve calcular medias corretamente para multiplos feedbacks', () => {
    const feedbacks: BreakFeedback[] = [
      { foco: 8, energia: 6, confianca: 7, inteligenciaEmocional: 9, interferencias: 2 },
      { foco: 6, energia: 4, confianca: 5, inteligenciaEmocional: 7, interferencias: 4 },
    ];
    const avg = calculateBreakAverages(feedbacks);
    expect(avg.foco).toBe(7); // (8+6)/2
    expect(avg.energia).toBe(5); // (6+4)/2
    expect(avg.confianca).toBe(6); // (7+5)/2
    expect(avg.inteligenciaEmocional).toBe(8); // (9+7)/2
    expect(avg.interferencias).toBe(3); // (2+4)/2
  });

  it('deve retornar zeros para array vazio', () => {
    const avg = calculateBreakAverages([]);
    expect(avg).toEqual({ energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 });
  });

  it('deve retornar zeros para null/undefined', () => {
    const avg = calculateBreakAverages(null as any);
    expect(avg).toEqual({ energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 });
  });

  it('deve retornar os mesmos valores para um unico feedback', () => {
    const feedbacks: BreakFeedback[] = [
      { foco: 8, energia: 6, confianca: 7, inteligenciaEmocional: 9, interferencias: 2 },
    ];
    const avg = calculateBreakAverages(feedbacks);
    expect(avg.foco).toBe(8);
    expect(avg.energia).toBe(6);
    expect(avg.confianca).toBe(7);
    expect(avg.inteligenciaEmocional).toBe(9);
    expect(avg.interferencias).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Helper Functions
// ---------------------------------------------------------------------------

describe('GrindSessionLive — getSiteColor', () => {
  it('deve retornar bg-red-600 para PokerStars', () => {
    expect(getSiteColor('PokerStars')).toBe('bg-red-600');
  });

  it('deve retornar bg-orange-600 para GGPoker', () => {
    expect(getSiteColor('GGPoker')).toBe('bg-orange-600');
  });

  it('deve retornar bg-orange-600 para GGNetwork', () => {
    expect(getSiteColor('GGNetwork')).toBe('bg-orange-600');
  });

  it('deve retornar bg-blue-600 para 888poker', () => {
    expect(getSiteColor('888poker')).toBe('bg-blue-600');
  });

  it('deve retornar bg-purple-600 para WPN', () => {
    expect(getSiteColor('WPN')).toBe('bg-purple-600');
  });

  it('deve retornar bg-gray-600 para site desconhecido', () => {
    expect(getSiteColor('UnknownSite')).toBe('bg-gray-600');
  });

  it('deve retornar bg-gray-600 para string vazia', () => {
    expect(getSiteColor('')).toBe('bg-gray-600');
  });
});

describe('GrindSession — formatCurrency (local)', () => {
  it('deve formatar valores positivos com $ e arredondar', () => {
    // Math.round(1500).toLocaleString() depends on locale, but the prefix is $
    const result = formatCurrencyLocal(1500);
    expect(result).toMatch(/^\$1[,.]?500$/);
  });

  it('deve formatar zero como $0', () => {
    expect(formatCurrencyLocal(0)).toBe('$0');
  });

  it('deve arredondar decimais', () => {
    const result = formatCurrencyLocal(99.7);
    expect(result).toBe('$100');
  });

  it('deve formatar valores negativos', () => {
    const result = formatCurrencyLocal(-250);
    expect(result).toMatch(/^\$-250$/);
  });
});

// ---------------------------------------------------------------------------
// 3b. Tournament Dedup Logic
// ---------------------------------------------------------------------------

describe('GrindSessionLive — Tournament Deduplication', () => {
  it('deve manter todos os session tournaments', () => {
    const session: TournamentBase[] = [
      { id: 'st1', name: 'T1', site: 'GGPoker', buyIn: '100', status: 'registered' },
      { id: 'st2', name: 'T2', site: 'PokerStars', buyIn: '50', status: 'upcoming' },
    ];
    const planned: TournamentBase[] = [];
    const result = deduplicateTournaments(session, planned);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toContain('st1');
    expect(result.map(t => t.id)).toContain('st2');
  });

  it('deve adicionar planned tournaments que nao tem sessao correspondente', () => {
    const session: TournamentBase[] = [
      { id: 'st1', name: 'T1', site: 'GGPoker', buyIn: '100', status: 'registered' },
    ];
    const planned: TournamentBase[] = [
      { id: 'pt1', name: 'T3', site: 'PartyPoker', buyIn: '200', status: 'upcoming' },
    ];
    const result = deduplicateTournaments(session, planned);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toContain('st1');
    expect(result.map(t => t.id)).toContain('planned-pt1');
  });

  it('deve descartar planned tournament quando session tournament tem plannedTournamentId correspondente', () => {
    const session: TournamentBase[] = [
      { id: 'st1', name: 'T1', site: 'GGPoker', buyIn: '100', plannedTournamentId: 'pt1', status: 'registered' },
    ];
    const planned: TournamentBase[] = [
      { id: 'pt1', name: 'T1', site: 'GGPoker', buyIn: '100', status: 'upcoming' },
    ];
    const result = deduplicateTournaments(session, planned);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('st1');
  });

  it('deve descartar planned tournament quando session tournament tem mesmo nome/site/buyIn/time e fromPlannedTournament=true', () => {
    const session: TournamentBase[] = [
      { id: 'st1', name: 'T1', site: 'GGPoker', buyIn: '100', time: '14:00', fromPlannedTournament: true, status: 'registered' },
    ];
    const planned: TournamentBase[] = [
      { id: 'pt1', name: 'T1', site: 'GGPoker', buyIn: '100', time: '14:00', status: 'upcoming' },
    ];
    const result = deduplicateTournaments(session, planned);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('st1');
  });

  it('deve tratar arrays null/undefined como vazios', () => {
    const result = deduplicateTournaments(null as any, undefined as any);
    expect(result).toHaveLength(0);
  });

  it('deve adicionar planned tournaments com status "upcoming" por padrao', () => {
    const session: TournamentBase[] = [];
    const planned: TournamentBase[] = [
      { id: 'pt1', name: 'T1', site: 'GGPoker', buyIn: '100' },
    ];
    const result = deduplicateTournaments(session, planned);
    expect(result[0].status).toBe('upcoming');
  });
});
