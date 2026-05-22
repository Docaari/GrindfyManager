/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.6 (disconnect UX) + RF-01.2 (Free gate) + D13 (mobile blocked)
 *
 * Component: client/src/components/settings/SpotifyConnectionPanel.tsx
 *
 * Renderizado em /coach-ai aba Preferencias secao "Integracoes".
 *
 * Estados:
 *  - desconectado + desktop: botao "Conectar Spotify" (data-testid="spotify-connect-button")
 *  - desconectado + mobile: botao disabled + tooltip "Spotify disponivel apenas em desktop"
 *  - conectado: linha "Spotify: Conectado como <displayName>" (data-testid="spotify-connection-status")
 *               + botao [Desconectar] (data-testid="spotify-disconnect-button")
 *  - Click Desconectar: abre confirm modal Radix (Dialog) com "Tem certeza?" → confirma → POST disconnect
 *
 * useQuery('/api/audio/spotify/status') retorna { connected: bool, displayName?, productTier? }
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, initiateSpotifyAuthMock, disconnectSpotifyMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  initiateSpotifyAuthMock: vi.fn(),
  disconnectSpotifyMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: undefined,
}));

vi.mock('@/lib/spotify/auth', () => ({
  initiateSpotifyAuth: initiateSpotifyAuthMock,
  disconnectSpotify: disconnectSpotifyMock,
  SpotifyPremiumRequiredError: class extends Error {
    displayName: string;
    constructor(name: string) {
      super('Premium required');
      this.displayName = name;
      this.name = 'SpotifyPremiumRequiredError';
    }
  },
  SpotifyPopupBlockedError: class extends Error {
    constructor() { super('Popup blocked'); this.name = 'SpotifyPopupBlockedError'; }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // default: viewport desktop (>= 1024px)
  (window as any).innerWidth = 1280;
  (window as any).matchMedia = (q: string) => ({
    matches: q.includes('min-width: 1024px') ? true : false,
    media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  });
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadComponent() {
  return await import('./SpotifyConnectionPanel');
}

describe('SpotifyConnectionPanel — disconnected desktop (RF-01.6)', () => {
  it('exibe botao Conectar Spotify quando desconectado', async () => {
    apiRequestMock.mockResolvedValue({ connected: false });
    const { SpotifyConnectionPanel } = await loadComponent();
    render(wrap(<SpotifyConnectionPanel />));
    const btn = await screen.findByTestId('spotify-connect-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toBeEnabled();
  });

  it('click Conectar chama initiateSpotifyAuth', async () => {
    apiRequestMock.mockResolvedValue({ connected: false });
    initiateSpotifyAuthMock.mockResolvedValue({
      accessToken: 't', expiresIn: 3600, displayName: 'X', productTier: 'premium',
    });
    const { SpotifyConnectionPanel } = await loadComponent();
    render(wrap(<SpotifyConnectionPanel />));
    const btn = await screen.findByTestId('spotify-connect-button');
    fireEvent.click(btn);
    await waitFor(() => expect(initiateSpotifyAuthMock).toHaveBeenCalledTimes(1));
  });
});

describe('SpotifyConnectionPanel — mobile (D13)', () => {
  it('em mobile (<1024px): botao Conectar disabled + tooltip aviso', async () => {
    (window as any).innerWidth = 600;
    (window as any).matchMedia = (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    });
    apiRequestMock.mockResolvedValue({ connected: false });
    const { SpotifyConnectionPanel } = await loadComponent();
    render(wrap(<SpotifyConnectionPanel />));
    const btn = await screen.findByTestId('spotify-connect-button');
    expect(btn).toBeDisabled();
    // tooltip text (Radix Tooltip — pode estar em aria-describedby ou title)
    const tooltipText =
      btn.getAttribute('title') ??
      btn.getAttribute('aria-label') ??
      btn.getAttribute('aria-describedby') ?? '';
    // Implementer pode usar Radix tooltip — testamos via aria-label como fallback:
    const hasMessage = /desktop/i.test(tooltipText) || screen.queryByText(/desktop/i) !== null;
    expect(hasMessage).toBe(true);
  });
});

describe('SpotifyConnectionPanel — connected (RF-01.6)', () => {
  it('mostra "Conectado como <displayName>" + data-testid="spotify-connection-status"', async () => {
    apiRequestMock.mockResolvedValue({
      connected: true,
      displayName: 'Player1',
      productTier: 'premium',
    });
    const { SpotifyConnectionPanel } = await loadComponent();
    render(wrap(<SpotifyConnectionPanel />));
    const status = await screen.findByTestId('spotify-connection-status');
    expect(status).toBeInTheDocument();
    expect(status.textContent).toMatch(/Player1/);
  });

  it('botao Desconectar exibe confirm modal antes de chamar disconnectSpotify', async () => {
    apiRequestMock.mockResolvedValue({
      connected: true, displayName: 'Player1', productTier: 'premium',
    });
    const { SpotifyConnectionPanel } = await loadComponent();
    render(wrap(<SpotifyConnectionPanel />));

    const btnDisconnect = await screen.findByTestId('spotify-disconnect-button');
    fireEvent.click(btnDisconnect);

    // Confirm modal aparece (Radix Dialog) - busca pelo titulo OU testid
    const confirmDialog =
      screen.queryByTestId('spotify-disconnect-confirm') ??
      screen.queryByText(/Tem certeza/i);
    expect(confirmDialog).toBeTruthy();
    expect(disconnectSpotifyMock).not.toHaveBeenCalled();
  });

  it('confirmar modal → chama disconnectSpotify', async () => {
    apiRequestMock.mockResolvedValue({
      connected: true, displayName: 'Player1', productTier: 'premium',
    });
    disconnectSpotifyMock.mockResolvedValue(undefined);
    const { SpotifyConnectionPanel } = await loadComponent();
    render(wrap(<SpotifyConnectionPanel />));

    fireEvent.click(await screen.findByTestId('spotify-disconnect-button'));

    // confirm
    const confirmBtn = await screen.findByRole('button', { name: /Sim|Confirmar|Desconectar/i });
    // segunda ocorrencia (Sim/Confirmar) pode ser dentro do dialog — alguns testes
    // pegam por testid:
    const realConfirm =
      screen.queryByTestId('spotify-disconnect-confirm-yes') ?? confirmBtn;
    fireEvent.click(realConfirm);

    await waitFor(() => expect(disconnectSpotifyMock).toHaveBeenCalledTimes(1));
  });
});

describe('SpotifyConnectionPanel — Premium gate UX (RF-01.2)', () => {
  it('initiateSpotifyAuth lanca SpotifyPremiumRequiredError → mostra modal upgrade', async () => {
    apiRequestMock.mockResolvedValue({ connected: false });
    const { SpotifyPremiumRequiredError } = await import('@/lib/spotify/auth');
    initiateSpotifyAuthMock.mockRejectedValue(new (SpotifyPremiumRequiredError as any)('FreeUser'));

    const { SpotifyConnectionPanel } = await loadComponent();
    render(wrap(<SpotifyConnectionPanel />));
    fireEvent.click(await screen.findByTestId('spotify-connect-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('spotify-premium-gate-dialog')).toBeInTheDocument();
    });
  });
});
