/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Variance-1 — RF-06 (propagar profileLetter + dayOfWeek ao PrimedopePanel)
 *
 * Spec : Docs/specs/sprint-variance-1.md §RF-06
 * Deps : server/services/primedopeBucketsPrefill.ts (ja existente).
 *
 * Hoje GradePlanner.tsx:971-974 passa apenas userId + bankrollUsd para
 * PrimedopePanel. Spec exige propagar profileLetter (perfil da grade ativa) e
 * dayOfWeek (helper getTodayDayOfWeek). PrimedopePanel ja aceita as props
 * (atualmente com defaults A/0); GradePlanner deve passar valores hidratados.
 *
 * Cenarios:
 *   1. GradePlanner com profile ativo "B" + dia atual=2 -> panel recebe
 *      profileLetter='B', dayOfWeek=2.
 *   2. Prefill: PrimedopeWizard ja consome /api/primedope/buckets-prefill
 *      via useQuery automatico (ver PrimedopeWizard.tsx:70). Validamos que
 *      a requisicao parte com profileLetter + dayOfWeek corretos.
 *
 * Lessons:
 *   #14 await import() para componentes React.
 *   #28 vi.mock por path exato (PrimedopePanel).
 *   #29 QueryClientProvider obrigatorio (componente usa useQuery internamente).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks de dependencias pesadas
// =============================================================================

vi.mock('@/hooks/useBankroll', () => ({
  useBankroll: () => ({
    data: {
      configured: true,
      amount: 1000,
      currency: 'USD',
      maxBuyInUSD: 30,
    },
    isLoading: false,
  }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => []),
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('@/components/grade-planner/SelectorPanel', () => ({
  SelectorPanel: () => React.createElement('div', { 'data-testid': 'mock-selector-panel' }, 'Selector'),
  default: () => React.createElement('div', { 'data-testid': 'mock-selector-panel' }, 'Selector'),
}));

vi.mock('@/components/grade-planner/FlightsPanel', () => ({
  FlightsPanel: () => React.createElement('div', { 'data-testid': 'mock-flights-panel' }, 'Flights'),
  default: () => React.createElement('div', { 'data-testid': 'mock-flights-panel' }, 'Flights'),
}));

// Captura as props recebidas pelo PrimedopePanel.
const capturedPanelProps: {
  userId: string | null;
  bankrollUsd: number | null;
  profileLetter: any;
  dayOfWeek: any;
} = { userId: null, bankrollUsd: null, profileLetter: null, dayOfWeek: null };

vi.mock('@/components/primedope/PrimedopePanel', () => ({
  PrimedopePanel: (props: any) => {
    capturedPanelProps.userId = props?.userId ?? null;
    capturedPanelProps.bankrollUsd = props?.bankrollUsd ?? null;
    capturedPanelProps.profileLetter = props?.profileLetter ?? null;
    capturedPanelProps.dayOfWeek = props?.dayOfWeek ?? null;
    return React.createElement('div', { 'data-testid': 'mock-primedope-panel' }, 'Primedope');
  },
  default: (props: any) => {
    capturedPanelProps.userId = props?.userId ?? null;
    capturedPanelProps.bankrollUsd = props?.bankrollUsd ?? null;
    capturedPanelProps.profileLetter = props?.profileLetter ?? null;
    capturedPanelProps.dayOfWeek = props?.dayOfWeek ?? null;
    return React.createElement('div', { 'data-testid': 'mock-primedope-panel' }, 'Primedope');
  },
}));

// Mock auth com user fixo.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { userPlatformId: 'USER-VARIANCE-1' },
  }),
}));

// Mock helper getTodayDayOfWeek para retornar 2 (terca).
// O helper real eh em '@/components/grade-planner/grind-cta-helpers'.
vi.mock('@/components/grade-planner/grind-cta-helpers', async () => {
  const actual: any = await vi.importActual('@/components/grade-planner/grind-cta-helpers');
  return {
    ...actual,
    getTodayDayOfWeek: () => 2, // terca
  };
});

// Mock useProfileStates para retornar grade com perfil B no dia 2.
vi.mock('@/hooks/useProfileStates', () => ({
  useProfileStates: () => ({
    data: [
      { dayOfWeek: 0, profile: 'A' },
      { dayOfWeek: 1, profile: 'A' },
      { dayOfWeek: 2, profile: 'B' }, // terca = B
      { dayOfWeek: 3, profile: 'B' },
      { dayOfWeek: 4, profile: 'C' },
      { dayOfWeek: 5, profile: 'C' },
      { dayOfWeek: 6, profile: 'OFF' },
    ],
    isLoading: false,
  }),
  useUpdateProfileState: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

async function loadGradePlanner() {
  const mod: any = await import('@/pages/GradePlanner');
  return (mod.default ?? mod.GradePlanner) as React.FC<any>;
}

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  cleanup();
  capturedPanelProps.userId = null;
  capturedPanelProps.bankrollUsd = null;
  capturedPanelProps.profileLetter = null;
  capturedPanelProps.dayOfWeek = null;
  try { localStorage.clear(); } catch {}
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Cenario 1 — profileLetter + dayOfWeek propagados ao panel
// =============================================================================

describe('GradePlanner — RF-06 propagar profileLetter + dayOfWeek ao PrimedopePanel', () => {
  it('passa profileLetter="B" quando grade ativa do dia=2 e perfil B', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    // Aguarda render — o panel eh mockado, props capturadas no render inicial.
    // (Mesmo que dentro de TabsContent inativo, React renderiza children
    // por default no Radix Tabs.)
    expect(capturedPanelProps.profileLetter).toBe('B');
  });

  it('passa dayOfWeek=2 (helper getTodayDayOfWeek mock terca)', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    expect(capturedPanelProps.dayOfWeek).toBe(2);
  });

  it('userId + bankrollUsd continuam sendo passados (regressao)', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    expect(capturedPanelProps.userId).toBe('USER-VARIANCE-1');
    expect(typeof capturedPanelProps.bankrollUsd === 'number').toBe(true);
  });
});

// =============================================================================
// Cenario 2 — Prefill via PrimedopeWizard (downstream do panel)
//
// PrimedopeWizard.tsx faz useQuery em queryKey ['primedope-prefill',
// profileLetter, dayOfWeek, multiplier] e GET
// /api/primedope/buckets-prefill?profileLetter=X&dayOfWeek=Y.
//
// Como o PrimedopePanel real esta MOCKADO neste teste, validamos so o
// contrato de propagacao das props. Tests do prefill em si rodam em
// PrimedopePanel.test.tsx (existente).
// =============================================================================

describe('GradePlanner — RF-06 contrato com PrimedopeWizard (prefill)', () => {
  it('panel recebe profileLetter + dayOfWeek -> wizard tem inputs para useQuery prefill', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    // Contrato: ambos definidos e nao-nulos.
    expect(capturedPanelProps.profileLetter).not.toBeNull();
    expect(capturedPanelProps.dayOfWeek).not.toBeNull();
    // Tipo correto para passar adiante ao Wizard.
    expect(['A', 'B', 'C'].includes(capturedPanelProps.profileLetter)).toBe(true);
    expect(typeof capturedPanelProps.dayOfWeek === 'number').toBe(true);
    expect(capturedPanelProps.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(capturedPanelProps.dayOfWeek).toBeLessThanOrEqual(6);
  });
});
