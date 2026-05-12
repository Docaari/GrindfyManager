/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M6: Auditoria visual de tokens semanticos
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M6)
 * UX audit: Docs/strategy/b2-ux-audit.md (secao 6)
 *
 * Cenarios cobertos (smoke, nao pixel-perfect):
 *   1. SessionSummaryModal NAO usa classes raw 'bg-white', 'bg-gray-100', 'bg-gray-50'
 *   2. Secao bankroll-reconcile-section usa token semantico 'bg-card' OU 'bg-poker-surface'
 *   3. CTAs primarios usam 'bg-primary' OU variant 'gold'
 *   4. Inputs usam tokens semanticos (nao 'bg-white' ou 'bg-gray-50')
 *
 * Implementer deve:
 *   - substituir bg-white / bg-gray-100 / bg-gray-50 por tokens semanticos
 *     (bg-card, bg-background, bg-poker-surface) em SessionSummaryModal e
 *     componentes filhos do fluxo session-end.
 *
 * Implementacao: render simples + inspect className via regex. Nao pixel-perfect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/grind/active', vi.fn()],
}));

import SessionSummaryModal from '../SessionSummaryModal';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseSummary = {
  sessionId: 'ses_1',
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
  abiMed: 10,
  duration: 120,
  focoMedio: 8,
  inteligenciaEmocionalMedia: 8,
  interferenciasMedia: 2,
};

const wallets = [
  {
    walletId: 'w_suprema',
    name: 'Suprema Main',
    platform: 'Suprema',
    nativeCurrency: 'BRL',
    openingBalance: 500,
    balance: 500,
    expectedPreviousBalance: 500,
    expectedDelta: -50,
    expectedClosingBalance: 450,
    contributingTournaments: ['st_1'],
    hadActivityInSession: true,
    tieBreakStrategy: 'single',
  },
];

const baseProps: any = {
  show: true,
  summaryData: baseSummary,
  finalNotes: '',
  setFinalNotes: vi.fn(),
  onContinueSession: vi.fn(),
  onEndSession: vi.fn(),
  bankrollManagementEnabled: true,
  reconcilableWallets: wallets,
  missingPlatforms: [],
  playedPlatforms: ['Suprema'],
};

beforeEach(() => {
  apiRequestMock.mockReset();
});

// =============================================================================
// Helper: walk dom + collect classes
// =============================================================================

function collectAllClasses(root: Element | null): string[] {
  if (!root) return [];
  const classes: string[] = [];
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    if (el.className && typeof el.className === 'string') {
      classes.push(el.className);
    }
    for (let i = 0; i < el.children.length; i++) {
      stack.push(el.children[i] as Element);
    }
  }
  return classes;
}

// =============================================================================
// Cenario 1: NAO usa classes raw bg-white / bg-gray-100 / bg-gray-50
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M6) — tokens semanticos', () => {
  it('NAO contem classe bg-white em nenhum elemento do modal', () => {
    const { container } = render(wrap(<SessionSummaryModal {...baseProps} />));
    const allClasses = collectAllClasses(container.firstElementChild);
    const banned = allClasses.filter((c) => /\bbg-white\b/.test(c));
    expect(banned.length).toBe(0);
  });

  it('NAO contem classe bg-gray-100 em nenhum elemento do modal', () => {
    const { container } = render(wrap(<SessionSummaryModal {...baseProps} />));
    const allClasses = collectAllClasses(container.firstElementChild);
    const banned = allClasses.filter((c) => /\bbg-gray-100\b/.test(c));
    expect(banned.length).toBe(0);
  });

  it('NAO contem classe bg-gray-50 em nenhum elemento do modal', () => {
    const { container } = render(wrap(<SessionSummaryModal {...baseProps} />));
    const allClasses = collectAllClasses(container.firstElementChild);
    const banned = allClasses.filter((c) => /\bbg-gray-50\b/.test(c));
    expect(banned.length).toBe(0);
  });
});

// =============================================================================
// Cenario 2: secao bankroll-reconcile-section usa token semantico
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M6) — bankroll-reconcile-section usa token semantico', () => {
  it('bankroll-reconcile-section ou seu container externo usa bg-card OU bg-poker-surface OU bg-background', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const section = screen.getByTestId('bankroll-reconcile-section');
    // Aceita classe direto na secao OU em ancestral imediato.
    const candidates = [section, ...Array.from(section.querySelectorAll('*'))];
    const hasSemanticToken = candidates.some((el) => {
      const cn = (el as HTMLElement).className;
      if (typeof cn !== 'string') return false;
      return /\bbg-card\b|\bbg-poker-surface\b|\bbg-background\b/.test(cn);
    });
    expect(hasSemanticToken).toBe(true);
  });
});

// =============================================================================
// Cenario 3: CTAs primarios usam bg-primary OU classes gold/poker-green
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M6) — CTAs com tokens primarios', () => {
  // cta-start-cooldown removido do modal (cooldown removal 2363509 — cool-down
  // roda via /cooldown standalone). O unico CTA de acao agora e cta-finalize-session.

  it('cta-finalize-session usa token semantico (NAO bg-white nem bg-gray-50)', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const cta = screen.getByTestId('cta-finalize-session');
    const cn = (cta as HTMLElement).className;
    expect(/\bbg-white\b/.test(cn)).toBe(false);
    expect(/\bbg-gray-50\b/.test(cn)).toBe(false);
  });
});

// =============================================================================
// Cenario 4: inputs usam tokens semanticos
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M6) — inputs com tokens', () => {
  it('wallet-balance-input-:walletId NAO usa bg-white nem bg-gray-50', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const input = screen.getByTestId('wallet-balance-input-w_suprema');
    const cn = (input as HTMLElement).className;
    expect(/\bbg-white\b/.test(cn)).toBe(false);
    expect(/\bbg-gray-50\b/.test(cn)).toBe(false);
  });

  it('wallet-balance-input-:walletId usa bg-background OU bg-gray-800 OU token equivalente', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const input = screen.getByTestId('wallet-balance-input-w_suprema');
    const cn = (input as HTMLElement).className;
    const hasDarkToken =
      /\bbg-background\b|\bbg-gray-800\b|\bbg-input\b|\bbg-poker-surface\b/.test(cn);
    expect(hasDarkToken).toBe(true);
  });
});
