import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): client/src/components/bankroll/BankrollWidget.tsx
//
// Fonte: docs/specs/bankroll-management.md (RF-09)
//        docs/architecture/flows/bankroll/feature-flow.md (Estados do Dashboard widget)
//
// Spec RF-09: Widget no Dashboard com:
//   - Empty state (banca nao configurada) + CTA para Settings (Q9)
//   - Banca atual USD + BRL equivalente
//   - Mini-sparkline dos ultimos 30d (ou periodo do filtro)
//   - ROI sobre a banca no periodo
//   - Projecao mensal condicional (ROI30d > 0)
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { BankrollWidget } from '../../../client/src/components/bankroll/BankrollWidget';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Empty State (banca nao configurada) - Q9
// ===========================================================================

describe('BankrollWidget - empty state (banca nao configurada)', () => {
  it('banca nao configurada -> mostra CTA "Configure sua banca" (Q9)', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: false,
      amount: null,
      rule: '1pct',
      maxBuyInUSD: null,
      snapshotCount: 0,
      lastUpdatedAt: null,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('bankroll-widget-cta')).toBeTruthy();
  });

  it('CTA tem link para /settings', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: false, amount: null, rule: '1pct', maxBuyInUSD: null, snapshotCount: 0, lastUpdatedAt: null,
    });
    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const cta = screen.getByTestId('bankroll-widget-cta');
      expect(cta.getAttribute('href') ?? cta.getAttribute('data-to')).toContain('/settings');
    });
  });
});

// ===========================================================================
// Estado configurado
// ===========================================================================

describe('BankrollWidget - banca configurada', () => {
  it('mostra banca atual em USD', async () => {
    (apiRequest as any).mockImplementation((url: string) => {
      if (url.includes('/api/bankroll/history')) {
        return Promise.resolve({ snapshots: [], series: [], summary: { netChange: 0, startBalance: 1000, endBalance: 1000 }, pagination: { total: 0, limit: 100, offset: 0 } });
      }
      return Promise.resolve({
        configured: true,
        amount: 1000,
        rule: '1pct',
        rulePct: 1.0,
        tolerance: 1.5,
        maxBuyInUSD: 15,
        maxBuyInDisplay: { USD: 15, BRL: 78 },
        snapshotCount: 1,
        lastUpdatedAt: '2026-04-24T18:00:00-03:00',
      });
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const el = screen.getByTestId('bankroll-widget-amount');
      expect(el.textContent).toMatch(/1[.,]?000/);
    });
  });

  it('mostra equivalente em BRL', async () => {
    (apiRequest as any).mockImplementation((url: string) => {
      if (url.includes('/api/bankroll/history')) {
        return Promise.resolve({ snapshots: [], series: [], summary: { netChange: 0, startBalance: 1000, endBalance: 1000 }, pagination: { total: 0, limit: 100, offset: 0 } });
      }
      return Promise.resolve({
        configured: true,
        amount: 1000,
        rule: '1pct',
        maxBuyInUSD: 15,
        maxBuyInDisplay: { USD: 15, BRL: 5200 },
        snapshotCount: 1,
      });
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-amount-brl')).toBeTruthy();
    });
  });

  it('mini-sparkline renderiza com serie real', async () => {
    (apiRequest as any).mockImplementation((url: string) => {
      if (url.includes('/api/bankroll/history')) {
        return Promise.resolve({
          snapshots: [],
          series: [
            { bucket: '2026-04-01', balance: 1000, movements: 1, delta: 1000 },
            { bucket: '2026-04-15', balance: 1200, movements: 1, delta: 200 },
            { bucket: '2026-04-24', balance: 1500, movements: 1, delta: 300 },
          ],
          summary: { netChange: 500, startBalance: 1000, endBalance: 1500 },
          pagination: { total: 3, limit: 100, offset: 0 },
        });
      }
      return Promise.resolve({
        configured: true, amount: 1500, rule: '1pct', maxBuyInUSD: 22.5, snapshotCount: 3,
      });
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-sparkline')).toBeTruthy();
    });
  });

  it('projecao mensal esconde valor quando ROI30d <= 0 (spec RF-09 criterio)', async () => {
    (apiRequest as any).mockImplementation((url: string) => {
      if (url.includes('/api/bankroll/history')) {
        return Promise.resolve({
          snapshots: [],
          series: [
            { bucket: '2026-04-01', balance: 1500, movements: 1, delta: 0 },
            { bucket: '2026-04-24', balance: 1000, movements: 1, delta: -500 },
          ],
          summary: { netChange: -500, startBalance: 1500, endBalance: 1000 },
          pagination: { total: 2, limit: 100, offset: 0 },
        });
      }
      return Promise.resolve({
        configured: true, amount: 1000, rule: '1pct', maxBuyInUSD: 15, snapshotCount: 2,
      });
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const projection = screen.queryByTestId('bankroll-widget-projection');
      // Esconde ou mostra mensagem de foco
      if (projection) {
        expect(projection.textContent).toMatch(/estabilizar|foco/i);
      }
    });
  });
});
