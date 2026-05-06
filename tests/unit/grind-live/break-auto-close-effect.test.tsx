import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD (red phase) — useEffect clock auto-close.
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RF-03)
// ADR: Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
//
// Tal como break-auto-open-effect, o implementer DEVE extrair o handler do
// useEffect de auto-close para uma fn pura testavel:
//
//   client/src/components/grind-session/break-auto-close-effect.ts
//   exporta:
//     runAutoCloseTick(deps): { closed: boolean, forced?: boolean, toastShown?: boolean }
//
//   deps:
//   {
//     now: Date,
//     showBreakDialog: boolean,
//     wasAutoOpenedRef: { current: boolean },
//     openedAtRef: { current: Date | null },
//     lastSliderInteractionAtRef: { current: number },
//     isInTextarea: boolean,
//     setShowBreakDialog: (b: boolean) => void,
//     toast: (opts: { title: string; description?: string; variant?: string; duration?: number }) => void,
//   }
//
// Comportamento:
// - Se modal NAO esta aberto OU !wasAutoOpened OU openedAt nulo -> no-op
// - Se now esta na janela [XX:02, XX:04) BRT (relativa a openedAt) E user
//   nao esta interagindo -> close + clear refs + toast
// - Se now esta na janela tolerancia [XX:04, XX:06) E user esta interagindo
//   -> retentar (no-op, retornar { closed: false })
// - Se now >= XX:06 (4 min apos XX:02) -> forca close mesmo com interacao
// =============================================================================

// Lesson #14: dynamic import + /* @vite-ignore */ para tolerar red phase.
const MODULE_PATH = '../../../client/src/components/grind-session/break-auto-close-effect';
let runAutoCloseTick: (deps: any) => void;

beforeEach(async () => {
  const mod = await import(/* @vite-ignore */ MODULE_PATH);
  runAutoCloseTick = mod.runAutoCloseTick;
});

function buildDeps(overrides: Partial<any> = {}) {
  return {
    now: new Date('2026-05-05T18:02:00Z'), // BRT 15:02 (default — janela close)
    showBreakDialog: true,
    wasAutoOpenedRef: { current: true },
    openedAtRef: { current: new Date('2026-05-05T17:54:00Z') }, // BRT 14:54
    lastSliderInteractionAtRef: { current: 0 }, // sem interacao recente
    isInTextarea: false,
    setShowBreakDialog: vi.fn(),
    toast: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-05T18:02:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Happy path
// =============================================================================
describe('runAutoCloseTick - happy path', () => {
  it('BRT 15:02, sem interacao, wasAutoOpened=true -> fecha modal', () => {
    const deps = buildDeps();
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });

  it('fecha + dispara toast "Break finalizado..."', () => {
    const deps = buildDeps();
    runAutoCloseTick(deps);
    expect(deps.toast).toHaveBeenCalled();
    const arg = deps.toast.mock.calls[0][0];
    // Toast obrigatorio segundo spec; texto pode variar mas titulo/desc menciona break.
    const flat = JSON.stringify(arg).toLowerCase();
    expect(flat).toMatch(/break/);
  });

  it('fecha limpa wasAutoOpenedRef', () => {
    const deps = buildDeps();
    runAutoCloseTick(deps);
    expect(deps.wasAutoOpenedRef.current).toBe(false);
  });
});

// =============================================================================
// Guard: aberto manualmente nao auto-fecha
// =============================================================================
describe('runAutoCloseTick - aberto manualmente', () => {
  it('wasAutoOpened=false em XX:02 -> NAO fecha', () => {
    const deps = buildDeps({ wasAutoOpenedRef: { current: false } });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('wasAutoOpened=false NAO dispara toast', () => {
    const deps = buildDeps({ wasAutoOpenedRef: { current: false } });
    runAutoCloseTick(deps);
    expect(deps.toast).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Guard: modal ja fechado
// =============================================================================
describe('runAutoCloseTick - modal nao aberto', () => {
  it('showBreakDialog=false -> no-op', () => {
    const deps = buildDeps({ showBreakDialog: false });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
    expect(deps.toast).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Guard: openedAt nulo
// =============================================================================
describe('runAutoCloseTick - openedAt nulo', () => {
  it('openedAtRef.current=null -> no-op (defensivo)', () => {
    const deps = buildDeps({ openedAtRef: { current: null } });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Janela de tempo
// =============================================================================
describe('runAutoCloseTick - janela', () => {
  it('BRT 15:01 (antes da janela) -> NAO fecha', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T18:01:00Z') });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('BRT 15:03 (dentro da janela) -> fecha', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T18:03:30Z') });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });

  it('BRT 14:58 (mesma hora do open, antes de virar) -> NAO fecha', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T17:58:00Z') });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Interacao (textarea + slider <30s)
// =============================================================================
describe('runAutoCloseTick - interacao', () => {
  it('BRT 15:02, isInTextarea=true -> NAO fecha (retentar)', () => {
    const deps = buildDeps({ isInTextarea: true });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('BRT 15:02, slider mudou ha 10s -> NAO fecha', () => {
    const now = new Date('2026-05-05T18:02:00Z');
    const deps = buildDeps({
      now,
      lastSliderInteractionAtRef: { current: now.getTime() - 10_000 },
    });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('BRT 15:02, slider mudou ha 35s -> fecha', () => {
    const now = new Date('2026-05-05T18:02:00Z');
    const deps = buildDeps({
      now,
      lastSliderInteractionAtRef: { current: now.getTime() - 35_000 },
    });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });
});

// =============================================================================
// Force close apos 4 min (XX:06 — out of normal window)
// =============================================================================
describe('runAutoCloseTick - force close em XX:06+', () => {
  it('BRT 15:06, isInTextarea=true (interagindo continuamente) -> forca close', () => {
    const deps = buildDeps({
      now: new Date('2026-05-05T18:06:00Z'),
      isInTextarea: true,
    });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });

  it('BRT 15:06, slider mudou ha 5s -> forca close mesmo com interacao recente', () => {
    const now = new Date('2026-05-05T18:06:00Z');
    const deps = buildDeps({
      now,
      lastSliderInteractionAtRef: { current: now.getTime() - 5_000 },
    });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });

  it('BRT 15:07 (passou ate da janela force) -> ainda fecha (cleanup defensivo)', () => {
    const deps = buildDeps({
      now: new Date('2026-05-05T18:07:00Z'),
      isInTextarea: true,
    });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });
});

// =============================================================================
// MEDIUM-3: force-close branch defensivo demais — valida elapsed window
// =============================================================================
describe('runAutoCloseTick - MEDIUM-3 force-close janela [4, 30) min', () => {
  it('openedAt=14:54, now=15:06 (elapsed=12min) -> force close OK', () => {
    const deps = buildDeps({
      now: new Date('2026-05-05T18:06:00Z'), // BRT 15:06
      openedAtRef: { current: new Date('2026-05-05T17:54:00Z') }, // BRT 14:54
      isInTextarea: true, // forca branch force-close (XX:06)
    });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
  });

  it('openedAt=14:54, now=16:06 (elapsed=72min) -> NAO force close (modal abandonado)', () => {
    const deps = buildDeps({
      now: new Date('2026-05-05T19:06:00Z'), // BRT 16:06
      openedAtRef: { current: new Date('2026-05-05T17:54:00Z') }, // BRT 14:54
      isInTextarea: true,
    });
    runAutoCloseTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});
