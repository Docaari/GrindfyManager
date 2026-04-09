import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: FP-13 — Correlacao metricas mentais com ROI
//
// Funcoes puras que calculam correlacao entre estado mental e performance:
//   - `calculateMentalCorrelation(sessions, feedbacks)` — ROI por faixa mental
//   - `formatCorrelationInsight(type, highROI, lowROI)` — gera texto do insight
//   - `hasEnoughDataForCorrelation(sessions, feedbacks)` — true se >= 5 sessoes
//
// Modulo esperado: `client/src/lib/mental-correlation-helpers.ts`
//
// Fonte de verdade: spec RF-12, RF-13, RF-14
// Schema: break_feedbacks (foco, energia, confianca 0-10),
//         grind_sessions (profitLoss), session_tournaments (buyIn, prize)
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Tipos esperados
interface SessionWithROI {
  id: string;
  date: string;
  totalBuyIn: number;
  totalPrize: number;
  profitLoss: number;
}

interface BreakFeedback {
  sessionId: string;
  foco: number;       // 0-10
  energia: number;    // 0-10
  confianca: number;  // 0-10
}

interface MentalCorrelation {
  roiHighFocus: number | null;
  roiLowFocus: number | null;
  roiHighEnergy: number | null;
  roiLowEnergy: number | null;
  roiHighConfidence: number | null;
  roiLowConfidence: number | null;
  sampleSize: number;
  insufficient: boolean;
}

// Stubs para compilacao — Implementer substituira
let calculateMentalCorrelation: (sessions: SessionWithROI[], feedbacks: BreakFeedback[]) => MentalCorrelation;
let formatCorrelationInsight: (type: 'foco' | 'energia' | 'confianca', highROI: number, lowROI: number) => string;
let hasEnoughDataForCorrelation: (sessions: SessionWithROI[], feedbacks: BreakFeedback[]) => boolean;

try {
  const mod = require('../../../client/src/lib/mental-correlation-helpers');
  if (mod.calculateMentalCorrelation) calculateMentalCorrelation = mod.calculateMentalCorrelation;
  if (mod.formatCorrelationInsight) formatCorrelationInsight = mod.formatCorrelationInsight;
  if (mod.hasEnoughDataForCorrelation) hasEnoughDataForCorrelation = mod.hasEnoughDataForCorrelation;
} catch {
  // Esperado em red phase
}

// Helpers para montar dados de teste
function makeSession(id: string, buyIn: number, prize: number): SessionWithROI {
  return {
    id,
    date: '2026-04-01',
    totalBuyIn: buyIn,
    totalPrize: prize,
    profitLoss: prize - buyIn,
  };
}

function makeFeedback(sessionId: string, foco: number, energia: number, confianca: number): BreakFeedback {
  return { sessionId, foco, energia, confianca };
}

// ---------------------------------------------------------------------------
// hasEnoughDataForCorrelation — verifica se ha dados suficientes
// ---------------------------------------------------------------------------

describe('hasEnoughDataForCorrelation', () => {
  it('deve retornar false quando nao ha sessoes', () => {
    expect(hasEnoughDataForCorrelation([], [])).toBe(false);
  });

  it('deve retornar false quando ha sessoes mas nenhum feedback', () => {
    const sessions = [makeSession('s1', 100, 200)];
    expect(hasEnoughDataForCorrelation(sessions, [])).toBe(false);
  });

  it('deve retornar false quando ha menos de 5 sessoes com feedback', () => {
    const sessions = [
      makeSession('s1', 100, 200),
      makeSession('s2', 100, 50),
      makeSession('s3', 100, 150),
      makeSession('s4', 100, 0),
    ];
    const feedbacks = [
      makeFeedback('s1', 8, 7, 9),
      makeFeedback('s2', 4, 3, 5),
      makeFeedback('s3', 7, 8, 6),
      makeFeedback('s4', 5, 4, 3),
    ];
    expect(hasEnoughDataForCorrelation(sessions, feedbacks)).toBe(false);
  });

  it('deve retornar true quando ha 5 ou mais sessoes com feedback', () => {
    const sessions = [
      makeSession('s1', 100, 200),
      makeSession('s2', 100, 50),
      makeSession('s3', 100, 150),
      makeSession('s4', 100, 0),
      makeSession('s5', 100, 300),
    ];
    const feedbacks = [
      makeFeedback('s1', 8, 7, 9),
      makeFeedback('s2', 4, 3, 5),
      makeFeedback('s3', 7, 8, 6),
      makeFeedback('s4', 5, 4, 3),
      makeFeedback('s5', 9, 8, 8),
    ];
    expect(hasEnoughDataForCorrelation(sessions, feedbacks)).toBe(true);
  });

  it('deve contar apenas sessoes que tem pelo menos 1 feedback associado', () => {
    const sessions = [
      makeSession('s1', 100, 200),
      makeSession('s2', 100, 50),
      makeSession('s3', 100, 150),
      makeSession('s4', 100, 0),
      makeSession('s5', 100, 300),
      makeSession('s6', 100, 100), // sem feedback
      makeSession('s7', 100, 250), // sem feedback
    ];
    const feedbacks = [
      makeFeedback('s1', 8, 7, 9),
      makeFeedback('s2', 4, 3, 5),
      makeFeedback('s3', 7, 8, 6),
      makeFeedback('s4', 5, 4, 3),
      makeFeedback('s5', 9, 8, 8),
    ];
    expect(hasEnoughDataForCorrelation(sessions, feedbacks)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateMentalCorrelation — calcula ROI por faixa de metrica mental
// ---------------------------------------------------------------------------

describe('calculateMentalCorrelation', () => {
  it('deve retornar insufficient: true quando sample < 5', () => {
    const sessions = [makeSession('s1', 100, 200)];
    const feedbacks = [makeFeedback('s1', 8, 7, 9)];
    const result = calculateMentalCorrelation(sessions, feedbacks);
    expect(result.insufficient).toBe(true);
    expect(result.sampleSize).toBeLessThan(5);
  });

  it('deve calcular ROI alto vs baixo para foco', () => {
    // Sessoes com foco alto (>=7) tem ROI positivo, foco baixo (<5) ROI negativo
    const sessions = [
      makeSession('s1', 100, 250),  // +150% ROI, foco 8
      makeSession('s2', 100, 50),   // -50% ROI, foco 3
      makeSession('s3', 100, 200),  // +100% ROI, foco 9
      makeSession('s4', 100, 40),   // -60% ROI, foco 4
      makeSession('s5', 100, 180),  // +80% ROI, foco 7
    ];
    const feedbacks = [
      makeFeedback('s1', 8, 5, 5),
      makeFeedback('s2', 3, 5, 5),
      makeFeedback('s3', 9, 5, 5),
      makeFeedback('s4', 4, 5, 5),
      makeFeedback('s5', 7, 5, 5),
    ];
    const result = calculateMentalCorrelation(sessions, feedbacks);
    expect(result.insufficient).toBe(false);
    expect(result.sampleSize).toBe(5);
    // ROI alto foco (s1=150%, s3=100%, s5=80%) media ~110%
    expect(result.roiHighFocus).toBeGreaterThan(0);
    // ROI baixo foco (s2=-50%, s4=-60%) media ~-55%
    expect(result.roiLowFocus).toBeLessThan(0);
  });

  it('deve calcular media de feedbacks por sessao quando ha multiplos breaks', () => {
    const sessions = [
      makeSession('s1', 100, 200),
      makeSession('s2', 100, 50),
      makeSession('s3', 100, 150),
      makeSession('s4', 100, 80),
      makeSession('s5', 100, 300),
    ];
    const feedbacks = [
      makeFeedback('s1', 8, 7, 9),  // foco medio s1 = (8+6)/2 = 7
      makeFeedback('s1', 6, 5, 7),
      makeFeedback('s2', 3, 4, 2),
      makeFeedback('s3', 7, 8, 6),
      makeFeedback('s4', 4, 3, 5),
      makeFeedback('s5', 9, 9, 8),
    ];
    const result = calculateMentalCorrelation(sessions, feedbacks);
    expect(result.insufficient).toBe(false);
    expect(result.sampleSize).toBe(5);
  });

  it('deve retornar null para faixa sem dados (ex: nenhuma sessao com foco < 5)', () => {
    const sessions = [
      makeSession('s1', 100, 200),
      makeSession('s2', 100, 150),
      makeSession('s3', 100, 180),
      makeSession('s4', 100, 220),
      makeSession('s5', 100, 300),
    ];
    // Todos com foco alto (>=7)
    const feedbacks = [
      makeFeedback('s1', 8, 7, 9),
      makeFeedback('s2', 7, 8, 6),
      makeFeedback('s3', 9, 7, 8),
      makeFeedback('s4', 8, 9, 7),
      makeFeedback('s5', 9, 8, 8),
    ];
    const result = calculateMentalCorrelation(sessions, feedbacks);
    expect(result.roiLowFocus).toBeNull();
    expect(result.roiHighFocus).not.toBeNull();
  });

  it('deve lidar com ROI negativo em ambas as faixas', () => {
    const sessions = [
      makeSession('s1', 100, 80),   // -20%, foco 8
      makeSession('s2', 100, 20),   // -80%, foco 3
      makeSession('s3', 100, 90),   // -10%, foco 7
      makeSession('s4', 100, 30),   // -70%, foco 4
      makeSession('s5', 100, 70),   // -30%, foco 8
    ];
    const feedbacks = [
      makeFeedback('s1', 8, 5, 5),
      makeFeedback('s2', 3, 5, 5),
      makeFeedback('s3', 7, 5, 5),
      makeFeedback('s4', 4, 5, 5),
      makeFeedback('s5', 8, 5, 5),
    ];
    const result = calculateMentalCorrelation(sessions, feedbacks);
    expect(result.roiHighFocus).toBeLessThan(0);
    expect(result.roiLowFocus).toBeLessThan(0);
    // Mas high focus ROI deve ser melhor (menos negativo) que low focus
    expect(result.roiHighFocus!).toBeGreaterThan(result.roiLowFocus!);
  });
});

// ---------------------------------------------------------------------------
// formatCorrelationInsight — gera texto do insight para tooltip/card
// ---------------------------------------------------------------------------

describe('formatCorrelationInsight', () => {
  it('deve formatar insight de foco com ROI positivo vs negativo', () => {
    const text = formatCorrelationInsight('foco', 25.5, -10.3);
    expect(text).toContain('foco');
    expect(text).toContain('25.5');
    expect(text).toContain('-10.3');
    expect(text).toContain('>= 7');
    expect(text).toContain('< 5');
  });

  it('deve formatar insight de energia', () => {
    const text = formatCorrelationInsight('energia', 18.2, -5.1);
    expect(text).toContain('energia');
    expect(text).toContain('18.2');
    expect(text).toContain('-5.1');
  });

  it('deve formatar insight de confianca', () => {
    const text = formatCorrelationInsight('confianca', 30.0, 2.5);
    expect(text).toContain('confianca');
    expect(text).toContain('30');
    expect(text).toContain('2.5');
  });

  it('deve gerar texto legivel em portugues', () => {
    const text = formatCorrelationInsight('foco', 20, -15);
    // Deve seguir o padrao: "Seu ROI e X% quando foco >= 7, vs Y% quando foco < 5"
    expect(text).toMatch(/ROI/i);
    expect(text).toMatch(/20/);
    expect(text).toMatch(/-15/);
  });
});
