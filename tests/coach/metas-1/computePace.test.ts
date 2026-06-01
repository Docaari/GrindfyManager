import { describe, it, expect } from 'vitest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — computePace.ts — RED phase
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/coach/goals/computePace.ts
//     computeExpectedNow(baseline, target, createdAt, deadline, now): number | null
//       expectedNow = baseline + (target - baseline) * clamp01((now-createdAt)/(deadline-createdAt))
//     deriveStatus(actual, expectedNow, target, direction): GoalStatus
//       thresholds FIXOS DEC-A3 (ratio = actual/expectedNow):
//         achieved se actual >= target (override, qualquer ratio)
//         ahead     ratio > 1.10
//         on_track  0.90 <= ratio <= 1.10
//         behind    0.70 <= ratio < 0.90
//         at_risk   ratio < 0.70
//       Borda div-zero DEC-A3:
//         expectedNow === 0 e actual <= 0 -> on_track, ratio null (dia-zero, A4 nao crava)
//         expectedNow === 0 e actual  > 0 -> ahead
//
// Lessons aplicadas:
//   #14/#26/#38 — await import (nao require).
//   datas FIXAS passadas como args (NUNCA Date.now()) — testes time-dependent
//   quebram em borda de data; aqui os timestamps sao explicitos.
//
// Suposicoes documentadas (ADR ambiguo para o test):
//   - computeExpectedNow aceita Date OU epoch-ms para createdAt/deadline/now.
//     Escolho passar `Date` (ramo mais provavel; o helper internamente usa getTime()).
//   - clamp01 satura em [0,1]: now < createdAt -> 0 (expectedNow = baseline);
//     now > deadline -> 1 (expectedNow = target).
//   - direction default 'up' (fatia-1 so exercita 'up' — DEC-A3).
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

async function loadPace() {
  return await import('../../../server/coach/goals/computePace');
}

// Datas FIXAS — janela de 100 dias: 2026-01-01 -> 2026-04-11 (100d depois).
const CREATED = new Date('2026-01-01T00:00:00.000Z');
const DEADLINE = new Date('2026-04-11T00:00:00.000Z'); // +100 dias
const HALFWAY = new Date('2026-02-20T00:00:00.000Z'); // +50 dias (50% do intervalo)
const QUARTER = new Date('2026-01-26T00:00:00.000Z'); // +25 dias (25% do intervalo)

describe('computeExpectedNow — interpolacao linear + clamp01 (RF-07)', () => {
  it('no meio do intervalo (50%): expectedNow = baseline + (target-baseline)*0.5', async () => {
    const { computeExpectedNow } = await loadPace();
    // baseline 0 -> target 100, 50% do tempo -> 50
    const r = computeExpectedNow(0, 100, CREATED, DEADLINE, HALFWAY);
    expect(r).toBeCloseTo(50, 5);
  });

  it('a 25% do intervalo com baseline != 0: 200 + (1200-200)*0.25 = 450', async () => {
    const { computeExpectedNow } = await loadPace();
    const r = computeExpectedNow(200, 1200, CREATED, DEADLINE, QUARTER);
    expect(r).toBeCloseTo(450, 5);
  });

  it('no instante de criacao (now === createdAt): expectedNow = baseline', async () => {
    const { computeExpectedNow } = await loadPace();
    const r = computeExpectedNow(10, 100, CREATED, DEADLINE, CREATED);
    expect(r).toBeCloseTo(10, 5);
  });

  it('clamp01: now < createdAt satura em 0 -> expectedNow = baseline', async () => {
    const { computeExpectedNow } = await loadPace();
    const before = new Date('2025-12-01T00:00:00.000Z');
    const r = computeExpectedNow(10, 100, CREATED, DEADLINE, before);
    expect(r).toBeCloseTo(10, 5);
  });

  it('clamp01: now > deadline satura em 1 -> expectedNow = target', async () => {
    const { computeExpectedNow } = await loadPace();
    const after = new Date('2026-12-01T00:00:00.000Z');
    const r = computeExpectedNow(10, 100, CREATED, DEADLINE, after);
    expect(r).toBeCloseTo(100, 5);
  });

  it('deadline <= createdAt (dado inconsistente): clamp01 retorna 1 -> expectedNow = target (DEC-A3)', async () => {
    const { computeExpectedNow } = await loadPace();
    const badDeadline = new Date('2025-06-01T00:00:00.000Z'); // antes de createdAt
    const r = computeExpectedNow(10, 100, CREATED, badDeadline, HALFWAY);
    expect(r).toBeCloseTo(100, 5);
  });

  it('baseline === target (meta degenerada): expectedNow = target constante', async () => {
    const { computeExpectedNow } = await loadPace();
    const r = computeExpectedNow(100, 100, CREATED, DEADLINE, HALFWAY);
    expect(r).toBeCloseTo(100, 5);
  });
});

describe('deriveStatus — thresholds FIXOS DEC-A3 (ratio = actual/expectedNow)', () => {
  it('achieved: actual >= target override (qualquer ratio)', async () => {
    const { deriveStatus } = await loadPace();
    // actual 120 >= target 100 mesmo com expectedNow alto -> achieved
    expect(deriveStatus(120, 50, 100, 'up')).toBe('achieved');
    // batido exatamente no alvo
    expect(deriveStatus(100, 50, 100, 'up')).toBe('achieved');
  });

  it('ahead: ratio > 1.10 (actual 55, expected 50 -> 1.10 NAO conta; 56/50=1.12 conta)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(56, 50, 100, 'up')).toBe('ahead'); // 1.12 > 1.10
  });

  it('on_track: borda superior ratio == 1.10 (55/50) -> on_track (<= 1.10)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(55, 50, 100, 'up')).toBe('on_track');
  });

  it('on_track: borda inferior ratio == 0.90 (45/50) -> on_track (>= 0.90)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(45, 50, 100, 'up')).toBe('on_track');
  });

  it('on_track: ratio == 1.00 (no pace exato)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(50, 50, 100, 'up')).toBe('on_track');
  });

  it('behind: 0.70 <= ratio < 0.90 (40/50 = 0.80)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(40, 50, 100, 'up')).toBe('behind');
  });

  it('behind: borda inferior ratio == 0.70 (35/50) -> behind (>= 0.70)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(35, 50, 100, 'up')).toBe('behind');
  });

  it('at_risk: ratio < 0.70 (34/50 = 0.68)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(34, 50, 100, 'up')).toBe('at_risk');
  });

  it('at_risk: actual 0, expected > 0 -> ratio 0 < 0.70', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(0, 50, 100, 'up')).toBe('at_risk');
  });
});

describe('deriveStatus — borda divisao por zero (DEC-A3)', () => {
  it('expectedNow === 0 e actual <= 0 -> on_track (dia-zero, A4 nao crava)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(0, 0, 100, 'up')).toBe('on_track');
  });

  it('expectedNow === 0 e actual > 0 -> ahead (fez algo antes do esperado ser > 0)', async () => {
    const { deriveStatus } = await loadPace();
    expect(deriveStatus(5, 0, 100, 'up')).toBe('ahead');
  });
});
