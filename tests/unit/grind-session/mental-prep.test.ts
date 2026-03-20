import { describe, it, expect } from 'vitest';
import {
  insertPreparationLogSchema,
  insertBreakFeedbackSchema,
} from '../../../shared/schema';
import { clampValue, clampBreakFeedback } from '../../../shared/utils';
import { mapLogsToStats } from '../../../client/src/lib/mentalPrepUtils';

// =============================================================================
// Testes TDD: Mental Prep (fix-mental-prep spec)
// Definem o comportamento CORRETO apos as correcoes.
// Todos devem FALHAR com o codigo atual (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// PARTE 1: insertBreakFeedbackSchema — Validacao de range 0-10 (RF-10)
//
// ATUALMENTE: O schema aceita qualquer integer (sem .min/.max).
// ESPERADO: Campos foco, energia, confianca, inteligenciaEmocional,
//           interferencias devem ser validados com .min(0).max(10).
// ---------------------------------------------------------------------------

describe('insertBreakFeedbackSchema — validacao de range 0-10 (RF-10)', () => {
  const validFeedback = {
    userId: 'USER-0001',
    sessionId: 'session-001',
    breakTime: new Date('2025-01-20T16:00:00.000Z'),
    foco: 8,
    energia: 7,
    confianca: 9,
    inteligenciaEmocional: 6,
    interferencias: 3,
  };

  const sliderFields = [
    'foco',
    'energia',
    'confianca',
    'inteligenciaEmocional',
    'interferencias',
  ] as const;

  // --- Valores acima do maximo (devem ser rejeitados) ---

  for (const field of sliderFields) {
    it(`deve rejeitar ${field} com valor 11 (acima do maximo)`, () => {
      const data = { ...validFeedback, [field]: 11 };
      const result = insertBreakFeedbackSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it(`deve rejeitar ${field} com valor 999 (muito acima do maximo)`, () => {
      const data = { ...validFeedback, [field]: 999 };
      const result = insertBreakFeedbackSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  }

  // --- Valores abaixo do minimo (devem ser rejeitados) ---

  for (const field of sliderFields) {
    it(`deve rejeitar ${field} com valor -1 (abaixo do minimo)`, () => {
      const data = { ...validFeedback, [field]: -1 };
      const result = insertBreakFeedbackSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it(`deve rejeitar ${field} com valor -100 (muito abaixo do minimo)`, () => {
      const data = { ...validFeedback, [field]: -100 };
      const result = insertBreakFeedbackSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  }

  // --- Valores nos limites exatos (devem ser aceitos) ---

  it('deve aceitar todos os campos com valor 0 (limite inferior)', () => {
    const data = {
      ...validFeedback,
      foco: 0,
      energia: 0,
      confianca: 0,
      inteligenciaEmocional: 0,
      interferencias: 0,
    };
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar todos os campos com valor 10 (limite superior)', () => {
    const data = {
      ...validFeedback,
      foco: 10,
      energia: 10,
      confianca: 10,
      inteligenciaEmocional: 10,
      interferencias: 10,
    };
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar todos os campos com valor 5 (meio do range)', () => {
    const data = {
      ...validFeedback,
      foco: 5,
      energia: 5,
      confianca: 5,
      inteligenciaEmocional: 5,
      interferencias: 5,
    };
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PARTE 2: insertPreparationLogSchema — Validacao de range para levels (RF-06)
//
// ATUALMENTE: O schema aceita qualquer integer para focusLevel e
//             confidenceLevel (sem restricao de range).
// ESPERADO: focusLevel e confidenceLevel devem ser validados com
//           .min(1).max(10) (escala 1-10 apos unificacao com MentalSlider).
// ---------------------------------------------------------------------------

describe('insertPreparationLogSchema — validacao de range 1-10 para levels (RF-06)', () => {
  const validLog = {
    userId: 'USER-0001',
    mentalState: 75,
    focusLevel: 8,
    confidenceLevel: 9,
  };

  // --- focusLevel ---

  it('deve aceitar focusLevel com valor 1 (limite inferior)', () => {
    const data = { ...validLog, focusLevel: 1 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar focusLevel com valor 10 (limite superior)', () => {
    const data = { ...validLog, focusLevel: 10 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar focusLevel com valor 0 (abaixo do minimo)', () => {
    const data = { ...validLog, focusLevel: 0 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar focusLevel com valor 11 (acima do maximo)', () => {
    const data = { ...validLog, focusLevel: 11 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar focusLevel com valor -1 (negativo)', () => {
    const data = { ...validLog, focusLevel: -1 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar focusLevel com valor 100 (escala antiga 0-100)', () => {
    const data = { ...validLog, focusLevel: 100 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // --- confidenceLevel ---

  it('deve aceitar confidenceLevel com valor 1 (limite inferior)', () => {
    const data = { ...validLog, confidenceLevel: 1 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar confidenceLevel com valor 10 (limite superior)', () => {
    const data = { ...validLog, confidenceLevel: 10 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar confidenceLevel com valor 0 (abaixo do minimo)', () => {
    const data = { ...validLog, confidenceLevel: 0 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar confidenceLevel com valor 11 (acima do maximo)', () => {
    const data = { ...validLog, confidenceLevel: 11 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar confidenceLevel com valor -5 (negativo)', () => {
    const data = { ...validLog, confidenceLevel: -5 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PARTE 3: insertPreparationLogSchema — Validacao de notes maxLength (RF-05)
//
// ATUALMENTE: O campo notes aceita text sem limite.
// ESPERADO: notes deve ter maxLength de 200 caracteres.
// ---------------------------------------------------------------------------

describe('insertPreparationLogSchema — validacao de notes maxLength (RF-05)', () => {
  const validLog = {
    userId: 'USER-0001',
    mentalState: 75,
    focusLevel: 8,
    confidenceLevel: 9,
  };

  it('deve aceitar notes com 200 caracteres (limite exato)', () => {
    const data = { ...validLog, notes: 'a'.repeat(200) };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar notes com 201 caracteres (acima do limite)', () => {
    const data = { ...validLog, notes: 'a'.repeat(201) };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar notes como null', () => {
    const data = { ...validLog, notes: null };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar notes como string vazia', () => {
    const data = { ...validLog, notes: '' };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PARTE 4: Funcao clampValue — Clamping de valores para sliders (RF-03/RF-10)
//
// Funcao utilitaria que garante que um valor fica entre min e max.
// Usada tanto nos sliders do frontend (1-10) quanto no clamping do backend (0-10).
//
// IMPORT: Esta funcao AINDA NAO EXISTE. O Implementer vai cria-la.
// Local esperado: shared/utils.ts ou client/src/lib/mentalPrepUtils.ts
// ---------------------------------------------------------------------------

// O import vai falhar ate o Implementer criar o modulo.
// import { clampValue } from '../../../shared/utils';

describe('clampValue — clamping de valores para sliders', () => {
  // Import real: clampValue from shared/utils

  it('deve retornar o valor quando esta dentro do range', () => {
    expect(clampValue(5, 1, 10)).toBe(5);
  });

  it('deve retornar min quando valor esta abaixo', () => {
    expect(clampValue(0, 1, 10)).toBe(1);
  });

  it('deve retornar max quando valor esta acima', () => {
    expect(clampValue(15, 1, 10)).toBe(10);
  });

  it('deve retornar min quando valor e negativo', () => {
    expect(clampValue(-5, 0, 10)).toBe(0);
  });

  it('deve retornar o limite exato quando valor e igual ao min', () => {
    expect(clampValue(1, 1, 10)).toBe(1);
  });

  it('deve retornar o limite exato quando valor e igual ao max', () => {
    expect(clampValue(10, 1, 10)).toBe(10);
  });

  it('deve funcionar com range 0-10 (break feedbacks)', () => {
    expect(clampValue(999, 0, 10)).toBe(10);
    expect(clampValue(-999, 0, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PARTE 5: Funcao clampBreakFeedback — Clamping de todos os campos (RF-10)
//
// Funcao que recebe os campos raw do request body e retorna objeto com
// todos os valores clampados ao range 0-10, com default 5 para undefined.
//
// IMPORT: Esta funcao AINDA NAO EXISTE. O Implementer vai cria-la.
// Local esperado: server/utils.ts ou server/routes/grind-sessions.ts (inline)
// ---------------------------------------------------------------------------

describe('clampBreakFeedback — clamping de campos do break feedback (RF-10)', () => {
  // Import real: clampBreakFeedback from shared/utils

  it('deve clampar foco=999 para 10', () => {
    const result = clampBreakFeedback({ foco: 999, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 });
    expect(result.foco).toBe(10);
  });

  it('deve clampar foco=-5 para 0', () => {
    const result = clampBreakFeedback({ foco: -5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 });
    expect(result.foco).toBe(0);
  });

  it('deve usar default 5 quando foco e undefined', () => {
    const result = clampBreakFeedback({ energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 });
    expect(result.foco).toBe(5);
  });

  it('deve clampar todos os campos simultaneamente', () => {
    const result = clampBreakFeedback({
      foco: 999,
      energia: -10,
      confianca: 11,
      inteligenciaEmocional: -1,
      interferencias: 100,
    });
    expect(result.foco).toBe(10);
    expect(result.energia).toBe(0);
    expect(result.confianca).toBe(10);
    expect(result.inteligenciaEmocional).toBe(0);
    expect(result.interferencias).toBe(10);
  });

  it('deve manter valores validos inalterados', () => {
    const result = clampBreakFeedback({
      foco: 8,
      energia: 7,
      confianca: 9,
      inteligenciaEmocional: 6,
      interferencias: 3,
    });
    expect(result.foco).toBe(8);
    expect(result.energia).toBe(7);
    expect(result.confianca).toBe(9);
    expect(result.inteligenciaEmocional).toBe(6);
    expect(result.interferencias).toBe(3);
  });

  it('deve tratar valores string numericos via parseInt', () => {
    const result = clampBreakFeedback({
      foco: '8',
      energia: '7',
      confianca: '9',
      inteligenciaEmocional: '6',
      interferencias: '3',
    });
    expect(result.foco).toBe(8);
    expect(result.energia).toBe(7);
    expect(result.confianca).toBe(9);
    expect(result.inteligenciaEmocional).toBe(6);
    expect(result.interferencias).toBe(3);
  });

  it('deve usar default 5 para valores nao-numericos (NaN)', () => {
    const result = clampBreakFeedback({
      foco: 'abc',
      energia: null,
      confianca: undefined,
      inteligenciaEmocional: '',
      interferencias: NaN,
    });
    expect(result.foco).toBe(5);
    expect(result.energia).toBe(5);
    expect(result.confianca).toBe(5);
    expect(result.inteligenciaEmocional).toBe(5);
    expect(result.interferencias).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PARTE 6: Funcao mapLogsToStats — Mapeamento de dados da API para UI (RF-01)
//
// Funcao que converte array de preparation_logs retornados pelo backend
// no formato de stats usado pela UI da pagina MentalPrep.
//
// IMPORT: Esta funcao AINDA NAO EXISTE. O Implementer vai cria-la.
// Local esperado: client/src/lib/mentalPrepUtils.ts
// ---------------------------------------------------------------------------

// Tipo esperado do log retornado pelo GET /api/preparation-logs
interface PreparationLog {
  id: string;
  userId: string;
  sessionId: string | null;
  mentalState: number;
  focusLevel: number;
  confidenceLevel: number;
  exercisesCompleted: string[] | null;
  warmupCompleted: boolean;
  notes: string | null;
  createdAt: string; // ISO date string from API
}

// Tipo esperado do retorno da funcao
interface MentalPrepStats {
  totalSessions: number;
  averageScore: number;
  currentStreak: number;
  scoreHistory: Array<{ date: string; score: number }>;
}

describe('mapLogsToStats — mapeamento de preparation_logs para stats da UI (RF-01)', () => {
  // Import real: mapLogsToStats from client/src/lib/mentalPrepUtils

  const makeLog = (overrides: Partial<PreparationLog> = {}): PreparationLog => ({
    id: 'log-1',
    userId: 'USER-0001',
    sessionId: null,
    mentalState: 75,
    focusLevel: 8,
    confidenceLevel: 7,
    exercisesCompleted: ['breathing'],
    warmupCompleted: true,
    notes: null,
    createdAt: '2026-03-20T10:00:00.000Z',
    ...overrides,
  });

  // --- totalSessions ---

  it('deve retornar totalSessions igual ao tamanho do array', () => {
    const logs = [
      makeLog({ id: 'log-1', createdAt: '2026-03-20T10:00:00.000Z' }),
      makeLog({ id: 'log-2', createdAt: '2026-03-19T10:00:00.000Z' }),
      makeLog({ id: 'log-3', createdAt: '2026-03-18T10:00:00.000Z' }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.totalSessions).toBe(3);
  });

  it('deve retornar totalSessions 0 para array vazio', () => {
    const stats = mapLogsToStats([]);
    expect(stats.totalSessions).toBe(0);
  });

  // --- averageScore ---

  it('deve calcular averageScore como media dos mentalState', () => {
    const logs = [
      makeLog({ id: 'log-1', mentalState: 80 }),
      makeLog({ id: 'log-2', mentalState: 60 }),
      makeLog({ id: 'log-3', mentalState: 70 }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.averageScore).toBe(70);
  });

  it('deve retornar averageScore 0 para array vazio', () => {
    const stats = mapLogsToStats([]);
    expect(stats.averageScore).toBe(0);
  });

  it('deve arredondar averageScore para inteiro', () => {
    const logs = [
      makeLog({ id: 'log-1', mentalState: 80 }),
      makeLog({ id: 'log-2', mentalState: 75 }),
      makeLog({ id: 'log-3', mentalState: 72 }),
    ];
    const stats = mapLogsToStats(logs);
    // (80 + 75 + 72) / 3 = 75.666... -> arredonda para 76
    expect(stats.averageScore).toBe(76);
  });

  // --- currentStreak ---

  it('deve calcular streak de 3 para 3 dias consecutivos', () => {
    const logs = [
      makeLog({ id: 'log-1', createdAt: '2026-03-20T10:00:00.000Z' }),
      makeLog({ id: 'log-2', createdAt: '2026-03-19T10:00:00.000Z' }),
      makeLog({ id: 'log-3', createdAt: '2026-03-18T10:00:00.000Z' }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.currentStreak).toBe(3);
  });

  it('deve calcular streak de 1 quando so ha um log hoje', () => {
    const logs = [
      makeLog({ id: 'log-1', createdAt: '2026-03-20T10:00:00.000Z' }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.currentStreak).toBe(1);
  });

  it('deve calcular streak de 0 para array vazio', () => {
    const stats = mapLogsToStats([]);
    expect(stats.currentStreak).toBe(0);
  });

  it('deve quebrar streak quando ha gap de um dia', () => {
    const logs = [
      makeLog({ id: 'log-1', createdAt: '2026-03-20T10:00:00.000Z' }),
      makeLog({ id: 'log-2', createdAt: '2026-03-19T10:00:00.000Z' }),
      // gap: 2026-03-18 faltando
      makeLog({ id: 'log-3', createdAt: '2026-03-17T10:00:00.000Z' }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.currentStreak).toBe(2);
  });

  it('deve contar apenas 1 log por dia para streak (multiplos no mesmo dia)', () => {
    const logs = [
      makeLog({ id: 'log-1', createdAt: '2026-03-20T10:00:00.000Z' }),
      makeLog({ id: 'log-2', createdAt: '2026-03-20T14:00:00.000Z' }),
      makeLog({ id: 'log-3', createdAt: '2026-03-19T10:00:00.000Z' }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.currentStreak).toBe(2);
  });

  // --- scoreHistory ---

  it('deve retornar scoreHistory ordenado por data descendente', () => {
    const logs = [
      makeLog({ id: 'log-1', mentalState: 80, createdAt: '2026-03-18T10:00:00.000Z' }),
      makeLog({ id: 'log-2', mentalState: 70, createdAt: '2026-03-20T10:00:00.000Z' }),
      makeLog({ id: 'log-3', mentalState: 90, createdAt: '2026-03-19T10:00:00.000Z' }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.scoreHistory[0].score).toBe(70);  // 2026-03-20 (mais recente)
    expect(stats.scoreHistory[1].score).toBe(90);  // 2026-03-19
    expect(stats.scoreHistory[2].score).toBe(80);  // 2026-03-18 (mais antigo)
  });

  it('deve retornar scoreHistory vazio para array vazio', () => {
    const stats = mapLogsToStats([]);
    expect(stats.scoreHistory).toEqual([]);
  });

  it('deve incluir date e score em cada item do scoreHistory', () => {
    const logs = [
      makeLog({ id: 'log-1', mentalState: 85, createdAt: '2026-03-20T10:00:00.000Z' }),
    ];
    const stats = mapLogsToStats(logs);
    expect(stats.scoreHistory).toHaveLength(1);
    expect(stats.scoreHistory[0]).toHaveProperty('date');
    expect(stats.scoreHistory[0]).toHaveProperty('score');
    expect(stats.scoreHistory[0].score).toBe(85);
  });
});
