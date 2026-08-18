/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Feature: Ajuste manual do resultado final da sessao (grind-live)
 * Spec:  Docs/specs/grind-live-manual-session-result.md (RF-04)
 * ADR:   Docs/architecture/decisions/244-grind-live-manual-session-result.md (D1, D4)
 * Fluxo: Docs/architecture/diagrams/grind-live-manual-session-result/
 *          finalize-with-manual-result-sequence.mermaid
 *
 * -----------------------------------------------------------------------------
 * O QUE O IMPLEMENTER PRECISA FAZER
 * -----------------------------------------------------------------------------
 * O corpo do `PUT /api/grind-sessions/:id` hoje e um objeto literal inline
 * dentro de `handleEndSession` (`client/src/pages/GrindSessionLive.tsx:711`).
 * Testar "byte-a-byte igual ao de hoje" exige uma unidade — o componente tem
 * 3000+ linhas e nao e renderizavel em teste (mesmo motivo documentado em
 * tests/unit/bankroll/GrindSessionLive.test.tsx).
 *
 * Extrair o literal, SEM mudar nenhum valor, para:
 *
 *   client/src/components/grind-session-live/session-end-helpers.ts
 *
 *   export interface BuildEndSessionPayloadInput {
 *     sessionData: {
 *       volume: number;
 *       invested: number;
 *       profit: number;
 *       roi: number;
 *       fts: number;
 *       wins: number;
 *       objectiveStatus?: string;
 *       mentalAverages: {
 *         focus: number; energy: number; confidence: number;
 *         emotionalIntelligence: number; interference: number;
 *       };
 *     };
 *     finalNotes: string;
 *     endTimeIso: string;
 *     walletProfitUsd?: number;
 *     // 2o argumento novo de onEndSession (ver SessionSummaryModal):
 *     manualOverride?: { profitUsd: number; roi: number | null } | null;
 *   }
 *   export function buildEndSessionPayload(
 *     input: BuildEndSessionPayloadInput,
 *   ): Record<string, any>;
 *
 * `handleEndSession` passa a montar o body chamando este helper. Nenhuma outra
 * mudanca de comportamento no caminho sem ajuste.
 *
 * Regras (D1 / D4):
 *   - SEM override: payload identico ao de hoje. `walletProfitUsd` so aparece
 *     quando o argumento e um numero finito.
 *   - COM override: `profit` = `roi-base` = `walletProfitUsd` = valor manual;
 *     `roi` = numero em string OU `null` (chave SEMPRE presente — omitir
 *     deixaria o roi antigo no banco, pior que null; ver ADR Q4 opcao C).
 *   - `abiMed` continua `invested / volume` — o override nao mexe nele.
 *
 * Red esperado: `buildEndSessionPayload` ainda nao existe.
 */

import { describe, it, expect } from 'vitest';

import { buildEndSessionPayload } from '../session-end-helpers';

const sessionData = {
  volume: 10,
  invested: 1200,
  profit: 180,
  roi: 15,
  fts: 2,
  wins: 1,
  objectiveStatus: 'completed',
  mentalAverages: {
    focus: 8,
    energy: 7,
    confidence: 8,
    emotionalIntelligence: 8,
    interference: 2,
  },
};

const END_TIME = '2026-08-01T22:00:00.000Z';

function baseInput(overrides: any = {}) {
  return {
    sessionData,
    finalNotes: 'sessao ok',
    endTimeIso: END_TIME,
    ...overrides,
  };
}

// =============================================================================
// Nao-regressao — SEM ajuste, o payload e o de hoje (RNF)
// =============================================================================

describe('buildEndSessionPayload — sem ajuste (regressao byte-a-byte)', () => {
  it('sem walletProfitUsd: payload identico ao literal de hoje', () => {
    const payload = buildEndSessionPayload(baseInput());

    expect(payload).toEqual({
      status: 'completed',
      endTime: END_TIME,
      finalNotes: 'sessao ok',
      objectiveCompleted: true,
      volume: 10,
      profit: '180',
      abiMed: '120',
      roi: '15',
      fts: 2,
      cravadas: 1,
      energiaMedia: '7',
      focoMedio: '8',
      confiancaMedia: '8',
      inteligenciaEmocionalMedia: '8',
      interferenciasMedia: '2',
    });
  });

  it('sem walletProfitUsd: a chave walletProfitUsd NAO existe no payload', () => {
    const payload = buildEndSessionPayload(baseInput());
    expect('walletProfitUsd' in payload).toBe(false);
  });

  it('com walletProfitUsd finito: entra como string, sem tocar profit/roi', () => {
    const payload = buildEndSessionPayload(baseInput({ walletProfitUsd: 180 }));
    expect(payload.walletProfitUsd).toBe('180');
    expect(payload.profit).toBe('180');
    expect(payload.roi).toBe('15');
  });

  it('walletProfitUsd NaN: chave omitida (guard Number.isFinite de hoje)', () => {
    const payload = buildEndSessionPayload(baseInput({ walletProfitUsd: NaN }));
    expect('walletProfitUsd' in payload).toBe(false);
  });

  it('objectiveStatus diferente de "completed" -> objectiveCompleted false', () => {
    const payload = buildEndSessionPayload(
      baseInput({ sessionData: { ...sessionData, objectiveStatus: 'partial' } }),
    );
    expect(payload.objectiveCompleted).toBe(false);
  });

  it('invested 0 -> abiMed "0" (guard de divisao de hoje)', () => {
    const payload = buildEndSessionPayload(
      baseInput({ sessionData: { ...sessionData, invested: 0 } }),
    );
    expect(payload.abiMed).toBe('0');
  });

  it('manualOverride null e tratado como "sem ajuste"', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: null }));
    expect(payload.profit).toBe('180');
    expect(payload.roi).toBe('15');
    expect('walletProfitUsd' in payload).toBe(false);
  });
});

// =============================================================================
// RF-04 / D1 — COM ajuste, o valor manual ocupa os tres campos
// =============================================================================

describe('buildEndSessionPayload — com ajuste manual (D1)', () => {
  const override = { profitUsd: 300, roi: 25 };

  it('profit carrega o valor manual em string ("300")', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: override }));
    expect(payload.profit).toBe('300');
  });

  it('roi carrega o ROI recalculado em string ("25")', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: override }));
    expect(payload.roi).toBe('25');
  });

  it('walletProfitUsd carrega o MESMO valor manual ("300")', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: override }));
    expect(payload.walletProfitUsd).toBe('300');
  });

  it('payload completo do criterio RF-04 (+$300 sobre investido $1200)', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: override }));
    expect(payload).toEqual({
      status: 'completed',
      endTime: END_TIME,
      finalNotes: 'sessao ok',
      objectiveCompleted: true,
      volume: 10,
      profit: '300',
      abiMed: '120',
      roi: '25',
      walletProfitUsd: '300',
      fts: 2,
      cravadas: 1,
      energiaMedia: '7',
      focoMedio: '8',
      confiancaMedia: '8',
      inteligenciaEmocionalMedia: '8',
      interferenciasMedia: '2',
    });
  });

  it('walletProfitUsd sai mesmo SEM wallets (walletProfitUsd argumento ausente)', () => {
    const payload = buildEndSessionPayload(
      baseInput({ manualOverride: { profitUsd: -75.5, roi: -6.29 } }),
    );
    expect(payload.walletProfitUsd).toBe('-75.5');
  });

  it('o valor manual SOBRESCREVE o walletProfitUsd calculado da banca', () => {
    const payload = buildEndSessionPayload(
      baseInput({ walletProfitUsd: 180, manualOverride: override }),
    );
    expect(payload.walletProfitUsd).toBe('300');
  });

  it('prejuizo manual e persistido com sinal', () => {
    const payload = buildEndSessionPayload(
      baseInput({ manualOverride: { profitUsd: -430.25, roi: -35.854166666666664 } }),
    );
    expect(payload.profit).toBe('-430.25');
    expect(payload.roi).toBe('-35.854166666666664');
  });

  it('roi persistido NAO e arredondado a 1 casa (exibicao arredonda, dado nao)', () => {
    const payload = buildEndSessionPayload(
      baseInput({ manualOverride: { profitUsd: 100, roi: 8.333333333333334 } }),
    );
    expect(payload.roi).toBe('8.333333333333334');
    expect(payload.roi).not.toBe('8.3');
  });

  it('ajuste 0 grava profit "0" (zero declarado, nao ausencia)', () => {
    const payload = buildEndSessionPayload(
      baseInput({ manualOverride: { profitUsd: 0, roi: 0 } }),
    );
    expect(payload.profit).toBe('0');
    expect(payload.roi).toBe('0');
    expect(payload.walletProfitUsd).toBe('0');
  });

  it('abiMed continua derivado de invested/volume (override nao mexe)', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: override }));
    expect(payload.abiMed).toBe('120');
  });

  it('volume, fts e cravadas continuam vindo do sessionData', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: override }));
    expect(payload.volume).toBe(10);
    expect(payload.fts).toBe(2);
    expect(payload.cravadas).toBe(1);
  });

  it('medias mentais nao sao afetadas pelo ajuste', () => {
    const payload = buildEndSessionPayload(baseInput({ manualOverride: override }));
    expect(payload.focoMedio).toBe('8');
    expect(payload.interferenciasMedia).toBe('2');
  });
});

// =============================================================================
// D4 — investido 0 com ajuste: roi null explicito no PUT
// =============================================================================

describe('buildEndSessionPayload — roi null quando investido <= 0 (D4)', () => {
  it('override com roi null -> payload.roi === null (nao "0", nao "null")', () => {
    const payload = buildEndSessionPayload(
      baseInput({
        sessionData: { ...sessionData, invested: 0 },
        manualOverride: { profitUsd: 50, roi: null },
      }),
    );
    expect(payload.roi).toBeNull();
  });

  it('a chave roi CONTINUA presente (omitir deixaria o roi antigo no banco)', () => {
    const payload = buildEndSessionPayload(
      baseInput({
        sessionData: { ...sessionData, invested: 0 },
        manualOverride: { profitUsd: 50, roi: null },
      }),
    );
    expect('roi' in payload).toBe(true);
  });

  it('roi null NAO impede profit e walletProfitUsd de irem preenchidos', () => {
    const payload = buildEndSessionPayload(
      baseInput({
        sessionData: { ...sessionData, invested: 0 },
        manualOverride: { profitUsd: 50, roi: null },
      }),
    );
    expect(payload.profit).toBe('50');
    expect(payload.walletProfitUsd).toBe('50');
  });

  it('investido 0 + override: abiMed "0" e roi null convivem', () => {
    const payload = buildEndSessionPayload(
      baseInput({
        sessionData: { ...sessionData, invested: 0 },
        manualOverride: { profitUsd: 50, roi: null },
      }),
    );
    expect(payload.abiMed).toBe('0');
    expect(payload.roi).toBeNull();
  });
});

// =============================================================================
// Pureza
// =============================================================================

describe('buildEndSessionPayload — pureza', () => {
  it('nao muta o sessionData recebido', () => {
    const data = JSON.parse(JSON.stringify(sessionData));
    buildEndSessionPayload(
      baseInput({ sessionData: data, manualOverride: { profitUsd: 300, roi: 25 } }),
    );
    expect(data).toEqual(sessionData);
  });

  it('nao muta o manualOverride recebido', () => {
    const ov = { profitUsd: 300, roi: 25 };
    buildEndSessionPayload(baseInput({ manualOverride: ov }));
    expect(ov).toEqual({ profitUsd: 300, roi: 25 });
  });
});
