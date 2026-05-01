// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — getTrendIndicator helper (RF-15)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-15 trend indicator + threshold por unit)
// ADR  : 066 (3-way comparison semantics — secao "Trend indicator")
//
// Modulo NAO existe ainda — Implementer criara em
// `shared/hud-trend-indicator.ts`.
//
// Threshold por `unit`:
//   pct:   <1% estavel | 1-5% moderado | >=5% grande
//   bb:    <0.1 estavel | 0.1-0.5 moderado | >=0.5 grande
//   count: <1 estavel | 1-5 moderado | >=5 grande
//
// Direction-aware:
//   higher_better: delta>0 -> ↑ (good); delta<0 -> ↓ (leak)
//   lower_better:  delta>0 -> ↓ (leak); delta<0 -> ↑ (good)
//   context|neutral: sempre →
// =============================================================================

import { describe, it, expect } from 'vitest';

// Modulo NAO existe — red phase
import {
  getTrendIndicator,
  type TrendIcon,
} from '../../../shared/hud-trend-indicator';

describe('getTrendIndicator — return shape', () => {
  it('retorna objeto com icon + kind ou null', () => {
    const result = getTrendIndicator('higher_better', 22, 24, 'pct');
    expect(result).not.toBeNull();
    expect(typeof result!.icon).toBe('string');
    expect(typeof result!.kind).toBe('string');
  });

  it('retorna null quando snap1 OR snap2 sao null', () => {
    expect(getTrendIndicator('higher_better', null, 24, 'pct')).toBeNull();
    expect(getTrendIndicator('higher_better', 22, null, 'pct')).toBeNull();
    expect(getTrendIndicator('higher_better', null, null, 'pct')).toBeNull();
  });
});

describe('getTrendIndicator — threshold por unit pct', () => {
  it('|delta|<1% retorna estavel →', () => {
    const result = getTrendIndicator('higher_better', 22.0, 22.5, 'pct');
    expect(result!.icon).toBe('→');
    expect(result!.kind).toBe('stable');
  });

  it('1% <= |delta| < 5% retorna ↑ ou ↓ (moderado)', () => {
    const result = getTrendIndicator('higher_better', 22, 25, 'pct'); // delta=3 (positivo)
    expect(result!.icon).toBe('↑');
    expect(result!.kind === 'small_positive').toBe(true);
  });

  it('|delta| >= 5% retorna ↑↑ ou ↓↓ (grande)', () => {
    const result = getTrendIndicator('higher_better', 22, 30, 'pct'); // delta=8
    expect(result!.icon).toBe('↑↑');
    expect(result!.kind).toBe('big_positive');
  });
});

describe('getTrendIndicator — direction lower_better inverte', () => {
  it('lower_better delta>0 retorna ↓ (leak)', () => {
    // Fold-vs-3bet: delta +10 com lower_better = pior (subiu fold demais)
    const result = getTrendIndicator('lower_better', 50, 60, 'pct');
    expect(result!.icon).toBe('↓↓');
    expect(result!.kind).toBe('big_negative');
  });

  it('lower_better delta<0 retorna ↑ (good — invertido visual)', () => {
    const result = getTrendIndicator('lower_better', 60, 50, 'pct'); // delta=-10
    expect(result!.icon).toBe('↑↑');
    expect(result!.kind).toBe('big_positive');
  });
});

describe('getTrendIndicator — context / neutral sempre →', () => {
  it('context retorna → mesmo com delta grande', () => {
    const result = getTrendIndicator('context', 22, 30, 'pct');
    expect(result!.icon).toBe('→');
  });

  it('neutral retorna → mesmo com delta grande', () => {
    const result = getTrendIndicator('neutral', 22, 30, 'pct');
    expect(result!.icon).toBe('→');
  });
});

describe('getTrendIndicator — threshold unit bb', () => {
  it('|delta|<0.1 bb estavel →', () => {
    const result = getTrendIndicator('higher_better', 5.0, 5.05, 'bb');
    expect(result!.icon).toBe('→');
  });

  it('0.1 <= |delta| < 0.5 bb moderado', () => {
    const result = getTrendIndicator('higher_better', 5.0, 5.3, 'bb');
    expect(result!.icon).toBe('↑');
  });

  it('|delta| >= 0.5 bb grande', () => {
    const result = getTrendIndicator('higher_better', 5.0, 5.6, 'bb');
    expect(result!.icon).toBe('↑↑');
  });
});

describe('getTrendIndicator — equal values', () => {
  it('snap1 === snap2 retorna →', () => {
    const result = getTrendIndicator('higher_better', 22, 22, 'pct');
    expect(result!.icon).toBe('→');
    expect(result!.kind).toBe('stable');
  });
});
