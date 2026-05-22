// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-04.1 - formatDuration helper
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-04.1
//
// Target: client/src/lib/audio-engine/formatDuration.ts (NOVO)
//
// Contract:
//   - formatDuration(seconds: number | null | undefined): string
//   - 0..59 -> "M:SS" (e.g. 5 -> "0:05")
//   - 60..3599 -> "M:SS" (e.g. 125 -> "2:05", 599 -> "9:59")
//   - 3600+ -> "H:MM:SS" (e.g. 3725 -> "1:02:05")
//   - <=0, null, undefined, NaN -> "--:--"
// =============================================================================

import { describe, it, expect } from 'vitest';

async function loadHelper() {
  const mod: any = await import('@/lib/audio-engine/formatDuration');
  return mod.formatDuration;
}

describe('formatDuration (RF-04.1)', () => {
  it('0 -> "0:00"', async () => {
    const f = await loadHelper();
    expect(f(0)).toBe('0:00');
  });

  it('5 -> "0:05" (zero-pad)', async () => {
    const f = await loadHelper();
    expect(f(5)).toBe('0:05');
  });

  it('59 -> "0:59"', async () => {
    const f = await loadHelper();
    expect(f(59)).toBe('0:59');
  });

  it('60 -> "1:00"', async () => {
    const f = await loadHelper();
    expect(f(60)).toBe('1:00');
  });

  it('65 -> "1:05"', async () => {
    const f = await loadHelper();
    expect(f(65)).toBe('1:05');
  });

  it('125 -> "2:05"', async () => {
    const f = await loadHelper();
    expect(f(125)).toBe('2:05');
  });

  it('599 -> "9:59"', async () => {
    const f = await loadHelper();
    expect(f(599)).toBe('9:59');
  });

  it('3599 -> "59:59"', async () => {
    const f = await loadHelper();
    expect(f(3599)).toBe('59:59');
  });

  it('3600 -> "1:00:00"', async () => {
    const f = await loadHelper();
    expect(f(3600)).toBe('1:00:00');
  });

  it('3725 -> "1:02:05"', async () => {
    const f = await loadHelper();
    expect(f(3725)).toBe('1:02:05');
  });

  it('86399 -> "23:59:59"', async () => {
    const f = await loadHelper();
    expect(f(86399)).toBe('23:59:59');
  });

  it('null -> "--:--"', async () => {
    const f = await loadHelper();
    expect(f(null as any)).toBe('--:--');
  });

  it('undefined -> "--:--"', async () => {
    const f = await loadHelper();
    expect(f(undefined as any)).toBe('--:--');
  });

  it('NaN -> "--:--"', async () => {
    const f = await loadHelper();
    expect(f(NaN)).toBe('--:--');
  });

  it('negative -> "--:--"', async () => {
    const f = await loadHelper();
    expect(f(-10)).toBe('--:--');
  });

  it('floor floats (125.7 -> "2:05")', async () => {
    const f = await loadHelper();
    expect(f(125.7)).toBe('2:05');
  });
});
