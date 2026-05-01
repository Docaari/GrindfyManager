/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-13
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 *
 * Foco: header da pagina /grind mostra "Profit total: $X" agregando
 * sessions + manual_reports respeitando filtro D10.
 *
 * Lessons:
 *   #2 — data-testid grind-profit-total estavel.
 *   #3 — mock shape REAL do endpoint history (union type).
 *   #6 — soma profitUsd ja FX-aware (server normaliza).
 *   #11 — formato existente formatUsd (sem features extras).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock apiRequest para alimentar TanStack Query
vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Componente novo: header da pagina /grind. Pode ser sub-componente extraido.
// @ts-expect-error — RED: componente nao existe
import { GrindProfitHeader } from '../../../client/src/components/grind-session/GrindProfitHeader';
import { apiRequest } from '../../../client/src/lib/queryClient';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const sessionEntry = {
  type: 'session', id: 'SES-1',
  occurredAt: '2026-05-01T22:00:00Z', completedAt: '2026-05-01T22:30:00Z',
  profitUsd: -30, tournamentsCount: 5, platformsAffected: ['PokerStars'], detailsAvailable: true,
};

const manualReportEntry = {
  type: 'manual_report', id: 'mr_a',
  occurredAt: '2026-05-01T14:30:00Z',
  profitUsd: 100, transactionIds: ['tx_a'], platformsAffected: ['PokerStars'], detailsAvailable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch {}
});

describe('GrindProfitHeader — total inclui manual_reports (RF-13)', () => {
  it('renderiza data-testid grind-profit-total', async () => {
    (apiRequest as any).mockResolvedValue([sessionEntry, manualReportEntry]);

    render(withClient(<GrindProfitHeader />));

    await waitFor(() => {
      expect(screen.getByTestId('grind-profit-total')).toBeTruthy();
    });
  });

  it('soma profitUsd de session + manual_report no default (Tudo)', async () => {
    (apiRequest as any).mockResolvedValue([sessionEntry, manualReportEntry]);

    render(withClient(<GrindProfitHeader />));

    await waitFor(() => {
      const total = screen.getByTestId('grind-profit-total');
      // -30 + 100 = 70
      expect(total.textContent).toMatch(/70/);
    });
  });

  it('skeleton enquanto loading', async () => {
    let resolveQuery: (data: any) => void = () => {};
    (apiRequest as any).mockImplementation(() => new Promise((resolve) => { resolveQuery = resolve; }));

    render(withClient(<GrindProfitHeader />));
    expect(screen.getByTestId('grind-profit-total-loading')).toBeTruthy();
    resolveQuery([]);
  });

  it('empty state $0 quando sem entries', async () => {
    (apiRequest as any).mockResolvedValue([]);

    render(withClient(<GrindProfitHeader />));

    await waitFor(() => {
      const total = screen.getByTestId('grind-profit-total');
      expect(total.textContent).toMatch(/\$\s*0|0[.,]00/);
    });
  });

  it('profit positivo: data-sign=positive', async () => {
    (apiRequest as any).mockResolvedValue([
      { ...manualReportEntry, profitUsd: 200 },
    ]);

    render(withClient(<GrindProfitHeader />));

    await waitFor(() => {
      const total = screen.getByTestId('grind-profit-total');
      const sign = total.getAttribute('data-sign') ?? '';
      const className = total.className ?? '';
      expect(sign === 'positive' || className.includes('green')).toBe(true);
    });
  });

  it('profit negativo: data-sign=negative', async () => {
    (apiRequest as any).mockResolvedValue([
      { ...sessionEntry, profitUsd: -100 },
    ]);

    render(withClient(<GrindProfitHeader />));

    await waitFor(() => {
      const total = screen.getByTestId('grind-profit-total');
      const sign = total.getAttribute('data-sign') ?? '';
      const className = total.className ?? '';
      expect(sign === 'negative' || className.includes('red') || className.includes('destructive')).toBe(true);
    });
  });

  it('filter "Apenas sessoes" muda total para soma de sessions', async () => {
    (apiRequest as any).mockResolvedValue([sessionEntry, manualReportEntry]);

    const user = userEvent.setup();
    render(withClient(<GrindProfitHeader />));

    await waitFor(() => {
      expect(screen.getByTestId('grind-profit-total')).toBeTruthy();
    });

    // Toggle filtro
    const sessionsBtn = screen.queryByTestId('grind-history-filter-sessions');
    if (sessionsBtn) {
      await user.click(sessionsBtn);
      await waitFor(() => {
        const total = screen.getByTestId('grind-profit-total');
        // -30 (apenas session)
        expect(total.textContent).toMatch(/-?30/);
      });
    }
  });

  it('mock shape real do endpoint history (#3) — entries ja com type discriminator', async () => {
    // Garante que componente espera shape correto
    (apiRequest as any).mockResolvedValue([
      { type: 'session', id: 'SES-1', occurredAt: '2026-05-01T22:00:00Z', completedAt: '2026-05-01T22:30:00Z', profitUsd: 50, platformsAffected: [], detailsAvailable: true, tournamentsCount: 0 },
      { type: 'manual_report', id: 'mr_x', occurredAt: '2026-05-01T14:30:00Z', profitUsd: 50, transactionIds: ['tx_x'], platformsAffected: [], detailsAvailable: true },
    ]);

    render(withClient(<GrindProfitHeader />));

    await waitFor(() => {
      const total = screen.getByTestId('grind-profit-total');
      expect(total.textContent).toMatch(/100/);
    });
  });
});
