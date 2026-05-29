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
    if (typeof url === 'string' && url.includes('/api/variance/history-aggregate')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          groups: [
            {
              name: 'High PKO', tier: 'high', type: 'PKO',
              buyIn: 215, field: 1800, roi: 0.09, countPerWeek: 4,
              count: 48, isPKO: true, source: 'historical' as const, lowSample: false,
            },
            {
              name: 'Mid Vanilla', tier: 'mid', type: 'Vanilla',
              buyIn: 55, field: 800, roi: 0.13, countPerWeek: 8,
              count: 96, isPKO: false, source: 'historical' as const, lowSample: false,
            },
          ],
          meta: {
            profileLetter: 'historical', weeks: 12, daysInProfile: 0,
            tournamentsPerWeek: 12, weeklyInvestment: 7560,
            from: '2026-02-28', to: '2026-05-29',
          },
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
      // Nome agora e um input editavel (founder feedback) — le o value, nao textContent.
      const nameInput = screen.getByTestId('name-input-0') as HTMLInputElement;
      expect(nameInput.value).toMatch(/High Vanilla|Mid Vanilla|Mid PKO|Low Vanilla|Entry Vanilla/);
      // buyIn/field/ROI/count continuam como inputs com testid estavel.
      expect(screen.getByTestId('buyin-input-0')).toBeInTheDocument();
      expect(screen.getByTestId('field-input-0')).toBeInTheDocument();
      expect(screen.getByTestId('roi-input-0')).toBeInTheDocument();
      expect(screen.getByTestId('count-input-0')).toBeInTheDocument();
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
  // Buy-in editing (founder feedback 2026-05-29: buy-in deve ser editavel)
  // -------------------------------------------------------------------------

  describe('buy-in editing', () => {
    it('deve permitir editar o buy-in de um grupo', async () => {
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

      const buyInInput = screen.getByTestId('buyin-input-0') as HTMLInputElement;
      expect(buyInInput).toBeInTheDocument();
      fireEvent.change(buyInInput, { target: { value: '215' } });
      expect(buyInInput.value).toBe('215');
    });

    it('NAO deve exibir o campo "Investimento diario" (removido)', async () => {
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

      expect(screen.queryByTestId('daily-investment-input')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Add / remove tournament type (founder feedback 2026-05-29)
  // -------------------------------------------------------------------------

  describe('add / remove tournament type', () => {
    it('deve adicionar uma nova linha ao clicar em "Adicionar tipo"', async () => {
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

      const before = screen.getAllByTestId(/^group-row-/).length;
      fireEvent.click(screen.getByTestId('add-group-button'));

      await waitFor(() => {
        const after = screen.getAllByTestId(/^group-row-/).length;
        expect(after).toBe(before + 1);
      });
    });

    it('deve remover uma linha ao clicar no botao de remover', async () => {
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

      const before = screen.getAllByTestId(/^group-row-/).length;
      fireEvent.click(screen.getByTestId('remove-group-0'));

      await waitFor(() => {
        const after = screen.getAllByTestId(/^group-row-/).length;
        expect(after).toBe(before - 1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // ITM% + Rake% (ADR-216 / VR-CALC-1 — fidelidade poker)
  // -------------------------------------------------------------------------

  describe('ITM% e Rake% por grupo', () => {
    it('deve renderizar inputs de ITM% e Rake% por grupo', async () => {
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

      expect(screen.getByTestId('itm-input-0')).toBeInTheDocument();
      expect(screen.getByTestId('rake-input-0')).toBeInTheDocument();
      // ITM default 15%
      expect((screen.getByTestId('itm-input-0') as HTMLInputElement).value).toBe('15');
      // Rake default 7% (media MTT GGPoker — founder 2026-05-29)
      expect((screen.getByTestId('rake-input-0') as HTMLInputElement).value).toBe('7');
    });

    it('deve converter percent da UI para decimal no payload de simulacao', async () => {
      const AggregationWizard = await tryLoadComponent();
      expect(AggregationWizard).not.toBeNull();

      const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      const onRun = (await import('vitest')).vi.fn();

      render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(AggregationWizard, { onRun }),
        ),
      );

      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('itm-input-0'), { target: { value: '20' } });
      fireEvent.change(screen.getByTestId('rake-input-0'), { target: { value: '7' } });
      fireEvent.click(screen.getByTestId('simulate-button'));

      expect(onRun).toHaveBeenCalledTimes(1);
      const payload = onRun.mock.calls[0][0];
      expect(payload.groups[0].placesPaidPct).toBeCloseTo(0.20, 5);
      expect(payload.groups[0].rakePct).toBeCloseTo(0.07, 5);
    });
  });

  // -------------------------------------------------------------------------
  // VR-CALC-2 — import do historico CSV (fonte alternativa)
  // -------------------------------------------------------------------------

  describe('fonte: grade planejada vs meu historico', () => {
    it('deve renderizar toggle de fonte com "Grade planejada" default', async () => {
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

      expect(screen.getByTestId('aggregation-source-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('source-planned')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('source-history')).toHaveAttribute('aria-pressed', 'false');
    });

    it('ao trocar para "Meu historico" deve buscar history-aggregate e exibir period chips', async () => {
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

      fireEvent.click(screen.getByTestId('source-history'));

      // period chips aparecem
      await waitFor(() => {
        expect(screen.getByTestId('hist-period-30')).toBeInTheDocument();
      });
      expect(screen.getByTestId('hist-period-7')).toBeInTheDocument();
      expect(screen.getByTestId('hist-period-365')).toBeInTheDocument();

      // tabela carrega do historico (High PKO / Mid Vanilla do mock)
      await waitFor(() => {
        expect(screen.getByTestId('aggregation-table')).toBeInTheDocument();
      });
      const histCall = mockFetch.mock.calls.find(
        (c: any) => typeof c[0] === 'string' && c[0].includes('/api/variance/history-aggregate'),
      );
      expect(histCall).toBeTruthy();
      expect(histCall[0]).toContain('lastDays=30');
    });

    it('modo "Intervalo" usa from/to e só busca quando ambos preenchidos', async () => {
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

      fireEvent.click(screen.getByTestId('source-history'));
      await waitFor(() => {
        expect(screen.getByTestId('hist-mode-range')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('hist-mode-range'));

      // só from preenchido -> ainda não busca por range (hint visível)
      fireEvent.change(screen.getByTestId('hist-from'), { target: { value: '2026-01-01' } });
      await waitFor(() => {
        expect(screen.getByTestId('hist-range-hint')).toBeInTheDocument();
      });

      // ambos preenchidos -> busca com from/to
      fireEvent.change(screen.getByTestId('hist-to'), { target: { value: '2026-03-01' } });

      await waitFor(() => {
        const rangeCall = mockFetch.mock.calls.find(
          (c: any) => typeof c[0] === 'string'
            && c[0].includes('/api/variance/history-aggregate')
            && c[0].includes('from=2026-01-01')
            && c[0].includes('to=2026-03-01'),
        );
        expect(rangeCall).toBeTruthy();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Leaks conhecidos visiveis na pagina (founder feedback)
  // -------------------------------------------------------------------------

  describe('leaks conhecidos na pagina', () => {
    it('deve exibir o banner de leaks/limitacoes conhecidas', async () => {
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

      expect(screen.getByTestId('known-leaks-banner')).toBeInTheDocument();
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
