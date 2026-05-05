import { describe, it, expect } from 'vitest';
import { MODE_CONFIGS, totalSeconds } from '@/components/warmup/durations';

// =============================================================================
// Tempos por modo somam EXATO o label (reform 2026-05-05).
// =============================================================================

describe('warmup durations - soma exata', () => {
  it('modo 6m soma 360s (6 min)', () => {
    expect(totalSeconds('6m')).toBe(360);
  });

  it('modo 15m soma 900s (15 min)', () => {
    expect(totalSeconds('15m')).toBe(900);
  });

  it('modo 30m soma 1800s (30 min)', () => {
    expect(totalSeconds('30m')).toBe(1800);
  });

  it('todos modos tem 4 blocos cronometrados (Setup nao conta)', () => {
    for (const m of ['6m', '15m', '30m'] as const) {
      const c = MODE_CONFIGS[m];
      expect(c.breathingSeconds).toBeGreaterThan(0);
      expect(c.heuristicsSeconds).toBeGreaterThan(0);
      expect(c.intentionSeconds).toBeGreaterThan(0);
      expect(c.pfcSeconds).toBeGreaterThan(0);
    }
  });
});
