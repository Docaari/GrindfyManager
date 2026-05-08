/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2.2 Algoritmo SM-2 simplified
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.2
 * ADRs: 136 (algoritmo SM-2 simplified), 139 (initial state por source)
 *
 * Cobertura RED — modulo `server/services/spotReentry/srsAlgorithm`:
 *   - applyGrade(card, grade): { nextIntervalDays, newEaseFactor, nextReviewAt }
 *     - 4 grades x 5 estados iniciais = ~20 casos.
 *     - Caps interval [1, 120], ease [1.3, 3.0].
 *   - computeInitialState(input): { intervalDays, easeFactor, nextReviewAt }
 *     - Por source (manual_add, drill_gto_difficult_spot, coach_session_insight).
 *     - decision_correct=false → 1d.
 *     - confidence_level<=2 → 2d.
 *     - default → 1d.
 *
 * Lessons aplicadas:
 *   #5 vi.fn ok (puro algoritmo, sem mocks)
 *
 * Status RED: arquivo server/services/spotReentry/srsAlgorithm.ts NAO existe.
 */

import { describe, it, expect } from 'vitest';

async function loadAlg() {
  const mod: any = await import('../../server/services/spotReentry/srsAlgorithm');
  return mod;
}

const NOW = new Date('2026-05-08T12:00:00Z');

// =============================================================================
// applyGrade — matriz 4 grades × 5 estados
// =============================================================================
describe('srsAlgorithm.applyGrade — grade=again', () => {
  it('reset interval=1 + ease *= 0.8', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 10, easeFactor: 2.5 },
      'again',
    );
    expect(out.nextIntervalDays).toBe(1);
    expect(out.newEaseFactor).toBeCloseTo(2.0, 2); // 2.5 * 0.8
  });

  it('cap ease em 1.3 quando ease cai abaixo (multiplas falhas consecutivas)', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 5, easeFactor: 1.4 },
      'again',
    );
    // 1.4 * 0.8 = 1.12 -> cap 1.3
    expect(out.newEaseFactor).toBeCloseTo(1.3, 2);
  });

  it('interval reset 1 mesmo se vinha de 120 (max)', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 120, easeFactor: 2.5 },
      'again',
    );
    expect(out.nextIntervalDays).toBe(1);
  });

  it('ease starts 2.5, after 5 again grades atinge cap 1.3', async () => {
    const { applyGrade } = await loadAlg();
    let card = { intervalDays: 1, easeFactor: 2.5 };
    for (let i = 0; i < 5; i++) {
      const out = applyGrade(card, 'again');
      card = { intervalDays: out.nextIntervalDays, easeFactor: out.newEaseFactor };
    }
    expect(card.easeFactor).toBeCloseTo(1.3, 2);
  });
});

describe('srsAlgorithm.applyGrade — grade=hard', () => {
  it('interval *= 1.2 + ease *= 0.9', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 10, easeFactor: 2.5 },
      'hard',
    );
    expect(out.nextIntervalDays).toBeCloseTo(12, 1); // 10 * 1.2
    expect(out.newEaseFactor).toBeCloseTo(2.25, 2); // 2.5 * 0.9
  });

  it('cap ease 1.3 nao desce abaixo', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 1, easeFactor: 1.35 },
      'hard',
    );
    // 1.35 * 0.9 = 1.215 -> cap 1.3
    expect(out.newEaseFactor).toBeCloseTo(1.3, 2);
  });

  it('cap interval 120 mesmo apos hard de valor alto', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 110, easeFactor: 2.5 },
      'hard',
    );
    // 110 * 1.2 = 132 -> cap 120
    expect(out.nextIntervalDays).toBe(120);
  });
});

describe('srsAlgorithm.applyGrade — grade=good', () => {
  it('interval *= ease, ease unchanged', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 1, easeFactor: 2.5 },
      'good',
    );
    expect(out.nextIntervalDays).toBeCloseTo(2.5, 1);
    expect(out.newEaseFactor).toBeCloseTo(2.5, 2);
  });

  it('interval=2.5, ease=2.5 → next=6.25', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 2.5, easeFactor: 2.5 },
      'good',
    );
    expect(out.nextIntervalDays).toBeCloseTo(6.25, 2);
  });

  it('cap interval 120 mesmo good de muito grande', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 100, easeFactor: 2.5 },
      'good',
    );
    // 100 * 2.5 = 250 -> cap 120
    expect(out.nextIntervalDays).toBe(120);
  });
});

describe('srsAlgorithm.applyGrade — grade=easy', () => {
  it('interval *= ease * 1.3, ease *= 1.15', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 10, easeFactor: 2.5 },
      'easy',
    );
    // 10 * 2.5 * 1.3 = 32.5
    expect(out.nextIntervalDays).toBeCloseTo(32.5, 1);
    // 2.5 * 1.15 = 2.875 (sem cap, abaixo de 3.0)
    expect(out.newEaseFactor).toBeCloseTo(2.88, 1);
  });

  it('cap ease 3.0 quando easeFactor sobe demais', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 1, easeFactor: 2.8 },
      'easy',
    );
    // 2.8 * 1.15 = 3.22 -> cap 3.0
    expect(out.newEaseFactor).toBeCloseTo(3.0, 2);
  });

  it('cap interval 120', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 50, easeFactor: 2.5 },
      'easy',
    );
    // 50 * 2.5 * 1.3 = 162.5 -> cap 120
    expect(out.nextIntervalDays).toBe(120);
  });
});

// =============================================================================
// nextReviewAt
// =============================================================================
describe('srsAlgorithm.applyGrade — nextReviewAt', () => {
  it('nextReviewAt = now + interval*86400_000ms', async () => {
    const { applyGrade } = await loadAlg();
    const before = Date.now();
    const out = applyGrade(
      { intervalDays: 1, easeFactor: 2.5 },
      'good',
    );
    const after = Date.now();
    const delta = out.nextReviewAt.getTime() - (before);
    // interval = 1 * 2.5 = 2.5d
    expect(delta).toBeGreaterThan(2.4 * 86_400_000);
    expect(delta).toBeLessThan(2.6 * 86_400_000 + (after - before));
  });
});

// =============================================================================
// Determinismo
// =============================================================================
describe('srsAlgorithm.applyGrade — deterministico', () => {
  it('mesma entrada produz mesmo nextIntervalDays + newEaseFactor (sem fuzz)', async () => {
    const { applyGrade } = await loadAlg();
    const a = applyGrade({ intervalDays: 5, easeFactor: 2.5 }, 'good');
    const b = applyGrade({ intervalDays: 5, easeFactor: 2.5 }, 'good');
    expect(a.nextIntervalDays).toBe(b.nextIntervalDays);
    expect(a.newEaseFactor).toBe(b.newEaseFactor);
  });
});

// =============================================================================
// Rounding
// =============================================================================
describe('srsAlgorithm.applyGrade — rounding 2 casas', () => {
  it('intervalDays sempre arredonda para 2 casas decimais', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 1, easeFactor: 2.5 },
      'hard',
    );
    // 1 * 1.2 = 1.2 (ja exato 2 casas)
    expect(Number.isFinite(out.nextIntervalDays)).toBe(true);
    expect(Math.abs(out.nextIntervalDays * 100 - Math.round(out.nextIntervalDays * 100))).toBeLessThan(0.01);
  });

  it('easeFactor sempre arredonda para 2 casas decimais', async () => {
    const { applyGrade } = await loadAlg();
    const out = applyGrade(
      { intervalDays: 1, easeFactor: 2.5 },
      'easy',
    );
    expect(Math.abs(out.newEaseFactor * 100 - Math.round(out.newEaseFactor * 100))).toBeLessThan(0.01);
  });
});

// =============================================================================
// computeInitialState — RF-2.2 + ADR-139
// =============================================================================
describe('srsAlgorithm.computeInitialState — manual_add', () => {
  it('manual_add sempre 1d, ease 2.5', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({ source: 'manual_add' });
    expect(r.intervalDays).toBe(1);
    expect(r.easeFactor).toBe(2.5);
  });
});

describe('srsAlgorithm.computeInitialState — drill_gto_difficult_spot', () => {
  it('drill source sempre 1d ease 2.5 (sem decision_correct nem confidence)', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({ source: 'drill_gto_difficult_spot' });
    expect(r.intervalDays).toBe(1);
    expect(r.easeFactor).toBe(2.5);
  });
});

describe('srsAlgorithm.computeInitialState — coach_session_insight', () => {
  it('decision_correct=false → 1d', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({
      source: 'coach_session_insight',
      decisionCorrect: false,
    });
    expect(r.intervalDays).toBe(1);
  });

  it('confidence_level=1 (chutei) → 2d', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({
      source: 'coach_session_insight',
      confidenceLevel: 1,
    });
    expect(r.intervalDays).toBe(2);
  });

  it('confidence_level=2 (quase chutei) → 2d', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({
      source: 'coach_session_insight',
      confidenceLevel: 2,
    });
    expect(r.intervalDays).toBe(2);
  });

  it('confidence_level=3 (default) → 1d', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({
      source: 'coach_session_insight',
      confidenceLevel: 3,
    });
    expect(r.intervalDays).toBe(1);
  });

  it('decision_correct=true e confidence=4 → 1d (default)', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({
      source: 'coach_session_insight',
      decisionCorrect: true,
      confidenceLevel: 4,
    });
    expect(r.intervalDays).toBe(1);
  });

  it('decision_correct=false TEM PRIORIDADE sobre confidence_level<=2', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({
      source: 'coach_session_insight',
      decisionCorrect: false,
      confidenceLevel: 1,
    });
    // Erro confirmado = 1d (revisar logo), nao 2d.
    expect(r.intervalDays).toBe(1);
  });

  it('null/undefined fallback para 1d', async () => {
    const { computeInitialState } = await loadAlg();
    const r = computeInitialState({
      source: 'coach_session_insight',
      decisionCorrect: null,
      confidenceLevel: null,
    });
    expect(r.intervalDays).toBe(1);
  });
});

describe('srsAlgorithm.computeInitialState — nextReviewAt computado', () => {
  it('nextReviewAt = now + intervalDays*86400_000', async () => {
    const { computeInitialState } = await loadAlg();
    const before = Date.now();
    const r = computeInitialState({ source: 'manual_add' });
    const delta = r.nextReviewAt.getTime() - before;
    expect(delta).toBeGreaterThan(0.9 * 86_400_000);
    expect(delta).toBeLessThan(1.1 * 86_400_000 + 100);
  });

  it('low confidence (interval=2) gera nextReviewAt 2d a frente', async () => {
    const { computeInitialState } = await loadAlg();
    const before = Date.now();
    const r = computeInitialState({
      source: 'coach_session_insight',
      confidenceLevel: 1,
    });
    const delta = r.nextReviewAt.getTime() - before;
    expect(delta).toBeGreaterThan(1.9 * 86_400_000);
    expect(delta).toBeLessThan(2.1 * 86_400_000 + 100);
  });
});
