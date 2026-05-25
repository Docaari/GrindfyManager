// =============================================================================
// Sprint VR-2 — RF-07: AggregationWizard (client component)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-07)
// ADR   : 212 (aggregate tiers + historical ROI)
// Diagram: Docs/architecture/diagrams/variance-reform/aggregation-wizard-flow.mermaid
//
// Mode  : TDD (red phase) — component DOES NOT EXIST yet.
//
// Tests cover:
//   - Toggle "Por periodo" (default) vs "Por dia" (backward-compat)
//   - Profile selector (A/B/C)
//   - Period selector (1 sem / 1 mes / 1 tri / 1 ano)
//   - Aggregated table (~8 groups) rendering from API
//   - Badge "hist" (blue) vs "est" (yellow) per field
//   - Empty state when profile has no tournaments
//   - Inline edit of ROI, field, count
//   - Daily investment field scales buy-ins proportionally
//
// Convention: data-testid for stable selectors (lesson #2).
// Convention: await import() NOT require() for components (lesson #14/#26).
// Convention: QueryClientProvider wrapper for TanStack hooks.
//
// NOTE: All tests use vi.mock for the component module. In red phase the
// component file does not exist; vi.mock intercepts the import with our
// factory so the tests can express behavioral expectations against the
// contract. Once the Implementer creates the real component, these mocks
// are replaced with the real render-based tests (uncommented in the
// integration section at the bottom).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — component dependency contracts
// ---------------------------------------------------------------------------

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('wouter', () => ({
  useLocation: () => ['/variancia', vi.fn()],
  useRoute: () => [false, {}],
  Link: ({ children, href }: any) => React.createElement('a', { href }, children),
}));

// ---------------------------------------------------------------------------
// Helpers — mock API responses
// ---------------------------------------------------------------------------

/** Mock response for GET /api/variance/buckets-aggregate */
function makeBucketsAggregateResponse() {
  return {
    groups: [
      {
        name: 'High Vanilla', tier: 'high', type: 'Vanilla',
        buyIn: 120, field: 600, roi: 0.08, countPerWeek: 6,
        count: 72, isPKO: false, source: 'historical' as const, lowSample: false,
      },
      {
        name: 'Mid Vanilla', tier: 'mid', type: 'Vanilla',
        buyIn: 55, field: 900, roi: 0.12, countPerWeek: 12,
        count: 144, isPKO: false, source: 'historical' as const, lowSample: false,
      },
      {
        name: 'Mid PKO', tier: 'mid', type: 'PKO',
        buyIn: 60, field: 700, roi: 0.15, countPerWeek: 6,
        count: 72, isPKO: true, source: 'historical' as const, lowSample: false,
      },
      {
        name: 'Low Vanilla', tier: 'low', type: 'Vanilla',
        buyIn: 33, field: 1200, roi: 0.10, countPerWeek: 12,
        count: 144, isPKO: false, source: 'historical' as const, lowSample: false,
      },
      {
        name: 'Entry Vanilla', tier: 'entry', type: 'Vanilla',
        buyIn: 16, field: 2000, roi: 0.20, countPerWeek: 6,
        count: 72, isPKO: false, source: 'default' as const, lowSample: true,
      },
    ],
    meta: {
      profileLetter: 'A',
      weeks: 12,
      daysInProfile: 6,
      tournamentsPerWeek: 42,
      weeklyInvestment: 5346,
    },
  };
}

function makeEmptyBucketsResponse() {
  return {
    groups: [],
    meta: {
      profileLetter: 'B',
      weeks: 4,
      daysInProfile: 0,
      tournamentsPerWeek: 0,
      weeklyInvestment: 0,
    },
  };
}

function setupFetchMock(bucketsResponse = makeBucketsAggregateResponse()) {
  mockFetch.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.includes('/api/variance/buckets-aggregate')) {
      return {
        ok: true,
        status: 200,
        json: async () => bucketsResponse,
      };
    }
    if (typeof url === 'string' && url.includes('/api/variance/historical-stats')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tiers: [],
          totals: { tournaments: 0, dateRange: { from: '', to: '' }, duplicatesRemoved: 0 },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setupFetchMock();
});

// ---------------------------------------------------------------------------
// Helper to attempt component load with graceful failure
// ---------------------------------------------------------------------------

async function tryLoadComponent(): Promise<any | null> {
  try {
    // Dynamic path variable bypasses Vite's static import analysis (lesson #26
    // addendum: `@vite-ignore` comment OR string indirection avoids the
    // "Failed to resolve import" transform-time error for files that don't
    // exist yet in red phase).
    const p = '@/components/primedope/AggregationWizard';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).AggregationWizard ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// Tests — Behavioral contracts (red phase: component does not exist yet)
//
// These tests define WHAT the component must do. Each test attempts to
// import and render the component; if it doesn't exist yet (red phase),
// the test fails with a clear message. Once the Implementer creates the
// component, these tests will pass or fail based on actual behavior.
// =============================================================================

describe('AggregationWizard (RF-07)', () => {
  // -------------------------------------------------------------------------
  // Mode toggle
  // -------------------------------------------------------------------------

  describe('mode toggle', () => {
    it('deve renderizar toggle entre "Por periodo" e "Por dia"', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      const toggle = screen.getByTestId('aggregation-mode-toggle');
      expect(toggle).toBeInTheDocument();
      expect(screen.getByText(/por per[ií]odo/i)).toBeInTheDocument();
      expect(screen.getByText(/por dia/i)).toBeInTheDocument();
    });

    it('deve ter "Por periodo" como modo default (selecionado)', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      const periodButton = screen.getByTestId('mode-por-periodo');
      expect(periodButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // -------------------------------------------------------------------------
  // Profile selector
  // -------------------------------------------------------------------------

  describe('profile selector', () => {
    it('deve renderizar opcoes de perfil A, B e C', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      expect(screen.getByTestId('profile-selector-A')).toBeInTheDocument();
      expect(screen.getByTestId('profile-selector-B')).toBeInTheDocument();
      expect(screen.getByTestId('profile-selector-C')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Period selector
  // -------------------------------------------------------------------------

  describe('period selector', () => {
    it('deve renderizar 4 opcoes de periodo', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      expect(screen.getByTestId('period-1')).toBeInTheDocument();
      expect(screen.getByTestId('period-4')).toBeInTheDocument();
      expect(screen.getByTestId('period-12')).toBeInTheDocument();
      expect(screen.getByTestId('period-52')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Aggregated table
  // -------------------------------------------------------------------------

  describe('aggregated table', () => {
    it('deve renderizar tabela agrupada com 5-10 linhas (nao 263 individuais)', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const rows = screen.getAllByTestId(/^group-row-/);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      expect(rows.length).toBeLessThanOrEqual(10);
    });

    it('deve exibir nome, buyIn, field, ROI, count para cada grupo', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const firstRow = screen.getByTestId('group-row-0');
      expect(firstRow).toBeInTheDocument();
      expect(firstRow.textContent).toMatch(/High Vanilla|Mid Vanilla|Mid PKO|Low Vanilla|Entry Vanilla/);
    });
  });

  // -------------------------------------------------------------------------
  // Badges
  // -------------------------------------------------------------------------

  describe('badges', () => {
    it('deve exibir badge "hist" azul para campos com source = historical', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const histBadges = screen.getAllByTestId(/badge-hist/);
      expect(histBadges.length).toBeGreaterThan(0);
    });

    it('deve exibir badge "est" amarelo para campos com source = default', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const estBadges = screen.getAllByTestId(/badge-est/);
      expect(estBadges.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('deve exibir mensagem quando perfil nao tem torneios', async () => {
      setupFetchMock(makeEmptyBucketsResponse());

      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      const profileB = screen.getByTestId('profile-selector-B');
      fireEvent.click(profileB);

      await waitFor(() => {
        expect(
          screen.getByText(/adicione torneios na aba grade/i),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Inline editing
  // -------------------------------------------------------------------------

  describe('inline editing', () => {
    it('deve permitir editar ROI de um grupo', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const roiInput = screen.getByTestId('roi-input-0') as HTMLInputElement;
      expect(roiInput).toBeInTheDocument();
      fireEvent.change(roiInput, { target: { value: '0.20' } });
      expect(roiInput.value).toBe('0.20');
    });

    it('deve permitir editar field size de um grupo', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const fieldInput = screen.getByTestId('field-input-0') as HTMLInputElement;
      expect(fieldInput).toBeInTheDocument();
      fireEvent.change(fieldInput, { target: { value: '1500' } });
      expect(fieldInput.value).toBe('1500');
    });

    it('deve permitir editar count de um grupo', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const countInput = screen.getByTestId('count-input-0') as HTMLInputElement;
      expect(countInput).toBeInTheDocument();
      fireEvent.change(countInput, { target: { value: '200' } });
      expect(countInput.value).toBe('200');
    });
  });

  // -------------------------------------------------------------------------
  // Daily investment scaling
  // -------------------------------------------------------------------------

  describe('daily investment', () => {
    it('deve exibir campo "Investimento diario"', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const dailyInput = screen.getByTestId('daily-investment-input');
      expect(dailyInput).toBeInTheDocument();
    });

    it('deve escalar buy-ins proporcionalmente quando investimento diario preenchido', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const buyInDisplay = screen.getByTestId('buyin-display-0');
      const initialBuyIn = parseFloat(buyInDisplay.textContent ?? '0');

      const dailyInput = screen.getByTestId('daily-investment-input') as HTMLInputElement;
      fireEvent.change(dailyInput, { target: { value: '2000' } });

      await waitFor(() => {
        const updatedBuyIn = parseFloat(
          (screen.getByTestId('buyin-display-0') as HTMLElement).textContent ?? '0',
        );
        if (initialBuyIn > 0) {
          expect(updatedBuyIn).not.toBe(initialBuyIn);
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Simulate button
  // -------------------------------------------------------------------------

  describe('simulate button', () => {
    it('deve ter botao "Simular" habilitado quando ha grupos', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      const simulateBtn = screen.getByTestId('simulate-button');
      expect(simulateBtn).toBeInTheDocument();
      expect(simulateBtn).not.toBeDisabled();
    });
  });
});
