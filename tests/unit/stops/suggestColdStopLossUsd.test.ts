/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-02)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-2)
 *
 * Helper PURO: server/coach/stops/suggestColdStopLossUsd.ts
 *   suggestColdStopLossUsd(nBI: 3|4|5, abiUsd: number) -> { suggestedUsd: number } | null
 *
 * Regra (ADR-235 D-2):
 *   - abiUsd <= 0 OU não-finito (NaN/Infinity) -> null (degrada, esconde sugestão BI).
 *   - senão suggestedUsd = round2(nBI * abiUsd).
 *
 * PURO: o caller resolve ABI (storage) + FX (fxResolver) ANTES de chamar (lesson #6).
 * O helper NÃO vê FX/DB/new Date. Zero mock, literais. RED por import inexistente.
 */

import { describe, it, expect } from 'vitest';

// Módulo AINDA NÃO EXISTE — implementer cria (red phase).
import { suggestColdStopLossUsd } from '../../../server/coach/stops/suggestColdStopLossUsd';

describe('suggestColdStopLossUsd — happy path (nBI × abiUsd, round2)', () => {
  it('3 BI × $50 = $150', () => {
    expect(suggestColdStopLossUsd(3, 50)).toEqual({ suggestedUsd: 150 });
  });

  it('4 BI × $50 = $200', () => {
    expect(suggestColdStopLossUsd(4, 50)).toEqual({ suggestedUsd: 200 });
  });

  it('5 BI × $50 = $250', () => {
    expect(suggestColdStopLossUsd(5, 50)).toEqual({ suggestedUsd: 250 });
  });

  it('arredonda a 2 casas (3 × 11.111 = 33.33)', () => {
    expect(suggestColdStopLossUsd(3, 11.111)).toEqual({ suggestedUsd: 33.33 });
  });

  it('arredonda a 2 casas (3 × 22.225 = 66.68 ou 66.67 — round2 padrão)', () => {
    // 3 * 22.225 = 66.675 -> round2 -> 66.68 (round-half-up) ou 66.67 (banker's).
    // O ADR não especifica banker's; assumimos round-half-up padrão (Math.round em centavos).
    expect(suggestColdStopLossUsd(3, 22.225)).toEqual({ suggestedUsd: 66.68 });
  });
});

describe('suggestColdStopLossUsd — degrade (retorna null)', () => {
  it('abiUsd = 0 -> null', () => {
    expect(suggestColdStopLossUsd(3, 0)).toBeNull();
  });

  it('abiUsd negativo -> null', () => {
    expect(suggestColdStopLossUsd(3, -50)).toBeNull();
  });

  it('abiUsd NaN -> null', () => {
    expect(suggestColdStopLossUsd(3, NaN)).toBeNull();
  });

  it('abiUsd Infinity -> null', () => {
    expect(suggestColdStopLossUsd(3, Infinity)).toBeNull();
  });

  it('abiUsd -Infinity -> null', () => {
    expect(suggestColdStopLossUsd(5, -Infinity)).toBeNull();
  });
});

describe('suggestColdStopLossUsd — pureza', () => {
  it('determinístico para a mesma entrada', () => {
    expect(suggestColdStopLossUsd(4, 75)).toEqual(suggestColdStopLossUsd(4, 75));
    expect(suggestColdStopLossUsd(4, 75)).toEqual({ suggestedUsd: 300 });
  });
});
