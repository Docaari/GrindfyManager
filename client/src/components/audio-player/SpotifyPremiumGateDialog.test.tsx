/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.2
 *
 * Component: client/src/components/audio-player/SpotifyPremiumGateDialog.tsx
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   displayName: string  (do user Free conectado)
 *
 * Modal Radix Dialog (lesson MP1.1 RF-05) com:
 *  - titulo "Spotify Premium necessario"
 *  - body com displayName + explicacao
 *  - botao "Saiba mais sobre Premium" → window.open('https://spotify.com/premium', '_blank')
 *  - botao "Cancelar" → onClose
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

beforeEach(() => {
  vi.clearAllMocks();
});

async function loadComponent() {
  return await import('./SpotifyPremiumGateDialog');
}

describe('SpotifyPremiumGateDialog (RF-01.2)', () => {
  it('renderiza com data-testid="spotify-premium-gate-dialog" quando open=true', async () => {
    const { SpotifyPremiumGateDialog } = await loadComponent();
    render(
      <SpotifyPremiumGateDialog open={true} onClose={() => {}} displayName="Free Joe" />,
    );
    expect(screen.getByTestId('spotify-premium-gate-dialog')).toBeInTheDocument();
  });

  it('exibe displayName do user Free', async () => {
    const { SpotifyPremiumGateDialog } = await loadComponent();
    render(
      <SpotifyPremiumGateDialog open={true} onClose={() => {}} displayName="Carlos" />,
    );
    expect(screen.getByText(/Carlos/)).toBeInTheDocument();
  });

  it('exibe titulo Spotify Premium necessario', async () => {
    const { SpotifyPremiumGateDialog } = await loadComponent();
    render(
      <SpotifyPremiumGateDialog open={true} onClose={() => {}} displayName="X" />,
    );
    expect(screen.getByText(/Spotify Premium necessario/i)).toBeInTheDocument();
  });

  it('botao "Saiba mais" abre spotify.com/premium em nova aba', async () => {
    const { SpotifyPremiumGateDialog } = await loadComponent();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <SpotifyPremiumGateDialog open={true} onClose={() => {}} displayName="X" />,
    );

    const btn = screen.getByRole('button', { name: /Saiba mais/i });
    fireEvent.click(btn);

    expect(openSpy).toHaveBeenCalledWith(
      'https://spotify.com/premium',
      '_blank',
      expect.any(String),
    );
    openSpy.mockRestore();
  });

  it('botao Cancelar dispara onClose', async () => {
    const { SpotifyPremiumGateDialog } = await loadComponent();
    const onClose = vi.fn();
    render(
      <SpotifyPremiumGateDialog open={true} onClose={onClose} displayName="X" />,
    );
    const btn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('open=false → nao renderiza dialog body', async () => {
    const { SpotifyPremiumGateDialog } = await loadComponent();
    render(
      <SpotifyPremiumGateDialog open={false} onClose={() => {}} displayName="X" />,
    );
    expect(screen.queryByTestId('spotify-premium-gate-dialog')).not.toBeInTheDocument();
  });
});
