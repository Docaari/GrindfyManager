/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Feature: Ajuste manual do resultado final da sessao (grind-live)
 * Spec:  Docs/specs/grind-live-manual-session-result.md (RF-03)
 * ADR:   Docs/architecture/decisions/244-grind-live-manual-session-result.md (D4)
 * Fluxo: Docs/architecture/diagrams/grind-live-manual-session-result/
 *          manual-result-value-decision-flow.mermaid
 *
 * MODULO SOB TESTE (ainda NAO existe — o implementer cria):
 *   client/src/components/grind-session-live/manual-session-result.ts
 *
 * Contrato exigido (RF-03 / D4):
 *   export interface ComputeAdjustedResultInput {
 *     manualProfitUsd: number;
 *     investedUsd: number;
 *   }
 *   export interface AdjustedResult {
 *     profitUsd: number;
 *     roi: number | null;
 *     reason?: 'invested_zero';
 *   }
 *   export function computeAdjustedResult(
 *     input: ComputeAdjustedResultInput,
 *   ): AdjustedResult;
 *
 * Regras duras que estes testes protegem:
 *   1. `roi = (manualProfitUsd / investedUsd) * 100`.
 *   2. `investedUsd <= 0` OU nao finito -> `roi = null` + `reason: 'invested_zero'`.
 *      NUNCA 0 inventado (`.claude/rules/03-padrao-codigo.md`, "Falhar alto").
 *   3. O valor persistido NAO e arredondado. Arredondar e responsabilidade
 *      exclusiva da exibicao (1 casa) — o helper devolve o numero cru.
 *   4. `profitUsd` e o valor digitado, ecoado sem transformacao.
 *   5. `manualProfitUsd = 0` e entrada VALIDA (sessao que zerou) — nao e
 *      "ausencia de dado" e nao produz `reason`.
 *
 * Red esperado: modulo inexistente -> falha de resolucao de import.
 */

import { describe, it, expect } from 'vitest';

import { computeAdjustedResult } from '../manual-session-result';

// =============================================================================
// RF-03 — ROI positivo, negativo e zero (happy path da matematica)
// =============================================================================

describe('computeAdjustedResult — ROI sobre investido valido', () => {
  it('lucro +250 sobre investido 1000 -> roi 25 (criterio RF-03)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 250, investedUsd: 1000 });
    expect(r.roi).toBe(25);
  });

  it('prejuizo -400 sobre investido 1000 -> roi -40 (criterio RF-03)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: -400, investedUsd: 1000 });
    expect(r.roi).toBe(-40);
  });

  it('lucro +300 sobre investido 1200 -> roi 25 (criterio RF-04 do PUT)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 300, investedUsd: 1200 });
    expect(r.roi).toBe(25);
  });

  it('resultado 0 sobre investido 1000 -> roi 0 (zero real, nao ausencia)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 0, investedUsd: 1000 });
    expect(r.roi).toBe(0);
  });

  it('resultado 0 com investido valido NAO devolve reason (0 e valor legitimo)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 0, investedUsd: 1000 });
    expect(r.reason).toBeUndefined();
  });

  it('lucro maior que o investido -> roi acima de 100 (nao ha cap)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 3000, investedUsd: 1000 });
    expect(r.roi).toBe(300);
  });

  it('prejuizo igual ao investido -> roi -100', () => {
    const r = computeAdjustedResult({ manualProfitUsd: -500, investedUsd: 500 });
    expect(r.roi).toBe(-100);
  });

  it('caso valido NAO devolve reason', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 250, investedUsd: 1000 });
    expect(r.reason).toBeUndefined();
  });
});

// =============================================================================
// RF-03 — profitUsd e eco do valor digitado (nada de transformacao)
// =============================================================================

describe('computeAdjustedResult — profitUsd ecoa o valor manual', () => {
  it('devolve profitUsd identico ao manualProfitUsd positivo', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 250, investedUsd: 1000 });
    expect(r.profitUsd).toBe(250);
  });

  it('devolve profitUsd identico ao manualProfitUsd negativo', () => {
    const r = computeAdjustedResult({ manualProfitUsd: -120.5, investedUsd: 1000 });
    expect(r.profitUsd).toBe(-120.5);
  });

  it('preserva casas decimais do valor digitado (sem toFixed no valor)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 249.99999, investedUsd: 1000 });
    expect(r.profitUsd).toBe(249.99999);
  });

  it('preserva profitUsd mesmo quando o roi e null (investido 0)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: 0 });
    expect(r.profitUsd).toBe(50);
  });

  it('preserva -0.01 como prejuizo (nao normaliza para 0)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: -0.01, investedUsd: 100 });
    expect(r.profitUsd).toBe(-0.01);
  });
});

// =============================================================================
// RF-03 — decimais e ausencia de arredondamento no valor calculado
// =============================================================================

describe('computeAdjustedResult — decimais e arredondamento', () => {
  it('-120.5 sobre 1000 -> roi -12.05 (2 casas exatas)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: -120.5, investedUsd: 1000 });
    expect(r.roi).toBeCloseTo(-12.05, 10);
  });

  it('100 sobre 3 -> roi dizima, NAO arredondado a 1 casa', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 100, investedUsd: 3 });
    // (100 / 3) * 100 = 3333.3333...
    expect(r.roi).toBeCloseTo(3333.3333333, 5);
    // Guarda explicita: o helper NAO pode devolver o valor de exibicao (1 casa).
    expect(r.roi).not.toBe(3333.3);
  });

  it('33.33 sobre 99.99 -> roi ~33.3333 (nao trunca)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 33.33, investedUsd: 99.99 });
    expect(r.roi).toBeCloseTo(33.3333333, 5);
  });

  it('investido fracionario (0.5) com lucro 1 -> roi 200', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 1, investedUsd: 0.5 });
    expect(r.roi).toBe(200);
  });
});

// =============================================================================
// D4 — investido <= 0 ou nao finito: roi null + reason 'invested_zero'
// Nunca 0 inventado. A UI mostra "—" e o PUT envia roi: null.
// =============================================================================

describe('computeAdjustedResult — investido zero (D4)', () => {
  it('investido 0 -> roi null (nunca 0)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: 0 });
    expect(r.roi).toBeNull();
  });

  it('investido 0 -> reason "invested_zero" (criterio RF-03)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: 0 });
    expect(r.reason).toBe('invested_zero');
  });

  it('investido 0 com manual 0 -> roi null (nao confunde 0/0 com roi 0)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 0, investedUsd: 0 });
    expect(r.roi).toBeNull();
    expect(r.reason).toBe('invested_zero');
  });

  it('investido negativo -> roi null + reason (dado inconsistente recusa calculo)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: -100 });
    expect(r.roi).toBeNull();
    expect(r.reason).toBe('invested_zero');
  });

  it('investido -0.01 -> roi null (limite negativo, nao "quase zero")', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: -0.01 });
    expect(r.roi).toBeNull();
  });
});

describe('computeAdjustedResult — investido nao finito (D4)', () => {
  it('investido NaN -> roi null + reason', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: NaN });
    expect(r.roi).toBeNull();
    expect(r.reason).toBe('invested_zero');
  });

  it('investido Infinity -> roi null + reason (nunca roi 0 por divisao)', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: Infinity });
    expect(r.roi).toBeNull();
    expect(r.reason).toBe('invested_zero');
  });

  it('investido -Infinity -> roi null + reason', () => {
    const r = computeAdjustedResult({ manualProfitUsd: 50, investedUsd: -Infinity });
    expect(r.roi).toBeNull();
    expect(r.reason).toBe('invested_zero');
  });

  it('investido undefined (defensivo, chamador quebrado) -> roi null + reason', () => {
    // O tipo declara number, mas o valor real vem de summaryData.invested,
    // que ja nasceu de `stats.totalInvestidoUSD ?? stats.totalInvestido`.
    // Ausencia NUNCA pode virar 0% na tela.
    const r = computeAdjustedResult({
      manualProfitUsd: 50,
      investedUsd: undefined as any,
    });
    expect(r.roi).toBeNull();
    expect(r.reason).toBe('invested_zero');
  });

  it('investido null (defensivo) -> roi null + reason', () => {
    const r = computeAdjustedResult({
      manualProfitUsd: 50,
      investedUsd: null as any,
    });
    expect(r.roi).toBeNull();
    expect(r.reason).toBe('invested_zero');
  });
});

// =============================================================================
// Pureza — helper puro, sem efeito colateral no input
// =============================================================================

describe('computeAdjustedResult — pureza', () => {
  it('nao muta o objeto de entrada', () => {
    const input = { manualProfitUsd: 250, investedUsd: 1000 };
    computeAdjustedResult(input);
    expect(input).toEqual({ manualProfitUsd: 250, investedUsd: 1000 });
  });

  it('duas chamadas com a mesma entrada devolvem o mesmo resultado', () => {
    const a = computeAdjustedResult({ manualProfitUsd: -77.7, investedUsd: 333 });
    const b = computeAdjustedResult({ manualProfitUsd: -77.7, investedUsd: 333 });
    expect(a).toEqual(b);
  });

  it('a base de investimento NUNCA aparece alterada no retorno', () => {
    // RF-03: "Base de investimento nao muda". O helper nao devolve investido
    // recalculado nem sobrescrito — quem exibe o card "Investido" continua
    // lendo summaryData.invested.
    const r: any = computeAdjustedResult({ manualProfitUsd: 250, investedUsd: 1000 });
    expect(r.investedUsd).toBeUndefined();
  });
});
