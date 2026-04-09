import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-05/RF-06/RF-07 — Inicio rapido de sessao (FP-09)
//
// Funcoes puras que controlam a logica de inicio rapido:
//   - `buildQuickStartSession`: monta objeto de sessao com defaults inteligentes
//   - `hasWarmUpData`: verifica se warm-up foi concluido
//   - `getQuickStartLabel`: retorna label contextual do botao
//   - `getLastSessionDefaults`: extrai defaults da sessao mais recente
//
// Modulo esperado: `client/src/components/grind-session/quick-start-helpers.ts`
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Estas funcoes AINDA NAO EXISTEM
// import {
//   buildQuickStartSession,
//   hasWarmUpData,
//   getQuickStartLabel,
//   getLastSessionDefaults,
// } from '../../../client/src/components/grind-session/quick-start-helpers';

// Tipos esperados
interface WarmUpData {
  mentalState: number;
  focusLevel: number;
  confidenceLevel: number;
  warmupCompleted: boolean;
  notes?: string | null;
  exercisesCompleted?: string[];
  createdAt: string;
}

interface SessionData {
  id: string;
  date: string;
  status: string;
  screenCap?: number | null;
  notes?: string | null;
  preparationPercentage?: number | null;
  [key: string]: any;
}

interface UserSettings {
  breakFrequencyMinutes?: number;
  [key: string]: any;
}

interface QuickStartSession {
  preparationPercentage: number;
  preparationNotes: string;
  dailyGoals: string;
  screenCap: number;
  skipBreaksToday: boolean;
}

// Stubs para compilacao — Implementer substituira
let buildQuickStartSession: (warmUpData: WarmUpData | null, previousSession: SessionData | null, userSettings: UserSettings | null) => QuickStartSession;
let hasWarmUpData: (warmUpData: WarmUpData | null) => boolean;
let getQuickStartLabel: (warmUpData: WarmUpData | null) => string;
let getLastSessionDefaults: (sessions: SessionData[]) => { screenCap: number };

try {
  const mod = require('../../../client/src/components/grind-session/quick-start-helpers');
  if (mod.buildQuickStartSession) buildQuickStartSession = mod.buildQuickStartSession;
  if (mod.hasWarmUpData) hasWarmUpData = mod.hasWarmUpData;
  if (mod.getQuickStartLabel) getQuickStartLabel = mod.getQuickStartLabel;
  if (mod.getLastSessionDefaults) getLastSessionDefaults = mod.getLastSessionDefaults;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const completedWarmUp: WarmUpData = {
  mentalState: 85,
  focusLevel: 8,
  confidenceLevel: 7,
  warmupCompleted: true,
  notes: 'Fiz respiracao e visualizacao',
  exercisesCompleted: ['breathing', 'visualization', 'affirmations'],
  createdAt: '2026-04-08T14:00:00.000Z',
};

const incompleteWarmUp: WarmUpData = {
  mentalState: 30,
  focusLevel: 3,
  confidenceLevel: 4,
  warmupCompleted: false,
  notes: null,
  exercisesCompleted: [],
  createdAt: '2026-04-08T14:00:00.000Z',
};

const zeroScoreWarmUp: WarmUpData = {
  mentalState: 0,
  focusLevel: 0,
  confidenceLevel: 0,
  warmupCompleted: false,
  notes: null,
  exercisesCompleted: [],
  createdAt: '2026-04-08T14:00:00.000Z',
};

const previousSession: SessionData = {
  id: 's1',
  date: '2026-04-07T14:00:00.000Z',
  status: 'completed',
  screenCap: 6,
  notes: 'Sessao produtiva',
  preparationPercentage: 75,
};

const previousSessionNoScreenCap: SessionData = {
  id: 's2',
  date: '2026-04-06T14:00:00.000Z',
  status: 'completed',
  screenCap: null,
  notes: null,
  preparationPercentage: 50,
};

// ---------------------------------------------------------------------------
// hasWarmUpData — verifica se warm-up foi concluido
// ---------------------------------------------------------------------------

describe('hasWarmUpData', () => {
  it('deve retornar true quando warm-up foi completado (warmupCompleted=true)', () => {
    expect(hasWarmUpData(completedWarmUp)).toBe(true);
  });

  it('deve retornar false quando warmUpData e null', () => {
    expect(hasWarmUpData(null)).toBe(false);
  });

  it('deve retornar false quando warm-up nao foi completado (warmupCompleted=false)', () => {
    expect(hasWarmUpData(incompleteWarmUp)).toBe(false);
  });

  it('deve retornar false quando mentalState e 0 e warmupCompleted e false', () => {
    expect(hasWarmUpData(zeroScoreWarmUp)).toBe(false);
  });

  it('deve retornar true mesmo com mentalState baixo se warmupCompleted e true', () => {
    const lowScoreCompleted: WarmUpData = {
      ...incompleteWarmUp,
      mentalState: 20,
      warmupCompleted: true,
    };
    expect(hasWarmUpData(lowScoreCompleted)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getQuickStartLabel — retorna label contextual do botao
// ---------------------------------------------------------------------------

describe('getQuickStartLabel', () => {
  it('deve retornar "Inicio Rapido" quando nao ha warm-up', () => {
    expect(getQuickStartLabel(null)).toBe('Inicio Rapido');
  });

  it('deve retornar "Inicio Rapido" quando warm-up nao foi completado', () => {
    expect(getQuickStartLabel(incompleteWarmUp)).toBe('Inicio Rapido');
  });

  it('deve retornar label com percentual quando warm-up foi completado', () => {
    expect(getQuickStartLabel(completedWarmUp)).toBe('Inicio Rapido (Warm-up 85%)');
  });

  it('deve incluir o percentual correto do mentalState', () => {
    const warmUp70: WarmUpData = { ...completedWarmUp, mentalState: 70 };
    expect(getQuickStartLabel(warmUp70)).toBe('Inicio Rapido (Warm-up 70%)');
  });

  it('deve funcionar com mentalState 100%', () => {
    const warmUp100: WarmUpData = { ...completedWarmUp, mentalState: 100 };
    expect(getQuickStartLabel(warmUp100)).toBe('Inicio Rapido (Warm-up 100%)');
  });

  it('deve funcionar com mentalState 0% se warmupCompleted e true', () => {
    const warmUp0: WarmUpData = { ...completedWarmUp, mentalState: 0 };
    expect(getQuickStartLabel(warmUp0)).toBe('Inicio Rapido (Warm-up 0%)');
  });
});

// ---------------------------------------------------------------------------
// getLastSessionDefaults — extrai defaults da sessao mais recente
// ---------------------------------------------------------------------------

describe('getLastSessionDefaults', () => {
  it('deve retornar screenCap da sessao mais recente', () => {
    const result = getLastSessionDefaults([previousSession]);
    expect(result.screenCap).toBe(6);
  });

  it('deve retornar screenCap default 4 quando lista de sessoes e vazia', () => {
    const result = getLastSessionDefaults([]);
    expect(result.screenCap).toBe(4);
  });

  it('deve retornar screenCap default 4 quando sessao mais recente nao tem screenCap', () => {
    const result = getLastSessionDefaults([previousSessionNoScreenCap]);
    expect(result.screenCap).toBe(4);
  });

  it('deve usar a sessao mais recente por data', () => {
    const olderSession: SessionData = {
      id: 's3',
      date: '2026-04-05T14:00:00.000Z',
      status: 'completed',
      screenCap: 3,
    };
    // previousSession (04-07) e mais recente que olderSession (04-05)
    const result = getLastSessionDefaults([olderSession, previousSession]);
    expect(result.screenCap).toBe(6);
  });

  it('deve pular sessoes com screenCap null e usar a proxima com valor', () => {
    const recentNoScreenCap: SessionData = {
      id: 's4',
      date: '2026-04-08T10:00:00.000Z',
      status: 'completed',
      screenCap: null,
    };
    // recentNoScreenCap (04-08) e mais recente mas sem screenCap
    // previousSession (04-07) tem screenCap 6
    const result = getLastSessionDefaults([recentNoScreenCap, previousSession]);
    expect(result.screenCap).toBe(6);
  });

  it('deve retornar 4 quando todas as sessoes tem screenCap null', () => {
    const sessions: SessionData[] = [
      { id: 's1', date: '2026-04-07T14:00:00.000Z', status: 'completed', screenCap: null },
      { id: 's2', date: '2026-04-06T14:00:00.000Z', status: 'completed', screenCap: null },
    ];
    const result = getLastSessionDefaults(sessions);
    expect(result.screenCap).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// buildQuickStartSession — monta objeto de sessao com defaults inteligentes
// ---------------------------------------------------------------------------

describe('buildQuickStartSession', () => {
  // --- Happy path com warm-up ---

  describe('com warm-up completado', () => {
    it('deve usar preparationPercentage do warm-up', () => {
      const session = buildQuickStartSession(completedWarmUp, previousSession, null);
      expect(session.preparationPercentage).toBe(85);
    });

    it('deve usar notas do warm-up como preparationNotes', () => {
      const session = buildQuickStartSession(completedWarmUp, previousSession, null);
      expect(session.preparationNotes).toBe('Fiz respiracao e visualizacao');
    });

    it('deve ter dailyGoals vazio', () => {
      const session = buildQuickStartSession(completedWarmUp, previousSession, null);
      expect(session.dailyGoals).toBe('');
    });

    it('deve ter skipBreaksToday false', () => {
      const session = buildQuickStartSession(completedWarmUp, previousSession, null);
      expect(session.skipBreaksToday).toBe(false);
    });

    it('deve herdar screenCap da sessao anterior', () => {
      const session = buildQuickStartSession(completedWarmUp, previousSession, null);
      expect(session.screenCap).toBe(6);
    });
  });

  // --- Sem warm-up ---

  describe('sem warm-up', () => {
    it('deve ter preparationPercentage 0 quando warmUpData e null', () => {
      const session = buildQuickStartSession(null, previousSession, null);
      expect(session.preparationPercentage).toBe(0);
    });

    it('deve ter preparationPercentage 0 quando warm-up nao foi completado', () => {
      const session = buildQuickStartSession(incompleteWarmUp, previousSession, null);
      expect(session.preparationPercentage).toBe(0);
    });

    it('deve ter preparationNotes vazio sem warm-up', () => {
      const session = buildQuickStartSession(null, previousSession, null);
      expect(session.preparationNotes).toBe('');
    });

    it('deve manter skipBreaksToday false mesmo sem warm-up', () => {
      const session = buildQuickStartSession(null, previousSession, null);
      expect(session.skipBreaksToday).toBe(false);
    });
  });

  // --- screenCap defaults ---

  describe('screenCap defaults', () => {
    it('deve usar screenCap da sessao anterior quando disponivel', () => {
      const session = buildQuickStartSession(null, previousSession, null);
      expect(session.screenCap).toBe(6);
    });

    it('deve usar default 4 quando nao ha sessao anterior', () => {
      const session = buildQuickStartSession(null, null, null);
      expect(session.screenCap).toBe(4);
    });

    it('deve usar default 4 quando sessao anterior nao tem screenCap', () => {
      const session = buildQuickStartSession(null, previousSessionNoScreenCap, null);
      expect(session.screenCap).toBe(4);
    });
  });

  // --- Todos defaults (usuario novo, sem nada) ---

  describe('usuario novo sem dados previos', () => {
    it('deve retornar sessao com todos os defaults', () => {
      const session = buildQuickStartSession(null, null, null);
      expect(session).toEqual({
        preparationPercentage: 0,
        preparationNotes: '',
        dailyGoals: '',
        screenCap: 4,
        skipBreaksToday: false,
      });
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('deve funcionar com warm-up sem notas (notes null)', () => {
      const warmUpNoNotes: WarmUpData = {
        ...completedWarmUp,
        notes: null,
      };
      const session = buildQuickStartSession(warmUpNoNotes, null, null);
      expect(session.preparationPercentage).toBe(85);
      expect(session.preparationNotes).toBe('');
    });

    it('deve funcionar com warm-up com notas vazias', () => {
      const warmUpEmptyNotes: WarmUpData = {
        ...completedWarmUp,
        notes: '',
      };
      const session = buildQuickStartSession(warmUpEmptyNotes, null, null);
      expect(session.preparationNotes).toBe('');
    });

    it('deve usar preparationPercentage 0 para warm-up com mentalState 0 e warmupCompleted false', () => {
      const session = buildQuickStartSession(zeroScoreWarmUp, null, null);
      expect(session.preparationPercentage).toBe(0);
    });

    it('skipBreaksToday deve ser sempre false no quick start independente de qualquer input', () => {
      const session1 = buildQuickStartSession(completedWarmUp, previousSession, { breakFrequencyMinutes: 30 });
      const session2 = buildQuickStartSession(null, null, null);
      const session3 = buildQuickStartSession(incompleteWarmUp, previousSession, null);
      expect(session1.skipBreaksToday).toBe(false);
      expect(session2.skipBreaksToday).toBe(false);
      expect(session3.skipBreaksToday).toBe(false);
    });
  });
});
