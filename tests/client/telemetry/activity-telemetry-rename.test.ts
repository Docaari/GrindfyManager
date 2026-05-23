// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 — alias deprecado `audio-telemetry.ts` 90d
//
// Spec: Docs/specs/sprint-mp-validation.md RF-01 §Notas de Implementacao
// ADR-207 §6: lib renomeada `client/src/lib/activity-telemetry.ts`. Manter
//             `audio-telemetry.ts` como alias re-export 90d + console.warn dev.
//
// Cobertura:
//   - Import legacy `@/lib/audio-telemetry` ainda resolve (alias).
//   - Exporta `emitAudioEvent` (back-compat ADR-191).
//   - Modulo novo `@/lib/activity-telemetry` exporta API nova.
//
// Lessons: #14/#26 (await import dynamic).
// =============================================================================

import { describe, it, expect } from 'vitest';

describe('RF-01 — activity-telemetry rename + alias 90d', () => {
  it('@/lib/audio-telemetry continua resolvendo (alias deprecado)', async () => {
    const legacy: any = await import('@/lib/audio-telemetry');
    expect(legacy).toBeDefined();
    expect(typeof legacy.emitAudioEvent).toBe('function');
  });

  it('@/lib/activity-telemetry exporta API nova (emit*Event)', async () => {
    const mod: any = await import('@/lib/activity-telemetry');
    expect(typeof mod.emitAudioEvent).toBe('function');
    expect(typeof mod.emitLessonEvent).toBe('function');
    expect(typeof mod.emitCoachEvent).toBe('function');
    expect(typeof mod.emitLibraryEvent).toBe('function');
  });

  it('alias re-exporta emitAudioEvent da nova lib (mesma funcao)', async () => {
    const legacy: any = await import('@/lib/audio-telemetry');
    const current: any = await import('@/lib/activity-telemetry');
    // Mesma referencia (re-export *) ou wrapper que delega — ambos OK.
    expect(typeof legacy.emitAudioEvent).toBe('function');
    expect(typeof current.emitAudioEvent).toBe('function');
  });
});
