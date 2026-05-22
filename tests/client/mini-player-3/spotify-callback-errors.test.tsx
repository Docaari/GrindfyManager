// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-06.2 - SpotifyOAuthErrorDialog + callback page
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-06.2 + D17
//
// Target:
//   - client/src/components/audio-player/SpotifyOAuthErrorDialog.tsx (NOVO)
//   - client/src/pages/spotify-callback.tsx (estende para renderizar dialog)
//
// Contract:
//   - /spotify-callback?error=access_denied -> dialog mostra mensagem PT-BR
//   - /spotify-callback?error=state_mismatch -> mensagem "Sessao expirada..."
//   - /spotify-callback?error=invalid_grant -> "Token Spotify invalido..."
//   - /spotify-callback?error=server_error -> "Erro do servidor Spotify..."
//   - /spotify-callback?error=unknown -> "Erro inesperado"
//   - data-testid="spotify-oauth-error-dialog"
//   - data-testid="spotify-oauth-reconnect-button" + onClick chama initiateSpotifyAuth
//   - data-testid="spotify-oauth-error-message-<reason>"
//
// Mock initiateSpotifyAuth para isolar comportamento do dialog.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/spotify/auth', () => ({
  initiateSpotifyAuth: vi.fn(async () => ({
    accessToken: 'AT',
    expiresIn: 3600,
    displayName: 'Tester',
  })),
}));

function setLocation(search: string) {
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      ...window.location,
      search,
      origin: 'http://localhost:3000',
      pathname: '/spotify-callback',
      href: `http://localhost:3000/spotify-callback${search}`,
      hash: '',
    },
  });
}

async function loadDialog() {
  const mod: any = await import('@/components/audio-player/SpotifyOAuthErrorDialog');
  return mod.SpotifyOAuthErrorDialog;
}

async function loadCallbackPage() {
  const mod: any = await import('@/pages/spotify-callback');
  return mod.default ?? mod.SpotifyCallbackPage;
}

describe('<SpotifyOAuthErrorDialog> RF-06.2', () => {
  it('reason=access_denied -> mensagem PT-BR "voce cancelou a autorizacao"', async () => {
    const Dialog = await loadDialog();
    render(<Dialog open={true} reason="access_denied" onOpenChange={() => {}} />);
    expect(screen.getByTestId('spotify-oauth-error-dialog')).toBeInTheDocument();
    const msg = screen.getByTestId('spotify-oauth-error-message-access_denied');
    expect((msg.textContent ?? '').toLowerCase()).toMatch(/cancel/);
  });

  it('reason=state_mismatch -> "Sessao expirada"', async () => {
    const Dialog = await loadDialog();
    render(<Dialog open={true} reason="state_mismatch" onOpenChange={() => {}} />);
    const msg = screen.getByTestId('spotify-oauth-error-message-state_mismatch');
    expect((msg.textContent ?? '').toLowerCase()).toMatch(/sess[aã]o expirada/);
  });

  it('reason=invalid_grant -> "Token Spotify invalido. Reconecte."', async () => {
    const Dialog = await loadDialog();
    render(<Dialog open={true} reason="invalid_grant" onOpenChange={() => {}} />);
    const msg = screen.getByTestId('spotify-oauth-error-message-invalid_grant');
    expect((msg.textContent ?? '').toLowerCase()).toMatch(/token.*invalid|invalid.*token|reconect/);
  });

  it('reason=server_error -> "Erro do servidor Spotify"', async () => {
    const Dialog = await loadDialog();
    render(<Dialog open={true} reason="server_error" onOpenChange={() => {}} />);
    const msg = screen.getByTestId('spotify-oauth-error-message-server_error');
    expect((msg.textContent ?? '').toLowerCase()).toMatch(/servidor.*spotify|spotify.*servidor/);
  });

  it('reason=unknown ou ausente -> "Erro inesperado" default', async () => {
    const Dialog = await loadDialog();
    render(<Dialog open={true} reason={'unknown_reason' as any} onOpenChange={() => {}} />);
    // Aceita testid baseado no reason ou um generic.
    const fallback =
      screen.queryByTestId('spotify-oauth-error-message-unknown_reason') ??
      screen.queryByTestId('spotify-oauth-error-message-default');
    expect(fallback).toBeTruthy();
    expect((fallback!.textContent ?? '').toLowerCase()).toMatch(/inesperado|desconhecido/);
  });

  it('botao "Reconectar" data-testid + chama initiateSpotifyAuth', async () => {
    const Dialog = await loadDialog();
    const auth = await import('@/lib/spotify/auth');
    const initiateSpy = vi.mocked(auth.initiateSpotifyAuth);
    initiateSpy.mockClear();

    render(<Dialog open={true} reason="access_denied" onOpenChange={() => {}} />);
    const btn = screen.getByTestId('spotify-oauth-reconnect-button');
    fireEvent.click(btn);
    expect(initiateSpy).toHaveBeenCalled();
  });

  it('botao "Cancelar" data-testid + chama onOpenChange(false)', async () => {
    const Dialog = await loadDialog();
    const onOpenChange = vi.fn();
    render(<Dialog open={true} reason="access_denied" onOpenChange={onOpenChange} />);
    const btn =
      screen.queryByTestId('spotify-oauth-cancel-button') ??
      screen.queryByText(/cancelar/i);
    expect(btn).toBeTruthy();
    fireEvent.click(btn as any);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('spotify-callback page — restore + error rendering (RF-06)', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {}
  });

  it('?error=access_denied -> renderiza SpotifyOAuthErrorDialog', async () => {
    setLocation('?error=access_denied');
    const Page = await loadCallbackPage();
    render(<Page />);
    // Aceita dialog OR mensagem in-page (implementer flexivel).
    const dialog = screen.queryByTestId('spotify-oauth-error-dialog');
    const inPage = (document.body.textContent ?? '').toLowerCase();
    expect(dialog !== null || inPage.includes('cancel')).toBe(true);
  });

  it('?error=state_mismatch -> renderiza dialog com mensagem expirada', async () => {
    setLocation('?error=state_mismatch');
    const Page = await loadCallbackPage();
    render(<Page />);
    const text = (document.body.textContent ?? '').toLowerCase();
    expect(text).toMatch(/sess[aã]o expirada|expirou|invalid|tente novamente/);
  });

  it('?error=invalid_grant -> mensagem token Spotify invalido', async () => {
    setLocation('?error=invalid_grant');
    const Page = await loadCallbackPage();
    render(<Page />);
    const text = (document.body.textContent ?? '').toLowerCase();
    expect(text).toMatch(/token.*spotify|spotify.*invalid|reconect/);
  });

  it('?error=server_error -> mensagem servidor Spotify', async () => {
    setLocation('?error=server_error');
    const Page = await loadCallbackPage();
    render(<Page />);
    const text = (document.body.textContent ?? '').toLowerCase();
    expect(text).toMatch(/servidor.*spotify|spotify.*servidor|erro.*servidor/);
  });

  it('sucesso (code+state, sem error) -> NAO renderiza error dialog', async () => {
    setLocation('?code=AC&state=ST');
    const Page = await loadCallbackPage();
    render(<Page />);
    expect(screen.queryByTestId('spotify-oauth-error-dialog')).toBeNull();
  });

  it('snapshot fresh em sessionStorage + sucesso (sem window.opener) -> restore scrollY', async () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    sessionStorage.setItem(
      'spotify_oauth_snapshot',
      JSON.stringify({
        activeTrackId: 'L1',
        scrollY: 850,
        queueVersion: 7,
        timestamp: Date.now(),
        // HIGH-3 + HIGH-4 (ADR-194): snapshot tem `pathname`, NAO `authUrl`.
        pathname: '/',
      }),
    );
    setLocation('?code=AC&state=ST');
    // window.opener = null indica fluxo redirect (nao popup).
    Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });

    const Page = await loadCallbackPage();
    render(<Page />);

    // Aceita restore sincrono ou em setTimeout(100).
    await new Promise((r) => setTimeout(r, 200));
    // Pode usar scrollTo(0, 850) OR scrollTo({ top: 850 })
    expect(scrollSpy).toHaveBeenCalled();
  });
});
