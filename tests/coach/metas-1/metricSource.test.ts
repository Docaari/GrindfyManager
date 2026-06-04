import { describe, it, expect } from 'vitest';
import { aggregateCurrentValue } from '../../../server/coach/goals/aggregateCurrentValue';
import { parseMetricSource, RESULT_ONLY_METRICS, GRIND_CAPABLE_METRICS } from '../../../server/coach/goals/sourceMetricMap';

// =============================================================================
// ADR-241 — fonte de dado selecionavel (profit/volume @grind|@history) + parser.
// =============================================================================

describe('parseMetricSource', () => {
  it('sem sufixo -> source=history (back-compat)', () => {
    expect(parseMetricSource('roi_pct')).toEqual({ base: 'roi_pct', source: 'history' });
  });
  it('@grind / @history', () => {
    expect(parseMetricSource('profit@grind')).toEqual({ base: 'profit', source: 'grind' });
    expect(parseMetricSource('volume@history')).toEqual({ base: 'volume', source: 'history' });
  });
  it('NAO conflita com o ":" do leak_focus', () => {
    expect(parseMetricSource('leak_focus_progress:vpip')).toEqual({
      base: 'leak_focus_progress:vpip',
      source: 'history',
    });
  });
  it('catalogos de doutrina', () => {
    expect(RESULT_ONLY_METRICS.has('profit')).toBe(true);
    expect(RESULT_ONLY_METRICS.has('volume')).toBe(false); // volume e controlavel
    expect(GRIND_CAPABLE_METRICS.has('profit')).toBe(true);
    expect(GRIND_CAPABLE_METRICS.has('roi_pct')).toBe(false); // sem currency em session_tournaments
  });
});

describe('aggregateCurrentValue — fonte grind (profit/volume)', () => {
  const window = { weekStartDate: '2026-06-01', rangeStartYmd: '2026-04-01', rangeEndYmd: '2026-06-04' };

  it('profit@grind soma profitLoss das sessoes completed na janela', async () => {
    const deps = {
      getGrindSessionsInRange: async () => [
        { status: 'completed', profitLoss: '120.5' },
        { status: 'completed', profitLoss: '-40' },
        { status: 'active', profitLoss: '999' }, // ignorado (nao completed)
      ],
    };
    const r = await aggregateCurrentValue('USER-1', 'profit@grind', window, deps as any);
    expect(r.value).toBeCloseTo(80.5);
    expect(r.dataSufficiency).toBe('ok');
  });

  it('volume@grind usa o count de session_tournaments da janela', async () => {
    const deps = { getSessionTournamentCountInRange: async () => 37 };
    const r = await aggregateCurrentValue('USER-1', 'volume@grind', window, deps as any);
    expect(r.value).toBe(37);
  });
});

describe('aggregateCurrentValue — fonte historico (profit/volume via getPerformanceByPeriod)', () => {
  const window = { weekStartDate: '2026-06-01' };

  it('profit@history le perf.profit', async () => {
    const deps = { getPerformanceByPeriod: async () => ({ profit: '512.3', totalTournaments: 9 }) };
    const r = await aggregateCurrentValue('USER-1', 'profit@history', window, deps as any);
    expect(r.value).toBeCloseTo(512.3);
  });

  it('volume@history le perf.totalTournaments', async () => {
    const deps = { getPerformanceByPeriod: async () => ({ profit: '0', totalTournaments: 42 }) };
    const r = await aggregateCurrentValue('USER-1', 'volume@history', window, deps as any);
    expect(r.value).toBe(42);
  });

  it('profit sem sufixo (default history) tambem resolve', async () => {
    const deps = { getPerformanceByPeriod: async () => ({ profit: '100', totalTournaments: 5 }) };
    const r = await aggregateCurrentValue('USER-1', 'profit', window, deps as any);
    expect(r.value).toBe(100);
  });
});
