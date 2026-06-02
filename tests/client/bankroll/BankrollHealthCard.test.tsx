/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase D #8 — Painel BRM/RoR ao vivo
 *
 * Spec : Docs/specs/sprint-fase-d-brm-ror-2026-06-02.md (RF-05)
 * ADR  : 236 (D-7 BankrollHealthCard no /bankroll, useQuery isolado)
 *
 * Componente sob teste: client/src/components/bankroll/BankrollHealthCard.tsx
 *
 * Cobertura (4 estados + numeros + badge + isolamento):
 *   - ok: card completo, mostra RoR% + classificacao badge, sem aviso.
 *   - low: card + aviso "amostra pequena", NAO esconde o numero.
 *   - none: empty-state "importe torneios" + CTA upload.
 *   - no_bankroll: empty-state "configure banca".
 *   - badge de classificacao reflete cor por estado (healthy/warning/risky).
 *   - useQuery isolado: montar standalone NAO derruba (lesson #29).
 *   - loading → skeleton.
 *
 * data-testid (lesson #2 — estaveis):
 *   bankroll-health-card, bankroll-health-empty, bankroll-health-low-sample,
 *   bankroll-health-ror, bankroll-health-classification.
 *
 * Convencao: await import() (NAO require) p/ componente React (lesson #14/#26/#38).
 *
 * Status RED: BankrollHealthCard.tsx NAO existe → loadCard() retorna null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// vi.hoisted — useQuery mockavel (lesson #14) + apiRequest stub.
// ---------------------------------------------------------------------------
const { useQueryMock, apiRequestMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeHealth(over: Partial<any> = {}) {
  return {
    bankrollUsd: 5000,
    roiMean: 0.1,
    stdDev: 7200,
    riskOfRuinPct: 3.2,
    classification: 'healthy',
    dataSufficiency: 'ok',
    sampleSize: 300,
    bisOfMargin: 250,
    groupsUsed: 1,
    ...over,
  };
}

/** Faz useQuery devolver o estado pedido. */
function mockQuery(state: { data?: any; isLoading?: boolean; isError?: boolean }) {
  useQueryMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    error: state.isError ? new Error('boom') : null,
  });
}

async function loadCard(): Promise<any | null> {
  try {
    // Caminho em variavel + @vite-ignore: evita o static import-analysis do Vite
    // hard-falhar na red phase quando o componente ainda nao existe (padrao do
    // DrawdownCard.test.tsx irmao). Resolve via alias @/.
    const p = '@/components/bankroll/BankrollHealthCard';
    const mod: any = await import(/* @vite-ignore */ p);
    return mod.BankrollHealthCard ?? mod.default ?? null;
  } catch {
    return null;
  }
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue(makeHealth());
});

// =============================================================================
// Estado ok
// =============================================================================
describe('BankrollHealthCard — estado ok', () => {
  it('renderiza card com data-testid="bankroll-health-card"', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth() });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    expect(screen.getByTestId('bankroll-health-card')).toBeInTheDocument();
  });

  it('mostra RoR% via data-testid="bankroll-health-ror"', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ riskOfRuinPct: 3.2 }) });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    const ror = screen.getByTestId('bankroll-health-ror');
    expect(ror).toBeInTheDocument();
    expect(ror.textContent).toMatch(/3[.,]2/);
  });

  it('mostra classificacao via data-testid="bankroll-health-classification"', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ classification: 'healthy' }) });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    expect(screen.getByTestId('bankroll-health-classification')).toBeInTheDocument();
  });

  it('estado ok NAO mostra aviso de amostra pequena', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ dataSufficiency: 'ok' }) });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    expect(screen.queryByTestId('bankroll-health-low-sample')).toBeNull();
  });
});

// =============================================================================
// Estado low (amostra pequena — RoR mostrado COM aviso, nao esconde) #11
// =============================================================================
describe('BankrollHealthCard — estado low', () => {
  it('low → card + aviso bankroll-health-low-sample visivel', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ dataSufficiency: 'low', sampleSize: 50 }) });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    expect(screen.getByTestId('bankroll-health-card')).toBeInTheDocument();
    expect(screen.getByTestId('bankroll-health-low-sample')).toBeInTheDocument();
  });

  it('low → NAO esconde o numero de RoR (mostra com aviso, lesson #11)', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ dataSufficiency: 'low', riskOfRuinPct: 8.1, sampleSize: 50 }) });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    expect(screen.getByTestId('bankroll-health-ror')).toBeInTheDocument();
  });
});

// =============================================================================
// Estado none (sem historico) → empty-state upload
// =============================================================================
describe('BankrollHealthCard — estado none', () => {
  it('none → empty-state bankroll-health-empty (sem card de numeros)', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ dataSufficiency: 'none', riskOfRuinPct: null, classification: null }) });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    expect(screen.getByTestId('bankroll-health-empty')).toBeInTheDocument();
    // numero de RoR NAO renderiza no empty-state
    expect(screen.queryByTestId('bankroll-health-ror')).toBeNull();
  });

  it('none → tem CTA para /upload', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ dataSufficiency: 'none', riskOfRuinPct: null }) });

    const { render, screen } = await import('@testing-library/react');
    const { container } = render(React.createElement(Card));

    const empty = screen.getByTestId('bankroll-health-empty');
    // CTA aponta para /upload (link ou texto)
    const hasUploadLink = !!container.querySelector('a[href="/upload"]');
    const mentionsImport = /import/i.test(empty.textContent ?? '');
    expect(hasUploadLink || mentionsImport).toBe(true);
  });
});

// =============================================================================
// Estado no_bankroll → empty-state banca
// =============================================================================
describe('BankrollHealthCard — estado no_bankroll', () => {
  it('no_bankroll → empty-state bankroll-health-empty', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({
      data: makeHealth({ dataSufficiency: 'no_bankroll', bankrollUsd: 0, riskOfRuinPct: null, classification: null }),
    });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    expect(screen.getByTestId('bankroll-health-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('bankroll-health-ror')).toBeNull();
  });

  it('no_bankroll → mensagem menciona banca/configurar', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth({ dataSufficiency: 'no_bankroll', bankrollUsd: 0 }) });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    const empty = screen.getByTestId('bankroll-health-empty');
    expect(/banca/i.test(empty.textContent ?? '')).toBe(true);
  });
});

// =============================================================================
// Badge de classificacao por estado (cores diferentes)
// =============================================================================
describe('BankrollHealthCard — badge de classificacao', () => {
  it('renderiza classificacao distinta para healthy vs risky', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');

    mockQuery({ data: makeHealth({ classification: 'healthy', riskOfRuinPct: 2 }) });
    const { unmount } = render(React.createElement(Card));
    const healthyBadge = screen.getByTestId('bankroll-health-classification');
    const healthyText = healthyBadge.textContent ?? '';
    const healthyClass = healthyBadge.className;
    unmount();
    cleanup();

    mockQuery({ data: makeHealth({ classification: 'risky', riskOfRuinPct: 30 }) });
    render(React.createElement(Card));
    const riskyBadge = screen.getByTestId('bankroll-health-classification');
    const riskyText = riskyBadge.textContent ?? '';
    const riskyClass = riskyBadge.className;

    // O badge deve diferir entre estados (texto OU classe de cor).
    expect(healthyText !== riskyText || healthyClass !== riskyClass).toBe(true);
  });
});

// =============================================================================
// Loading
// =============================================================================
describe('BankrollHealthCard — loading', () => {
  it('isLoading true → nao crasha (skeleton/placeholder, sem numeros)', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ isLoading: true, data: undefined });

    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Card));

    // durante loading nao deve mostrar o numero de RoR
    expect(screen.queryByTestId('bankroll-health-ror')).toBeNull();
  });
});

// =============================================================================
// Isolamento useQuery (lesson #29) — montar standalone NAO derruba
// =============================================================================
describe('BankrollHealthCard — isolamento (lesson #29)', () => {
  it('renderiza sem QueryClientProvider sem lancar (useQuery mockado / ErrorBoundary)', async () => {
    const Card = await loadCard();
    expect(Card).not.toBeNull();
    mockQuery({ data: makeHealth() });

    const { render } = await import('@testing-library/react');
    // Sem QueryClientProvider no wrapper — nao deve lancar hard error.
    expect(() => render(React.createElement(Card))).not.toThrow();
  });
});
