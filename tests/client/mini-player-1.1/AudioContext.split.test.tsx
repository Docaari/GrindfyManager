// =============================================================================
// Test-Writer (Modo TDD - Red Phase) - CONDICIONAL (describe.skip)
// Sprint Mini Player 1.1 / RF-04 - Split AudioPlayerContext em
// AudioStateContext + AudioControlsContext
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-04 (CONDICIONAL ao profiler)
//
// Targets (SE GATE PROFILER PASSAR):
//   - client/src/contexts/AudioStateContext.tsx (NOVO)
//   - client/src/contexts/AudioControlsContext.tsx (NOVO)
//   - client/src/contexts/AudioPlayerContext.tsx (refactor — wrapper)
//
// Comportamento esperado quando split implementado:
//   - Components que so consomem controls (setVolume, setSpeed) NAO devem
//     re-renderizar quando state context muda (timeupdate ~4x/s).
//   - useAudioPlayer() continua funcionando (back-compat).
//
// IMPORTANTE: este describe esta em `.skip` por default. Implementer remove
// `.skip` apos confirmar via React Profiler que split e necessario. Se
// profiler indicar React.memo suficiente, mantem .skip e documenta no spec.
//
// NOTA TECNICA: usamos `require()` lazy dentro dos tests (nao top-level
// `await import(...)`) porque Vite resolve imports estaticos no transform
// pipeline mesmo dentro de `describe.skip` — `@/contexts/AudioControlsContext`
// nao existe na red phase e quebra o file resolve. `require()` lazy passa
// pelo Module.prototype._extensions['.tsx'] handler do setup.ts (lesson #38).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

describe.skip('AudioContext split (RF-04 - condicional) - unskip se profiler PASS', () => {
  it('useAudioControls existe e expoe setVolume/setSpeed/play/pause/seek', () => {
    // unskip apos split: deve haver export `useAudioControls`
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/contexts/AudioControlsContext');
    expect(typeof mod.useAudioControls).toBe('function');
  });

  it('useAudioState existe e expoe activeTrack/isPlaying/currentSeconds/durationSeconds', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/contexts/AudioStateContext');
    expect(typeof mod.useAudioState).toBe('function');
  });

  it('AudioPlayerProvider continua exportando useAudioPlayer() (back-compat)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@/contexts/AudioPlayerContext');
    expect(typeof mod.AudioPlayerProvider).toBe('function');
    expect(typeof mod.useAudioPlayer).toBe('function');
  });

  it('componente que so consome useAudioControls NAO re-renderiza em state change (timeupdate)', () => {
    // Idea: usar render counter mock + simulate currentSeconds change.
    // Sem split, controls esta junto com state, entao qualquer mudanca
    // de state forca re-render do consumer mesmo se ele so usa controls.
    // Com split, consumer de controls so re-renderiza se controls callbacks
    // mudarem (que com useCallback estavel quase nunca acontece).

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AudioPlayerProvider } = require('@/contexts/AudioPlayerContext');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAudioControls } = require('@/contexts/AudioControlsContext');

    const controlsRenderCount = { value: 0 };

    function ControlsConsumer() {
      controlsRenderCount.value++;
      const controls = useAudioControls();
      // Use the controls to prevent tree-shake-ish optimization
      void controls.setVolume;
      return <div data-testid="controls-consumer">controls</div>;
    }

    // Render and let provider settle
    const { rerender } = render(
      <AudioPlayerProvider>
        <ControlsConsumer />
      </AudioPlayerProvider>,
    );

    const initialCount = controlsRenderCount.value;

    // Force a re-render of provider (simula timeupdate). Sem split, este
    // re-render propaga para o consumer; com split, consumer fica intacto.
    rerender(
      <AudioPlayerProvider>
        <ControlsConsumer />
      </AudioPlayerProvider>,
    );

    // Aceita 1 re-render adicional pelo rerender top-level mas nao deve
    // ser proporcional a frequencia de timeupdate (~4x/s).
    const delta = controlsRenderCount.value - initialCount;
    expect(delta).toBeLessThanOrEqual(1);
  });
});
