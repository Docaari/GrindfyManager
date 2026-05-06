import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD (red phase) — useEffect clock auto-open dentro de GrindSessionLive.
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RF-02, RF-04 guards)
// ADR: Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
//
// Estrategia (lesson #14/#26): NAO carregar GrindSessionLive (3058 linhas + deps
// pesadas como Mux Player, react-query etc) via require(). Em vez disso, o
// implementer DEVE extrair o handler do useEffect para uma fn pura testavel:
//
//   client/src/components/grind-session/break-auto-open-effect.ts
//   exporta:
//     runAutoOpenTick(deps): void  // chamado pelo useEffect a cada 30s
//
//   Onde deps eh:
//   {
//     now: Date,
//     enabled: boolean,
//     activeSession: { id: string, skipBreaksToday?: boolean } | null,
//     isPaused: boolean,
//     skipBreaksToday: boolean,
//     showBreakDialog: boolean,
//     lastTriggerHourKeyRef: { current: string | null },
//     wasAutoOpenedRef: { current: boolean },
//     openedAtRef: { current: Date | null },
//     setShowBreakDialog: (b: boolean) => void,
//     setShowBreakBanner: (b: boolean) => void,
//     setBreakBannerActive: (b: boolean) => void,
//   }
//
// Beneficios desta extracao:
//   - 100% testavel sem React.
//   - Implementer apenas chama runAutoOpenTick dentro do setInterval no useEffect.
//   - Cumpre lesson #14: zero require() de componente .tsx em teste .tsx.
//
// Se o implementer optar por inline no GrindSessionLive (sem extrair),
// estes testes falham permanentemente (impedimento documentado e seguir).
// =============================================================================

// Lesson #14: Vite faz analise estatica de import 'literal-path' e quebra em
// red phase quando modulo nao existe (failed suite, sem registrar nenhum it()).
// Construimos string em runtime via dynamic import + /* @vite-ignore */.
const MODULE_PATH = '../../../client/src/components/grind-session/break-auto-open-effect';
let runAutoOpenTick: (deps: any) => void;

beforeEach(async () => {
  const mod = await import(/* @vite-ignore */ MODULE_PATH);
  runAutoOpenTick = mod.runAutoOpenTick;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-05T17:54:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function buildDeps(overrides: Partial<any> = {}) {
  return {
    now: new Date('2026-05-05T17:54:00Z'), // BRT 14:54 (default — modal deve abrir)
    enabled: true,
    activeSession: { id: 'sess-1', skipBreaksToday: false },
    isPaused: false,
    skipBreaksToday: false,
    showBreakDialog: false,
    lastTriggerHourKeyRef: { current: null as string | null },
    wasAutoOpenedRef: { current: false },
    openedAtRef: { current: null as Date | null },
    setShowBreakDialog: vi.fn(),
    setShowBreakBanner: vi.fn(),
    setBreakBannerActive: vi.fn(),
    ...overrides,
  };
}

// =============================================================================
// Toggle OFF
// =============================================================================
describe('runAutoOpenTick - toggle OFF', () => {
  it('relogio em BRT 14:54 + enabled=false -> NAO abre modal', () => {
    const deps = buildDeps({ enabled: false });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('OFF + relogio em XX:54 nao mexe na ref lastTriggerHourKey', () => {
    const deps = buildDeps({ enabled: false });
    runAutoOpenTick(deps);
    expect(deps.lastTriggerHourKeyRef.current).toBeNull();
  });
});

// =============================================================================
// Happy path
// =============================================================================
describe('runAutoOpenTick - happy path', () => {
  it('ON + sessao ativa + sem pausa + sem skip + BRT 14:54 -> abre modal', () => {
    const deps = buildDeps();
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(true);
  });

  it('abrir modal seta wasAutoOpened=true', () => {
    const deps = buildDeps();
    runAutoOpenTick(deps);
    expect(deps.wasAutoOpenedRef.current).toBe(true);
  });

  it('abrir modal grava lastTriggerHourKey (current hour BRT)', () => {
    const deps = buildDeps();
    runAutoOpenTick(deps);
    expect(deps.lastTriggerHourKeyRef.current).toBe('2026-05-05-14');
  });

  it('abrir modal grava openedAt = now', () => {
    const now = new Date('2026-05-05T17:54:00Z');
    const deps = buildDeps({ now });
    runAutoOpenTick(deps);
    expect(deps.openedAtRef.current).toEqual(now);
  });

  it('abrir modal suprime banner FP-07 (setShowBreakBanner=false + setBreakBannerActive=false)', () => {
    const deps = buildDeps();
    runAutoOpenTick(deps);
    expect(deps.setShowBreakBanner).toHaveBeenCalledWith(false);
    expect(deps.setBreakBannerActive).toHaveBeenCalledWith(false);
  });
});

// =============================================================================
// Guards (RF-02 + RF-04)
// =============================================================================
describe('runAutoOpenTick - guards', () => {
  it('isPaused=true em XX:54 -> NAO abre', () => {
    const deps = buildDeps({ isPaused: true });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('skipBreaksToday=true em XX:54 -> NAO abre', () => {
    const deps = buildDeps({ skipBreaksToday: true });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('activeSession.skipBreaksToday=true em XX:54 -> NAO abre', () => {
    const deps = buildDeps({
      activeSession: { id: 'sess-1', skipBreaksToday: true },
    });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('showBreakDialog=true (ja aberto manualmente) -> NAO re-abre', () => {
    const deps = buildDeps({ showBreakDialog: true });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('activeSession=null (sem sessao) -> NAO abre', () => {
    const deps = buildDeps({ activeSession: null });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Dedupe (mesmo tick disparando duas vezes na mesma hora)
// =============================================================================
describe('runAutoOpenTick - dedupe', () => {
  it('14:54 dispara, 14:54:30 segundo check NAO re-abre', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T17:54:00Z') });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledTimes(1);

    // segundo tick na mesma hora — modal pode ter sido fechado pelo user, mas
    // dedupe via lastTriggerHourKey impede re-abertura.
    deps.setShowBreakDialog.mockClear();
    deps.now = new Date('2026-05-05T17:54:30Z');
    deps.showBreakDialog = false; // user fechou manualmente
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('14:54 dispara, 15:54 dispara novamente (hora diferente)', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T17:54:00Z') });
    runAutoOpenTick(deps);
    expect(deps.lastTriggerHourKeyRef.current).toBe('2026-05-05-14');

    deps.setShowBreakDialog.mockClear();
    deps.now = new Date('2026-05-05T18:54:00Z'); // BRT 15:54
    deps.showBreakDialog = false;
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(true);
    expect(deps.lastTriggerHourKeyRef.current).toBe('2026-05-05-15');
  });

  it('14:54 dispara, no proximo dia (dia 06) 14:54 dispara de novo', () => {
    const deps = buildDeps({
      now: new Date('2026-05-05T17:54:00Z'),
      lastTriggerHourKeyRef: { current: '2026-05-05-14' },
    });
    deps.now = new Date('2026-05-06T17:54:00Z'); // BRT 14:54 dia 06
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(true);
    expect(deps.lastTriggerHourKeyRef.current).toBe('2026-05-06-14');
  });
});

// =============================================================================
// Minuto errado
// =============================================================================
describe('runAutoOpenTick - minuto errado', () => {
  it('BRT 14:53 -> NAO abre', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T17:53:00Z') });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('BRT 14:55 -> NAO abre', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T17:55:00Z') });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('BRT 14:00 -> NAO abre', () => {
    const deps = buildDeps({ now: new Date('2026-05-05T17:00:00Z') });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});

// =============================================================================
// HIGH-2: race do interval recreate (re-open apos close manual em XX:54)
// =============================================================================
describe('runAutoOpenTick - HIGH-2 race do interval recreate', () => {
  // Simula o cenario do bug: user abre modal manualmente em XX:54 (clicando
  // banner FP-07), fecha imediatamente, e o useEffect recria o interval por
  // mudanca de deps. O tick imediato pos-recreacao NAO pode re-abrir o modal
  // se o handleBreakRespond ja claimou o lastTriggerHourKey.
  it('lastTriggerHourKey === currentHourKey (claimed) -> NAO re-open', () => {
    const deps = buildDeps({
      now: new Date('2026-05-05T17:54:30Z'), // BRT 14:54:30
      showBreakDialog: false, // user ja fechou modal
      lastTriggerHourKeyRef: { current: '2026-05-05-14' }, // claimed por handleBreakRespond
    });
    runAutoOpenTick(deps);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});
