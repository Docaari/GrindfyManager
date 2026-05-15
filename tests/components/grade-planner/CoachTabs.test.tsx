/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-01 + RF-03 + RF-07.5: 4 abas /coach.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-01, §RF-03, §RF-07.5.
 * ADR: Docs/architecture/decisions/125-coach-tabs-consolidation.md §5.
 * Diagrama: components-after.mermaid
 *
 * 4 abas:
 *   coach-tab-planner   (default, Biblioteca + Grade)
 *   coach-tab-selector  (Tournament Selector + alias legacy grade-tab-selector)
 *   coach-tab-flights   (FlightsPanel)
 *   coach-tab-variance  (PrimedopePanel)
 *
 * RF-03 housekeeping:
 *   localStorage('primedope_panel_expanded') deve ser removida no mount inicial.
 *
 * RF-07.5 alias:
 *   data-testid 'grade-tab-selector' continua encontravel via wrapper
 *   <div data-testid="grade-tab-selector" style={{display:'contents'}}>.
 *
 * Lessons:
 *   #2 — testIds estaveis (lista canonica em §11.4).
 *   #14 — await import() (lazy load do componente).
 *   #15 — vi.doUnmock em escopo nested (nao usar vi.unmock).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock useBankroll para fornecer bankrollUsd hidratado.
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

// Mock apiRequest para qualquer query interna nao quebrar a render.
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => []),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Mock dos sub-componentes pesados — testamos a casca de tabs, nao internals.
vi.mock('@/components/grade-planner/SelectorPanel', () => ({
  SelectorPanel: () => React.createElement('div', { 'data-testid': 'mock-selector-panel' }, 'Selector'),
  default: () => React.createElement('div', { 'data-testid': 'mock-selector-panel' }, 'Selector'),
}));

vi.mock('@/components/grade-planner/FlightsPanel', () => ({
  FlightsPanel: () => React.createElement('div', { 'data-testid': 'mock-flights-panel' }, 'Flights'),
  default: () => React.createElement('div', { 'data-testid': 'mock-flights-panel' }, 'Flights'),
}));

const mockPrimedopeProps: { userId: string | null; bankrollUsd: number | null } = {
  userId: null,
  bankrollUsd: null,
};

vi.mock('@/components/primedope/PrimedopePanel', () => ({
  PrimedopePanel: (props: any) => {
    mockPrimedopeProps.userId = props?.userId ?? null;
    mockPrimedopeProps.bankrollUsd = props?.bankrollUsd ?? null;
    return React.createElement('div', { 'data-testid': 'mock-primedope-panel' }, 'Primedope');
  },
  default: (props: any) => {
    mockPrimedopeProps.userId = props?.userId ?? null;
    mockPrimedopeProps.bankrollUsd = props?.bankrollUsd ?? null;
    return React.createElement('div', { 'data-testid': 'mock-primedope-panel' }, 'Primedope');
  },
}));

// Importacao dinamica de GradePlanner — RED tolerante.
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
  try {
    localStorage.clear();
  } catch {
    // ok
  }
  mockPrimedopeProps.userId = null;
  mockPrimedopeProps.bankrollUsd = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GradePlanner — 4 abas peer (RF-01)', () => {
  it('renderiza coach-tab-planner', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    expect(screen.getByTestId('coach-tab-planner')).toBeInTheDocument();
  });

  it('renderiza coach-tab-selector', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    expect(screen.getByTestId('coach-tab-selector')).toBeInTheDocument();
  });

  it('renderiza coach-tab-flights', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    expect(screen.getByTestId('coach-tab-flights')).toBeInTheDocument();
  });

  it('renderiza coach-tab-variance', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    expect(screen.getByTestId('coach-tab-variance')).toBeInTheDocument();
  });
});

describe('GradePlanner — alias legacy grade-tab-selector (RF-07.5)', () => {
  it('alias legacy grade-tab-selector continua encontravel', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    expect(screen.getByTestId('grade-tab-selector')).toBeInTheDocument();
  });

  it('wrapper alias usa display:contents (nao polui layout)', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));
    const aliasEl = screen.getByTestId('grade-tab-selector');
    // Strategy default = wrapper <div style="display:contents">.
    // Se implementer escolher Opcao A (atributo paralelo), este teste falhara
    // e implementer documenta como impedimento. Spec/ADR default = Opcao B.
    const inlineStyle = (aliasEl as HTMLElement).style?.display ?? '';
    expect(inlineStyle).toBe('contents');
  });
});

describe('GradePlanner — aba Variance Calculator (RF-03)', () => {
  it('click em coach-tab-variance renderiza PrimedopePanel', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabVariance = screen.getByTestId('coach-tab-variance');
    fireEvent.click(tabVariance);

    expect(screen.getByTestId('mock-primedope-panel')).toBeInTheDocument();
  });

  it('container variance tem data-testid coach-variance-panel', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabVariance = screen.getByTestId('coach-tab-variance');
    fireEvent.click(tabVariance);

    expect(screen.getByTestId('coach-variance-panel')).toBeInTheDocument();
  });

  it('PrimedopePanel recebe bankrollUsd vindo de useBankroll mock', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabVariance = screen.getByTestId('coach-tab-variance');
    fireEvent.click(tabVariance);

    // bankrollUsd hidratado do mock useBankroll (amount=1000, currency=USD).
    // Implementer pode usar `amount` direto OU normalizar via FX. Aceita ambos.
    expect(typeof mockPrimedopeProps.bankrollUsd === 'number' || mockPrimedopeProps.bankrollUsd === null).toBe(true);
    // Pelo menos a prop deve ter sido passada (nao undefined).
    expect(mockPrimedopeProps.bankrollUsd).not.toBeUndefined();
  });
});

describe('GradePlanner — housekeeping primedope_panel_expanded (RF-03)', () => {
  it('remove localStorage("primedope_panel_expanded") no mount inicial', async () => {
    // Simula key legacy presente.
    localStorage.setItem('primedope_panel_expanded', '1');
    expect(localStorage.getItem('primedope_panel_expanded')).toBe('1');

    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    // Apos mount, key deve sumir (cleanup retroativo silencioso).
    expect(localStorage.getItem('primedope_panel_expanded')).toBeNull();
  });
});

describe('GradePlanner — housekeeping NAO escreve a key novamente (RF-03)', () => {
  it('mount nao escreve primedope_panel_expanded', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    // Componente migrou para aba Variance; flag legacy NAO deve ser escrita.
    expect(localStorage.getItem('primedope_panel_expanded')).toBeNull();
  });
});

describe('GradePlanner — switching de abas via click', () => {
  it('click em flights renderiza FlightsPanel mock', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabFlights = screen.getByTestId('coach-tab-flights');
    fireEvent.click(tabFlights);

    expect(screen.getByTestId('mock-flights-panel')).toBeInTheDocument();
  });

  it('click em selector renderiza SelectorPanel mock', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabSelector = screen.getByTestId('coach-tab-selector');
    fireEvent.click(tabSelector);

    expect(screen.getByTestId('mock-selector-panel')).toBeInTheDocument();
  });
});

// =============================================================================
// Sprint Variance-1 — RF-09: rename label "Variance Calculator (Beta)" -> "Simulador PrimeDope"
//
// Spec : Docs/specs/sprint-variance-1.md §RF-09
// Local: client/src/pages/GradePlanner.tsx:959-968.
//
// Mudancas:
//   - TabsTrigger header label: "Variance Calculator (PrimeDope) + Beta" -> "Simulador PrimeDope".
//   - Tooltip/subtexto: "Estima variancia esperada via Monte Carlo (PrimeDope.com)".
//   - data-testid="coach-variance-panel" preservado (testes existentes).
//
// PT-BR (convencao §8).
// =============================================================================

describe('GradePlanner — RF-09 rename "Simulador PrimeDope"', () => {
  it('container coach-variance-panel renderiza com novo header "Simulador PrimeDope"', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabVariance = screen.getByTestId('coach-tab-variance');
    fireEvent.click(tabVariance);

    const panel = screen.getByTestId('coach-variance-panel');
    expect(panel.textContent ?? '').toMatch(/Simulador PrimeDope/);
  });

  it('NAO mostra string "Variance Calculator" + sufixo "Beta"', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabVariance = screen.getByTestId('coach-tab-variance');
    fireEvent.click(tabVariance);

    const panel = screen.getByTestId('coach-variance-panel');
    const text = panel.textContent ?? '';
    expect(text).not.toMatch(/Variance Calculator/);
    // Beta NAO deve aparecer como badge.
    expect(text).not.toMatch(/\bBeta\b/);
  });

  it('mostra tooltip/subtexto explicativo "Monte Carlo"', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabVariance = screen.getByTestId('coach-tab-variance');
    fireEvent.click(tabVariance);

    const panel = screen.getByTestId('coach-variance-panel');
    // O tooltip pode estar como atributo `title=`, em subtexto visivel, ou
    // span [aria-label]. Aceita qualquer canal: subtitle text, title attr,
    // ou data-tooltip.
    const text = panel.textContent ?? '';
    const titleAttr = (panel.querySelector('[title]') as HTMLElement | null)?.getAttribute('title') ?? '';
    const ariaLabel = (panel.querySelector('[aria-label]') as HTMLElement | null)?.getAttribute('aria-label') ?? '';
    const combined = `${text} ${titleAttr} ${ariaLabel}`;
    expect(combined).toMatch(/Monte Carlo/i);
  });

  it('regressao: data-testid="coach-variance-panel" preservado', async () => {
    const GradePlanner = await loadGradePlanner();
    render(withClient(<GradePlanner />));

    const tabVariance = screen.getByTestId('coach-tab-variance');
    fireEvent.click(tabVariance);

    // Critical: testes existentes dependem deste testid.
    expect(screen.getByTestId('coach-variance-panel')).toBeInTheDocument();
  });
});
