/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-NEW.1
 *
 * Component: client/src/components/audio-player/SleepTimerControl.tsx
 *
 * Botao Moon icon no MiniPlayerBar. Click → Radix Popover com presets [15,30,45,60,90].
 *
 * Props:
 *   activeMinutes: number | null
 *   remainingSeconds: number | null
 *   onActivate: (minutes: number) => void
 *   onCancel: () => void
 *
 * Estado inativo: icone solido, NO badge.
 * Estado ativo: icone com badge mostrando minutos restantes ("30m", "23m").
 * Badge atualiza a cada 60s (interval setado pelo Provider, props mudam).
 *
 * Mobile (<768px) → componente nao renderiza (display: hidden md:inline-flex).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

async function loadComponent() {
  return await import('./SleepTimerControl');
}

describe('SleepTimerControl (RF-NEW.1)', () => {
  it('renderiza botao com data-testid="mini-player-sleep-timer-button"', async () => {
    const { SleepTimerControl } = await loadComponent();
    render(
      <SleepTimerControl
        activeMinutes={null}
        remainingSeconds={null}
        onActivate={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('mini-player-sleep-timer-button')).toBeInTheDocument();
  });

  it('estado inativo: aria-label "Timer de sono inativo"', async () => {
    const { SleepTimerControl } = await loadComponent();
    render(
      <SleepTimerControl
        activeMinutes={null}
        remainingSeconds={null}
        onActivate={() => {}}
        onCancel={() => {}}
      />,
    );
    const btn = screen.getByTestId('mini-player-sleep-timer-button');
    expect(btn.getAttribute('aria-label')).toMatch(/inativ/i);
  });

  it('estado ativo: badge mostra minutos restantes', async () => {
    const { SleepTimerControl } = await loadComponent();
    render(
      <SleepTimerControl
        activeMinutes={30}
        remainingSeconds={23 * 60}
        onActivate={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/23m/)).toBeInTheDocument();
  });

  it('estado ativo: aria-label dinamico com minutos restantes', async () => {
    const { SleepTimerControl } = await loadComponent();
    render(
      <SleepTimerControl
        activeMinutes={60}
        remainingSeconds={45 * 60}
        onActivate={() => {}}
        onCancel={() => {}}
      />,
    );
    const btn = screen.getByTestId('mini-player-sleep-timer-button');
    expect(btn.getAttribute('aria-label')).toMatch(/45/);
  });

  it('click abre Popover com 5 opcoes [15, 30, 45, 60, 90]', async () => {
    const { SleepTimerControl } = await loadComponent();
    render(
      <SleepTimerControl
        activeMinutes={null}
        remainingSeconds={null}
        onActivate={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('mini-player-sleep-timer-button'));
    await waitFor(() => {
      for (const m of [15, 30, 45, 60, 90]) {
        expect(screen.getByText(new RegExp(`${m}\\s?min`, 'i'))).toBeInTheDocument();
      }
    });
  });

  it('escolher preset 30min chama onActivate(30)', async () => {
    const { SleepTimerControl } = await loadComponent();
    const onActivate = vi.fn();
    render(
      <SleepTimerControl
        activeMinutes={null}
        remainingSeconds={null}
        onActivate={onActivate}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('mini-player-sleep-timer-button'));
    const item = await screen.findByText(/30\s?min/i);
    fireEvent.click(item);
    expect(onActivate).toHaveBeenCalledWith(30);
  });

  it('quando ativo: botao Cancelar timer chama onCancel', async () => {
    const { SleepTimerControl } = await loadComponent();
    const onCancel = vi.fn();
    render(
      <SleepTimerControl
        activeMinutes={30}
        remainingSeconds={1500}
        onActivate={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('mini-player-sleep-timer-button'));
    const cancelBtn = await screen.findByRole('button', { name: /Cancelar timer/i });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
