/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-05.2 / INFO-4
 *
 * Q-L resolvida (ADR-189 § Consequences): manter `useOptionalAudioPlayer`.
 * Este test confirma que o nome existe + tem JSDoc explicativo + comportamento
 * "retorna null fora do Provider" continua valido.
 *
 * RF-05.2 implementer action: atualizar JSDoc no arquivo do hook explicando
 * por que "Optional" (vs Safe / OrNull) — ja existe parcialmente, mas reviewer
 * confirma cobertura.
 *
 * Lesson #14/#26: usa `await import(...)` em vez de `require()`.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('useOptionalAudioPlayer naming kept (RF-05.2 / Q-L)', () => {
  it('export `useOptionalAudioPlayer` existe em AudioPlayerContext', async () => {
    const mod = await import('@/contexts/AudioPlayerContext');
    expect(typeof mod.useOptionalAudioPlayer).toBe('function');
  });

  it('NAO existe export alternativo useAudioPlayerSafe / OrNull (Q-L)', async () => {
    const mod: any = await import('@/contexts/AudioPlayerContext');
    expect(mod.useAudioPlayerSafe).toBeUndefined();
    expect(mod.useAudioPlayerOrNull).toBeUndefined();
  });

  it('comportamento legado preservado: retorna null fora do Provider', async () => {
    const { useOptionalAudioPlayer } = await import('@/contexts/AudioPlayerContext');
    function Probe() {
      const v = useOptionalAudioPlayer();
      return <span data-testid="opt">{v === null ? 'null' : 'present'}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('opt').textContent).toBe('null');
  });
});
