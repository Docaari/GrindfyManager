// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-08 - VolumeControl slider onMouseLeave reinicia hideTimer
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-08
//
// Target: client/src/components/audio-player/VolumeControl.tsx (existe, refactor)
//
// Cenario reviewer flag:
//   1. user passa mouse pelo botao volume (hover 200ms -> slider abre)
//   2. user entra no slider (hover hideTimer cancelado)
//   3. user sai do slider sem voltar pro botao
//   -> hoje: slider fica preso aberto (nenhum onMouseLeave dispara hide)
//   -> RF-08: slider container ganha onMouseLeave que rearma hideTimer
//
// Cobertura:
//   - apos mouseLeave do slider, timer 500ms rearma e slider fecha
//   - mouseEnter no slider antes do timer expirar mantem slider aberto
//
// Padrao: vi.useFakeTimers + advanceTimersByTime (lesson #40)
// userEvent.setup() ja patcheado em setup.ts para advanceTimers automatico.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { VolumeControl } from '@/components/audio-player/VolumeControl';

const HOVER_REVEAL_MS = 200;
const HOVER_HIDE_MS = 500;

function Setup() {
  return (
    <AudioPlayerProvider>
      <VolumeControl />
    </AudioPlayerProvider>
  );
}

describe('VolumeControl slider hide-on-leave (RF-08)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('slider abre apos hover 200ms no botao', () => {
    render(<Setup />);
    const btn = screen.getByTestId('mini-player-volume');
    fireEvent.mouseEnter(btn);

    // Antes de 200ms, ainda nao visivel
    vi.advanceTimersByTime(HOVER_REVEAL_MS - 10);
    expect(screen.queryByTestId('mini-player-volume-slider')).toBeNull();

    vi.advanceTimersByTime(20);
    expect(screen.getByTestId('mini-player-volume-slider')).toBeInTheDocument();
  });

  it('mouseLeave do SLIDER (nao do container) rearma hideTimer e fecha slider', () => {
    render(<Setup />);
    const btn = screen.getByTestId('mini-player-volume');

    // 1. hover no botao -> slider abre
    fireEvent.mouseEnter(btn);
    vi.advanceTimersByTime(HOVER_REVEAL_MS + 10);
    const slider = screen.getByTestId('mini-player-volume-slider');
    expect(slider).toBeInTheDocument();

    // 2. mouse entra no slider (cancela hide)
    fireEvent.mouseEnter(slider);

    // 3. mouse sai DO SLIDER -> RF-08 rearma hideTimer
    fireEvent.mouseLeave(slider);

    // Antes do timeout: ainda visivel
    vi.advanceTimersByTime(HOVER_HIDE_MS - 50);
    expect(screen.queryByTestId('mini-player-volume-slider')).toBeInTheDocument();

    // Apos hide timeout: fecha
    vi.advanceTimersByTime(100);
    expect(screen.queryByTestId('mini-player-volume-slider')).toBeNull();
  });

  it('mouseEnter de volta no slider antes do timer expirar cancela hide', () => {
    render(<Setup />);
    const btn = screen.getByTestId('mini-player-volume');

    fireEvent.mouseEnter(btn);
    vi.advanceTimersByTime(HOVER_REVEAL_MS + 10);
    const slider = screen.getByTestId('mini-player-volume-slider');
    expect(slider).toBeInTheDocument();

    fireEvent.mouseEnter(slider);
    fireEvent.mouseLeave(slider);
    // Re-enter rapido (antes do hide timeout)
    vi.advanceTimersByTime(HOVER_HIDE_MS / 2);
    fireEvent.mouseEnter(slider);

    // Avancar alem do que seria o hide original — deve continuar visivel
    vi.advanceTimersByTime(HOVER_HIDE_MS + 100);
    expect(screen.queryByTestId('mini-player-volume-slider')).toBeInTheDocument();
  });

  it('regressao MP1: mouseLeave do container ainda fecha o slider', () => {
    // Container outer (div.relative) ja tinha onMouseLeave; RF-08 adiciona
    // tambem no slider. Garantir que comportamento antigo segue valendo.
    const { container } = render(<Setup />);
    const btn = screen.getByTestId('mini-player-volume');

    fireEvent.mouseEnter(btn);
    vi.advanceTimersByTime(HOVER_REVEAL_MS + 10);
    expect(screen.getByTestId('mini-player-volume-slider')).toBeInTheDocument();

    // Sai do container (div.relative que envolve botao+slider)
    const root = container.querySelector('.relative.inline-flex.items-center') as HTMLElement;
    expect(root).not.toBeNull();
    fireEvent.mouseLeave(root!);

    vi.advanceTimersByTime(HOVER_HIDE_MS + 50);
    expect(screen.queryByTestId('mini-player-volume-slider')).toBeNull();
  });
});
