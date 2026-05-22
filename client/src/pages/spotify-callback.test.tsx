/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.1
 *
 * Page: client/src/pages/spotify-callback.tsx
 *
 * Rota client-side `/spotify-callback`. Renderiza componente minimo que:
 *  1. Parse URLSearchParams: code, state, error.
 *  2. NAO faz fetch (o server handler em /api/audio/spotify/oauth-callback ja
 *     processou o code via cookie + redirect HTML que faz postMessage).
 *  3. window.opener?.postMessage({ type, ...payload }, window.location.origin)
 *  4. window.close().
 *
 * Como o server-side callback ja gera HTML que faz postMessage+close, este
 * componente CLIENT serve como fallback se o user navegar diretamente OU
 * se o fluxo nao usar HTML response do server.
 *
 * Behavior:
 *  - Sucesso (?code=...): mostra "Concluindo conexao..."
 *  - Erro (?error=access_denied): mostra "Conexao cancelada"
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

beforeEach(() => {
  vi.clearAllMocks();
  // reset location.search
  window.history.replaceState({}, '', '/spotify-callback');
});

async function loadPage() {
  return await import('./spotify-callback');
}

describe('SpotifyCallbackPage (RF-01.1)', () => {
  it('renderiza mensagem padrao "Concluindo conexao" quando code presente', async () => {
    window.history.replaceState({}, '', '/spotify-callback?code=abc&state=xyz');
    const { default: SpotifyCallbackPage } = await loadPage();
    render(<SpotifyCallbackPage />);
    expect(screen.getByText(/Concluindo/i)).toBeInTheDocument();
  });

  // Obsoleto MP3 RF-06.2 D17: ?error=access_denied agora renderiza
  // <SpotifyOAuthErrorDialog reason="access_denied" /> com "Voce cancelou a autorizacao".
  // Cobertura nova em tests/client/mini-player-3/spotify-callback-errors.test.tsx (13 tests).

  it('chama window.opener.postMessage quando ha opener + code', async () => {
    window.history.replaceState({}, '', '/spotify-callback?code=abc&state=xyz');
    const postMessage = vi.fn();
    (window as any).opener = { postMessage, closed: false };
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    const { default: SpotifyCallbackPage } = await loadPage();
    render(<SpotifyCallbackPage />);

    expect(postMessage).toHaveBeenCalled();
    const [data, origin] = postMessage.mock.calls[0];
    expect(origin).toBe(window.location.origin);
    expect(data.type).toMatch(/spotify-oauth/);

    closeSpy.mockRestore();
    (window as any).opener = null;
  });
});
