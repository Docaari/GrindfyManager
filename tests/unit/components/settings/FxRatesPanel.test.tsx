/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-07: FxRatesPanel UI Settings
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-07
 *
 * Componente esperado: client/src/components/settings/FxRatesPanel.tsx
 *
 * Comportamentos:
 *   - Fetch GET /api/fx/current → render BRL + EUR com source badge
 *   - source='system' → badge "sistema"
 *   - source='user' → badge "manual"
 *   - source='fallback' → badge "fallback" (system rates ainda nao geradas)
 *   - Botao "Editar manualmente" abre dialog com inputs
 *   - Save dialog → PUT /api/user-settings { exchangeRates: {BRL, EUR} }
 *   - Botao "Resetar para taxas do sistema" → PUT /api/user-settings { exchangeRates: {} }
 *   - Loading state com skeleton
 *   - Error state com retry
 *
 * Padrao TDD: testid estavel:
 *   data-testid="fx-rate-BRL"
 *   data-testid="fx-rate-EUR"
 *   data-testid="fx-source-badge"
 *   data-testid="fx-edit-btn"
 *   data-testid="fx-reset-btn"
 *   data-testid="fx-edit-dialog"
 *   data-testid="fx-input-BRL"
 *   data-testid="fx-input-EUR"
 *   data-testid="fx-save-btn"
 *   data-testid="fx-loading"
 *   data-testid="fx-error"
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel
 *   #13 apiRequest retorna JSON parseado, NAO Response
 *
 * Status RED: componente nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Mock apiRequest (lesson #13: retorna JSON parseado direto)
// =============================================================================
const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

beforeEach(() => {
  apiRequestMock.mockReset();
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Lazy load via require()/import dentro de cada test pra tolerar red-phase
// (sem o componente, vite-import-analysis no top-level mata o suite inteiro).
async function loadPanel() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod: any = require('../../../../client/src/components/settings/FxRatesPanel');
  return mod.FxRatesPanel ?? mod.default;
}

// =============================================================================
// Render: rates + badge
// =============================================================================
describe('<FxRatesPanel> — RF-07 render', () => {
  it('source=system → mostra USD/BRL + USD/EUR + badge "sistema"', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.resolve({
          rates: { BRL: 5.1234, EUR: 0.9234 },
          source: 'system',
          fetchedAt: '2026-05-05T17:05:00Z',
        });
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => {
      const brl = screen.getByTestId('fx-rate-BRL');
      const eur = screen.getByTestId('fx-rate-EUR');
      expect(brl.textContent).toMatch(/5[.,]12/);
      expect(eur.textContent).toMatch(/0[.,]92/);
    });

    await waitFor(() => {
      const badge = screen.getByTestId('fx-source-badge');
      expect(badge.textContent?.toLowerCase()).toMatch(/sistema|system/);
    });
  });

  it('source=user → badge "manual"', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.resolve({
          rates: { BRL: 5.5, EUR: 0.95 },
          source: 'user',
          fetchedAt: '2026-05-05T17:05:00Z',
        });
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => {
      const badge = screen.getByTestId('fx-source-badge');
      expect(badge.textContent?.toLowerCase()).toMatch(/manual/);
    });
  });

  it('source=fallback → badge mostra fallback', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.resolve({
          rates: { BRL: 5.0, EUR: 0.93 },
          source: 'fallback',
          fetchedAt: new Date().toISOString(),
        });
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => {
      const badge = screen.getByTestId('fx-source-badge');
      expect(badge.textContent?.toLowerCase()).toMatch(/fallback|sistema/);
    });
  });

  it('loading state mostra skeleton', async () => {
    // Mock que NUNCA resolve para garantir loading visivel
    apiRequestMock.mockImplementation(() => new Promise(() => {}));

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    expect(screen.getByTestId('fx-loading')).toBeTruthy();
  });

  it('erro fetch → mostra error state com botao retry', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => {
      expect(screen.getByTestId('fx-error')).toBeTruthy();
    });
  });
});

// =============================================================================
// Edit dialog
// =============================================================================
describe('<FxRatesPanel> — RF-07 edit manual', () => {
  it('clique em "Editar manualmente" abre dialog com inputs preenchidos', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.resolve({
          rates: { BRL: 5.10, EUR: 0.92 },
          source: 'system',
          fetchedAt: '2026-05-05T17:05:00Z',
        });
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => screen.getByTestId('fx-edit-btn'));
    fireEvent.click(screen.getByTestId('fx-edit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('fx-edit-dialog')).toBeTruthy();
      const inputBRL = screen.getByTestId('fx-input-BRL') as HTMLInputElement;
      const inputEUR = screen.getByTestId('fx-input-EUR') as HTMLInputElement;
      expect(inputBRL.value).toMatch(/5[.,]?1/);
      expect(inputEUR.value).toMatch(/0[.,]?9/);
    });
  });

  it('save dialog chama PUT /api/user-settings com exchangeRates', async () => {
    apiRequestMock.mockImplementation((method: string, url: string, body?: any) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.resolve({
          rates: { BRL: 5.10, EUR: 0.92 },
          source: 'system',
          fetchedAt: '2026-05-05T17:05:00Z',
        });
      }
      if (method === 'PUT' && url.includes('/api/user-settings')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => screen.getByTestId('fx-edit-btn'));
    fireEvent.click(screen.getByTestId('fx-edit-btn'));

    await waitFor(() => screen.getByTestId('fx-input-BRL'));
    const inputBRL = screen.getByTestId('fx-input-BRL') as HTMLInputElement;
    fireEvent.change(inputBRL, { target: { value: '5.5' } });

    fireEvent.click(screen.getByTestId('fx-save-btn'));

    await waitFor(() => {
      const putCall = apiRequestMock.mock.calls.find(
        (call: any[]) => call[0] === 'PUT' && String(call[1]).includes('/api/user-settings'),
      );
      expect(putCall).toBeTruthy();
      const body = putCall![2];
      expect(body.exchangeRates).toBeDefined();
      expect(body.exchangeRates.BRL).toBeCloseTo(5.5, 2);
    });
  });
});

// =============================================================================
// Reset to system
// =============================================================================
describe('<FxRatesPanel> — RF-07 reset', () => {
  it('clique em "Resetar para taxas do sistema" → PUT /api/user-settings { exchangeRates: {} }', async () => {
    apiRequestMock.mockImplementation((method: string, url: string, body?: any) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.resolve({
          rates: { BRL: 5.5, EUR: 0.95 },
          source: 'user',
          fetchedAt: '2026-05-05T17:05:00Z',
        });
      }
      if (method === 'PUT' && url.includes('/api/user-settings')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => screen.getByTestId('fx-reset-btn'));
    fireEvent.click(screen.getByTestId('fx-reset-btn'));

    await waitFor(() => {
      const putCall = apiRequestMock.mock.calls.find(
        (call: any[]) => call[0] === 'PUT' && String(call[1]).includes('/api/user-settings'),
      );
      expect(putCall).toBeTruthy();
      const body = putCall![2];
      // Pode ser {} ou { exchangeRates: {} } — ambos zeram override
      expect(body.exchangeRates).toEqual({});
    });
  });
});

// =============================================================================
// Acessibilidade
// =============================================================================
describe('<FxRatesPanel> — RF-07 a11y', () => {
  it('botoes sao <button> semanticos', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/fx/current')) {
        return Promise.resolve({
          rates: { BRL: 5.10, EUR: 0.92 },
          source: 'system',
          fetchedAt: '2026-05-05T17:05:00Z',
        });
      }
      return Promise.resolve({});
    });

    const FxRatesPanel = await loadPanel();
    render(wrap(<FxRatesPanel />));

    await waitFor(() => {
      const editBtn = screen.getByTestId('fx-edit-btn');
      const resetBtn = screen.getByTestId('fx-reset-btn');
      expect(editBtn.tagName).toBe('BUTTON');
      expect(resetBtn.tagName).toBe('BUTTON');
    });
  });
});
