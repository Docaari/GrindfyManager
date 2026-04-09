import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-03 — Modo Quick Feedback para breaks (FP-07)
//
// Funcoes puras que controlam a distribuicao de feedback rapido:
//   - `distributeQuickFeedback`: distribui 1 valor (0-10) para 5 campos
//   - `getHistoricalAverages`: calcula medias historicas dos 5 campos
//
// Modulo esperado: `client/src/components/grind-session/quick-feedback-helpers.ts`
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Estas funcoes AINDA NAO EXISTEM
// import {
//   distributeQuickFeedback,
//   getHistoricalAverages,
// } from '../../../client/src/components/grind-session/quick-feedback-helpers';

// Tipos esperados (espelham o schema break_feedbacks)
interface BreakFeedbackValues {
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
}

interface BreakFeedbackRecord {
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  [key: string]: any;
}

// Stubs para compilacao — Implementer substituira
let distributeQuickFeedback: (overallScore: number, historicalAverages: BreakFeedbackValues | null) => BreakFeedbackValues;
let getHistoricalAverages: (breakFeedbacks: BreakFeedbackRecord[]) => BreakFeedbackValues;

try {
  const mod = require('../../../client/src/components/grind-session/quick-feedback-helpers');
  if (mod.distributeQuickFeedback) distributeQuickFeedback = mod.distributeQuickFeedback;
  if (mod.getHistoricalAverages) getHistoricalAverages = mod.getHistoricalAverages;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const historicalFeedbacks: BreakFeedbackRecord[] = [
  { foco: 7, energia: 6, confianca: 8, inteligenciaEmocional: 5, interferencias: 6 },
  { foco: 8, energia: 5, confianca: 7, inteligenciaEmocional: 6, interferencias: 5 },
  { foco: 6, energia: 7, confianca: 9, inteligenciaEmocional: 4, interferencias: 7 },
];

const uniformAverages: BreakFeedbackValues = {
  foco: 5,
  energia: 5,
  confianca: 5,
  inteligenciaEmocional: 5,
  interferencias: 5,
};

// ---------------------------------------------------------------------------
// getHistoricalAverages — calcula medias historicas dos 5 campos
// ---------------------------------------------------------------------------

describe('getHistoricalAverages', () => {
  it('deve retornar defaults (5, 5, 5, 5, 5) quando nao ha feedbacks', () => {
    const result = getHistoricalAverages([]);
    expect(result).toEqual({
      foco: 5,
      energia: 5,
      confianca: 5,
      inteligenciaEmocional: 5,
      interferencias: 5,
    });
  });

  it('deve calcular media correta de um unico feedback', () => {
    const result = getHistoricalAverages([
      { foco: 8, energia: 6, confianca: 7, inteligenciaEmocional: 5, interferencias: 4 },
    ]);
    expect(result.foco).toBe(8);
    expect(result.energia).toBe(6);
    expect(result.confianca).toBe(7);
    expect(result.inteligenciaEmocional).toBe(5);
    expect(result.interferencias).toBe(4);
  });

  it('deve calcular media correta de multiplos feedbacks', () => {
    const result = getHistoricalAverages(historicalFeedbacks);
    // foco: (7+8+6)/3 = 7, energia: (6+5+7)/3 = 6, confianca: (8+7+9)/3 = 8
    // IE: (5+6+4)/3 = 5, interferencias: (6+5+7)/3 = 6
    expect(result.foco).toBe(7);
    expect(result.energia).toBe(6);
    expect(result.confianca).toBe(8);
    expect(result.inteligenciaEmocional).toBe(5);
    expect(result.interferencias).toBe(6);
  });

  it('deve arredondar medias para inteiros', () => {
    const result = getHistoricalAverages([
      { foco: 7, energia: 5, confianca: 8, inteligenciaEmocional: 3, interferencias: 6 },
      { foco: 8, energia: 6, confianca: 7, inteligenciaEmocional: 4, interferencias: 5 },
    ]);
    // foco: 7.5 => 8, energia: 5.5 => 6, confianca: 7.5 => 8
    // IE: 3.5 => 4, interferencias: 5.5 => 6
    expect(result.foco).toBe(8);
    expect(result.energia).toBe(6);
    expect(result.confianca).toBe(8);
    expect(result.inteligenciaEmocional).toBe(4);
    expect(result.interferencias).toBe(6);
  });

  it('deve lidar com feedbacks onde todos os campos sao 0', () => {
    const result = getHistoricalAverages([
      { foco: 0, energia: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 },
    ]);
    expect(result).toEqual({
      foco: 0,
      energia: 0,
      confianca: 0,
      inteligenciaEmocional: 0,
      interferencias: 0,
    });
  });

  it('deve lidar com feedbacks onde todos os campos sao 10', () => {
    const result = getHistoricalAverages([
      { foco: 10, energia: 10, confianca: 10, inteligenciaEmocional: 10, interferencias: 10 },
    ]);
    expect(result).toEqual({
      foco: 10,
      energia: 10,
      confianca: 10,
      inteligenciaEmocional: 10,
      interferencias: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// distributeQuickFeedback — distribui 1 valor para 5 campos
// ---------------------------------------------------------------------------

describe('distributeQuickFeedback', () => {
  // --- Distribuicao uniforme (sem historico) ---

  describe('sem historico (averages null)', () => {
    it('deve distribuir uniformemente quando historico e null', () => {
      const result = distributeQuickFeedback(7, null);
      expect(result).toEqual({
        foco: 7,
        energia: 7,
        confianca: 7,
        inteligenciaEmocional: 7,
        interferencias: 7,
      });
    });

    it('deve distribuir 0 para todos os campos quando score e 0', () => {
      const result = distributeQuickFeedback(0, null);
      expect(result).toEqual({
        foco: 0,
        energia: 0,
        confianca: 0,
        inteligenciaEmocional: 0,
        interferencias: 0,
      });
    });

    it('deve distribuir 10 para todos os campos quando score e 10', () => {
      const result = distributeQuickFeedback(10, null);
      expect(result).toEqual({
        foco: 10,
        energia: 10,
        confianca: 10,
        inteligenciaEmocional: 10,
        interferencias: 10,
      });
    });

    it('deve distribuir 5 para todos os campos quando score e 5', () => {
      const result = distributeQuickFeedback(5, null);
      expect(result).toEqual({
        foco: 5,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
      });
    });

    it('deve distribuir 1 para todos os campos quando score e 1', () => {
      const result = distributeQuickFeedback(1, null);
      expect(result).toEqual({
        foco: 1,
        energia: 1,
        confianca: 1,
        inteligenciaEmocional: 1,
        interferencias: 1,
      });
    });
  });

  // --- Distribuicao uniforme (com historico uniforme) ---

  describe('com historico uniforme (todos iguais)', () => {
    it('deve distribuir uniformemente quando historico e uniforme', () => {
      const result = distributeQuickFeedback(7, uniformAverages);
      expect(result).toEqual({
        foco: 7,
        energia: 7,
        confianca: 7,
        inteligenciaEmocional: 7,
        interferencias: 7,
      });
    });
  });

  // --- Distribuicao proporcional (com historico) ---

  describe('com historico proporcional', () => {
    // Historico: foco=7, energia=6, confianca=8, IE=5, interferencias=6
    // Media historica = (7+6+8+5+6)/5 = 6.4
    const proportionalAverages: BreakFeedbackValues = {
      foco: 7,
      energia: 6,
      confianca: 8,
      inteligenciaEmocional: 5,
      interferencias: 6,
    };

    it('deve distribuir proporcionalmente ao historico para score 7', () => {
      const result = distributeQuickFeedback(7, proportionalAverages);
      // Proporcoes: foco=7/6.4, energia=6/6.4, confianca=8/6.4, IE=5/6.4, inter=6/6.4
      // foco = round(7 * 7/6.4) = round(7.66) = 8
      // energia = round(7 * 6/6.4) = round(6.56) = 7
      // confianca = round(7 * 8/6.4) = round(8.75) = 9
      // IE = round(7 * 5/6.4) = round(5.47) = 5
      // interferencias = round(7 * 6/6.4) = round(6.56) = 7
      expect(result.foco).toBe(8);
      expect(result.energia).toBe(7);
      expect(result.confianca).toBe(9);
      expect(result.inteligenciaEmocional).toBe(5);
      expect(result.interferencias).toBe(7);
    });

    it('deve clampar valores acima de 10', () => {
      // Score alto com historico onde confianca e desproporcionalmente alta
      const highConfidenceAverages: BreakFeedbackValues = {
        foco: 3,
        energia: 3,
        confianca: 10,
        inteligenciaEmocional: 3,
        interferencias: 3,
      };
      const result = distributeQuickFeedback(9, highConfidenceAverages);
      // confianca = round(9 * 10/4.4) = round(20.45) => clamp(10)
      expect(result.confianca).toBeLessThanOrEqual(10);
      // Todos devem estar entre 0 e 10
      expect(result.foco).toBeGreaterThanOrEqual(0);
      expect(result.foco).toBeLessThanOrEqual(10);
      expect(result.energia).toBeGreaterThanOrEqual(0);
      expect(result.energia).toBeLessThanOrEqual(10);
    });

    it('deve retornar todos 0 quando score e 0 independente do historico', () => {
      const result = distributeQuickFeedback(0, proportionalAverages);
      expect(result).toEqual({
        foco: 0,
        energia: 0,
        confianca: 0,
        inteligenciaEmocional: 0,
        interferencias: 0,
      });
    });

    it('deve distribuir score 10 proporcionalmente e clampar', () => {
      const result = distributeQuickFeedback(10, proportionalAverages);
      // foco = round(10 * 7/6.4) = round(10.94) => clamp(10)
      // confianca = round(10 * 8/6.4) = round(12.5) => clamp(10)
      // Todos devem estar clampados em [0, 10]
      expect(result.foco).toBeLessThanOrEqual(10);
      expect(result.confianca).toBeLessThanOrEqual(10);
      expect(result.inteligenciaEmocional).toBeLessThanOrEqual(10);
      expect(result.energia).toBeLessThanOrEqual(10);
      expect(result.interferencias).toBeLessThanOrEqual(10);
    });
  });

  // --- Valores resultantes sempre inteiros ---

  describe('valores resultantes', () => {
    it('deve retornar apenas inteiros em todos os campos', () => {
      const averages: BreakFeedbackValues = {
        foco: 7,
        energia: 3,
        confianca: 9,
        inteligenciaEmocional: 2,
        interferencias: 4,
      };
      const result = distributeQuickFeedback(6, averages);
      expect(Number.isInteger(result.foco)).toBe(true);
      expect(Number.isInteger(result.energia)).toBe(true);
      expect(Number.isInteger(result.confianca)).toBe(true);
      expect(Number.isInteger(result.inteligenciaEmocional)).toBe(true);
      expect(Number.isInteger(result.interferencias)).toBe(true);
    });

    it('deve retornar valores entre 0 e 10 para qualquer combinacao de inputs', () => {
      const extremeAverages: BreakFeedbackValues = {
        foco: 10,
        energia: 1,
        confianca: 10,
        inteligenciaEmocional: 1,
        interferencias: 10,
      };
      for (let score = 0; score <= 10; score++) {
        const result = distributeQuickFeedback(score, extremeAverages);
        const fields = ['foco', 'energia', 'confianca', 'inteligenciaEmocional', 'interferencias'] as const;
        for (const field of fields) {
          expect(result[field]).toBeGreaterThanOrEqual(0);
          expect(result[field]).toBeLessThanOrEqual(10);
        }
      }
    });

    it('deve retornar valores entre 0 e 10 sem historico para qualquer score', () => {
      for (let score = 0; score <= 10; score++) {
        const result = distributeQuickFeedback(score, null);
        const fields = ['foco', 'energia', 'confianca', 'inteligenciaEmocional', 'interferencias'] as const;
        for (const field of fields) {
          expect(result[field]).toBeGreaterThanOrEqual(0);
          expect(result[field]).toBeLessThanOrEqual(10);
          expect(Number.isInteger(result[field])).toBe(true);
        }
      }
    });
  });

  // --- Edge cases: historico com zeros ---

  describe('edge cases com historico zerado', () => {
    it('deve distribuir uniformemente quando historico tem todos os campos 0', () => {
      const zeroAverages: BreakFeedbackValues = {
        foco: 0,
        energia: 0,
        confianca: 0,
        inteligenciaEmocional: 0,
        interferencias: 0,
      };
      // Quando proporcao e impossivel (media=0), deve cair no uniforme
      const result = distributeQuickFeedback(7, zeroAverages);
      expect(result).toEqual({
        foco: 7,
        energia: 7,
        confianca: 7,
        inteligenciaEmocional: 7,
        interferencias: 7,
      });
    });
  });
});
