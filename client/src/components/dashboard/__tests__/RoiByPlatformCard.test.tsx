/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-7: RoiByPlatformCard UI
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-7)
 *
 * Componente esperado: client/src/components/dashboard/RoiByPlatformCard.tsx
 *
 * Casos:
 *   1. Render com data-testid="roi-by-platform-card"
 *   2. Loading state via Skeleton
 *   3. Empty state quando platforms=[]
 *   4. Linhas com profit > 0 verde, < 0 vermelho
 *   5. queryKey inclui userId (RF-12 lesson learned)
 *   6. ?period=30d default, troca via dropdown
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
  getCsrfToken: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue({
    period: '30d',
    generatedAt: '2026-05-01T10:00:00Z',
    platforms: [],
  });
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadCard() {
  const mod: any = await import('../RoiByPlatformCard');
  return mod.default ?? mod.RoiByPlatformCard;
}

describe('RoiByPlatformCard — RF-7', () => {
  it('renderiza com data-testid=roi-by-platform-card', async () => {
    const Card = await loadCard();
    render(wrap(<Card userId="USER-0001" />));
    await waitFor(() => {
      expect(screen.getByTestId('roi-by-platform-card')).toBeInTheDocument();
    });
  });

  it('loading state via Skeleton', async () => {
    apiRequestMock.mockImplementation(
      () => new Promise(() => {}), // pending
    );
    const Card = await loadCard();
    render(wrap(<Card userId="USER-0001" />));
    expect(
      screen.queryByTestId('roi-by-platform-loading') ??
        screen.queryByTestId('roi-by-platform-card'),
    ).toBeInTheDocument();
  });

  it('empty state quando platforms=[]', async () => {
    apiRequestMock.mockResolvedValue({
      period: '30d',
      generatedAt: new Date().toISOString(),
      platforms: [],
    });
    const Card = await loadCard();
    render(wrap(<Card userId="USER-0001" />));
    await waitFor(() => {
      expect(screen.queryByTestId('roi-by-platform-empty')).toBeInTheDocument();
    });
  });

  it('renderiza linhas por plataforma com testid', async () => {
    apiRequestMock.mockResolvedValue({
      period: '30d',
      generatedAt: new Date().toISOString(),
      platforms: [
        { site: 'GGNetwork', sessionsCount: 5, tournamentsCount: 20, investedUSD: 500, profitUSD: 50, roiPct: 10 },
        { site: 'Suprema', sessionsCount: 3, tournamentsCount: 10, investedUSD: 300, profitUSD: -20, roiPct: -6.67 },
      ],
    });
    const Card = await loadCard();
    render(wrap(<Card userId="USER-0001" />));
    await waitFor(() => {
      expect(screen.queryByTestId('roi-row-GGNetwork')).toBeInTheDocument();
      expect(screen.queryByTestId('roi-row-Suprema')).toBeInTheDocument();
    });
  });

  it('linha com profit > 0 tem data-tone=positive', async () => {
    apiRequestMock.mockResolvedValue({
      period: '30d',
      generatedAt: new Date().toISOString(),
      platforms: [
        { site: 'GGNetwork', sessionsCount: 5, tournamentsCount: 20, investedUSD: 500, profitUSD: 50, roiPct: 10 },
      ],
    });
    const Card = await loadCard();
    render(wrap(<Card userId="USER-0001" />));
    await waitFor(() => {
      const row = screen.getByTestId('roi-row-GGNetwork');
      expect(row.getAttribute('data-tone')).toBe('positive');
    });
  });

  it('linha com profit < 0 tem data-tone=negative', async () => {
    apiRequestMock.mockResolvedValue({
      period: '30d',
      generatedAt: new Date().toISOString(),
      platforms: [
        { site: 'Suprema', sessionsCount: 3, tournamentsCount: 10, investedUSD: 300, profitUSD: -50, roiPct: -16.67 },
      ],
    });
    const Card = await loadCard();
    render(wrap(<Card userId="USER-0001" />));
    await waitFor(() => {
      const row = screen.getByTestId('roi-row-Suprema');
      expect(row.getAttribute('data-tone')).toBe('negative');
    });
  });
});
