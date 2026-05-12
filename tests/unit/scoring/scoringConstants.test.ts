import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: server/scoring/scoringConstants.ts (NAO existe ainda)
//
// Constantes do algoritmo de scoring:
//   - WEIGHTS (7 pesos somam 1.0)
//   - SHRINK_CONSTANT = 30 (Bayesian K)
//   - GRADE_THRESHOLDS (S>=85, A>=70, B>=55, C>=40, D<40)
//   - BUYIN_BUCKETS (8 faixas)
//   - TIME_OF_DAY_BUCKETS (5 buckets)
//   - FIELD_BUCKETS (4 buckets)
//   - COLD_START_PURE_THRESHOLD = 20 (Q5)
//   - COLD_START_PARTIAL_THRESHOLD = 50
//   - COLD_START_BONUSES (Speed, Field, TimeOfDay) - tabela Q5
//   - SUPREMA_CATEGORY_MAP (Q6: "Bounty Hunter" -> "PKO" etc.)
//   - DEFAULT_EXCHANGE_RATES (ADR-033: units per 1 USD; BRL -> 5.0)
// =============================================================================

import {
  WEIGHTS,
  SHRINK_CONSTANT,
  GRADE_THRESHOLDS,
  BUYIN_BUCKETS,
  TIME_OF_DAY_BUCKETS,
  FIELD_BUCKETS,
  COLD_START_PURE_THRESHOLD,
  COLD_START_PARTIAL_THRESHOLD,
  COLD_START_BONUSES,
  SUPREMA_CATEGORY_MAP,
  DEFAULT_EXCHANGE_RATES,
} from '../../../server/scoring/scoringConstants';

// ===========================================================================
// WEIGHTS
// ===========================================================================

describe('scoringConstants - WEIGHTS', () => {
  it('soma dos 7 pesos = 1.0 (epsilon)', () => {
    const sum =
      WEIGHTS.siteRoi +
      WEIGHTS.buyInRoi +
      WEIGHTS.categoryRoi +
      WEIGHTS.speedRoi +
      WEIGHTS.dayOfWeekRoi +
      WEIGHTS.timeOfDayRoi +
      WEIGHTS.fieldRoi;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('site, buyIn, category cada um == 0.20 (per spec RF-02)', () => {
    expect(WEIGHTS.siteRoi).toBe(0.2);
    expect(WEIGHTS.buyInRoi).toBe(0.2);
    expect(WEIGHTS.categoryRoi).toBe(0.2);
  });

  it('speed e dayOfWeek cada um == 0.10', () => {
    expect(WEIGHTS.speedRoi).toBe(0.1);
    expect(WEIGHTS.dayOfWeekRoi).toBe(0.1);
  });

  it('timeOfDay == 0.15', () => {
    expect(WEIGHTS.timeOfDayRoi).toBe(0.15);
  });

  it('field == 0.05', () => {
    expect(WEIGHTS.fieldRoi).toBe(0.05);
  });

  it('todos os pesos sao positivos', () => {
    for (const v of Object.values(WEIGHTS)) {
      expect(v).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// SHRINK_CONSTANT
// ===========================================================================

describe('scoringConstants - SHRINK_CONSTANT', () => {
  it('valor exato = 30 (Bayesian shrinkage K, per spec)', () => {
    expect(SHRINK_CONSTANT).toBe(30);
  });
});

// ===========================================================================
// GRADE_THRESHOLDS
// ===========================================================================

describe('scoringConstants - GRADE_THRESHOLDS', () => {
  it('S = 85, A = 70, B = 55, C = 40 (per spec)', () => {
    expect(GRADE_THRESHOLDS.S).toBe(85);
    expect(GRADE_THRESHOLDS.A).toBe(70);
    expect(GRADE_THRESHOLDS.B).toBe(55);
    expect(GRADE_THRESHOLDS.C).toBe(40);
  });

  it('thresholds sao monotonicamente decrescentes', () => {
    expect(GRADE_THRESHOLDS.S).toBeGreaterThan(GRADE_THRESHOLDS.A);
    expect(GRADE_THRESHOLDS.A).toBeGreaterThan(GRADE_THRESHOLDS.B);
    expect(GRADE_THRESHOLDS.B).toBeGreaterThan(GRADE_THRESHOLDS.C);
  });

  it('thresholds estao todos no range [0, 100]', () => {
    for (const v of Object.values(GRADE_THRESHOLDS)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

// ===========================================================================
// BUYIN_BUCKETS
// ===========================================================================

describe('scoringConstants - BUYIN_BUCKETS', () => {
  it('exatamente 8 faixas conforme spec', () => {
    expect(BUYIN_BUCKETS.length).toBe(8);
  });

  it('cada bucket tem { range, min, max }', () => {
    for (const b of BUYIN_BUCKETS) {
      expect(b).toHaveProperty('range');
      expect(b).toHaveProperty('min');
      expect(b).toHaveProperty('max');
      expect(typeof b.range).toBe('string');
      expect(typeof b.min).toBe('number');
    }
  });

  it('faixas cobrem o dominio sem sobreposicao', () => {
    // Ordenar por min
    const sorted = [...BUYIN_BUCKETS].sort((a, b) => a.min - b.min);
    // Primeira faixa comeca em 0
    expect(sorted[0].min).toBe(0);
    // Cada faixa subsequente comeca onde a anterior terminou (sem gap, sem overlap)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].min).toBe(sorted[i - 1].max);
    }
    // Ultima faixa max = Infinity (ou >= 220)
    expect(sorted[sorted.length - 1].max).toBeGreaterThanOrEqual(220);
  });

  it('range "$0-1.99" comeca em 0', () => {
    const b = BUYIN_BUCKETS.find((x) => x.range.includes('0-1.99'));
    expect(b?.min).toBe(0);
  });

  it('range "$220+" e o ultimo (max grande)', () => {
    const last = BUYIN_BUCKETS.find((x) => x.range.includes('220+') || x.min === 220);
    expect(last).toBeDefined();
  });
});

// ===========================================================================
// TIME_OF_DAY_BUCKETS
// ===========================================================================

describe('scoringConstants - TIME_OF_DAY_BUCKETS', () => {
  it('exatamente 5 buckets', () => {
    expect(TIME_OF_DAY_BUCKETS.length).toBe(5);
  });

  it('contem madrugada/manha/tarde/noite-cedo/noite-nobre', () => {
    const names = TIME_OF_DAY_BUCKETS.map((b) => b.bucket);
    expect(names).toContain('madrugada');
    expect(names).toContain('manha');
    expect(names).toContain('tarde');
    expect(names).toContain('noite-cedo');
    expect(names).toContain('noite-nobre');
  });

  it('madrugada cobre 0-5', () => {
    const b = TIME_OF_DAY_BUCKETS.find((x) => x.bucket === 'madrugada');
    expect(b?.startHour).toBe(0);
    expect(b?.endHour).toBe(5);
  });

  it('manha 6-11', () => {
    const b = TIME_OF_DAY_BUCKETS.find((x) => x.bucket === 'manha');
    expect(b?.startHour).toBe(6);
    expect(b?.endHour).toBe(11);
  });

  it('tarde 12-17', () => {
    const b = TIME_OF_DAY_BUCKETS.find((x) => x.bucket === 'tarde');
    expect(b?.startHour).toBe(12);
    expect(b?.endHour).toBe(17);
  });

  it('noite-cedo 18-20', () => {
    const b = TIME_OF_DAY_BUCKETS.find((x) => x.bucket === 'noite-cedo');
    expect(b?.startHour).toBe(18);
    expect(b?.endHour).toBe(20);
  });

  it('noite-nobre 21-23', () => {
    const b = TIME_OF_DAY_BUCKETS.find((x) => x.bucket === 'noite-nobre');
    expect(b?.startHour).toBe(21);
    expect(b?.endHour).toBe(23);
  });

  it('cobertura total 0-23 sem gaps nem overlap', () => {
    const sorted = [...TIME_OF_DAY_BUCKETS].sort((a, b) => a.startHour - b.startHour);
    expect(sorted[0].startHour).toBe(0);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startHour).toBe(sorted[i - 1].endHour + 1);
    }
    expect(sorted[sorted.length - 1].endHour).toBe(23);
  });
});

// ===========================================================================
// FIELD_BUCKETS
// ===========================================================================

describe('scoringConstants - FIELD_BUCKETS', () => {
  it('exatamente 4 buckets: pequeno/medio/grande/massivo', () => {
    expect(FIELD_BUCKETS.length).toBe(4);
    const names = FIELD_BUCKETS.map((b) => b.bucket);
    expect(names).toContain('pequeno');
    expect(names).toContain('medio');
    expect(names).toContain('grande');
    expect(names).toContain('massivo');
  });

  it('pequeno < 100', () => {
    const b = FIELD_BUCKETS.find((x) => x.bucket === 'pequeno');
    expect(b?.min).toBe(0);
    expect(b?.max).toBe(100);
  });

  it('medio 100-499', () => {
    const b = FIELD_BUCKETS.find((x) => x.bucket === 'medio');
    expect(b?.min).toBe(100);
    expect(b?.max).toBe(500);
  });

  it('grande 500-1999', () => {
    const b = FIELD_BUCKETS.find((x) => x.bucket === 'grande');
    expect(b?.min).toBe(500);
    expect(b?.max).toBe(2000);
  });

  it('massivo >= 2000', () => {
    const b = FIELD_BUCKETS.find((x) => x.bucket === 'massivo');
    expect(b?.min).toBe(2000);
    expect(b?.max).toBeGreaterThanOrEqual(2000);
  });
});

// ===========================================================================
// COLD START
// ===========================================================================

describe('scoringConstants - cold start thresholds', () => {
  it('PURE_THRESHOLD = 20 (Q5)', () => {
    expect(COLD_START_PURE_THRESHOLD).toBe(20);
  });

  it('PARTIAL_THRESHOLD = 50', () => {
    expect(COLD_START_PARTIAL_THRESHOLD).toBe(50);
  });

  it('PURE_THRESHOLD < PARTIAL_THRESHOLD', () => {
    expect(COLD_START_PURE_THRESHOLD).toBeLessThan(COLD_START_PARTIAL_THRESHOLD);
  });
});

describe('scoringConstants - COLD_START_BONUSES (Q5)', () => {
  it('Speed Normal +15, Turbo +5, Hyper -10', () => {
    expect(COLD_START_BONUSES.speed.Normal).toBe(15);
    expect(COLD_START_BONUSES.speed.Turbo).toBe(5);
    expect(COLD_START_BONUSES.speed.Hyper).toBe(-10);
  });

  it('Field medio +10, pequeno +5, massivo -5, grande 0', () => {
    expect(COLD_START_BONUSES.field.medio).toBe(10);
    expect(COLD_START_BONUSES.field.pequeno).toBe(5);
    expect(COLD_START_BONUSES.field.massivo).toBe(-5);
    expect(COLD_START_BONUSES.field.grande).toBe(0);
  });

  it('TimeOfDay noite-nobre +5, demais 0', () => {
    expect(COLD_START_BONUSES.timeOfDay['noite-nobre']).toBe(5);
    expect(COLD_START_BONUSES.timeOfDay['madrugada']).toBe(0);
    expect(COLD_START_BONUSES.timeOfDay['manha']).toBe(0);
    expect(COLD_START_BONUSES.timeOfDay['tarde']).toBe(0);
    expect(COLD_START_BONUSES.timeOfDay['noite-cedo']).toBe(0);
  });
});

// ===========================================================================
// SUPREMA_CATEGORY_MAP (Q6)
// ===========================================================================

describe('scoringConstants - SUPREMA_CATEGORY_MAP (Q6)', () => {
  it('Vanilla mapeia para Vanilla', () => {
    expect(SUPREMA_CATEGORY_MAP['Vanilla']).toBe('Vanilla');
  });

  it('PKO mapeia para PKO', () => {
    expect(SUPREMA_CATEGORY_MAP['PKO']).toBe('PKO');
  });

  it('Mystery mapeia para Mystery', () => {
    expect(SUPREMA_CATEGORY_MAP['Mystery']).toBe('Mystery');
  });

  it('Bounty Hunter mapeia para PKO (alias)', () => {
    expect(SUPREMA_CATEGORY_MAP['Bounty Hunter']).toBe('PKO');
  });

  it('Knockout mapeia para PKO (alias)', () => {
    expect(SUPREMA_CATEGORY_MAP['Knockout']).toBe('PKO');
  });

  it('valor inventado retorna undefined (Q6: vira null no scorer)', () => {
    expect(SUPREMA_CATEGORY_MAP['ValorInexistente']).toBeUndefined();
  });
});

// ===========================================================================
// DEFAULT_EXCHANGE_RATES (Q2)
// ===========================================================================

describe('scoringConstants - DEFAULT_EXCHANGE_RATES (Q2)', () => {
  it('BRL fallback = 5.0 (1 USD = 5 BRL — ADR-033 units-per-USD)', () => {
    expect(DEFAULT_EXCHANGE_RATES.BRL).toBe(5.0);
  });

  it('USD = 1.0 (no-op)', () => {
    expect(DEFAULT_EXCHANGE_RATES.USD).toBe(1.0);
  });
});
