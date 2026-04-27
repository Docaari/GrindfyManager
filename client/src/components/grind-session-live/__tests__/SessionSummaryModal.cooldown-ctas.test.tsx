import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — SessionSummaryModal CTAs cool-down
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-01 + US-01/US-02/US-05)
// Sequence: Docs/architecture/flows/grind/sequence-cooldown-flow.mermaid
//
// Modulo EXISTE — Implementer DEVE adicionar 3 novos CTAs sem alterar testes
// existentes. Este arquivo verifica APENAS os adicionais (lessons #11):
//
// - summary-modal-cta-quick (Cool-down Rapido ~3min)
// - summary-modal-cta-full  (Iniciar Cool-down ~5min)
// - summary-modal-cta-skip  (Finalizar Sessao - Pular cool-down)
// - summary-modal-flag-warning (mensagem amarela quando hasFlags=true)
//
// Comportamento:
//   - hasFlags=true -> CTA full tem classe cooldown-cta-warning + msg warning
//   - hasFlags=false -> CTA full tem classe cooldown-cta-neutral + sem msg
//   - Click full -> POST /api/cooldown-logs {mode:'full'} + abre runner
//   - Click quick -> POST /api/cooldown-logs {mode:'quick'} + abre dialog
//   - Click skip -> redirect direto, sem criar
//   - Cool-down ja existe -> CTAs cooldown ESCONDIDOS
//   - "Continuar Sessao" preservado
// =============================================================================

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

import SessionSummaryModal from '../SessionSummaryModal';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseSummaryWithoutFlags = {
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
  objectives: 'objetivo da sessao',
  quickNotes: [],
  endTime: '2026-04-26T20:00:00Z',
  // Campos extras necessarios para detectRedFlags (RF-01):
  abiMed: 10,
  duration: 120, // minutos
  focoMedio: 8,
  inteligenciaEmocionalMedia: 8,
  interferenciasMedia: 2,
};

const summaryWithFlags = {
  ...baseSummaryWithoutFlags,
  profit: -100, // < -2*ABI
  focoMedio: 3, // < 4
  mentalAverages: {
    ...baseSummaryWithoutFlags.mentalAverages,
    focus: 3,
  },
};

const baseProps = {
  show: true,
  summaryData: baseSummaryWithoutFlags as any,
  finalNotes: '',
  setFinalNotes: vi.fn(),
  onContinueSession: vi.fn(),
  onEndSession: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
});

// ============================================================================
// CTAs novos presentes
// ============================================================================

describe('SessionSummaryModal - CTAs cool-down (RF-01)', () => {
  it('renderiza summary-modal-cta-quick', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.getByTestId('summary-modal-cta-quick')).toBeInTheDocument();
  });

  it('renderiza summary-modal-cta-full', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.getByTestId('summary-modal-cta-full')).toBeInTheDocument();
  });

  it('renderiza summary-modal-cta-skip (label "Finalizar Sessao" / "Pular cool-down")', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.getByTestId('summary-modal-cta-skip')).toBeInTheDocument();
  });

  it('mantem botao "Continuar Sessao" original (regressao)', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(document.body.textContent).toMatch(/continuar sess[aã]o/i);
  });
});

// ============================================================================
// Estilo adaptive: hasFlags
// ============================================================================

describe('SessionSummaryModal - sem red flags', () => {
  it('CTA full tem classe cooldown-cta-neutral', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));

    const cta = screen.getByTestId('summary-modal-cta-full');
    expect(cta.className).toContain('cooldown-cta-neutral');
    expect(cta.className).not.toContain('cooldown-cta-warning');
  });

  it('NAO renderiza summary-modal-flag-warning', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.queryByTestId('summary-modal-flag-warning')).not.toBeInTheDocument();
  });
});

describe('SessionSummaryModal - com red flags', () => {
  it('CTA full tem classe cooldown-cta-warning (amarelo)', () => {
    render(
      wrap(<SessionSummaryModal {...baseProps} summaryData={summaryWithFlags as any} />),
    );

    const cta = screen.getByTestId('summary-modal-cta-full');
    expect(cta.className).toContain('cooldown-cta-warning');
  });

  it('renderiza summary-modal-flag-warning com mensagem "fadiga/tilt"', () => {
    render(
      wrap(<SessionSummaryModal {...baseProps} summaryData={summaryWithFlags as any} />),
    );

    const warning = screen.getByTestId('summary-modal-flag-warning');
    expect(warning).toBeInTheDocument();
    expect(warning.textContent ?? '').toMatch(/fadiga|tilt|sinais/i);
  });
});

// ============================================================================
// Click handlers
// ============================================================================

describe('SessionSummaryModal - click full -> POST {mode:full} + abrir runner', () => {
  it('click no CTA full chama apiRequest com {mode: "full"}', async () => {
    apiRequestMock.mockResolvedValue({ id: 'cd_1', mode: 'full' });
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-full'));

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      expect(flat).toContain('cooldown-logs');
      expect(flat).toMatch(/full/i);
    });
  });
});

describe('SessionSummaryModal - click quick -> POST {mode:quick}', () => {
  it('click no CTA quick chama apiRequest com {mode: "quick"}', async () => {
    apiRequestMock.mockResolvedValue({ id: 'cd_2', mode: 'quick' });
    render(wrap(<SessionSummaryModal {...baseProps} />));

    fireEvent.click(screen.getByTestId('summary-modal-cta-quick'));

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      expect(flat).toContain('cooldown-logs');
      expect(flat).toMatch(/quick/i);
    });
  });
});

describe('SessionSummaryModal - click skip', () => {
  it('click no CTA skip NAO chama apiRequest cooldown-logs', () => {
    const onEndSession = vi.fn();
    render(
      wrap(<SessionSummaryModal {...baseProps} onEndSession={onEndSession} />),
    );

    fireEvent.click(screen.getByTestId('summary-modal-cta-skip'));

    const flat = JSON.stringify(apiRequestMock.mock.calls);
    expect(flat).not.toContain('cooldown-logs');
  });

  it('click skip chama onEndSession (preserva fluxo atual)', () => {
    const onEndSession = vi.fn();
    render(
      wrap(<SessionSummaryModal {...baseProps} onEndSession={onEndSession} />),
    );

    fireEvent.click(screen.getByTestId('summary-modal-cta-skip'));
    expect(onEndSession).toHaveBeenCalled();
  });
});

// ============================================================================
// Cool-down ja completado
// ============================================================================

describe('SessionSummaryModal - cool-down ja existe', () => {
  it('quando summaryData.cooldownCompleted=true, CTAs cool-down sao ocultos', () => {
    const completed = { ...baseSummaryWithoutFlags, cooldownCompleted: true } as any;
    render(wrap(<SessionSummaryModal {...baseProps} summaryData={completed} />));

    expect(screen.queryByTestId('summary-modal-cta-quick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-modal-cta-full')).not.toBeInTheDocument();
    // skip continua presente (sempre permite finalizar)
    expect(screen.queryByTestId('summary-modal-cta-skip')).toBeInTheDocument();
  });
});

// ============================================================================
// Boundary: summaryData = null nao crashea
// ============================================================================

describe('SessionSummaryModal - summaryData null/show=false', () => {
  it('show=false NAO renderiza modal', () => {
    render(wrap(<SessionSummaryModal {...baseProps} show={false} />));
    expect(screen.queryByTestId('summary-modal-cta-full')).not.toBeInTheDocument();
  });

  it('summaryData=null NAO renderiza modal', () => {
    render(wrap(<SessionSummaryModal {...baseProps} summaryData={null as any} />));
    expect(screen.queryByTestId('summary-modal-cta-full')).not.toBeInTheDocument();
  });
});
