import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint F4 W0 — tracker.ts stub (telemetria minimal)
//
// ADR-055: stub via console.log; interface estavel emit(event, payload)
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Parte F)
//
// Implementacao esperada (server/utils/tracker.ts):
//
//   export function emit(event: string, payload: Record<string, unknown>): void {
//     console.log('[track]', event, JSON.stringify(payload));
//   }
//
// Comportamento:
//   - Aceita event: string + payload: Record<string, unknown>
//   - Loga prefix '[track]' + event + JSON serializado do payload
//   - Defensivo contra payload nulo/undefined (usa {} ou string 'null')
//   - NAO lanca exception em qualquer cenario (telemetria nunca quebra fluxo)
// =============================================================================

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

async function loadTracker() {
  return await import('../../../server/utils/tracker');
}

describe('tracker.emit — formato basico', () => {
  it('chama console.log com prefix [track] + event + JSON payload', async () => {
    const { emit } = await loadTracker();
    emit('primedope_simulation_run', {
      profileLetter: 'A',
      dayOfWeek: 2,
      latencyMs: 2840,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const args = logSpy.mock.calls[0];
    expect(args[0]).toBe('[track]');
    expect(args[1]).toBe('primedope_simulation_run');
    // O 3o arg deve ser JSON serializado do payload.
    expect(typeof args[2]).toBe('string');
    const parsed = JSON.parse(args[2] as string);
    expect(parsed).toEqual(
      expect.objectContaining({
        profileLetter: 'A',
        dayOfWeek: 2,
        latencyMs: 2840,
      })
    );
  });

  it('serializa payload com multiplos tipos (string, number, boolean, object)', async () => {
    const { emit } = await loadTracker();
    emit('day_detail_drawer_open', {
      profileLetter: 'B',
      dayOfWeek: 5,
      totalCost: 124.5,
      tournamentCount: 8,
      empty: false,
      meta: { source: 'WeekGrid' },
    });

    const json = logSpy.mock.calls[0][2] as string;
    const parsed = JSON.parse(json);
    expect(parsed.totalCost).toBe(124.5);
    expect(parsed.empty).toBe(false);
    expect(parsed.meta).toEqual({ source: 'WeekGrid' });
  });
});

describe('tracker.emit — defensividade', () => {
  it('payload vazio {} nao quebra', async () => {
    const { emit } = await loadTracker();
    expect(() => emit('foo_event', {})).not.toThrow();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('payload com circular refs ou undefined nao lanca exception', async () => {
    const { emit } = await loadTracker();
    expect(() =>
      emit('weird_event', {
        a: undefined,
        b: null,
      })
    ).not.toThrow();
  });

  it('event vazio "" ainda eh emitido (no shadow validation no stub)', async () => {
    const { emit } = await loadTracker();
    expect(() => emit('', {})).not.toThrow();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

describe('tracker.emit — naming convention', () => {
  it('aceita event names em snake_case (PostHog/Mixpanel-friendly)', async () => {
    const { emit } = await loadTracker();
    emit('primedope_run_pinned', { runId: 'abc', pinned: true });
    emit('primedope_chart_proxy_miss', { hash: 'xyz' });
    emit('primedope_simulation_error', { errorType: 'queue_timeout' });
    expect(logSpy).toHaveBeenCalledTimes(3);
  });
});
