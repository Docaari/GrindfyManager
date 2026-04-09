import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: FP-17 — Metricas de progresso nos estudos
//
// Funcoes puras que calculam progresso e streaks de estudo:
//   - `calculateThemeProgress(cards)` — media de knowledgeScore (0-100)
//   - `getMasteryLevel(progress)` — Iniciante/Intermediario/Avancado/Dominado
//   - `calculateStudyStreak(sessions)` — dias consecutivos estudando
//   - `getStudyDashboardStats(sessions, cards)` — stats do mini-dashboard
//
// Modulo esperado: `client/src/lib/study-progress-helpers.ts`
//
// Fonte de verdade: spec RF-04, RF-05, RF-06, RF-07
// Schema: study_cards.knowledgeScore (0-100), study_sessions.duration (min)
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Tipos esperados
interface StudyCard {
  id: string;
  knowledgeScore: number; // 0-100
  status: string;
  category: string;
}

interface StudySession {
  id: string;
  date: string; // ISO date
  duration: number; // minutos
}

interface StudyDashboardStats {
  hoursThisMonth: number;
  themesInProgress: number;
  streakDays: number;
}

interface ThemeWithProgress {
  name: string;
  progress: number; // 0-100
  cards: StudyCard[];
}

// Stubs para compilacao — Implementer substituira
let calculateThemeProgress: (cards: StudyCard[]) => number;
let getMasteryLevel: (progress: number) => string;
let calculateStudyStreak: (sessions: StudySession[], referenceDate?: Date) => number;
let getStudyDashboardStats: (sessions: StudySession[], themes: ThemeWithProgress[], referenceDate?: Date) => StudyDashboardStats;

try {
  const mod = require('../../../client/src/lib/study-progress-helpers');
  if (mod.calculateThemeProgress) calculateThemeProgress = mod.calculateThemeProgress;
  if (mod.getMasteryLevel) getMasteryLevel = mod.getMasteryLevel;
  if (mod.calculateStudyStreak) calculateStudyStreak = mod.calculateStudyStreak;
  if (mod.getStudyDashboardStats) getStudyDashboardStats = mod.getStudyDashboardStats;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// calculateThemeProgress — media dos knowledgeScore dos cards
// ---------------------------------------------------------------------------

describe('calculateThemeProgress', () => {
  it('deve retornar 0 quando nao ha cards', () => {
    expect(calculateThemeProgress([])).toBe(0);
  });

  it('deve retornar a media dos knowledgeScore', () => {
    const cards: StudyCard[] = [
      { id: '1', knowledgeScore: 60, status: 'active', category: 'ICM' },
      { id: '2', knowledgeScore: 80, status: 'active', category: 'ICM' },
    ];
    expect(calculateThemeProgress(cards)).toBe(70);
  });

  it('deve retornar 100 quando todos os cards estao com score 100', () => {
    const cards: StudyCard[] = [
      { id: '1', knowledgeScore: 100, status: 'completed', category: '3bet' },
      { id: '2', knowledgeScore: 100, status: 'completed', category: '3bet' },
      { id: '3', knowledgeScore: 100, status: 'completed', category: '3bet' },
    ];
    expect(calculateThemeProgress(cards)).toBe(100);
  });

  it('deve arredondar para inteiro', () => {
    const cards: StudyCard[] = [
      { id: '1', knowledgeScore: 33, status: 'active', category: 'ICM' },
      { id: '2', knowledgeScore: 33, status: 'active', category: 'ICM' },
      { id: '3', knowledgeScore: 34, status: 'active', category: 'ICM' },
    ];
    // Media exata = 33.333..., deve arredondar
    const result = calculateThemeProgress(cards);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(33);
  });

  it('deve considerar cards com score 0', () => {
    const cards: StudyCard[] = [
      { id: '1', knowledgeScore: 0, status: 'active', category: 'ICM' },
      { id: '2', knowledgeScore: 100, status: 'completed', category: 'ICM' },
    ];
    expect(calculateThemeProgress(cards)).toBe(50);
  });

  it('deve retornar o proprio score quando ha apenas 1 card', () => {
    const cards: StudyCard[] = [
      { id: '1', knowledgeScore: 75, status: 'active', category: 'PKO' },
    ];
    expect(calculateThemeProgress(cards)).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// getMasteryLevel — retorna nivel de dominio baseado no progresso
// ---------------------------------------------------------------------------

describe('getMasteryLevel', () => {
  it('deve retornar "Iniciante" para progress 0', () => {
    expect(getMasteryLevel(0)).toBe('Iniciante');
  });

  it('deve retornar "Iniciante" para progress 29', () => {
    expect(getMasteryLevel(29)).toBe('Iniciante');
  });

  it('deve retornar "Intermediario" para progress 30', () => {
    expect(getMasteryLevel(30)).toBe('Intermediario');
  });

  it('deve retornar "Intermediario" para progress 59', () => {
    expect(getMasteryLevel(59)).toBe('Intermediario');
  });

  it('deve retornar "Avancado" para progress 60', () => {
    expect(getMasteryLevel(60)).toBe('Avancado');
  });

  it('deve retornar "Avancado" para progress 89', () => {
    expect(getMasteryLevel(89)).toBe('Avancado');
  });

  it('deve retornar "Dominado" para progress 90', () => {
    expect(getMasteryLevel(90)).toBe('Dominado');
  });

  it('deve retornar "Dominado" para progress 100', () => {
    expect(getMasteryLevel(100)).toBe('Dominado');
  });
});

// ---------------------------------------------------------------------------
// calculateStudyStreak — dias consecutivos estudando
// ---------------------------------------------------------------------------

describe('calculateStudyStreak', () => {
  // Usando referenceDate fixo para evitar dependencia de Date.now()
  const today = new Date('2026-04-08T12:00:00Z');

  it('deve retornar 0 quando nao ha sessoes', () => {
    expect(calculateStudyStreak([], today)).toBe(0);
  });

  it('deve retornar 0 se hoje nao tem sessao de estudo', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-07T10:00:00Z', duration: 30 },
    ];
    expect(calculateStudyStreak(sessions, today)).toBe(0);
  });

  it('deve retornar 1 se so hoje tem sessao', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-08T09:00:00Z', duration: 45 },
    ];
    expect(calculateStudyStreak(sessions, today)).toBe(1);
  });

  it('deve retornar 3 se estudou hoje, ontem e anteontem', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-08T09:00:00Z', duration: 30 },
      { id: '2', date: '2026-04-07T10:00:00Z', duration: 45 },
      { id: '3', date: '2026-04-06T14:00:00Z', duration: 20 },
    ];
    expect(calculateStudyStreak(sessions, today)).toBe(3);
  });

  it('deve parar a contagem no primeiro dia sem sessao', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-08T09:00:00Z', duration: 30 },
      { id: '2', date: '2026-04-07T10:00:00Z', duration: 45 },
      // gap em 2026-04-06
      { id: '3', date: '2026-04-05T14:00:00Z', duration: 20 },
    ];
    expect(calculateStudyStreak(sessions, today)).toBe(2);
  });

  it('deve contar multiplas sessoes no mesmo dia como 1 dia', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-08T09:00:00Z', duration: 30 },
      { id: '2', date: '2026-04-08T14:00:00Z', duration: 60 },
      { id: '3', date: '2026-04-07T10:00:00Z', duration: 45 },
    ];
    expect(calculateStudyStreak(sessions, today)).toBe(2);
  });

  it('deve contar sessao com duracao 0 minutos como dia valido para streak', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-08T09:00:00Z', duration: 0 },
      { id: '2', date: '2026-04-07T10:00:00Z', duration: 30 },
    ];
    expect(calculateStudyStreak(sessions, today)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getStudyDashboardStats — stats do mini-dashboard de estudos
// ---------------------------------------------------------------------------

describe('getStudyDashboardStats', () => {
  const today = new Date('2026-04-08T12:00:00Z');

  it('deve retornar tudo zero quando nao ha dados', () => {
    const stats = getStudyDashboardStats([], [], today);
    expect(stats.hoursThisMonth).toBe(0);
    expect(stats.themesInProgress).toBe(0);
    expect(stats.streakDays).toBe(0);
  });

  it('deve calcular horas do mes corrente a partir de minutos', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-05T10:00:00Z', duration: 120 }, // 2 horas
      { id: '2', date: '2026-04-08T10:00:00Z', duration: 60 },  // 1 hora
    ];
    const stats = getStudyDashboardStats(sessions, [], today);
    expect(stats.hoursThisMonth).toBe(3);
  });

  it('nao deve contar sessoes de outros meses nas horas', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-03-28T10:00:00Z', duration: 120 }, // marco — nao conta
      { id: '2', date: '2026-04-02T10:00:00Z', duration: 90 },  // abril — conta
    ];
    const stats = getStudyDashboardStats(sessions, [], today);
    expect(stats.hoursThisMonth).toBe(1.5);
  });

  it('deve contar temas em progresso (progress entre 1 e 99)', () => {
    const themes: ThemeWithProgress[] = [
      { name: 'ICM', progress: 50, cards: [] },       // em progresso
      { name: '3bet', progress: 0, cards: [] },        // nao iniciado
      { name: 'PKO', progress: 100, cards: [] },       // dominado
      { name: 'Mental', progress: 75, cards: [] },     // em progresso
    ];
    const stats = getStudyDashboardStats([], themes, today);
    expect(stats.themesInProgress).toBe(2);
  });

  it('deve calcular streak de dias a partir das sessoes', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-08T09:00:00Z', duration: 30 },
      { id: '2', date: '2026-04-07T10:00:00Z', duration: 45 },
      { id: '3', date: '2026-04-06T14:00:00Z', duration: 20 },
    ];
    const stats = getStudyDashboardStats(sessions, [], today);
    expect(stats.streakDays).toBe(3);
  });

  it('deve arredondar horas para 1 casa decimal', () => {
    const sessions: StudySession[] = [
      { id: '1', date: '2026-04-08T10:00:00Z', duration: 25 }, // 0.4166... horas
    ];
    const stats = getStudyDashboardStats(sessions, [], today);
    // 25 / 60 = 0.4166..., arredondado para 0.4
    expect(stats.hoursThisMonth).toBeCloseTo(0.4, 1);
  });
});
