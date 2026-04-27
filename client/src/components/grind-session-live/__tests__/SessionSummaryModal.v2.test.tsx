/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-08: SessionSummaryModal recebe sessionId (correcao P3)
 *  - RF-12: mapeamento de erros cooldown 400/401/404/409/429/5xx -> mensagens PT-BR
 *  - P4 / F-06: botao "Continuar Sessao" REMOVIDO pos-PUT
 *
 * Modulo EXISTE — Implementer DEVE:
 *  - Endurecer SessionSummaryModal.startCooldown com early return + toast quando
 *    summaryData.sessionId for falsy (NAO chama POST com fallback bugado).
 *  - Mapear codigos de erro do POST /api/cooldown-logs em mensagens PT-BR.
 *  - REMOVER botao "Continuar Sessao".
 *  - Manter botao "Fechar" quando cooldownAlreadyDone=true.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

const setLocationMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/grind-session-live', setLocationMock],
}));

import SessionSummaryModal from '../SessionSummaryModal';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseSummary = {
  volume: 5,
  invested: 50,
  profit: 100,
  roi: 50,
  fts: 1,
  wins: 0,
  bestResult: null,
  mentalAverages: {
    focus: 8,
    energy: 7,
    confidence: 8,
    emotionalIntelligence: 8,
    interference: 2,
  },
  objectiveStatus: 'completed',
  sessionTime: '02:00',
  objectives: '',
  quickNotes: [],
  endTime: '2026-04-26T20:00:00Z',
  abiMed: 10,
  duration: 120,
  focoMedio: 8,
  inteligenciaEmocionalMedia: 8,
  interferenciasMedia: 2,
  sessionId: 'ses_1', // P3 fix
};

const baseProps = {
  show: true,
  summaryData: baseSummary as any,
  finalNotes: '',
  setFinalNotes: vi.fn(),
  onContinueSession: vi.fn(),
  onEndSession: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  setLocationMock.mockClear();
});

// =============================================================================
// RF-08: sessionId guard (P3 fix bug P2 cooldown 400)
// =============================================================================

describe('SessionSummaryModal v2 — sessionId presente (RF-08, fix bug P3)', () => {
  it('startCooldown com sessionId valido -> POST com {sessionId, mode}', async () => {
    apiRequestMock.mockResolvedValue({ id: 'cd_1', mode: 'quick' });
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const flat = JSON.stringify(apiRequestMock.mock.calls);
    expect(flat).toContain('cooldown-logs');
    expect(flat).toContain('ses_1');
    expect(flat).toMatch(/quick/i);
  });

  it('startCooldown full com sessionId valido -> POST {sessionId, mode:"full"}', async () => {
    apiRequestMock.mockResolvedValue({ id: 'cd_2', mode: 'full' });
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-full'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const flat = JSON.stringify(apiRequestMock.mock.calls);
    expect(flat).toMatch(/full/i);
    expect(flat).toContain('ses_1');
  });
});

describe('SessionSummaryModal v2 — sessionId ausente -> early return + toast (RF-08)', () => {
  it('summaryData.sessionId undefined -> NAO chama POST cooldown-logs', async () => {
    const noSessionSummary = { ...baseSummary, sessionId: undefined };
    render(wrap(<SessionSummaryModal {...baseProps} summaryData={noSessionSummary as any} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    // Pequeno delay para garantir que async nao chamou
    await new Promise((r) => setTimeout(r, 10));
    const flat = JSON.stringify(apiRequestMock.mock.calls);
    expect(flat).not.toContain('cooldown-logs');
  });

  it('summaryData.sessionId undefined -> toast PT-BR informando "Sessao invalida ou expirada"', async () => {
    const noSessionSummary = { ...baseSummary, sessionId: undefined };
    render(wrap(<SessionSummaryModal {...baseProps} summaryData={noSessionSummary as any} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const messages = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(messages.toLowerCase()).toMatch(/sess[aã]o\s+(inv[aá]lida|expirada|n[aã]o\s+identificada)/);
  });
});

// =============================================================================
// RF-12: mapeamento de erros HTTP -> mensagens PT-BR
// =============================================================================

function makeFetchError(status: number, body: any = {}) {
  const err: any = new Error('http error');
  err.response = { status, data: body };
  return err;
}

describe('SessionSummaryModal v2 — RF-12 erros do cooldown-logs mapeados em PT-BR', () => {
  it('400 sessionId -> "Sessao invalida ou expirada. Recarregue a pagina."', async () => {
    apiRequestMock.mockRejectedValue(
      makeFetchError(400, { code: 'invalid_session', message: 'sessionId required' }),
    );
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const flat = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(flat.toLowerCase()).toMatch(/sess[aã]o\s+(inv[aá]lida|expirada).*recarregue/);
  });

  it('401 -> "Sessao expirada. Faca login novamente." + redirect /login', async () => {
    apiRequestMock.mockRejectedValue(makeFetchError(401, { message: 'unauthorized' }));
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-full'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const flat = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(flat.toLowerCase()).toMatch(/sess[aã]o\s+expirada.*login|fa[cç]a\s+login/);

    // Redirect /login chamado eventualmente (3s segundo spec — usamos waitFor com tempo)
    await waitFor(
      () => {
        const calls = setLocationMock.mock.calls.map((c) => c[0]).join(' ');
        expect(calls).toContain('/login');
      },
      { timeout: 4000 },
    );
  });

  it('404 -> "Sessao nao encontrada..." + redirect /grind', async () => {
    apiRequestMock.mockRejectedValue(makeFetchError(404, { message: 'not found' }));
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const flat = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(flat.toLowerCase()).toMatch(/sess[aã]o\s+n[aã]o\s+encontrada/);
  });

  it('409 -> toast "Cool-down ja iniciado..." (RF-12)', async () => {
    apiRequestMock.mockRejectedValue(
      makeFetchError(409, { code: 'already_started', existingId: 'cd_existing' }),
    );
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-full'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const flat = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(flat.toLowerCase()).toMatch(/cool-down\s+j[aá]\s+iniciado/);
  });

  it('429 -> "Muitas tentativas. Aguarde 1 minuto e tente novamente."', async () => {
    apiRequestMock.mockRejectedValue(makeFetchError(429, { message: 'rate limited' }));
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const flat = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(flat.toLowerCase()).toMatch(/muitas\s+tentativas|aguarde/);
  });

  it('500 -> "Erro no servidor. Sua sessao foi salva..."', async () => {
    apiRequestMock.mockRejectedValue(makeFetchError(500, { message: 'internal' }));
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const flat = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(flat.toLowerCase()).toMatch(/erro\s+no\s+servidor|sess[aã]o\s+foi\s+salva/);
  });

  it('Network error (fetch reject sem response) -> "Sem conexao. Verifique sua internet..."', async () => {
    apiRequestMock.mockRejectedValue(new Error('Failed to fetch'));
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const flat = toastMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(flat.toLowerCase()).toMatch(/sem\s+conex[aã]o|verifique.*internet/);
  });
});

// =============================================================================
// P4 / F-06: botao "Continuar Sessao" removido pos-PUT
// =============================================================================

describe('SessionSummaryModal v2 — Botao "Continuar Sessao" removido (P4/F-06)', () => {
  it('NAO renderiza texto "Continuar Sessao" no DOM apos PUT', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    // Spec RF-01 (P4): 3 CTAs apos endSessionMutation, sem "Continuar Sessao".
    expect(document.body.textContent ?? '').not.toMatch(/continuar\s+sess[aã]o/i);
  });
});

// =============================================================================
// cooldownAlreadyDone -> apenas botao "Fechar"
// =============================================================================

describe('SessionSummaryModal v2 — cooldownAlreadyDone=true mostra apenas Fechar (RF-01)', () => {
  it('1 botao "Fechar" + nenhum CTA cooldown', () => {
    const completed = { ...baseSummary, cooldownCompleted: true } as any;
    render(wrap(<SessionSummaryModal {...baseProps} summaryData={completed} />));

    expect(screen.queryByTestId('summary-modal-cta-quick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-modal-cta-full')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-modal-cta-skip')).toBeInTheDocument();
    // Botao skip vira "Fechar" quando cooldownAlreadyDone
    const skipBtn = screen.getByTestId('summary-modal-cta-skip');
    expect(skipBtn.textContent ?? '').toMatch(/fechar/i);
  });
});
