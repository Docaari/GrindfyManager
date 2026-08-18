/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Feature: Ajuste manual do resultado final da sessao (grind-live)
 * Spec:  Docs/specs/grind-live-manual-session-result.md (RF-06)
 * ADR:   Docs/architecture/decisions/244-grind-live-manual-session-result.md (D2)
 *
 * Como D2 dispensa coluna de auditoria, o UNICO rastro do valor declarado e
 * este evento. Se ele nao sair — ou sair com numero errado — a pergunta de
 * produto ("com que frequencia o calculo automatico erra, e por quanto?") fica
 * sem resposta para sempre, porque o passado nao e recuperavel (ADR §Confianca).
 *
 * Contrato do evento (RF-06):
 *   nome: 'session_result_manual_override'
 *   payload: {
 *     sessionId, computedProfitUsd, manualProfitUsd, deltaUsd, investedUsd,
 *     roiComputed, roiManual, source: 'wallet' | 'tournaments'
 *   }
 *   - emitido no clique de "Finalizar Sessao", SOMENTE com ajuste ativo;
 *   - via o `safeTrack` ja existente no modal (nunca lanca para o usuario);
 *   - `deltaUsd = manualProfitUsd - computedProfitUsd`;
 *   - `source` = qual card servia de base ('wallet' quando a secao Bancas esta
 *     visivel, 'tournaments' caso contrario).
 *
 * Notas tecnicas: componentes via `await import(...)` (lessons #14/#26); este
 * arquivo nao mistura estilos de import (lesson #38); `apiRequest` devolve JSON
 * ja parseado (lesson #13).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: any[]) => trackMock(...args),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/grind/active', vi.fn()],
  Link: ({ children }: any) => children,
}));

const EVENT = 'session_result_manual_override';

const baseSummary = {
  sessionId: 'ses_1',
  volume: 10,
  invested: 1000,
  profit: 180,
  roi: 18,
  fts: 2,
  wins: 1,
  bestResult: null,
  breaksRecorded: 1,
  mentalAverages: {
    focus: 8,
    energy: 7,
    confidence: 8,
    emotionalIntelligence: 8,
    interference: 2,
  },
  objectiveStatus: 'completed',
  sessionTime: '04:00',
  objectives: '',
  quickNotes: [],
  endTime: '2026-08-01T22:00:00Z',
  abiMed: 100,
  duration: 240,
};

const walletUsd = {
  walletId: 'w_acr',
  name: 'ACR Main',
  platform: 'ACR',
  nativeCurrency: 'USD',
  expectedPreviousBalance: 1000,
  expectedDelta: 180,
  expectedClosingBalance: 1180,
  hadActivityInSession: true,
  contributingTournaments: ['st_1'],
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadModal() {
  const mod = await import('../SessionSummaryModal');
  return mod.default;
}

function makeProps(overrides: any = {}) {
  return {
    show: true,
    summaryData: baseSummary,
    finalNotes: '',
    setFinalNotes: vi.fn(),
    onContinueSession: vi.fn(),
    onEndSession: vi.fn(),
    bankrollManagementEnabled: true,
    reconcilableWallets: [],
    missingPlatforms: [],
    usdConversionRates: { BRL: 5.2 },
    manualResultEnabled: true,
    ...overrides,
  };
}

function openAndType(value: string) {
  fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
  fireEvent.change(screen.getByTestId('manual-session-result-input'), {
    target: { value },
  });
}

function overrideEvents() {
  return trackMock.mock.calls.filter((c: any[]) => c[0] === EVENT);
}

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({});
  toastMock.mockClear();
  // mockReset (nao mockClear): alguns testes instalam uma implementacao que
  // lanca; sem reset ela vazaria para os testes seguintes.
  trackMock.mockReset();
});

// =============================================================================
// RF-06 — quando NAO emitir
// =============================================================================

describe('RF-06 — evento nao sai quando nao ha ajuste', () => {
  it('finalizar sem tocar no campo NAO emite session_result_manual_override', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(wrap(<Modal {...makeProps({ onEndSession })} />));
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(overrideEvents().length).toBe(0);
  });

  it('abrir o campo e clicar em "Desfazer ajuste" antes de finalizar NAO emite', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps()} />));
    openAndType('300');
    fireEvent.click(screen.getByTestId('manual-session-result-reset'));
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await new Promise((r) => setTimeout(r, 0));
    expect(overrideEvents().length).toBe(0);
  });

  it('preferencia OFF: nunca emite (o campo nem existe)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ manualResultEnabled: false })} />));
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await new Promise((r) => setTimeout(r, 0));
    expect(overrideEvents().length).toBe(0);
  });
});

// =============================================================================
// RF-06 — quando emitir, e com que numeros
// =============================================================================

describe('RF-06 — evento com ajuste ativo (base = torneios)', () => {
  it('emite exatamente uma vez', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
  });

  it('payload carrega o sessionId da sessao', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].sessionId).toBe('ses_1');
  });

  it('computedProfitUsd = base calculada (summaryData.profit = 180)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].computedProfitUsd).toBeCloseTo(180, 2);
  });

  it('manualProfitUsd = valor digitado (250)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].manualProfitUsd).toBe(250);
  });

  it('deltaUsd = manual - computed (250 - 180 = 70)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].deltaUsd).toBeCloseTo(70, 6);
  });

  it('deltaUsd e negativo quando o jogador corrige o numero PARA BAIXO', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('100');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].deltaUsd).toBeCloseTo(-80, 6);
  });

  it('investedUsd = base de investimento intocada (1000)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].investedUsd).toBe(1000);
  });

  it('roiManual = ROI recalculado sobre o valor digitado (25)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].roiManual).toBeCloseTo(25, 6);
  });

  it('roiComputed vem no payload (chave presente, RF-06)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(Object.keys(overrideEvents()[0][1])).toContain('roiComputed');
  });

  it('source = "tournaments" quando nao ha secao Bancas', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].source).toBe('tournaments');
  });

  it('investido 0: roiManual = null no payload (nunca 0 inventado)', async () => {
    const Modal = await loadModal();
    render(
      wrap(
        <Modal
          {...makeProps({
            reconcilableWallets: [],
            summaryData: { ...baseSummary, invested: 0, roi: 0 },
          })}
        />,
      ),
    );
    openAndType('50');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].roiManual).toBeNull();
  });
});

describe('RF-06 — evento com ajuste ativo (base = wallets)', () => {
  it('source = "wallet" quando a secao Bancas esta visivel', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />));
    openAndType('300');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].source).toBe('wallet');
  });

  it('computedProfitUsd = totalProfitUSD (delta das wallets = 180)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />));
    openAndType('300');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].computedProfitUsd).toBeCloseTo(180, 2);
  });

  it('deltaUsd usa a base de wallet (300 - 180 = 120)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />));
    openAndType('300');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(overrideEvents().length).toBe(1));
    expect(overrideEvents()[0][1].deltaUsd).toBeCloseTo(120, 2);
  });
});

// =============================================================================
// RF-06 — robustez: telemetria nunca bloqueia a finalizacao; duplo clique
// =============================================================================

describe('RF-06 — robustez', () => {
  it('safeTrack lancando NAO impede a finalizacao (onEndSession ainda roda)', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    trackMock.mockImplementation(() => {
      throw new Error('telemetry endpoint down');
    });

    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [], onEndSession })} />),
    );
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 250, roi: 25 });
  });

  it('safeTrack lancando NAO mostra toast de erro ao jogador', async () => {
    const Modal = await loadModal();
    trackMock.mockImplementation(() => {
      throw new Error('telemetry endpoint down');
    });

    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await new Promise((r) => setTimeout(r, 0));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('duplo clique em "Finalizar Sessao" emite o evento UMA unica vez (edge case da spec)', async () => {
    // O PUT ja e protegido pelo guard `isEndingRef` em GrindSessionLive; o modal
    // precisa do seu proprio guard para nao duplicar o rastro de auditoria.
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    const cta = screen.getByTestId('cta-finalize-session');
    fireEvent.click(cta);
    fireEvent.click(cta);

    await waitFor(() => expect(overrideEvents().length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 0));
    expect(overrideEvents().length).toBe(1);
  });
});
